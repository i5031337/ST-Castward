import { readerCancellationHarness } from './helpers/reader-cancellation.mjs';
import { createExtractionQueue } from '../src/tracker/extractor/status-extractor-queue.js';
import { captureReaderRules } from '../src/tracker/extractor/status-extractor-rules.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeCollectionUpdates } from '../src/tracker/extractor/status-collection-normalize.js';
import { diffTurnValues, applyTurnValues, turnEffectStatus } from '../src/tracker/snapshots/status-turn-delta.js';
import { normalizeModelReadings } from '../src/tracker/extractor/status-extractor-readings.js';
import { lockTrackerEdits, isTrackerEditLocked } from '../src/tracker/tracker-edit-lock.js';

const settings = { enabled: true, extractionMode: 'extract', collections: [
    { id: 'inventory', target: 'player' }, { id: 'abilities', target: 'npc' },
] };
test('unnamed collections use the single collection applicable to each actor', () => {
    const update = { player: { collections: { add: [{ name: 'Key' }], remove: ['Coin'] } },
        characters: [{ name: 'Ada', collections: { update: [{ name: 'Sneak' }] } }] };
    assert.deepEqual(normalizeCollectionUpdates(update, settings), []);
    assert.deepEqual(update.player.collections.inventory, { add: [{ name: 'Key' }], remove: ['Coin'] });
    assert.deepEqual(update.characters[0].collections.abilities, { update: [{ name: 'Sneak' }] });
});
test('ambiguous collections are skipped with a visible explanation; named ones stay intact', () => {
    const update = { player: { collections: { add: [] } } };
    const warnings = normalizeCollectionUpdates(update, { collections: [
        ...settings.collections, { id: 'spells', target: 'all' },
    ] });
    assert.match(warnings[0], /missing collection name \(2 possible collections\)/);
    assert.equal(update.player.collections, undefined);
    const named = { player: { collections: { inventory: { add: [] } } } };
    const original = structuredClone(named);
    normalizeCollectionUpdates(named, settings);
    assert.deepEqual(named, original);
});

