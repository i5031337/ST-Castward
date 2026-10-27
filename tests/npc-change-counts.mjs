import { calculateTrackerUpdate } from '../src/tracker/tracker-update-calculation.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { npcTemplateFor } from '../src/core/npc-templates.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replace(/^export \{[^}]*\};\s*/gm, '').replaceAll('export ', '');
const splitValue = new Function(`${source('../src/core/utils-format.js')}\nreturn splitValue;`)();
const system = { npcTemplates: [{ id: 'scout', name: 'Scout', statIds: ['hp', 'mood'] }],
    stats: { npc: [{ id: 'hp', name: 'HP' }, { id: 'mood', name: 'Mood' }] } };
const templateFor = actor => npcTemplateFor(actor, system);
const tracker = { npcStats: [{ id: 'hp', name: 'HP', defaultValue: '10' },
    { id: 'mood', name: 'Mood', defaultValue: 'Calm' }], collections: [{ id: 'items',
    targets: ['npc'], fields: [{ name: 'name', type: 'text', isPrimary: true }, { name: 'quantity', type: 'number' }] }] };
const compute = new Function('activeNpcSystem', 'npcTemplateFor', 'splitValue',
    `${source('../src/tracker/status-diff-compare.js')}\nreturn computeStateDiff;`)(() => system, templateFor, splitValue);
const sheet = () => ({ name: 'Mira', npcTemplateId: 'scout', stats: { HP: '8/10', Mood: 'Calm' },
    collections: { items: [{ name: 'Potion', quantity: 2 }] } });

function offstagePreview(update) {
    const saved = sheet();
    const card = { name: saved.name, npcTemplateId: saved.npcTemplateId,
        statusOverrides: saved.stats, statusCollections: saved.collections };
    const state = { global: {}, player: { name: 'Player', stats: {}, collections: {} }, characters: [] };
    const result = calculateTrackerUpdate({ state, tracker: { globalStats: [], playerStats: [], ...tracker },
        system, cards: [card], update: { characters: [update] },
        actorDecisions: [{ name: update.name, canonicalName: card.name, allowed: true }],
        playerIdentity: { name: 'Player' }, policy: { preview: true, admitCharacters: true }, timestamp: 1 });
    assert.deepEqual(result.nextState.characters, []);
    assert.deepEqual(card.statusOverrides, saved.stats);
    assert.deepEqual(card.statusCollections, saved.collections);
    assert.deepEqual(state.characters, []);
    const { actor, before } = result.offstageComparisons[0];
    Object.defineProperty(actor, 'comparisonBase', { value: before });
    assert.equal(JSON.stringify(actor).includes('comparisonBase'), false);
    return actor;
}

test('going offstage and restating a saved NPC produce no tracker changes', () => {
    assert.deepEqual(compute({ characters: [sheet()] }, { characters: [] }, tracker), []);
    const preview = offstagePreview({ name: 'Mira', stats: sheet().stats });
    assert.deepEqual(compute({ characters: [] }, { characters: [preview] }, tracker), []);
});

test('offstage comparisons count only actual stat and item field changes', () => {
    const preview = offstagePreview({ name: 'Mira', stats: { HP: '7/10' },
        collections: { items: { replace: [{ name: 'Potion', quantity: 1 }] } } });
    const changes = compute({ characters: [] }, { characters: [preview] }, tracker);
    assert.deepEqual(changes.map(row => [row.kind, row.label, row.before, row.after]), [
        ['stat', 'HP', '8', '7'], ['item-change', 'Potion · quantity', '2', '1'],
    ]);
});

test('mentioning a present NPC produces no change, including an unassigned NPC', () => {
    for (const npc of [sheet(), { name: 'Mira', npcTemplateId: '', stats: {}, collections: {} }]) {
        const after = structuredClone(npc);
        after.name = 'MIRA';
        assert.deepEqual(compute({ characters: [npc] }, { characters: [after] }, tracker), []);
    }
});

test('new NPC data and actual template assignments still produce changes', () => {
    const unassigned = { name: 'Mira', npcTemplateId: '', stats: {}, collections: {} };
    assert.equal(compute({ characters: [] }, { characters: [unassigned] }, tracker)[0].kind, 'npc-template');
    const changes = compute({ characters: [unassigned] }, { characters: [sheet()] }, tracker);
    assert.ok(changes.some(row => row.kind === 'npc-template' && row.after === 'scout'));
    assert.ok(changes.some(row => row.kind === 'stat' && row.label === 'HP'));
    assert.ok(changes.some(row => row.kind === 'item-add'));
});
