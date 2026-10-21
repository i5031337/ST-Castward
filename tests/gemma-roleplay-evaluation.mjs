import assert from 'node:assert/strict';
import test from 'node:test';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
import { roleplayScenarios, makeRoleplayState } from './fixtures/gemma-tracker-roleplay-scenarios.mjs';
import { score } from './fixtures/gemma-tracker-score.mjs';

async function fixture(id) {
    const scenario = roleplayScenarios.find(scene => scene.id === id);
    const empty = await harness(scenario.system, { global: {}, player: { stats: {} }, characters: [] });
    const state = makeRoleplayState(scenario, empty.settings);
    return { scenario, state, reader: await harness(scenario.system, state) };
}
function failures(bundle, raw) {
    const normalized = bundle.reader.normalize(raw, bundle.scenario.text);
    return score(bundle, normalized, raw, 'stop').filter(check => !check.passed);
}

test('roleplay benchmark has ten complete, contextual exchanges per System', () => {
    assert.equal(new Set(roleplayScenarios.map(scene => scene.id)).size, 20);
    for (const system of ['fantasy', 'dating']) {
        assert.equal(roleplayScenarios.filter(scene => scene.system === system).length, 10);
    }
    for (const scene of roleplayScenarios) {
        assert.deepEqual(scene.history.map(message => message.role), ['user', 'assistant', 'user', 'assistant']);
        assert.ok(scene.history.every(message => message.content.trim()));
        assert.ok(scene.user.trim());
        assert.ok(scene.text.split(/\s+/).length >= 150, scene.id);
        assert.equal(scene.generation.finishReason, 'stop');
        assert.match(scene.generation.model, /31B/i);
        assert.ok(scene.checks.length >= 4);
        assert.equal(scene.earlier.at(-1), `[Player (Alex)] ${scene.user}`);
    }
});

test('frozen exchange preserves user-only evidence and excludes authoring directions', async () => {
    const { reader, scenario } = await fixture('fantasy-bridge-toll');
    const prompt = reader.prompt(scenario.text, scenario.earlier);
    assert.ok(prompt.includes(scenario.user));
    assert.ok(prompt.includes(scenario.text));
    assert.ok(prompt.includes(scenario.history[0].content));
    assert.ok(!prompt.includes(scenario.generationBrief));
});

test('currency scoring rejects both ignoring the user action and counting payment twice', async () => {
    const bundle = await fixture('fantasy-bridge-toll');
    const raw = delta => ({ locationChanged: false, global: {}, player: { stats: { Currency: String(Number(bundle.state.player.stats.Currency) + delta) } }, characters: [{ name: 'Rowan' }] });
    assert.deepEqual(failures(bundle, raw(-3)), []);
    for (const delta of [0, -6]) {
        assert.ok(failures(bundle, raw(delta)).some(check => check.name.includes('Currency')));
    }
});

test('scarf scoring requires a transfer from worn clothes to held belongings', async () => {
    const bundle = await fixture('dating-coat-off');
    const raw = { locationChanged: true, global: {}, player: { collections: {
        clothing: { remove: ['blue wool scarf'] },
        items: { add: [{ name: 'blue wool scarf', quantity: 1 }] },
    } }, characters: [{ name: 'June' }] };
    assert.deepEqual(failures(bundle, raw), []);
    delete raw.player.collections.items;
    assert.ok(failures(bundle, raw).some(check => check.name.includes('collectionHas')));
});

test('a rejected romantic claim must preserve the relationship and lower comfort', async () => {
    const bundle = await fixture('dating-unwanted-kiss');
    const raw = { locationChanged: false, global: {}, player: {}, characters: [{ name: 'June', stats: { Comfort: String(Number(bundle.state.characters[0].stats.Comfort) - 3) } }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.characters[0].stats.Relationship = 'Romantic partners';
    assert.ok(failures(bundle, raw).some(check => check.name.includes('relationshipUnchanged')));
});

test('a learned light technique belongs to abilities, independently of equipment', async () => {
    const bundle = await fixture('fantasy-first-cantrip');
    const raw = { locationChanged: false, global: {}, player: { collections: {
        abilities: { add: [{ name: 'Wicklight', kind: 'Spell', effect: 'A steady, cool light.' }] },
    } }, characters: [{ name: 'Mira' }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.player.collections.equipment = { add: [{ name: 'light orb', quantity: 1 }] };
    assert.ok(failures(bundle, raw).some(check => check.name.includes('noInventoryAddsOrRemovesIn')));
});

test('holding checks accept a repeated outfit but reject a genuinely acquired object', async () => {
    const bundle = await fixture('dating-mutual-agreement');
    const raw = { locationChanged: false, global: {}, player: {}, characters: [{ name: 'June',
        stats: { Relationship: 'Partner', Affection: String(Number(bundle.state.characters[0].stats.Affection) + 1) },
        collections: { clothing: { add: [{ name: 'cardigan', slot: 'top', color: 'cream', details: 'soft, oversized' }] } },
    }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.characters[0].collections.items = { add: [{ name: 'gold ring', quantity: 1 }] };
    assert.ok(failures(bundle, raw).some(check => check.name === 'sameHoldings '));
});

test('redundant ability descriptions do not count as a change of holdings', async () => {
    const bundle = await fixture('fantasy-failed-fire');
    const raw = { locationChanged: false, global: {}, player: { stats: { Mana: `${Number(bundle.state.player.stats.Mana.split('/')[0]) - 3}/10` }, collections: {
        abilities: { update: [{ name: 'Ember', effect: 'A small directed flame.' }] },
    } }, characters: [{ name: 'Mira' }] };
    assert.deepEqual(failures(bundle, raw), []);
});

test('ordinary bandaging can improve a Condition while HP stays unchanged', async () => {
    const bundle = await fixture('fantasy-companion-bandage');
    const raw = { locationChanged: true, global: {}, player: { collections: {
        equipment: { remove: [{ name: 'clean bandage', quantity: 1 }] },
    } }, characters: [{ name: 'Mira', stats: { Condition: 'Bandaged forearm; bleeding stopped.' } }] };
    assert.deepEqual(failures(bundle, raw), []);
});

test('a future breakfast plan does not become the present Occasion', async () => {
    const bundle = await fixture('dating-rain-check');
    const raw = { locationChanged: false, global: {}, player: {}, characters: [{ name: 'June' }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.global.Occasion = 'Sunday breakfast';
    assert.equal(failures(bundle, raw).filter(check => check.name.startsWith('worldExcludes')).length, 2);
});
