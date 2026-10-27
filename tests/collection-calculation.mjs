import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCollectionUpdate } from '../src/tracker/collection-calculation.js';
import { setNpcTemplateSettingsProvider } from '../src/core/npc-templates.js';

function freeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}
function fixture(overrides = {}) {
    return {
        actor: { name: 'Player', collections: { inventory: [{ title: 'Potion', qty: 2, condition: 'New' }] } },
        collectionId: 'inventory', scope: 'player', system: null,
        tracker: { collections: [{ id: 'inventory', targets: ['player', 'npc'], trackQuantity: true,
            fields: [{ name: 'title', type: 'text', isPrimary: true, isStatic: true },
                { name: 'qty', type: 'number', defaultValue: '1' },
                { name: 'condition', type: 'text', options: ['New', 'Used'], defaultValue: 'New' }] }] },
        itemLibrary: {}, ...overrides,
    };
}

test('collection calculation accepts frozen inputs and keeps quantity operations local to its result', () => {
    const input = freeze(fixture({ update: {
        add: [{ title: 'Potion', qty: 2 }],
        remove: [{ title: 'Potion', qty: 1 }],
        update: [{ title: 'Potion', qty: 6, condition: 'Used' }],
    } }));
    const result = calculateCollectionUpdate(input);
    assert.deepEqual(result.collections.inventory, [{ title: 'Potion', qty: 6, condition: 'Used' }]);
    assert.deepEqual(input.actor.collections.inventory, [{ title: 'Potion', qty: 2, condition: 'New' }]);
    assert.deepEqual(result.libraryChanges, []);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.refusedValues, []);
});

test('ordinary arrays retain omitted holdings while explicit replacements plan library changes', () => {
    const base = fixture({ itemLibrary: { inventory: { tonic: { title: 'Tonic', condition: 'Used' } } } });
    base.tracker.collections[0].fields[2].isStatic = true;
    const additions = calculateCollectionUpdate(freeze({ ...base,
        update: [{ title: 'Tonic', qty: 3, condition: 'New' }] }));
    assert.deepEqual(additions.collections.inventory, [
        { title: 'Potion', qty: 2, condition: 'New' }, { title: 'Tonic', qty: 3, condition: 'New' },
    ]);
    assert.deepEqual(additions.libraryChanges, []);
    const replacement = calculateCollectionUpdate(freeze({ ...base,
        update: { replace: [{ title: 'Tonic', qty: 3, condition: 'New' }, { title: 'Elixir', qty: 4, condition: 'New' }] } }));
    assert.deepEqual(replacement.collections.inventory, [
        { title: 'Tonic', qty: 3, condition: 'Used' }, { title: 'Elixir', qty: 4, condition: 'New' },
    ]);
    assert.deepEqual(replacement.libraryChanges, [{ collectionId: 'inventory', itemName: 'Elixir',
        fields: { title: 'Elixir', condition: 'New' } }]);
    assert.deepEqual(base.itemLibrary, { inventory: { tonic: { title: 'Tonic', condition: 'Used' } } });
});

test('calculation uses explicit scope and System instead of actor name or active global templates', () => {
    const system = { npcTemplates: [{ id: 'human', name: 'Human' }] };
    const base = fixture({ scope: 'npc', system,
        actor: { name: 'Player', npcTemplateId: 'human', collections: {} },
        update: { add: [{ title: 'Coat', qty: 1, condition: 'New' }] } });
    base.tracker.collections[0].targets = ['template:human'];
    setNpcTemplateSettingsProvider(() => ({ activeSystem: 'Other', statusTracker: {
        presets: { Other: { definition: { npcTemplates: [] } } },
    } }));
    try {
        const accepted = calculateCollectionUpdate(freeze(base));
        assert.deepEqual(accepted.collections.inventory, [{ title: 'Coat', qty: 1, condition: 'New' }]);
        const denied = calculateCollectionUpdate({ ...base, scope: 'player' });
        assert.deepEqual(denied.collections, {});
        assert.equal(denied.warnings.length, 1);
        assert.deepEqual(calculateCollectionUpdate({ ...base, system: null }).collections, {});
    } finally {
        setNpcTemplateSettingsProvider(() => null);
    }
});

test('removed items can be acquired again by their former holder or another actor', () => {
    for (const scope of ['player', 'npc']) {
        const base = freeze(fixture({ scope }));
        const removed = calculateCollectionUpdate({ ...base, operation: 'remove', update: 'Potion' });
        assert.deepEqual(removed.collections.inventory, []);
        for (const update of [{ add: [{ title: 'Potion', qty: 1 }] }, { replace: [{ title: 'Potion', qty: 1 }] }]) {
            for (const name of ['Player', 'Mira']) {
                const reacquired = calculateCollectionUpdate({ ...base,
                    actor: { name, collections: removed.collections }, update });
                assert.deepEqual(reacquired.collections.inventory, [{ title: 'Potion', qty: 1, condition: 'New' }]);
            }
        }
        assert.equal(base.actor.collections.inventory.length, 1);
    }
});

test('field refusals belong to the returned calculation and cannot leak into another proposal', () => {
    const input = freeze(fixture({ update: { update: [{ title: 'Potion', condition: 'Broken' }] } }));
    const refused = calculateCollectionUpdate(input);
    assert.equal(refused.collections.inventory[0].condition, 'New');
    assert.deepEqual(refused.refusedValues, [{ field: 'condition', wanted: 'Broken', allowed: ['New', 'Used'], kept: 'New' }]);
    const accepted = calculateCollectionUpdate({ ...input, update: { update: [{ title: 'Potion', condition: 'Used' }] } });
    assert.equal(accepted.collections.inventory[0].condition, 'Used');
    assert.deepEqual(accepted.refusedValues, []);
    assert.deepEqual(accepted.warnings, []);
    assert.equal(refused.refusedValues.length, 1);
});

test('replacement previews reuse the first new item’s static fields without changing the library', () => {
    const input = fixture({ actor: { name: 'Player', collections: {} }, update: { replace: [
        { title: 'Sword', qty: 1, condition: 'New' },
        { title: 'sword', qty: 2, condition: 'Used' },
    ] } });
    input.tracker.collections[0].fields[2].isStatic = true;
    freeze(input);
    const preview = calculateCollectionUpdate({ ...input, preview: true });
    const accepted = calculateCollectionUpdate(input);
    assert.deepEqual(preview, accepted);
    assert.deepEqual(preview.collections.inventory, [
        { title: 'Sword', qty: 1, condition: 'New' },
        { title: 'Sword', qty: 2, condition: 'New' },
    ]);
    assert.equal(preview.libraryChanges.length, 1);
    assert.deepEqual(input.itemLibrary, {});
    assert.deepEqual(input.actor.collections, {});
});