function loadModule(path, deps) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '').replaceAll('export ', '');
    return new Function(...Object.keys(deps), `${source}\nreturn typeof extractStateFromMessage === 'function'
        ? { extractStateFromMessage } : { replacementReadingState, revertToBase };`)(...Object.values(deps));
}
function harness(mode = 'extract') {
    const baseState = { player: { stats: { XP: '10', HP: '100' } } };
    let live = { player: { stats: { XP: '30', HP: '95' } } };
    const base = { messageId: '0', state: baseState, profiles: {},
        applied: { state: { player: { stats: { XP: '30', HP: '100' } } }, profiles: {} } };
    const message = { mes: 'You earned experience.', extra: { sillynpc_applied: [{ old: true }] } };
    const context = { chat: [message] };
    let pending = [{ old: true }];
    let response = { player: { stats: { XP: '30' } } };
    let onRequest = () => {};
    let onLevelReading = () => {};
    let enabled = true;
    const system = { stats: { character: [{ name: 'XP', purpose: 'xp' }] }, npcTemplates: [],
        collections: structuredClone(settings.collections) };
    const tracker = { ...structuredClone(settings), extractionMode: mode,
        playerStats: [{ name: 'XP', purpose: 'xp' }], presets: { fixture: { definition: system } } };
    let previewWarnings = [];
    let rejectedPhase;
    const application = { attempts: [], records: 0, readingSaves: 0 };
    let prompted;
    const deps = {
        getContext: () => context, swipeBaseRecord: () => base,
        getSwipeBase: id => String(id) === base.messageId ? structuredClone(base.state) : null,
        loadStateFromMetadata: () => live, snapshotProfiles: () => ({}),
        restoreProfiles: () => [], saveStateToMetadata: state => { live = structuredClone(state); },
        diffTurnValues, applyTurnValues, turnEffectStatus, syncRebasedLore: () => {}, debugLog: () => {},
    };
    const snapshots = loadModule('../src/tracker/snapshots/status-snapshot-swipe.js', deps);
    const cancellation = readerCancellationHarness();
    const extraction = loadModule('../src/tracker/extractor/status-extractor-run.js', {
        createExtractionQueue, captureReaderRules,
        lockTrackerEdits,
        ...cancellation,
        ...deps, ...snapshots, normalizeCollectionUpdates,
        trackerMessageIndex: chat => chat.length - 1,
        getSettings: () => ({ enabled, activeSystem: 'fixture', statusTracker: tracker }),
        rememberSwipeBase: () => {},
        refreshTurnBase: () => { base.beforeApply = { state: structuredClone(live), profiles: {} }; },
        sanitizeModelUpdate: () => {}, reconcileScenePresence: () => {},
        applyUpdate: (parsed, options) => {
            application.attempts.push(options);
            if (rejectedPhase === (options?.dryRun ? 'preview' : 'commit')) return null;
            if (options?.dryRun) options.diagnostics.collectionWarnings.push(...previewWarnings);
            const result = structuredClone(live);
            Object.assign(result.player.stats, parsed.player?.stats || {});
            if (!options?.dryRun) live = result;
            return result;
        },
        computeStateDiff: (before, after) =>
            before.player.stats.XP === after.player.stats.XP ? [] : [{ label: 'XP', after: after.player.stats.XP }],
        partitionChanges: changes => ({ auto: changes, pending: [] }),
        buildUpdateFromChanges: () => ({}), attachReasons: () => [],
        setPendingChanges: (id, rows) => { pending = rows; }, isItemDecided: () => false,
        recordAppliedChanges: (id, rows) => {
            application.records++;
            message.extra.sillynpc_applied = (message.extra.sillynpc_applied || []).concat(rows);
            base.applied = { state: applyTurnValues(base.state, diffTurnValues(base.beforeApply.state, live)), profiles: {} };
        },
        setStrangerKinds: () => false,
        triggerReprocess: () => {}, buildExtractionSchema: () => ({}), strangersToClassify: () => [],
        buildUserPrompt: state => { prompted = structuredClone(state); return ''; }, collectLeadUp: () => '',
        requestExtraction: async () => { await onRequest(); return structuredClone(response); },
        coerceToUpdate: raw => raw, normalizeModelReadings,
        prepareLevelReading: async () => { await onLevelReading();
            return { rows: [], failures: [], transitions: [], reading: { personaId: 'hero' } }; },
        saveLevelReading: () => { application.readingSaves++; }, retryLevelReading: async () => ({ applied: false }),
        validateReviewedTransitions: () => ({ invalid: new Set() }),
        prepareGrantReview: () => {}, LEVEL_READING_KEY: 'sillynpc_level_reading',
        getCurrentPersonaKey: () => 'hero', getCurrentPersonaName: () => 'Hero',
        prepareSceneLocationReading: async () => null,
        npcProfileFollowups: { schedule: async () => ({}), clear() {} },
        startExtractionReport: id => context.chat[id], finishExtractionReport: (id, msg, report) => { msg.report = report; },
        extractionSwipe: () => 0, renderExtractionReport: () => {},
        getAllCharacters: () => [],
        document: { querySelector: () => null }, LOG_PREFIX: 'test',
    });
    return { run: (options = { regenerate: true }, id = 0) => extraction.extractStateFromMessage(context.chat[id].mes, id, options),
        cancellation, tracker, system, live: () => live, pending: () => pending, prompted: () => prompted, message, context, base,
        setEnabled: value => { enabled = value; },
        setResponse: value => { response = value; }, onRequest: fn => { onRequest = fn; },
        onLevelReading: fn => { onLevelReading = fn; },
        setWarnings: value => { previewWarnings = value; },
        rejectUpdate: phase => { rejectedPhase = phase; }, application };
}
for (const phase of ['onRequest', 'onLevelReading']) {
    test(`reader refuses changed System rules during ${phase} before applying or replacing a turn`, async () => {
        for (const change of [h => { h.system.stats.character[0].purpose = 'A different meaning'; },
            h => { h.tracker.playerStats[0].name = 'Renamed XP'; },
            h => { h.system.collections[0].fields = [{ name: 'title', isPrimary: true }]; }]) {
            const h = harness();
            const before = structuredClone(h.live());
            h[phase](() => change(h));
            const result = await h.run({ regenerate: true });
            assert.equal(result.applied, false);
            assert.equal(result.reason, 'System rules changed while reading');
            assert.deepEqual(h.live(), before);
            assert.deepEqual(h.pending(), [{ old: true }]);
            assert.deepEqual(h.message.extra.sillynpc_applied, [{ old: true }]);
            assert.equal(h.application.attempts.length, 0);
            assert.equal(h.application.readingSaves, 0);
            assert.equal(isTrackerEditLocked(), false);
            h[phase](() => {});
            assert.equal((await h.run({ regenerate: true })).applied, true);
        }
    });
}

