import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { calculateCollectionPlan, installCollectionChanges } from '../src/tracker/collection-pipeline.js';
import { npcStartingCollections, seedKnownNpcCollections,
    validateNpcStartingCollections } from '../src/npc/npc-collection-generation.js';
import { activeNpcSystem } from '../src/core/npc-templates.js';

function fixture({ known = false } = {}) {
    const definitions = [{ id: 'gear', targets: ['npc'], trackQuantity: true, fields: [
        { name: 'name', type: 'text', isPrimary: true },
        { name: 'rarity', type: 'text', options: ['Common'] },
        { name: 'quantity', type: 'number', defaultValue: 1 },
    ] }];
    const settings = { statusTracker: { collections: definitions },
        master_items: { gear: { sword: { name: 'Sword', rarity: 'Retired' } } } };
    const held = { gear: [{ name: 'Sword', rarity: 'Common', quantity: 2 }] };
    const state = { characters: known ? [{ name: 'Mira', collections: held }] : [] };
    const draft = { name: 'Mira', statusCollections: { gear: [
        { name: 'Shield', rarity: 'Common', quantity: 1 },
        { name: 'Sword', rarity: 'Common', quantity: 2 },
    ] } };
    const effects = { cards: 0, saves: 0, refreshes: 0 };
    const source = readFileSync(new URL('../src/npc/npc-tool.js', import.meta.url), 'utf8');
    const start = source.indexOf('commit: draft => {') + 'commit: '.length;
    const body = source.slice(start, source.indexOf('\n    beforeCreate:', start)).trim().replace(/,$/, '');
    const deps = { getSettings: () => settings, knownActor: name => state.characters.find(actor => actor.name === name),
        calculateCollectionPlan, installCollectionChanges, seedKnownNpcCollections,
        npcStartingCollections, activeNpcSystem,
        createCharacter: name => { effects.cards++; return { name }; },
        getContext: () => ({ chatMetadata: { sillynpc_status_state: state } }),
        saveStateToMetadata: () => { effects.saves++; }, saveSettings: () => { effects.saves++; },
        triggerReprocess: () => { effects.refreshes++; } };
    const commit = new Function(...Object.keys(deps), `return (${body});`)(...Object.values(deps));
    return { settings, state, draft, definitions, effects, commit };
}

test('new and already tracked NPCs reject invalid resolved definitions before creating or saving anything', () => {
    for (const known of [false, true]) {
        const f = fixture({ known });
        // The generated sheet is valid; only the later authoritative library merge is invalid.
        validateNpcStartingCollections(f.draft.statusCollections, f.definitions);
        const before = structuredClone({ state: f.state, library: f.settings.master_items });
        assert.throws(() => f.commit(f.draft), /Cannot use Item Library values/);
        assert.deepEqual(f.effects, { cards: 0, saves: 0, refreshes: 0 });
        assert.deepEqual({ state: f.state, library: f.settings.master_items }, before);
        assert.equal(f.settings.master_items.gear.shield, undefined, 'earlier valid entries remain unregistered');
    }
});

test('valid final NPC definitions are saved while archived collections remain intact', () => {
    const f = fixture();
    f.settings.master_items.gear.sword.rarity = 'Common';
    const archived = [{ formerField: 'Preserved old belongings' }];
    f.draft.statusCollections.archived = archived;
    const card = f.commit(f.draft);
    assert.deepEqual(card.statusCollections.gear, f.draft.statusCollections.gear);
    assert.deepEqual(card.statusCollections.archived, archived);
    assert.equal(f.settings.master_items.gear.shield.rarity, 'Common');
    assert.equal(f.settings.master_items.archived, undefined);
    assert.equal(f.effects.cards, 1);
});


test('creating a card from unchanged accepted holdings registers missing shared definitions', () => {
    const f = fixture({ known: true });
    f.settings.master_items = {};
    f.draft.statusCollections = structuredClone(f.state.characters[0].collections);
    const card = f.commit(f.draft);
    assert.deepEqual(f.settings.master_items.gear?.sword, { name: 'Sword', rarity: 'Common' });
    assert.equal(card.statusCollections.gear[0].quantity, 2);
});
