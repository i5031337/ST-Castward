import assert from 'node:assert/strict';
import test from 'node:test';
import { bindStatusModule } from './helpers/status-module.mjs';
import { captureTrackerOwner, trackerOwnerIsCurrent, commitTrackerUpdate } from '../src/tracker/tracker-update-commit.js';

function fixture() {
    const original = { global: {}, player: { name: 'Alex', stats: { HP: '5' }, collections: {} }, characters: [] };
    const card = { id: 'mira', name: 'Mira', statusOverrides: { HP: '4' } };
    const tracker = { globalStats: [], playerStats: [], npcStats: [], collections: [] };
    const system = { name: 'Adventure' };
    const settings = { activeSystem: 'Adventure', statusTracker: tracker };
    const environment = { chatId: 'chat-a', metadata: { state: original, system: 'Adventure' }, personaKey: 'Alex.png',
        systemKey: 'Adventure', system, tracker, state: original,
        message: { mes: 'Mira opens the door.', swipe_id: 0 } };
    const calls = { saved: 0, settings: 0, emitted: [], align: 0, roster: [], metadata: 0 };
    const readCurrent = () => ({ ...environment, storedState: environment.metadata.state,
        boundSystemKey: environment.metadata.system,
        sourceMessage: { index: 0, message: environment.message,
            text: environment.message?.mes, swipeId: environment.message?.swipe_id } });
    const deps = { STATE_KEY: 'state', HISTORY_KEY: 'history', committedState: original,
        committedChatId: 'chat-a', stateOrigin: new WeakMap(),
        getMetadata: () => environment.metadata, currentChatId: () => environment.chatId,
        hasOpenChat: () => environment.chatId !== undefined,
        alignSwipeBase: () => { calls.align++; } };
    deps.stateOrigin.set(original, 'chat-a');
    const host = { getSettings: () => settings,
        getContext: () => ({ saveMetadataDebounced: () => { calls.metadata++; } }),
        eventSource: { emit: (_event, state) => calls.emitted.push(state) },
        captureNpcRoster: () => {
            calls.roster.push({ card: structuredClone(card), library: structuredClone(settings.master_items) });
            return false;
        }, saveSettings: () => { calls.settings++; } };
    bindStatusModule(new URL('../src/tracker/status-state-storage.js', import.meta.url), deps, host);
    const calculated = { nextState: structuredClone(original),
        cardChanges: [{ cardIndex: 0, fields: { statusOverrides: { HP: '8' } } }],
        libraryChanges: [{ collectionId: 'items', itemName: 'Key', fields: { name: 'Key' } }] };
    calculated.nextState.player.stats.HP = '7';
    const commit = (owner = captureTrackerOwner(readCurrent()), options = {}, saveState = deps.saveStateToMetadata) =>
        commitTrackerUpdate({ owner, calculated, cards: [card], settings, readCurrent,
            saveState: (state, storageOptions) => { calls.saved++; return saveState(state, storageOptions); },
            saveSettings: host.saveSettings, emit: state => calls.emitted.push(state), options });
    return { environment, original, card, settings, calls, readCurrent, deps, calculated, commit };
}