test('display-only System and tracker changes do not discard a reading', async () => {
    const h = harness();
    h.onRequest(() => {
        h.system.hud = { layout: 'compact' };
        Object.assign(h.system.stats.character[0], { color: '#fff', format: '{{value}}', visible: false, isPrimary: true });
        Object.assign(h.tracker.playerStats[0], { color: '#fff', format: '{{value}}', visible: false, isPrimary: true });
        h.tracker.showRawOutput = false;
    });
    assert.equal((await h.run()).applied, true);
});

test('reader locks editing before the request and releases it on success and failure', async () => {
    for (const fail of [false, true]) {
        const h = harness();
        h.onRequest(() => {
            assert.equal(isTrackerEditLocked(), true);
            if (fail) throw new Error('Fixture request failed');
        });
        const result = await h.run({});
        assert.equal(result.applied, !fail);
        assert.equal(isTrackerEditLocked(), false);
    }
});

test('Stop releases editing even while the cancelled service request is still waiting', async () => {
    const h = harness();
    let release;
    h.onRequest(() => new Promise(resolve => { release = resolve; }));
    const pending = h.run({});
    assert.equal(isTrackerEditLocked(), true);
    h.cancellation.emit('stop');
    assert.equal(isTrackerEditLocked(), false);
    release();
    assert.equal((await pending).reason, 'cancelled');
    assert.equal(isTrackerEditLocked(), false);
});

test('overlapping automatic turns read in order using the preceding applied state', async () => {
    const h = harness();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let calls = 0;
    h.onRequest(async () => {
        calls += 1;
        if (calls === 1) await gate;
        h.setResponse({ player: { stats: { XP: calls === 1 ? '50' : '70' } } });
    });
    const first = h.run({});
    h.context.chat.push({ mes: 'Another accomplishment.', extra: {} });
    const second = h.run({}, 1);
    assert.equal(calls, 1);
    release();
    assert.equal((await first).applied, true);
    assert.equal((await second).applied, true);
    assert.equal(calls, 2);
    assert.equal(h.prompted().player.stats.XP, '50');
    assert.equal(h.live().player.stats.XP, '70');
});

test('Stop cancels both the active reading and a waiting turn without starting its request', async () => {
    const h = harness();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let calls = 0;
    h.onRequest(async () => { calls += 1; await gate; });
    const first = h.run({});
    h.context.chat.push({ mes: 'Another accomplishment.', extra: {} });
    const second = h.run({}, 1);
    h.cancellation.emit('stop');
    release();
    assert.equal((await first).reason, 'cancelled');
    assert.equal((await second).reason, 'cancelled');
    assert.equal(calls, 1);
    assert.equal(h.live().player.stats.XP, '30');
});
test('reader reports skipped collection proposals even with no review rows and clears them on regeneration', async () => {
    const h = harness();
    h.setResponse({ player: {} });
    const warning = 'Collection "moves" for Player skipped: entry requires primary field "move".';
    h.setWarnings([warning]);
    assert.equal((await h.run()).applied, true);
    assert.deepEqual(h.pending(), []);
    assert.deepEqual(h.message.report.warnings, [warning]);
    assert.match(h.message.report.summary, /1 warning/);
    h.setWarnings([]);
    await h.run();
    assert.deepEqual(h.message.report.warnings, []);
    assert.doesNotMatch(h.message.report.summary, /warning/);
});
test('regeneration replaces XP and applied rows, clears old proposals and keeps manual edits', async () => {
    const h = harness();
    assert.equal((await h.run()).applied, true);
    assert.equal(h.prompted().player.stats.XP, '10');
    assert.equal(h.live().player.stats.XP, '30');
    assert.equal(h.live().player.stats.HP, '95');
    assert.deepEqual(h.pending(), []);
    assert.equal(h.message.extra.sillynpc_applied.length, 1);
    await h.run();
    assert.equal(h.live().player.stats.XP, '30');
    assert.equal(h.message.extra.sillynpc_applied.length, 1);
});
test('an unusable regeneration leaves the previous reading and pending proposals intact', async () => {
    const h = harness(); h.setResponse(null);
    assert.equal((await h.run()).applied, false);
    assert.equal(h.live().player.stats.XP, '30');
    assert.deepEqual(h.pending(), [{ old: true }]);
    assert.deepEqual(h.message.extra.sillynpc_applied, [{ old: true }]);
});
test('a new turn arriving during regeneration prevents replacing the older turn', async () => {
    const h = harness(); h.onRequest(() => h.context.chat.push({ mes: 'Next turn' }));
    assert.equal((await h.run()).applied, false);
    assert.equal(h.live().player.stats.XP, '30');
});
test('manual changes during the request survive replacement', async () => {
    const h = harness(); h.onRequest(() => { h.live().player.stats.HP = '80'; });
    await h.run();
    assert.equal(h.live().player.stats.HP, '80');
    assert.equal(h.live().player.stats.XP, '30');
});

