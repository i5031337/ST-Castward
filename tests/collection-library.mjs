import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { calculateCollectionPlan, installCollectionChanges } from '../src/tracker/collection-pipeline.js';
import { seedKnownNpcCollections, npcStartingCollections } from '../src/npc/npc-collection-generation.js';

const definitions = [{ id: 'gear', targets: ['player', 'npc'], fields: [
    { name: 'name', type: 'text', isPrimary: true },
    { name: 'description', type: 'text', isStatic: true },
    { name: 'quantity', type: 'number', defaultValue: '1' },
    { name: 'condition', type: 'text', isStatic: false },
] }];
const item = { name: 'Sword', description: 'Steel blade', quantity: 3, condition: 'Worn' };

test('delta additions, edits and partial consumption register definitions without sharing holder readings', () => {
    for (const update of [{ add: [item] }, { update: [{ name: 'Sword', quantity: 2 }] },
        { remove: [{ name: 'Sword', quantity: 1 }] }]) {
        const actor = { name: 'Player', collections: { gear: update.add ? [] : [item] } };
        const result = calculateCollectionPlan({ actor, collectionId: 'gear', update,
            tracker: { collections: definitions }, scope: 'player' });
        assert.deepEqual(result.libraryChanges, [{ collectionId: 'gear', itemName: 'Sword',
            fields: { name: 'Sword', description: 'Steel blade' } }]);
        assert.deepEqual(actor.collections.gear, update.add ? [] : [item]);
    }
});

test('acquisition and reader edits use existing definitions while retaining holder-specific changes', () => {
    const itemLibrary = { gear: { sword: { name: 'Sword', description: 'Library blade' } } };
    for (const update of [{ add: [{ ...item, name: 'sword' }] },
        { update: [{ ...item, description: 'Attempted rewrite', quantity: 2 }] }]) {
        const result = calculateCollectionPlan({ actor: { collections: { gear: [item] } },
            collectionId: 'gear', update, tracker: { collections: definitions }, scope: 'player', itemLibrary });
        assert.equal(result.collections.gear[0].description, 'Library blade');
        assert.equal(result.collections.gear[0].condition, 'Worn');
        assert.equal(result.collections.gear[0].quantity, update.add ? 6 : 2);
        assert.deepEqual(result.libraryChanges, []);
        assert.equal(itemLibrary.gear.sword.description, 'Library blade');
    }
});

test('matching definitions ignore incoming static fields absent from the library too', () => {
    const result = calculateCollectionPlan({ actor: { collections: { gear: [] } },
        collectionId: 'gear', update: { add: [item] }, tracker: { collections: definitions },
        scope: 'player', itemLibrary: { gear: { sword: { name: 'Sword' } } } });
    assert.equal(result.collections.gear[0].name, 'Sword');
    assert.equal(result.collections.gear[0].description, '');
    assert.equal(result.collections.gear[0].condition, 'Worn');
    assert.deepEqual(result.libraryChanges, []);
});

test('manual additions and dynamic edits register missing definitions; explicit static edits update them', () => {
    const actor = { collections: { gear: [item] } };
    const base = { actor, collectionId: 'gear', tracker: { collections: definitions }, scope: 'player', itemLibrary: {} };
    const add = calculateCollectionPlan({ ...base, operation: 'add', item: { ...item, name: 'Shield' } });
    assert.equal(add.library.gear.shield.description, 'Steel blade');
    const dynamic = calculateCollectionPlan({ ...base, operation: 'edit', item, index: 0, fieldName: 'quantity', value: 7 });
    assert.deepEqual(dynamic.library.gear.sword, { name: 'Sword', description: 'Steel blade' });
    const changed = calculateCollectionPlan({ ...base, itemLibrary: dynamic.library,
        operation: 'edit', item, index: 0, fieldName: 'description', value: 'Silver blade' });
    assert.equal(changed.library.gear.sword.description, 'Silver blade');
    assert.equal(changed.collections.gear[0].description, 'Silver blade');
    assert.deepEqual(base.itemLibrary, {});
    assert.equal(actor.collections.gear[0].description, 'Steel blade');
});

