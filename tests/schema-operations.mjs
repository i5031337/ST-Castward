import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateSchemaOperation, installSchemaWrites } from '../src/tracker/schema-operation-calculation.js';

function fixture() {
    const field = { id: 'hp', name: 'HP', targets: ['player', 'template:mage'] };
    const collection = { id: 'gear', fields: [{ name: 'name', isPrimary: true }, { name: 'kind', isStatic: true }] };
    const system = { stats: { character: [field] }, npcTemplates: [{ id: 'mage' }, { id: 'beast' }] };
    const tracker = { presets: { story: { definition: system } }, playerStats: [field], npcStats: [field], collections: [collection],
        template: 'HP [{{HP}}] {{HPMax}}', customCSS: '.HP {}' };
    const state = { global: {}, player: { name: 'Hero', stats: { HP: '3' }, collections: { gear: [{ name: 'Wand', kind: 'wood' }] } },
        players: { other: { stats: { HP: '9' }, collections: { gear: [{ name: 'Ring', kind: 'gold' }], keepsakes: [{ name: 'Letter' }] } },
            empty: { stats: {} } }, characters: [{ npcTemplateId: 'mage', stats: { HP: '4' }, collections: { gear: [{ name: 'Hat', kind: 'cloth' }] } },
            { npcTemplateId: 'beast', stats: { HP: '8' } }], recently_deleted: { gear: { hat: 2 } } };
    const cards = [{ npcTemplateId: 'mage', statusOverrides: { HP: '5' }, statusCollections: { gear: [{ name: 'Hat', kind: 'cloth' }] } }];
    const personaData = { p: { stats: { HP: '7' }, collections: { gear: [{ name: 'Cane', kind: 'wood' }] } } };
    const itemLibrary = { gear: { wand: { name: 'Wand', kind: 'wood' } } };
    return { field, collection, system, tracker, state, cards, personaData, itemLibrary };
}

function frozen(value) {
    if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) frozen(child); }
    return value;
}

test('shared stat plan leaves inputs untouched, includes schema and assigned stores, and preserves identifiers', () => {
    const f = fixture();
    const before = structuredClone(f);
    const plan = calculateSchemaOperation({ ...frozen(f), operation: { type: 'stat', scopes: ['playerStats', 'npcStats'], oldName: 'HP', newName: 'Health', field: f.field } });
    assert.deepEqual(f, before);
    assert.deepEqual(plan.nextState.player.stats, { Health: '3' });
    assert.deepEqual(plan.nextState.players.other.stats, { Health: '9' });
    assert.deepEqual(plan.nextState.characters.map(actor => actor.stats), [{ Health: '4' }, { HP: '8' }]);
    assert.ok(plan.writes.some(write => write.target === f.field && write.key === 'name' && write.value === 'Health'));
    assert.ok(plan.writes.some(write => write.target === f.tracker && write.key === 'template' && write.value === 'Health [{{Health}}] {{HPMax}}'));
    assert.ok(plan.writes.some(write => write.target === f.cards[0] && write.key === 'statusOverrides'));
    assert.equal(f.field.id, 'hp');
});

test('collection field and ID plans cover library, all personas, offstage cards, live actors and tombstones', () => {
    const f = fixture();
    const oldField = f.collection.fields[1];
    const before = structuredClone(f);
    const plan = calculateSchemaOperation({ ...f, operation: { type: 'collection-field', collectionId: 'gear', oldName: 'kind', newName: 'material', field: oldField } });
    assert.deepEqual(f, before);
    assert.equal(plan.result.values, 6);
    assert.deepEqual(plan.nextState.players.other.collections, {
        gear: [{ name: 'Ring', material: 'gold' }], keepsakes: [{ name: 'Letter' }],
    });
    assert.deepEqual(plan.nextState.players.empty, { stats: {} });
    installSchemaWrites(plan.writes);
    assert.equal(oldField.name, 'material');
    assert.deepEqual(f.itemLibrary.gear.wand, { name: 'Wand', material: 'wood' });
    assert.deepEqual(f.cards[0].statusCollections.gear[0], { name: 'Hat', material: 'cloth' });
    assert.equal(plan.nextState.player.collections.gear[0].material, 'wood');
    const idBefore = structuredClone(f);
    const idPlan = calculateSchemaOperation({ ...f, operation: { type: 'collection-id', oldName: 'gear', newName: 'equipment', definition: f.collection } });
    assert.deepEqual(f, idBefore);
    installSchemaWrites(idPlan.writes);
    assert.equal(f.collection.id, 'equipment');
    assert.equal(f.itemLibrary.gear, undefined);
    assert.ok(f.itemLibrary.equipment.wand);
    assert.deepEqual(idPlan.nextState.players.other.collections, {
        equipment: [{ name: 'Ring', kind: 'gold' }], keepsakes: [{ name: 'Letter' }],
    });
    assert.deepEqual(idPlan.nextState.players.empty, { stats: {} });
    assert.deepEqual(idPlan.nextState.recently_deleted, { equipment: { hat: 2 } });
});