test('manual mode skips automatic requests and replaces an explicitly requested reading', async () => {
    const h = harness('manual');
    let requests = 0;
    h.onRequest(() => { requests += 1; });
    assert.equal((await h.run({})).reason, 'extraction disabled');
    assert.equal(requests, 0);
    for (let i = 0; i < 2; i++) {
        assert.equal((await h.run({ manual: true, regenerate: true })).applied, true);
        assert.equal(h.live().player.stats.XP, '30');
        assert.equal(h.message.extra.sillynpc_applied.length, 1);
    }
    assert.equal(requests, 2);
});

test('manual reading is discarded if a new turn arrives during the request', async () => {
    const h = harness('manual');
    h.onRequest(() => h.context.chat.push({ mes: 'Next turn' }));
    assert.equal((await h.run({ manual: true })).reason, 'reply changed while reading');
    assert.equal(h.live().player.stats.XP, '30');
});

test('manual mode does not enable the reader in inline mode', async () => {
    const h = harness('inline');
    assert.equal((await h.run({ manual: true })).reason, 'extraction disabled');
});


test('master switch blocks forced reads and discards replies from an in-flight read', async () => {
    const h = harness();
    const before = structuredClone(h.live());
    h.setEnabled(false);
    assert.deepEqual(await h.run({ force: true }), { applied: false, reason: 'extension disabled' });
    assert.equal(h.prompted(), undefined);
    h.setEnabled(true);
    h.onRequest(() => { h.setEnabled(false); });
    assert.deepEqual(await h.run(), { applied: false, reason: 'extension disabled' });
    assert.deepEqual(h.live(), before);
    assert.deepEqual(h.pending(), [{ old: true }]);
});

 test('stat rejection warnings persist without review rows and regeneration removes stale warnings', async () => {
    const h = harness();
    h.setResponse({ player: { deltas: { Missing: 1 } } });
    await h.run();
    assert.deepEqual(h.pending(), []);
    assert.match(h.message.report.warnings[0], /Player · deltas.*absolute readings/);
    assert.match(h.message.report.summary, /1 warning/);
    assert.deepEqual(h.message.report.output, { player: { deltas: { Missing: 1 } } });
    h.setResponse({ player: {} });
    await h.run();
    assert.deepEqual(h.message.report.warnings, []);
});

test('Stop preserves the previous reading and permits a clean retry', async () => {
    const h = harness();
    const previous = structuredClone(h.live());
    const proposals = structuredClone(h.pending());
    h.onRequest(() => h.cancellation.emit('stop'));
    assert.deepEqual(await h.run(), { applied: false, reason: 'cancelled' });
    assert.deepEqual(h.live(), previous);
    assert.deepEqual(h.pending(), proposals);
    assert.equal(h.message.report.status, 'cancelled');
    assert.equal(h.cancellation.listeners(), 0);
    h.onRequest(() => {});
    assert.equal((await h.run()).applied, true);
    assert.equal(h.message.report.status, 'done');
});


test('rejected tracker previews and commits do not record an applied reading and allow retry', async () => {
    for (const phase of ['preview', 'commit']) {
        const h = harness();
        const previous = structuredClone(h.live());
        h.rejectUpdate(phase);
        const result = await h.run({});
        assert.equal(result.applied, false);
        assert.equal(result.reason, 'reply changed while reading');
        assert.deepEqual(h.live(), previous);
        assert.deepEqual(h.message.extra.sillynpc_applied, [{ old: true }]);
        assert.deepEqual(h.pending(), [{ old: true }]);
        assert.equal(h.application.records, 0);
        assert.equal(h.application.readingSaves, 0);
        assert.notEqual(h.message.report.status, 'done');
        assert.equal(h.application.attempts.length, phase === 'preview' ? 1 : 2);
        assert.ok(h.application.attempts.every(options => options.messageId === 0));
        h.rejectUpdate(null);
        assert.equal((await h.run({})).applied, true);
        assert.equal(h.application.records, 1);
    }
});
