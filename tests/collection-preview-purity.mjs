import { bindCollectionUpdates } from './fixtures/collection-updates-bind.mjs';
import { isStaticField } from '../src/core/constants-profile.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function bindSource(path, dependencies, deps) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replace('export function bind', 'function bind');
    new Function(...Object.keys(dependencies), `${source}\nreturn bind;`)(...Object.values(dependencies))(deps);
}
function fixture(masterItems) {
    const settings = { statusTracker: { collections: [{ id: 'moves', target: 'all', fields: [
        { name: 'move', type: 'text', isPrimary: true },
        { name: 'description', type: 'text', isStatic: true },
        { name: 'uses', type: 'number' },
    ] }] } };
    if (masterItems !== undefined) settings.master_items = masterItems;
    let saves = 0;
    const deps = { committedState: { recently_deleted: { moves: { forgotten: 2 } } },
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

test('dry-run direct additions cannot clear committed tombstones', () => {
    const { deps } = fixture();
    const actor = { name: 'Player', collections: {} };
    deps.addItem(actor, 'moves', { move: 'Forgotten' }, { dryRun: true });
    assert.equal(deps.committedState.recently_deleted.moves.forgotten, 2);
    deps.addItem(actor, 'moves', { move: 'Forgotten' });
    assert.equal(deps.committedState.recently_deleted.moves.forgotten, undefined);
});

test('collection operations without tombstone checks do not load or repair tracker state', () => {
    const settings = { statusTracker: { collections: [{ id: 'moves', targets: ['player'],
        fields: [{ name: 'move', type: 'text', isPrimary: true },
            { name: 'qty', type: 'number', defaultValue: '1' }] }] } };
    const deps = { getCurrentPersonaName: () => 'Player',
        loadStateFromMetadata: () => { throw new Error('Unexpected state load'); } };
    bindCollectionUpdates(deps, { getSettings: () => settings });
    const actor = { name: 'Mira', collections: { moves: [{ move: 'Spark' }] } };
    deps.applyCollectionUpdate(actor, 'missing', { add: [{ move: 'Spark' }] }, { dryRun: true });
    deps.applyCollectionUpdate(actor, 'moves', { add: [{ move: 'Spark' }] }, { dryRun: true });
    assert.equal(deps.takeCollectionWarnings().length, 2);
    assert.deepEqual(actor.collections.moves, [{ move: 'Spark' }]);
    deps.removeItem(actor, 'moves', 'Spark');
    assert.deepEqual(actor.collections.moves, []);

    const held = [{ move: 'Spark', qty: 2 }];
    for (const [update, expected] of [
        [{ remove: [{ move: 'Spark', all: true }] }, []],
        [{ update: [{ move: 'Spark', qty: 4 }] }, [{ move: 'Spark', qty: 4 }]],
        [{ clear: true }, []], [{}, held], [{ replace: [] }, []], [{ add: [{}] }, held],
    ]) {
        const player = { name: 'Player', collections: { moves: structuredClone(held) } };
        deps.applyCollectionUpdate(player, 'moves', update, { allowReplace: true, dryRun: true });
        assert.deepEqual(player.collections.moves, expected);
    }
    for (const qty of [0, '2']) {
        const player = { name: 'Player', collections: { moves: structuredClone(held) } };
        deps.addItem(player, 'moves', { move: 'Spark', qty });
        assert.deepEqual(player.collections.moves, held);
    }
});
