import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTrackerUpdate } from '../src/tracker/tracker-update-calculation.js';
import { buildActorState, calculateActorStats } from '../src/tracker/actor-calculation.js';
import { setNpcTemplateSettingsProvider } from '../src/core/npc-templates.js';

function freeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}

function fixture(overrides = {}) {
    const stats = [
        { id: 'hp', name: 'HP', type: 'number', defaultValue: '10/10' },
        { id: 'earned', name: 'Experience', type: 'number', defaultValue: '0/100' },
        { id: 'rank', name: 'Rank', type: 'number', defaultValue: '1', locked: true },
    ];
    const progression = { enabled: true, xpFieldId: 'earned', levelFieldId: 'rank' };
    const template = { id: 'fighter', name: 'Fighter', statIds: stats.map(stat => stat.id), progression };
    const system = { npcTemplates: [template], stats: { npc: stats } };
    const tracker = { globalStats: [{ name: 'Weather', type: 'text' }], playerStats: stats, npcStats: stats,
        progression: { player: progression }, npcTemplates: [template],
        collections: [{ id: 'items', targets: ['player', 'npc'], fields: [
            { name: 'name', type: 'text', isPrimary: true },
            { name: 'description', type: 'text', isStatic: true },
            { name: 'quantity', type: 'number', isStatic: false },
        ] }] };
    const actor = { id: 'mira', name: 'Mira', npcTemplateId: 'fighter',
        stats: { HP: '8/10', Experience: '95/100', Rank: '3' }, collections: { items: [] } };
    return { state: { global: { Weather: 'Clear' }, player: { name: 'Alex',
        stats: { HP: '5/10', Experience: '90/100', Rank: '2' }, collections: { items: [] } },
        characters: [actor] },
    tracker, system, cards: [{ id: 'mira', name: 'Mira', npcTemplateId: 'fighter',
        statusOverrides: structuredClone(actor.stats), statusCollections: { items: [] } }],
    itemLibrary: {}, actorDecisions: [{ name: 'Mira', canonicalName: 'Mira', allowed: true }],
    playerIdentity: { name: 'Alex' }, timestamp: 123, update: {}, ...overrides };
}

test('full calculation returns state and card/library plans without changing frozen inputs', () => {
    const input = freeze(fixture({ update: { global: { Weather: 'Rain' }, player: { stats: { HP: '4' } },
        characters: [{ name: 'Mira', stats: { HP: '7', Experience: '110/100' },
            collections: { items: { replace: [{ name: 'Key', description: 'Brass', quantity: 1 }] } } }] } }));
    const result = calculateTrackerUpdate(input);
    assert.equal(result.nextState.global.Weather, 'Rain');
    assert.equal(result.nextState.player.stats.HP, '4/10');
    assert.deepEqual(result.nextState.characters[0].stats, { HP: '7/10', Experience: '10/100', Rank: '4' });
    assert.deepEqual(result.nextState.characters[0].collections.items, [{ name: 'Key', description: 'Brass', quantity: 1 }]);
    assert.equal(result.nextState.timestamp, 123);
    assert.equal(result.cardChanges[0].fields.statusOverrides.HP, '7/10');
    assert.deepEqual(result.libraryChanges, [{ collectionId: 'items', itemName: 'Key', fields: { name: 'Key', description: 'Brass' } }]);
    assert.equal(input.state.characters[0].stats.HP, '8/10');
    assert.equal(input.cards[0].statusOverrides.HP, '8/10');
    assert.deepEqual(input.itemLibrary, {});
});

test('actor calculation uses the captured System without consulting global template settings', () => {
    const input = fixture();
    setNpcTemplateSettingsProvider(() => { throw new Error('Global template settings accessed'); });
    try {
        const actor = buildActorState(freeze({ name: 'Mira', state: input.state, tracker: input.tracker,
            system: input.system, cards: input.cards }));
        assert.deepEqual(actor.stats, input.cards[0].statusOverrides);
        const result = calculateActorStats(freeze({ actor, update: { name: 'Mira', stats: { Experience: '110/100' } },
            tracker: input.tracker, system: input.system }));
        assert.equal(result.actor.stats.Experience, '10/100');
        assert.equal(result.actor.stats.Rank, '4');
        assert.equal(actor.stats.Experience, '95/100');
        assert.equal(calculateTrackerUpdate(freeze(input)).nextState.characters[0].npcTemplateId, 'fighter');
    } finally {
        setNpcTemplateSettingsProvider(() => null);
    }
});

test('offstage comparison actors remain separate from actual scene membership', () => {
    const input = fixture({ update: { characters: [{ name: 'Mira', stats: { HP: '7' } }] },
        policy: { preview: true, admitCharacters: true } });
    input.state.characters = [];
    const result = calculateTrackerUpdate(freeze(input));
    assert.deepEqual(result.nextState.characters, []);
    assert.equal(result.offstageComparisons.length, 1);
    assert.equal(result.offstageComparisons[0].actor.stats.HP, '7/10');
    assert.equal(result.offstageComparisons[0].before.stats.HP, '8/10');
    assert.equal(result.cardChanges[0].fields.statusOverrides.HP, '7/10');
    assert.equal(input.cards[0].statusOverrides.HP, '8/10');
});

test('earned, manual and resolved readings retain distinct progression policies', () => {
    const input = fixture({ update: { player: { stats: { Experience: '130' } } } });
    const earned = calculateTrackerUpdate(freeze(input));
    assert.equal(earned.nextState.player.stats.Experience, '30/100');
    assert.equal(earned.nextState.player.stats.Rank, '3');
    const manual = calculateTrackerUpdate({ ...input, policy: { verbatim: true } });
    assert.equal(manual.nextState.player.stats.Experience, '100');
    assert.equal(manual.nextState.player.stats.Rank, '2');
    const resolved = calculateTrackerUpdate({ ...input, update: { player: { stats: { Experience: '30/100', Rank: '3' } } },
        policy: { progressionResolved: true } });
    assert.equal(resolved.nextState.player.stats.Experience, '30/100');
    assert.equal(resolved.nextState.player.stats.Rank, '3');
});