test('NPC creation registers both generated and previously held collections through the shared resolver', () => {
    const settings = { statusTracker: { collections: definitions }, master_items: {
        gear: { sword: { name: 'Sword', description: 'Library blade' } },
    } };
    const state = { characters: [{ name: 'Mira', collections: { gear: [item] } }] };
    const source = readFileSync(new URL('../src/npc/npc-tool.js', import.meta.url), 'utf8');
    const start = source.indexOf('commit: draft => {') + 'commit: '.length;
    const body = source.slice(start, source.indexOf('\n    beforeCreate:', start)).trim().replace(/,$/, '');
    const deps = { getSettings: () => settings, knownActor: name => state.characters.find(actor => actor.name === name),
        calculateCollectionPlan, installCollectionChanges, seedKnownNpcCollections, npcStartingCollections,
        activeNpcSystem: () => null,
        createCharacter: name => ({ name }), getContext: () => ({ chatMetadata: { sillynpc_status_state: state } }),
        saveStateToMetadata() {}, saveSettings() {}, triggerReprocess() {} };
    const commit = new Function(...Object.keys(deps), `return (${body});`)(...Object.values(deps));
    const known = commit({ name: 'Mira', statusCollections: { gear: [item] } });
    assert.equal(known.statusCollections.gear[0].description, 'Library blade');
    const fresh = commit({ name: 'New NPC', statusCollections: { gear: [{ ...item, name: 'Shield' }] } });
    assert.deepEqual(settings.master_items.gear.shield, { name: 'Shield', description: 'Steel blade' });
    assert.equal(fresh.statusCollections.gear[0].quantity, 3);
});


test('holder renames reuse an existing destination definition and retain the source definition', () => {
    const source = { gear: { sword: { name: 'Sword', description: 'Steel blade' },
        dagger: { name: 'Dagger', description: 'Established short blade' } } };
    const plan = calculateCollectionPlan({ actor: { collections: { gear: [item] } }, item,
        collectionId: 'gear', operation: 'edit', index: 0, fieldName: 'name', value: 'Dagger',
        tracker: { collections: definitions }, scope: 'player', itemLibrary: source });
    assert.equal(plan.collections.gear[0].description, 'Established short blade');
    assert.equal(plan.collections.gear[0].quantity, 3);
    assert.deepEqual(plan.library, source);
});


test('accepted held fields complete partial definitions before quantity edits and reader mutations', () => {
    const itemLibrary = { gear: { sword: { name: 'Sword' } } };
    const before = structuredClone(itemLibrary);
    const actor = { name: 'Player', collections: { gear: [item] } };
    const input = { actor, collectionId: 'gear', tracker: { collections: definitions }, scope: 'player', itemLibrary };
    const manual = calculateCollectionPlan({ ...input, operation: 'edit', item, index: 0, fieldName: 'quantity', value: 2 });
    assert.equal(manual.collections.gear[0].description, 'Steel blade');
    assert.equal(manual.collections.gear[0].quantity, 2);
    assert.deepEqual(manual.library.gear.sword, { name: 'Sword', description: 'Steel blade' });
    assert.equal(manual.libraryChanged, true);
    for (const [update, quantity] of [
        [{ add: [{ ...item, description: 'Rejected definition', quantity: 1 }] }, 4],
        [{ update: [{ name: 'Sword', description: 'Rejected definition', quantity: 2 }] }, 2],
        [{ remove: [{ name: 'Sword', quantity: 1 }] }, 2],
        [{ replace: [{ ...item, description: 'Rejected definition', quantity: 2 }] }, 2],
    ]) {
        const result = calculateCollectionPlan({ ...input, update });
        assert.equal(result.collections.gear[0].description, 'Steel blade');
        assert.equal(result.collections.gear[0].quantity, quantity);
        assert.deepEqual(result.libraryChanges, [{ collectionId: 'gear', itemName: 'Sword',
            fields: { name: 'Sword', description: 'Steel blade' } }]);
    }
    assert.deepEqual(itemLibrary, before);
    assert.deepEqual(actor.collections.gear, [item]);
});

test('accepted-held backfill preserves explicit library fields and permits explicit manual edits', () => {
    const itemLibrary = { gear: { sword: { name: 'Sword', description: 'Library blade' } } };
    const input = { actor: { collections: { gear: [item] } }, item, collectionId: 'gear',
        tracker: { collections: definitions }, scope: 'player', itemLibrary, operation: 'edit', index: 0 };
    const quantity = calculateCollectionPlan({ ...input, fieldName: 'quantity', value: 2 });
    assert.equal(quantity.collections.gear[0].description, 'Library blade');
    assert.equal(quantity.libraryChanged, false);
    const description = calculateCollectionPlan({ ...input, fieldName: 'description', value: 'Silver blade' });
    assert.equal(description.collections.gear[0].description, 'Silver blade');
    assert.equal(description.library.gear.sword.description, 'Silver blade');
    assert.equal(itemLibrary.gear.sword.description, 'Library blade');
});