test('collection renames retain migrated inactive persona holdings through installation', () => {
    const f = runtimeFixture();
    assert.ok(f.run({ type: 'collection-field', collectionId: 'gear', oldName: 'kind', newName: 'material', field: f.collection.fields[1] }));
    assert.ok(f.run({ type: 'collection-id', oldName: 'gear', newName: 'equipment', definition: f.collection }));
    assert.deepEqual(f.stateNow().players.other.collections, {
        equipment: [{ name: 'Ring', material: 'gold' }], keepsakes: [{ name: 'Letter' }],
    });
    assert.deepEqual(f.stateNow().players.empty, { stats: {} });
    assert.equal(f.settingsSaves(), 2);
});

test('collection field collision keeps occupied destination and key order in both orders', () => {
    for (const item of [{ kind: 'old', material: 'new', last: 1 }, { material: 'new', kind: 'old', last: 1 }]) {
        const f = fixture();
        f.itemLibrary.gear.wand = item;
        const plan = calculateSchemaOperation({ ...f, operation: { type: 'collection-field', collectionId: 'gear', oldName: 'kind', newName: 'material' } });
        installSchemaWrites(plan.writes);
        assert.deepEqual(f.itemLibrary.gear.wand, { material: 'new', last: 1 });
    }
});

function runtimeFixture({ noChat = false, refuse = false, switchDuringSave = false, boundSystemKey, changeBoundDuringSave = false } = {}) {
    const f = fixture();
    const settings = { activeSystem: 'story', statusTracker: f.tracker, personaData: f.personaData, master_items: f.itemLibrary };
    let context = { getCurrentChatId: () => noChat ? undefined : 'chat', chatMetadata: { sillynpc_status_state: f.state, sillynpc_system: boundSystemKey } };
    const history = [];
    let settingsSaves = 0;
    const source = readFileSync(new URL('../src/tracker/schema-operation-runtime.js', import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '').replace('export function ', 'function ');
    const run = new Function('getContext', 'getSettings', 'saveSettings', 'getLibraryCharacters', 'calculateSchemaOperation', 'installSchemaWrites', `${source}\nreturn runSchemaOperation;`)(
        () => context, () => settings, () => settingsSaves++, () => f.cards, calculateSchemaOperation, installSchemaWrites);
    const capabilities = { personaKey: () => 'hero', peekState: () => f.state, saveState: (state, options) => {
        if (switchDuringSave) context = { getCurrentChatId: () => 'other', chatMetadata: {} };
        if (changeBoundDuringSave) context.chatMetadata.sillynpc_system = 'other';
        if (refuse || !options.isCurrent()) return false;
        options.beforeCommit();
        history.push(structuredClone(context.chatMetadata.sillynpc_status_state));
        context.chatMetadata.sillynpc_status_state = state;
        return true;
    } };
    return { ...f, settings, run: operation => run(operation, capabilities), history, settingsSaves: () => settingsSaves, stateNow: () => context.chatMetadata.sillynpc_status_state };
}

test('storage refusal and ownership change reject schema and every related effect before installation', () => {
    for (const options of [{ refuse: true }, { switchDuringSave: true }, { boundSystemKey: 'story', changeBoundDuringSave: true }]) {
        const f = runtimeFixture(options);
        const before = structuredClone(f.settings);
        const state = structuredClone(f.state);
        const cards = structuredClone(f.cards);
        assert.equal(f.run({ type: 'stat', scopes: ['playerStats', 'npcStats'], oldName: 'HP', newName: 'Health', field: f.field }), null);
        assert.deepEqual(f.settings, before);
        assert.deepEqual(f.state, state);
        assert.deepEqual(f.cards, cards);
        assert.equal(f.settingsSaves(), 0);
        assert.equal(f.history.length, 0);
    }
});

test('accepted schema migration installs new keys before history is captured', () => {
    const f = runtimeFixture();
    const result = f.run({ type: 'stat', scopes: ['playerStats', 'npcStats'], oldName: 'HP', newName: 'Health', field: f.field });
    assert.ok(result.values > 0);
    assert.equal(f.field.name, 'Health');
    assert.deepEqual(f.stateNow().player.stats, { Health: '3' });
    assert.equal(f.stateNow(), f.state);
    assert.deepEqual(f.history[0], f.stateNow());
    assert.equal(f.history[0].player.stats.HP, undefined);
    assert.equal(f.history[0].player.stats.Health, '3');
    assert.equal(f.settingsSaves(), 1);
});

test('global library/schema operations work without a chat and never edit retained old metadata', () => {
    const f = runtimeFixture({ noChat: true });
    const before = structuredClone(f.state);
    assert.ok(f.run({ type: 'library-update', collectionId: 'gear', itemName: 'Wand', itemData: { name: 'Wand', kind: 'oak', uses: 7 } }));
    assert.deepEqual(f.settings.master_items.gear.wand, { name: 'Wand', kind: 'oak' });
    assert.ok(f.run({ type: 'stat', scopes: ['playerStats', 'npcStats'], oldName: 'HP', newName: 'Health', field: f.field }));
    assert.equal(f.field.name, 'Health');
    assert.deepEqual(f.state, before);
    assert.equal(f.history.length, 0);
    assert.equal(f.settingsSaves(), 2);
});

test('sequential library field edits keep the rendered library reference current', () => {
    const f = runtimeFixture({ noChat: true });
    const master = f.settings.master_items;
    const owner = { library: master, definition: f.collection, collectionId: 'gear' };
    assert.ok(f.run({ type: 'library-update', collectionId: 'gear', itemName: 'Wand',
        itemData: { ...master.gear.wand, kind: 'oak' }, expected: owner }));
    assert.equal(f.settings.master_items, master);
    assert.ok(f.run({ type: 'library-update', collectionId: 'gear', itemName: 'Wand',
        itemData: { ...master.gear.wand, name: 'WAND' }, expected: owner }));
    assert.deepEqual(master.gear.wand, { name: 'WAND', kind: 'oak' });
    const current = master.gear.wand;
    assert.ok(f.run({ type: 'library-rename', collectionId: 'gear', oldName: 'Wand', newName: 'Staff',
        itemData: { ...current, name: 'Staff' }, expected: { ...owner, item: current, itemKey: 'wand' } }));
    assert.equal(master.gear.wand, undefined);
    assert.deepEqual(master.gear.staff, { name: 'Staff', kind: 'oak' });
});

test('stale library row cannot delete a replaced entry or edit a replaced library', () => {
    const f = runtimeFixture({ noChat: true });
    const expected = { library: f.settings.master_items, definition: f.collection, item: f.itemLibrary.gear.wand, itemKey: 'wand' };
    f.itemLibrary.gear.wand = { name: 'Wand', kind: 'new' };
    assert.equal(f.run({ type: 'library-delete', collectionId: 'gear', itemName: 'Wand', expected }), null);
    assert.equal(f.itemLibrary.gear.wand.kind, 'new');
    f.settings.master_items = structuredClone(f.itemLibrary);
    assert.equal(f.run({ type: 'library-update', collectionId: 'gear', itemName: 'Wand', itemData: { kind: 'stale' }, expected }), null);
    assert.equal(f.settings.master_items.gear.wand.kind, 'new');
    assert.equal(f.settingsSaves(), 0);
});

test('schema rename rejects incoming state whose bound System has not been restored yet', () => {
    const f = runtimeFixture({ boundSystemKey: 'incoming' });
    const before = structuredClone(f.state);
    assert.equal(f.run({ type: 'stat', scopes: ['playerStats'], oldName: 'HP', newName: 'Health', field: f.field }), null);
    assert.equal(f.field.name, 'HP');
    assert.deepEqual(f.state, before);
    assert.equal(f.settingsSaves(), 0);
});

test('unassigned reusable stat can be renamed without migrating live values', () => {
    const f = runtimeFixture();
    f.field.targets = [];
    const before = structuredClone(f.state);
    const result = f.run({ type: 'stat', scopes: [], oldName: 'HP', newName: 'Health', field: f.field });
    assert.equal(result.values, 0);
    assert.equal(f.field.name, 'Health');
    assert.deepEqual(f.state, before);
    assert.equal(f.history.length, 0);
});
