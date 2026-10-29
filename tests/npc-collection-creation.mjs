import test from 'node:test';
import assert from 'node:assert/strict';
import { npcGenerationContract, npcGenerationPrompt, validateGeneratedNpc } from '../src/npc/npc-generation.js';
import { request, fixture, generated } from './helpers/npc-creation.mjs';
import { seedKnownNpcCollections } from '../src/npc/npc-collection-generation.js';

function setup() {
    const f = fixture();
    f.settings.statusTracker.presets.River.definition.npcTemplates.push({ id: 'beast', name: 'Beast' });
    f.settings.statusTracker.collections = [
        { id: 'clothes', name: 'Clothes', targets: ['template:human'], trackQuantity: false,
            hint: 'Garments currently worn, consistent with appearance.', fields: [
                { id: 'piece-id', name: 'piece', label: 'Garment', type: 'text', isPrimary: true },
                { id: 'colour-id', name: 'colour', type: 'text', options: ['blue', 'green', 'yellow'], defaultValue: 'blue' },
                { id: 'worn-id', name: 'worn', type: 'boolean', defaultValue: true },
                { id: 'description-id', name: 'description', type: 'text', isMultiline: true, isStatic: true, hint: 'Describe fabric and cut.' },
                { id: 'retired-id', name: 'old-secret', type: 'text', retired: true },
            ] },
        { id: 'moves', name: 'Moves', targets: ['template:beast'], trackQuantity: false,
            guidance: 'A few moves appropriate to species and level.', fields: [
                { id: 'move-id', name: 'move', type: 'text', isPrimary: true },
                { id: 'pp-id', name: 'pp', type: 'number', defaultValue: '10', min: '0', maxStatValue: '40' },
                { id: 'special-id', name: 'special', type: 'boolean', defaultValue: false },
            ] },
        { id: 'gear', name: 'Gear', targets: ['npc'], trackQuantity: true, fields: [
            { id: 'label-id', name: 'label', type: 'text', isPrimary: true },
            { id: 'qty-id', name: 'qty', type: 'number', defaultValue: '1', min: '0', maxStatValue: '20' },
        ] },
        { id: 'quests', name: 'Quests', targets: ['npc'], hint: 'Only quests already undertaken.',
            fields: [{ id: 'quest-id', name: 'quest', type: 'text', isPrimary: true }] },
        { id: 'player-collection', targets: ['player'], fields: [{ name: 'name', type: 'text', isPrimary: true }] },
        { id: 'retired-collection', targets: ['npc'], retired: true, fields: [{ name: 'name', type: 'text', isPrimary: true }] },
    ];
    return f;
}

function response() {
    return { ...generated(), collections: {
        clothes: [{ piece: 'Oilskin coat', description: 'A patched yellow coat.' }],
        gear: [{ label: 'Ferry pole' }], quests: [],
    } };
}

test('the contract includes only active NPC collections and exposes typed entry fields', () => {
    const f = setup();
    const contract = npcGenerationContract(f.settings);
    const human = contract.choices.find(choice => choice.id === 'human');
    const beast = contract.choices.find(choice => choice.id === 'beast');
    assert.deepEqual(human.collections.map(collection => collection.id), ['clothes', 'gear', 'quests']);
    assert.deepEqual(beast.collections.map(collection => collection.id), ['moves', 'gear', 'quests']);
    const props = contract.schema.properties.collections.properties;
    assert.equal(props['player-collection'], undefined);
    assert.equal(props['retired-collection'], undefined);
    assert.equal(props.clothes.items.properties['old-secret'], undefined);
    assert.deepEqual(props.clothes.items.required, ['piece']);
    assert.equal(props.clothes.items.properties.worn.type, 'boolean');
    assert.equal(props.gear.items.properties.qty.type, 'number');
    assert.equal(props.moves.items.properties.pp.type, 'number');
});

test('the generation request includes configured collection meanings and field guidance', () => {
    const f = setup();
    const body = JSON.parse(npcGenerationPrompt(request, npcGenerationContract(f.settings), {}, () => 0));
    assert.match(body.templates[0].collections, /Garments currently worn/);
    assert.match(body.templates[0].collections, /Describe fabric and cut/);
});

test('starting entries are returned and saved in one request with typed defaults and empty event collections', async () => {
    const f = setup(); f.setGenerate(async () => response());
    const result = JSON.parse(await f.service.create({ ...request, npcTemplateId: 'human' }));
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.cards[0].statusCollections, {
        clothes: [{ piece: 'Oilskin coat', description: 'A patched yellow coat.', colour: 'blue', worn: true }],
        gear: [{ label: 'Ferry pole', qty: 1 }], quests: [],
    });
    assert.equal(f.context.chatMetadata.sillynpc_status_state, undefined);
});

test('beasts receive their own move collection and configured numeric/boolean values', () => {
    const f = setup();
    const raw = { ...generated(), npcTemplateId: 'beast', collections: {
        moves: [{ move: 'Tackle', pp: 35, special: false }], gear: [], quests: [],
    } };
    const card = validateGeneratedNpc(raw, npcGenerationContract(f.settings), [], () => 0);
    assert.deepEqual(card.statusCollections.moves, [{ move: 'Tackle', pp: 35, special: false }]);
    assert.equal(card.statusCollections.clothes, undefined);
});

test('empty appropriate collections are allowed without a new collection setting or forced minimum', () => {
    const f = setup();
    const raw = response(); raw.collections = { clothes: [], gear: [], quests: [] };
    assert.deepEqual(validateGeneratedNpc(raw, npcGenerationContract(f.settings), [], () => 0).statusCollections, raw.collections);
});

