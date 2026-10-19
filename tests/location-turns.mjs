import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffTurnValues, applyTurnValues, turnEffectStatus } from '../src/tracker/snapshots/status-turn-delta.js';

const source = file => readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replaceAll('export function ', 'function ');
const evaluate = (file, dependencies, result) => new Function(...Object.keys(dependencies),
    `${source(file)}\nreturn ${result};`)(...Object.values(dependencies));

function fixture(initial) {
    let state = structuredClone(initial);
    const message = { mes: 'A new tavern opens beside the square.', swipe_id: 0, extra: {} };
    const context = { chat: [message], chatMetadata: {}, getCurrentChatId: () => 'places-test' };
    const session = { loadStateFromMetadata: () => state };
    evaluate('../src/tracker/status-chat-session.js', {
        getContext: () => context, getAllCharacters: () => [], debugLog: () => {},
        diffTurnValues, applyTurnValues,
    }, 'bind')(session);
    session.rememberSwipeBase('0', state);
    const snapshots = evaluate('../src/tracker/snapshots/status-snapshot-swipe.js', {
        getContext: () => context, debugLog: () => {},
        loadStateFromMetadata: () => state,
        saveStateToMetadata: next => { state = next; },
        getSwipeBase: session.getSwipeBase, swipeBaseRecord: session.swipeBaseRecord,
        getProfileBase: session.getProfileBase,
        restoreProfiles: session.restoreProfiles, snapshotProfiles: session.snapshotProfiles,
        getAppliedChanges: () => [], appliedChangesForCurrentSwipe: () => [],
        applyRows: () => {}, syncRebasedLore: () => {},
        diffTurnValues, applyTurnValues, turnEffectStatus,
    }, '{ rebaseToSwipe, revertToBase, alignSwipeBaseToNow, replacementReadingState }');
    return {
        session, snapshots, message, context,
        get state() { return state; },
        set state(next) { state = next; },
        apply(change) {
            session.refreshTurnBase('0');
            const next = structuredClone(state);
            change(next.locations);
            state = next;
            assert.equal(session.recordTurnEffects('0'), true);
        },
    };
}

const place = (id, name, description = '') => ({ id, name, aliases: [], description, parentId: '' });
const initialState = () => ({ global: {}, characters: [], locations: {
    enabled: true, currentId: 'square', records: {
        square: place('square', 'Old Square', 'A cobbled market square.'),
    },
} });

test('choosing rules before the first player message preserves chat-owned places', () => {
    const initial = initialState();
    const f = fixture(initial);
    f.context.chatMetadata.sillynpc_status_state = f.state;
    assert.equal(f.session.resetUnplayedChatState(), true);
    const reset = f.context.chatMetadata.sillynpc_status_state;
    assert.deepEqual(reset.locations, initial.locations);
    assert.deepEqual(reset.global, {});
    assert.equal(f.context.chatMetadata.sillynpc_swipe_base, undefined);
    assert.notEqual(reset.locations, initial.locations);
});

test('real turn records reverse reviewed discoveries, edits, and movement across swipes', () => {
    const initial = initialState();
    const f = fixture(initial);
    f.apply(locations => {
        locations.records.tavern = place('tavern', 'The Lantern', 'A new tavern.');
        locations.records.square.description = 'The market square has a new tavern.';
        locations.currentId = 'tavern';
    });
    const first = structuredClone(f.state);
    const firstExtra = structuredClone(f.message.extra);
    f.message.swipe_id = 1;
    f.message.mes = 'We remain in the square.';
    f.message.extra = {};
    assert.equal(f.snapshots.rebaseToSwipe('0').rebased, true);
    assert.deepEqual(f.state, initial);
    f.apply(locations => { locations.records.square.description = 'The square is quiet.'; });
    const second = structuredClone(f.state);
    const secondExtra = structuredClone(f.message.extra);

    f.message.swipe_id = 0;
    f.message.mes = 'A new tavern opens beside the square.';
    f.message.extra = firstExtra;
    assert.equal(f.snapshots.rebaseToSwipe('0').rebased, true);
    assert.deepEqual(f.state, first);
    f.message.swipe_id = 1;
    f.message.mes = 'We remain in the square.';
    f.message.extra = secondExtra;
    assert.equal(f.snapshots.rebaseToSwipe('0').rebased, true);
    assert.deepEqual(f.state, second);
});

