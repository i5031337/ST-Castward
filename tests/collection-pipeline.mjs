import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCollectionPlan, installCollectionChanges } from '../src/tracker/collection-pipeline.js';

const tracker = { collections: [{ id: 'gear', targets: ['player', 'npc'], trackQuantity: true, fields: [
    { name: 'name', type: 'text', isPrimary: true },
    { name: 'description', type: 'text', isStatic: true },
    { name: 'rarity', type: 'text', isStatic: true, options: ['Common', 'Rare'] },
    { name: 'quantity', type: 'number', isStatic: false, defaultValue: 1 },
    { name: 'condition', type: 'text', isStatic: false },
] }] };
const held = { name: 'Sword', description: 'Established steel blade', rarity: 'Common', quantity: 1, condition: 'Worn' };

function freeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}

test('reader, manual-add and starting/import plans share definition precedence and holder-specific readings', () => {
    const incoming = { ...held, name: 'sword', description: 'Attempted replacement', rarity: 'Rare', quantity: 2 };
    const itemLibrary = { gear: { sword: { name: 'Sword', description: held.description, rarity: 'Common' } } };
    const base = freeze({ tracker, itemLibrary, actor: { collections: { gear: [] } }, scope: 'player' });
    const requests = [
        { collectionId: 'gear', update: { add: [incoming] } },
        { collectionId: 'gear', operation: 'add', item: incoming },
        { operation: 'replace-all', update: { gear: [incoming] }, validation: 'strict', requiredCollections: true, preserveUnknown: false },
        { operation: 'replace-all', update: { gear: [incoming] }, validation: 'strict', preserveUnknown: true },
    ];
    for (const request of requests) {
        const plan = calculateCollectionPlan({ ...base, ...request });
        assert.deepEqual(plan.collections.gear, [{ ...held, quantity: 2 }]);
        assert.deepEqual(plan.libraryChanges, []);
        assert.deepEqual(itemLibrary.gear.sword, { name: 'Sword', description: held.description, rarity: 'Common' });
    }
});

test('manual adds obey collection targets and unknown IDs leave holdings untouched', () => {
    const actor = { collections: { gear: [] } };
    for (const request of [
        { collectionId: 'missing', scope: 'player' },
        { collectionId: 'gear', scope: 'global' },
    ]) {
        const plan = calculateCollectionPlan({ tracker, actor, operation: 'add',
            item: held, ...request });
        assert.deepEqual(plan.collections, actor.collections);
        assert.deepEqual(plan.libraryChanges, []);
        assert.equal(plan.warnings.length, 1);
    }
    const plan = calculateCollectionPlan({ tracker, actor, operation: 'add',
        collectionId: 'GEAR', scope: 'player', item: held });
    assert.deepEqual(plan.collections.gear, [held]);
    assert.equal(plan.collections.GEAR, undefined);
});

test('strict creation plans validate after lookup and reject the whole plan without publishing earlier entries', () => {
    for (const scope of ['player', 'npc', undefined]) {
        const itemLibrary = freeze({ gear: { sword: { name: 'Sword', description: held.description, rarity: 'Retired' } } });
        const settings = { master_items: itemLibrary };
        const request = freeze({ tracker, itemLibrary, actor: { collections: {} }, scope,
            operation: 'replace-all', validation: 'strict', preserveUnknown: true,
            update: { gear: [{ ...held, name: 'Shield' }, held] } });
        assert.throws(() => calculateCollectionPlan(request), /rarity.*allowed values/);
        assert.equal(settings.master_items.gear.shield, undefined);
        assert.equal(settings.master_items.gear.sword.rarity, 'Retired');
    }
});