test('stale tracker owners reject every store and event before committing a plan', () => {
    const changes = {
        'closed chat': h => { h.environment.chatId = undefined; },
        'different chat': h => { h.environment.chatId = 'chat-b'; },
        'replaced metadata': h => { h.environment.metadata = { state: h.original }; },
        'different persona': h => { h.environment.personaKey = 'Other.png'; },
        'different bound System': h => { h.environment.metadata.system = 'Other'; },
        'different System': h => { h.environment.systemKey = 'Other'; },
        'changed System definition': h => { h.environment.system.name = 'Revised Adventure'; },
        'replaced System definition': h => { h.environment.system = { name: 'Adventure' }; },
        'changed rules': h => { h.environment.tracker.collections.push({ id: 'new' }); },
        'changed source state': h => { h.environment.state.player.stats.HP = '3'; },
        'replaced stored state': h => { h.environment.metadata.state = structuredClone(h.original); },
        'replaced source state': h => { h.environment.state = structuredClone(h.original); },
        'edited source reply': h => { h.environment.message.mes = 'A different reply.'; },
        'changed swipe': h => { h.environment.message.swipe_id = 1; },
        'replaced reply identity': h => { h.environment.message = { ...h.environment.message }; },
        'removed reply': h => { h.environment.message = undefined; },
    };
    for (const [name, change] of Object.entries(changes)) {
        const h = fixture();
        const owner = captureTrackerOwner(h.readCurrent());
        change(h);
        const beforeMetadata = structuredClone(h.environment.metadata);
        assert.equal(trackerOwnerIsCurrent(owner, h.readCurrent()), false, name);
        assert.equal(h.commit(owner), null, name);
        assert.equal(h.calls.saved, 0, name);
        assert.equal(h.calls.settings, 0, name);
        assert.deepEqual(h.calls.emitted, [], name);
        assert.deepEqual(h.card.statusOverrides, { HP: '4' }, name);
        assert.equal(h.settings.master_items, undefined, name);
        assert.deepEqual(h.environment.metadata, beforeMetadata, name);
    }
});

test('inconsistent captured persona and missing explicit source cannot authorize a commit', () => {
    for (const invalid of ['persona', 'source']) {
        const h = fixture();
        if (invalid === 'persona') h.original.player.personaKey = 'Other.png';
        else h.environment.message = undefined;
        const owner = captureTrackerOwner(h.readCurrent());
        assert.equal(h.commit(owner), null);
        assert.equal(h.calls.saved, 0);
        assert.deepEqual(h.card.statusOverrides, { HP: '4' });
        assert.equal(h.settings.master_items, undefined);
        assert.deepEqual(h.calls.emitted, []);
    }
});

test('storage refusal leaves planned cards and library changes unapplied', () => {
    const h = fixture();
    const owner = captureTrackerOwner(h.readCurrent());
    // Storage performs its own origin validation after the outer owner check.
    h.deps.stateOrigin.set(h.calculated.nextState, 'another-chat');
    const previousError = console.error;
    console.error = () => {};
    try { assert.equal(h.commit(owner), null); }
    finally { console.error = previousError; }
    assert.deepEqual(h.card.statusOverrides, { HP: '4' });
    assert.equal(h.settings.master_items, undefined);
    assert.equal(h.environment.metadata.state, h.original);
    assert.equal(h.environment.metadata.history, undefined);
    assert.equal(h.calls.settings, 0);
    assert.deepEqual(h.calls.emitted, []);
    assert.deepEqual(h.calls.roster, []);
});

test('storage revalidates ownership immediately before related store writes', () => {
    const h = fixture();
    const owner = captureTrackerOwner(h.readCurrent());
    const accepted = h.commit(owner, {}, (state, options) => {
        h.environment.personaKey = 'Other.png';
        return h.deps.saveStateToMetadata(state, options);
    });
    assert.equal(accepted, null);
    assert.deepEqual(h.card.statusOverrides, { HP: '4' });
    assert.equal(h.settings.master_items, undefined);
    assert.equal(h.environment.metadata.state, h.original);
    assert.equal(h.environment.metadata.history, undefined);
    assert.equal(h.calls.settings, 0);
    assert.deepEqual(h.calls.emitted, []);
    assert.deepEqual(h.calls.roster, []);
});

test('accepted plans reach roster capture and retain manual undo and swipe alignment', () => {
    const h = fixture();
    const accepted = h.commit(undefined, { label: 'Manual correction' });
    assert.equal(accepted, h.calculated.nextState);
    assert.equal(h.environment.metadata.state.player.stats.HP, '7');
    assert.deepEqual(h.card.statusOverrides, { HP: '8' });
    assert.deepEqual(h.settings.master_items, { items: { key: { name: 'Key' } } });
    assert.equal(h.calls.roster[0].card.statusOverrides.HP, '8');
    assert.deepEqual(h.calls.roster[0].library, h.settings.master_items);
    assert.equal(h.environment.metadata.history.length, 1);
    assert.equal(h.environment.metadata.history[0].label, 'Manual correction');
    assert.equal(h.environment.metadata.history[0].state.player.stats.HP, '5');
    assert.equal(h.calls.align, 1);
    assert.equal(h.calls.settings, 1);
    assert.deepEqual(h.calls.emitted, [accepted]);
    const undo = h.deps.undoLastChange();
    assert.equal(undo.state.player.stats.HP, '5');
    assert.equal(h.environment.metadata.state.player.stats.HP, '5');
    assert.deepEqual(h.environment.metadata.history, []);
});

