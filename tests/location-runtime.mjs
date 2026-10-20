import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLocationProposals, applyLocationReview } from '../src/locations/location-proposals.js';
import { trackerMessageIndex } from '../src/tracker/ui/status-ui-placement.js';
import { selectReviewRows, materializeGrantRows, validateReviewedTransitions, remainingGrantRows } from '../src/tracker/level-grant-review.js';
import { appendMemory, memorySourcesMatch, normalizeMemorySources, memoryTextFingerprint } from '../src/core/profile-memories.js';

function evaluate(file, dependencies, result) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export function ', 'function ').replaceAll('export const ', 'const ');
    return new Function(...Object.keys(dependencies), `${source}\nreturn ${result};`)(...Object.values(dependencies));
}

function fixture() {
    let state = { global: { Time: 'noon' }, characters: [], locations: {
        enabled: true, currentId: '', records: {},
    } };
    let chatId = 'chat-a';
    const context = { chat: [{ mes: 'We enter the Lantern tavern.', name: 'Narrator', swipe_id: 0, extra: {} }],
        getCurrentChatId: () => chatId };
    const saves = [], records = [], refreshes = [], events = [];
    const dependencies = {
        getContext: () => context, eventSource: { emit: (...args) => events.push(args) },
        loadStateFromMetadata: () => state,
        saveStateToMetadata: (next, options) => { state = next; saves.push(options); },
        refreshTurnBase: id => refreshes.push(id),
        recordAppliedChanges: (id, rows) => records.push({ id, rows }),
        trackerMessageIndex, buildLocationProposals, applyLocationReview,
    };
    const runtime = evaluate('../src/locations/location-runtime.js', dependencies,
        '{ locationProposalsForReading, resolveLocationRows }');
    const discover = (movement = true) => runtime.locationProposalsForReading(state, {
        places: [{ name: 'The Lantern', description: 'A tavern.' }],
        ...(movement ? { current: 'The Lantern' } : {}),
    }, 0).rows;
    return { context, saves, records, refreshes, events, dependencies, runtime, discover,
        get state() { return state; }, set chatId(value) { chatId = value; } };
}

test('latest reviewed places use turn effects and duplicate acceptance cannot replay', () => {
    const f = fixture();
    const rows = f.discover();
    const result = f.runtime.resolveLocationRows(0, rows, rows);
    assert.equal(result.applied, 2);
    assert.equal(f.state.locations.records[f.state.locations.currentId].name, 'The Lantern');
    assert.deepEqual(f.refreshes, [0]);
    assert.equal(f.saves[0].partOfMessage, true);
    assert.equal(f.records[0].rows.length, 2);
    assert.equal(f.runtime.resolveLocationRows(0, rows, rows).applied, 0);
    assert.equal(f.saves.length, 1);
});

test('historical discoveries are corrections and cannot move the latest scene', () => {
    const f = fixture();
    const rows = f.discover();
    f.context.chat.push({ mes: 'We leave for another town.', extra: {} });
    const result = f.runtime.resolveLocationRows(0, rows, rows);
    assert.equal(result.applied, 1);
    assert.equal(result.remaining[0].kind, 'location-current');
    assert.equal(f.state.locations.currentId, '');
    assert.equal(f.saves[0].partOfMessage, false);
    assert.deepEqual(f.refreshes, []);
    assert.deepEqual(f.records, []);
});

test('chat, source text, swipe, and disabled places each block saved proposals', () => {
    const mutations = [f => { f.chatId = 'chat-b'; },
        f => { f.context.chat[0].mes = 'An edited reply.'; },
        f => { f.context.chat[0].swipe_id = 1; },
        f => { f.state.locations.enabled = false; }];
    for (const mutate of mutations) {
        const f = fixture();
        const rows = f.discover();
        mutate(f);
        const result = f.runtime.resolveLocationRows(0, rows, rows);
        assert.equal(result.applied, 0);
        assert.equal(result.remaining.length, 2);
        assert.deepEqual(f.saves, []);
    }
});

test('selected unresolved dependencies stay pending while declined proposals are discarded', () => {
    const f = fixture();
    const rows = f.discover();
    const current = rows.find(row => row.kind === 'location-current');
    const result = f.runtime.resolveLocationRows(0, rows, [current]);
    assert.equal(result.applied, 0);
    assert.deepEqual(result.remaining.map(row => row.id), [current.id]);
    assert.match(result.remaining[0].reason, /Accept the new place/);
    assert.deepEqual(f.runtime.resolveLocationRows(0, rows, [], { discardAll: true }).remaining, []);
});