test('deletion and regeneration restore the pre-turn places while preserving manual edits', () => {
    for (const removed of [false, true]) {
        const f = fixture(initialState());
        f.apply(locations => {
            locations.records.tavern = place('tavern', 'The Lantern');
            locations.records.square.description = 'The square is crowded.';
            locations.currentId = 'tavern';
        });
        f.state.locations.records.square.name = 'Founders Square';
        f.state.locations.records.square.description = 'My manually corrected square.';
        f.state.locations.records.garden = place('garden', 'The Garden');
        if (removed) f.context.chat.length = 0;
        assert.equal(f.snapshots.revertToBase('0').reverted, true);
        assert.equal(f.state.locations.currentId, 'square');
        assert.equal(f.state.locations.records.tavern, undefined);
        assert.equal(f.state.locations.records.square.name, 'Founders Square');
        assert.equal(f.state.locations.records.square.description, 'My manually corrected square.');
        assert.equal(f.state.locations.records.garden.name, 'The Garden');
    }
});

test('manual edits made between automatic reading and later place acceptance stay outside effects', () => {
    const f = fixture(initialState());
    // The automatic part records no place changes; review can arrive later.
    f.apply(() => {});
    f.state.locations.records.square.name = 'Founders Square';
    f.apply(locations => { locations.records.square.description = 'The market is closed.'; });
    assert.equal(f.snapshots.revertToBase('0').reverted, true);
    assert.equal(f.state.locations.records.square.name, 'Founders Square');
    assert.equal(f.state.locations.records.square.description, 'A cobbled market square.');
});

test('manual place edits survive legacy swipe bases without reply effects', () => {
    const f = fixture({ global: {}, characters: [] });
    f.state.locations = initialState().locations;
    f.state.locations.records.square.name = 'Founders Square';
    assert.equal(f.snapshots.alignSwipeBaseToNow(), 1);
    assert.notEqual(f.session.swipeBaseRecord().state.locations, f.state.locations);
    f.message.swipe_id = 1;
    f.message.mes = 'An older alternative reply.';
    assert.equal(f.snapshots.rebaseToSwipe('0').rebased, true);
    assert.equal(f.state.locations.records.square.name, 'Founders Square');
    assert.equal(f.state.locations.currentId, 'square');
});

test('editing a newly discovered place adopts it without retaining unrelated discovered geography', () => {
    for (const manualMarker of [false, true]) {
        const f = fixture(initialState());
        f.apply(locations => {
            locations.records.town = place('town', 'New Town');
            locations.records.tavern = { ...place('tavern', 'The Lantern'), parentId: 'town' };
            locations.currentId = 'town';
        });
        f.state.locations.records.tavern.description = 'A personally corrected tavern.';
        if (manualMarker) f.state.locations.currentId = 'tavern';
        const preview = f.snapshots.replacementReadingState('0');
        assert.equal(preview.locations.records.tavern.description, 'A personally corrected tavern.');
        assert.equal(preview.locations.records.town, undefined);
        assert.equal(preview.locations.records.tavern.parentId, '');
        f.message.swipe_id = 1;
        f.message.mes = 'We stay in the square.';
        f.message.extra = {};
        assert.equal(f.snapshots.rebaseToSwipe('0').rebased, true);
        assert.equal(f.state.locations.records.tavern.description, 'A personally corrected tavern.');
        assert.equal(f.state.locations.records.tavern.parentId, '');
        assert.equal(f.state.locations.records.town, undefined);
        assert.equal(f.state.locations.currentId, manualMarker ? 'tavern' : 'square');
    }
});