test('preferred cache stays read-only and invalidates after metadata or saved-state changes', () => {
    for (const change of ['metadata with state', 'metadata without state', 'saved state pointer', 'removed saved state']) {
        const h = fixture();
        Object.assign(h.deps, {
            getCurrentPersonaKey: () => 'Alex.png', getCurrentPersonaName: () => 'Alex',
            activatePersona() {},
            createInitialState: () => ({ global: {}, characters: [], recently_deleted: {} }),
            createChatPlayerSeed: () => ({ stats: { HP: '10' }, collections: {} }),
        });
        h.original.recently_deleted = {};
        const cachedBefore = structuredClone(h.original);
        assert.equal(h.deps.loadStateFromMetadata({ preferCache: true }), h.original);
        assert.deepEqual(h.original, cachedBefore);
        assert.equal(h.calls.metadata, 0);
        assert.deepEqual(h.calls.emitted, []);
        assert.deepEqual(h.calls.roster, []);
        const replacement = structuredClone(h.original);
        replacement.player.stats.HP = '9';
        if (change === 'metadata with state') h.environment.metadata = { state: replacement };
        else if (change === 'metadata without state') h.environment.metadata = {};
        else if (change === 'removed saved state') delete h.environment.metadata.state;
        else h.environment.metadata.state = replacement;
        const loaded = h.deps.loadStateFromMetadata({ preferCache: true });
        assert.notEqual(loaded, h.original, change);
        const fresh = change === 'metadata without state' || change === 'removed saved state';
        assert.equal(loaded.player.stats.HP, fresh ? '10' : '9', change);
        assert.equal(h.deps.committedState, loaded, change);
        if (!fresh) assert.equal(loaded, replacement, change);
        assert.equal(h.environment.chatId, 'chat-a', change);
    }
});

test('message-owned commits keep the turn base separate from manual undo', () => {
    const h = fixture();
    const accepted = h.commit(undefined, { label: 'Reader update', partOfMessage: true });
    assert.equal(accepted, h.calculated.nextState);
    assert.equal(h.environment.metadata.history, undefined);
    assert.equal(h.calls.align, 0);
    assert.deepEqual(h.calls.emitted, [accepted]);
});

test('raw state peeks never repair data or reuse a cache after its metadata source changes', () => {
    const h = fixture();
    h.original.recently_deleted = {};
    const before = structuredClone(h.original);
    assert.equal(h.deps.peekStateFromMetadata(), h.original);
    assert.equal(h.deps.loadStateFromMetadata({ preferCache: true }), h.original);
    delete h.environment.metadata.state;
    assert.equal(h.deps.peekStateFromMetadata(), null);
    h.environment.metadata = {};
    assert.equal(h.deps.peekStateFromMetadata(), null);
    h.environment.metadata.state = { global: { Time: 'morning' } };
    assert.equal(h.deps.peekStateFromMetadata(), h.environment.metadata.state);
    h.environment.chatId = undefined;
    assert.equal(h.deps.peekStateFromMetadata(), null);
    assert.deepEqual(h.original, before);
    assert.equal(h.calls.metadata, 0);
    assert.equal(h.calls.settings, 0);
    assert.deepEqual(h.calls.roster, []);
    assert.deepEqual(h.calls.emitted, []);
});

test('raw state peeks accept a proven initial cache before its first save', () => {
    const h = fixture();
    h.environment.metadata = {};
    assert.equal(h.deps.peekStateFromMetadata(), null);
    assert.equal(h.deps.loadStateFromMetadata({ preferCache: true }), h.original);
    assert.equal(h.deps.peekStateFromMetadata(), h.original);
    h.environment.metadata = {};
    assert.equal(h.deps.peekStateFromMetadata(), null);
    assert.equal(h.calls.metadata, 0);
});