function reviewFixture() {
    const f = fixture();
    const card = { id: 'ada', name: 'Ada' };
    const settings = { activeSystem: 'system-a', statusTracker: { collections: [] } };
    const memory = evaluate('../src/memory/memory-review.js', {
        appendMemory, memorySourcesMatch, normalizeMemorySources,
        readNpcMemories: state => state.npcMemories || {},
        writeNpcMemories: (state, card, store) => { state.npcMemories = store; },
    }, '{ selectMemoryReviewRows, applyReviewedMemories, mergePendingMemoryRows }');
    const partitions = [];
    const review = evaluate('../src/tracker/status-review.js', {
        ...f.dependencies, ...memory,
        getSettings: () => settings, getAllCharacters: () => [card], debugLog: () => {},
        getCurrentPersonaKey: () => 'persona-a', saveChatSoon: () => {},
        appliedChangesForCurrentSwipe: () => [],
        selectReviewRows: (pending, accepted, applied) => {
            partitions.push({ pending, accepted });
            return selectReviewRows(pending, accepted, applied);
        },
        materializeGrantRows, validateReviewedTransitions, remainingGrantRows,
        buildUpdateFromChanges: rows => ({ global: Object.fromEntries(rows.map(row => [row.label, row.after])) }),
        applyUpdate: (update, options) => {
            const next = { ...f.state, global: { ...f.state.global, ...update.global } };
            if (!options.dryRun) f.dependencies.saveStateToMetadata(next, options);
            return next;
        },
        failedReviewedStats: () => [],
        activeNpcSystem: () => ({ memories: { enabled: true, maxEntriesPerCharacter: 50 } }),
        syncProfileToLore: async () => {}, resolveLocationRows: f.runtime.resolveLocationRows,
    }, '{ setPendingChanges, getPendingChanges, resolvePendingChanges }');
    const stat = { id: 'time', kind: 'stat', scope: 'global', label: 'Time', before: 'noon', after: 'evening' };
    const memoryRow = { id: 'memory', kind: 'memory-add', scope: 'character', actor: 'Ada', cardId: 'ada',
        after: 'Visited the Lantern.', provenance: { chatId: 'chat-a', systemId: 'system-a', sources: [{
            messageId: 0, swipeId: 0, fingerprint: memoryTextFingerprint(f.context.chat[0].mes),
        }] } };
    return { ...f, get state() { return f.state; }, review, partitions, stat, memoryRow };
}

test('mixed review isolates places and memories from stat updates and counts every accepted change', () => {
    const f = reviewFixture();
    const rows = [f.stat, f.memoryRow, ...f.discover()];
    f.review.setPendingChanges(0, rows);
    const result = f.review.resolvePendingChanges(0, rows);
    assert.deepEqual(result, { applied: 4, discarded: 0, remaining: 0 });
    assert.deepEqual(f.partitions[0].pending, [f.stat]);
    assert.deepEqual(f.partitions[0].accepted, [f.stat]);
    assert.equal(f.state.global.Time, 'evening');
    assert.equal(f.state.npcMemories.entries[0].text, 'Visited the Lantern.');
    assert.equal(Object.keys(f.state.locations.records).length, 1);
    assert.deepEqual(f.review.getPendingChanges(0), []);
});

test('mixed review retains only selected blocked places and discard-all clears the remaining panel', () => {
    const f = reviewFixture();
    const placeRows = f.discover();
    const current = placeRows.find(row => row.kind === 'location-current');
    f.review.setPendingChanges(0, [f.stat, f.memoryRow, ...placeRows]);
    assert.deepEqual(f.review.resolvePendingChanges(0, [f.stat, current]),
        { applied: 1, discarded: 2, remaining: 1 });
    assert.deepEqual(f.review.getPendingChanges(0).map(row => row.id), [current.id]);
    assert.deepEqual(f.review.resolvePendingChanges(0, [], [], { discardAll: true }),
        { applied: 0, discarded: 1, remaining: 0 });
    assert.deepEqual(f.review.getPendingChanges(0), []);
});