test('accepted holdings fill partial definitions before acquisition proposals and remain private until installed', () => {
    const itemLibrary = { gear: { sword: { name: 'Sword' } } };
    const before = structuredClone(itemLibrary);
    const request = freeze({ tracker, itemLibrary, actor: { collections: { gear: [] } }, scope: 'player',
        acceptedHoldings: [{ gear: [held] }], collectionId: 'gear',
        update: { add: [{ ...held, description: 'Unaccepted proposal', quantity: 2 }] } });
    const plan = calculateCollectionPlan(request);
    assert.equal(plan.collections.gear[0].description, held.description);
    assert.equal(plan.collections.gear[0].quantity, 2);
    assert.deepEqual(itemLibrary, before);
    const accepted = { master_items: structuredClone(itemLibrary) };
    installCollectionChanges(accepted, plan.libraryChanges);
    assert.deepEqual(accepted.master_items.gear.sword, { name: 'Sword', description: held.description, rarity: 'Common' });
    assert.equal(accepted.master_items.gear.sword.quantity, undefined);
    assert.deepEqual(itemLibrary, before);
});

test('an explicit manual shared-field edit becomes the definition used by later reader plans', () => {
    const itemLibrary = { gear: { sword: { name: 'Sword', description: held.description, rarity: 'Common' } } };
    const actor = { collections: { gear: [held] } };
    const edit = calculateCollectionPlan({ tracker, itemLibrary, actor, scope: 'player', collectionId: 'gear',
        operation: 'edit', item: held, index: 0, fieldName: 'rarity', value: 'Rare' });
    assert.equal(edit.collections.gear[0].rarity, 'Rare');
    assert.equal(edit.collections.gear[0].quantity, 1);
    const settings = { master_items: structuredClone(itemLibrary) };
    installCollectionChanges(settings, edit.libraryChanges);
    const reader = calculateCollectionPlan({ tracker, itemLibrary: settings.master_items, actor: { collections: { gear: [] } },
        scope: 'npc', collectionId: 'gear', update: { add: [{ ...held, quantity: 4 }] } });
    assert.equal(reader.collections.gear[0].rarity, 'Rare');
    assert.equal(reader.collections.gear[0].quantity, 4);
    assert.equal(itemLibrary.gear.sword.rarity, 'Common');
    assert.equal(actor.collections.gear[0].rarity, 'Common');
});


test('normalized identifiers resolve existing definitions before starting, import, and ordinary updates', () => {
    const itemLibrary = { gear: { sword: { name: 'Sword', description: held.description, rarity: 'Common' } } };
    const incoming = { ...held, name: ' Sword ', description: 'Invented gold blade', rarity: 'Rare' };
    for (const request of [
        { collectionId: 'gear', update: { add: [incoming] } },
        { collectionId: 'gear', operation: 'add', item: incoming },
        { operation: 'replace-all', validation: 'strict', requiredCollections: true, preserveUnknown: false, update: { gear: [incoming] } },
        { operation: 'replace-all', validation: 'strict', preserveUnknown: true, update: { gear: [incoming] } },
    ]) {
        const plan = calculateCollectionPlan({ tracker, itemLibrary, actor: { collections: { gear: [] } }, ...request });
        assert.deepEqual(plan.collections.gear, [held]);
        assert.deepEqual(plan.libraryChanges, []);
    }
    assert.equal(itemLibrary.gear.sword.description, held.description);
});

test('primary-field constraints run before definition lookup on normal updates', () => {
    const rules = structuredClone(tracker);
    rules.collections[0].fields[0].maxLength = 5;
    const itemLibrary = { gear: { 'sword…': { name: 'Sword…', description: held.description, rarity: 'Common' } } };
    const plan = calculateCollectionPlan({ tracker: rules, itemLibrary, actor: { collections: { gear: [] } },
        collectionId: 'gear', update: { add: [{ ...held, name: 'Sword of Gold', description: 'Invented gold blade' }] } });
    assert.equal(plan.collections.gear[0].name, 'Sword…');
    assert.equal(plan.collections.gear[0].description, held.description);
    assert.deepEqual(plan.libraryChanges, []);
});
