import { bindStatusModule } from './helpers/status-module.mjs';
import { bindCollectionUpdates } from './fixtures/collection-updates-bind.mjs';
import { isStaticField } from '../src/core/constants-profile.js';
import assert from 'node:assert/strict';
import test from 'node:test';

function bindSource(path, dependencies, deps) {
    bindStatusModule(new URL(path, import.meta.url), deps, dependencies);
}

function fixture(masterItems) {
    const settings = { statusTracker: { collections: [{ id: 'moves', target: 'all', fields: [
        { name: 'move', type: 'text', isPrimary: true },
        { name: 'description', type: 'text', isStatic: true },
        { name: 'uses', type: 'number' },
    ] }] } };
    if (masterItems !== undefined) settings.master_items = masterItems;
    let saves = 0;
    const deps = { committedState: { player: { name: 'Player', collections: {} } },
        getCurrentPersonaName: () => 'Player', constrainToDefinition: (_field, value) => value };
    const boundaries = { getSettings: () => settings, saveSettings: () => { saves++; },
        isStaticField, debugLog: () => {}, LOG_PREFIX: 'test' };
    bindSource('../src/tracker/status-collection-schema.js', boundaries, deps);
    bindCollectionUpdates(deps, boundaries);
    return { deps, settings, saves: () => saves };
}

test('replacement preview never creates Item Library stores and acceptance writes only static fields', () => {
    for (const master of [undefined, {}]) {
        const { deps, settings, saves } = fixture(master);
        const before = structuredClone(settings);
        const actor = { name: 'Player', collections: {} };
        const item = { move: 'Spark', description: 'A tiny flash', uses: 3 };
        deps.applyCollectionUpdate(actor, 'moves', { replace: [item] }, { dryRun: true });
        assert.deepEqual(settings, before);
        assert.equal(saves(), 0);
        assert.deepEqual(actor.collections.moves, [item]);
        deps.applyCollectionUpdate(actor, 'moves', { replace: [item] });
        assert.deepEqual(settings.master_items, { moves: { spark: { move: 'Spark', description: 'A tiny flash' } } });
        assert.equal(saves(), 1);
    }
});

test('preview reads shared static fields without overwriting them or holder-specific values', () => {
    const { deps, settings, saves } = fixture({ moves: { spark: { description: 'Library description' } } });
    const before = structuredClone(settings);
    const actor = { name: 'Mira', collections: {} };
    deps.applyCollectionUpdate(actor, 'moves', [{ move: 'Spark', description: 'Attempted rewrite', uses: 2 }],
        { allowReplace: true, dryRun: true });
    assert.deepEqual(actor.collections.moves, [{ move: 'Spark', description: 'Library description', uses: 2 }]);
    assert.deepEqual(settings, before);
    assert.equal(saves(), 0);
});

test('direct additions and removals only change the supplied actor', () => {
    const { deps, settings, saves } = fixture();
    const before = structuredClone(deps.committedState);
    const settingsBefore = structuredClone(settings);
    const actor = { name: 'Player', collections: {} };
    deps.addItem(actor, 'moves', { move: 'Forgotten' }, { dryRun: true });
    assert.equal(actor.collections.moves[0].move, 'Forgotten');
    deps.removeItem(actor, 'moves', 'Forgotten');
    assert.deepEqual(actor.collections.moves, []);
    deps.addItem(actor, 'moves', { move: 'Forgotten' });
    assert.equal(actor.collections.moves[0].move, 'Forgotten');
    assert.deepEqual(deps.committedState, before);
    assert.deepEqual(settings, settingsBefore);
    assert.equal(saves(), 0);
});