test('unknown, missing and off-template collections and retired fields are rejected', () => {
    const f = setup(); const contract = npcGenerationContract(f.settings);
    for (const change of [
        raw => { raw.collections.unknown = []; },
        raw => { raw.collections.moves = []; },
        raw => { delete raw.collections.gear; },
        raw => { raw.collections.clothes[0]['old-secret'] = 'Retired'; },
        raw => { raw.collections.gear = { add: [{ label: 'Pole' }] }; },
        raw => { delete raw.collections; },
    ]) {
        const raw = response(); change(raw);
        assert.throws(() => validateGeneratedNpc(raw, contract, [], () => 0));
    }
});

test('identifiers, entry types, bounds, options, quantity and duplicates are validated before saving', async () => {
    const f = setup(); const contract = npcGenerationContract(f.settings);
    for (const change of [
        raw => { delete raw.collections.clothes[0].piece; },
        raw => { raw.collections.clothes[0].piece = ' '; },
        raw => { raw.collections.clothes[0].colour = 'purple'; },
        raw => { raw.collections.clothes[0].worn = 'true'; },
        raw => { raw.collections.gear[0].qty = '2'; },
        raw => { raw.collections.gear[0].qty = 21; },
        raw => { raw.collections.gear[0].qty = -1; },
        raw => { raw.collections.gear[0].qty = 0; },
        raw => { raw.collections.gear[0].qty = Infinity; },
        raw => { raw.collections.gear.push({ label: ' ferry pole ' }); },
        raw => { raw.collections.gear.push({ label: 'Ｆｅｒｒｙ pole' }); },
        raw => { raw.collections.gear[0].extra = 'unsupported'; },
    ]) {
        const raw = response(); change(raw);
        assert.throws(() => validateGeneratedNpc(raw, contract, [], () => 0));
    }
    f.settings.master_items = { gear: { sentinel: { label: 'Do not change' } } };
    const before = structuredClone(f.settings.master_items);
    f.setGenerate(async () => { const raw = response(); raw.collections.gear[0].qty = -1; return raw; });
    await assert.rejects(f.service.create({ ...request, npcTemplateId: 'human' }));
    assert.equal(f.calls.length, 2);
    assert.equal(f.cards.length, 0);
    assert.deepEqual(f.settings.master_items, before);
});

test('numeric identifiers including zero are valid and remain numbers', () => {
    const f = setup();
    const gear = f.settings.statusTracker.collections.find(collection => collection.id === 'gear');
    gear.fields[0].type = 'number';
    const raw = response(); raw.collections.gear = [{ label: 0, qty: 2 }];
    assert.equal(validateGeneratedNpc(raw, npcGenerationContract(f.settings), [], () => 0).statusCollections.gear[0].label, 0);
});

test('named actors retain held entries and intentionally empty lists while missing collections initialize', async () => {
    const f = setup();
    const actor = { name: 'Gandalf', npcTemplateId: 'human', stats: { Level: '7', XP: '75/100' },
        collections: { clothes: [], gear: [{ label: 'Old staff', qty: 2 }] } };
    f.context.chatMetadata.sillynpc_status_state = { characters: [actor] };
    const before = structuredClone(actor);
    f.setGenerate(async () => {
        const raw = response(); delete raw.nameCandidates;
        raw.collections.quests = [{ quest: 'An established errand' }];
        return raw;
    });
    const result = JSON.parse(await f.service.create({ ...request, name: 'Gandalf', npcTemplateId: 'human' }));
    assert.deepEqual(f.cards[0].statusCollections.clothes, []);
    assert.deepEqual(f.cards[0].statusCollections.gear, [{ label: 'Old staff', qty: 2 }]);
    assert.deepEqual(f.cards[0].statusCollections.quests, [{ quest: 'An established errand' }]);
    assert.equal(f.cards[0].statusOverrides.Level, '7');
    assert.deepEqual(actor, before);
    f.cards[0].statusCollections.gear[0].qty = 3;
    assert.equal(actor.collections.gear[0].qty, 2);
});

test('changes to collection definitions during generation cancel the response', async () => {
    const f = setup(); let finish;
    f.setGenerate(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.service.create({ ...request, npcTemplateId: 'human' });
    f.settings.statusTracker.collections[0].fields[0].name = 'renamed';
    finish(response());
    await assert.rejects(pending, /cancelled/);
    assert.equal(f.cards.length, 0);
});

test('starting collections become visible on a previously tracked NPC without overwriting existing state', () => {
    const original = { characters: [{ name: 'Gandalf', stats: { Level: '7' },
        collections: { gear: [{ label: 'Old staff' }], clothes: [] } }] };
    const state = structuredClone(original);
    const card = { name: 'gandalf', statusCollections: {
        gear: [{ label: 'New staff' }], clothes: [{ piece: 'Coat' }], quests: [{ quest: 'Established errand' }],
    } };
    assert.equal(seedKnownNpcCollections(state, card), true);
    assert.deepEqual(state.characters[0].collections.gear, original.characters[0].collections.gear);
    assert.deepEqual(state.characters[0].collections.clothes, []);
    assert.deepEqual(state.characters[0].stats, { Level: '7' });
    assert.deepEqual(state.characters[0].collections.quests, card.statusCollections.quests);
    state.characters[0].collections.quests[0].quest = 'Edited';
    assert.equal(card.statusCollections.quests[0].quest, 'Established errand');
    assert.equal(seedKnownNpcCollections(state, card), false);
    assert.equal(seedKnownNpcCollections(state, { name: 'Legolas', statusCollections: { clothes: [{ piece: 'Coat' }] } }), false);
    assert.equal(state.characters.length, 1);
    assert.deepEqual(original.characters[0].collections, { gear: [{ label: 'Old staff' }], clothes: [] });
});
