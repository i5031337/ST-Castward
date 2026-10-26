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

test('exact-value scoring rejects both omitted and duplicated payment', async () => {
    const bundle = await fixture('fantasy-bridge-toll');
    const raw = delta => ({ locationChanged: false, global: {}, player: { stats: { Currency: String(Number(bundle.state.player.stats.Currency) + delta) } }, characters: [{ name: 'Rowan' }] });
    assert.deepEqual(failures(bundle, raw(-3)), []);
    for (const delta of [0, -6]) {
        assert.ok(failures(bundle, raw(delta)).some(check => check.name.includes('Currency')));
    }
});

test('transfer scoring requires destination ownership after clothing removal', async () => {
    const bundle = await fixture('dating-coat-off');
    const raw = { locationChanged: true, global: {}, player: { collections: {
        clothing: { remove: ['blue wool scarf'] },
        items: { add: [{ name: 'blue wool scarf', quantity: 1 }] },
    } }, characters: [{ name: 'June' }] };
    assert.deepEqual(failures(bundle, raw), []);
    delete raw.player.collections.items;
    assert.ok(failures(bundle, raw).some(check => check.name.includes('collectionHas')));
});

test('relationship-preservation scoring rejects an altered categorical value', async () => {
    const bundle = await fixture('dating-unwanted-kiss');
    const raw = { locationChanged: false, global: {}, player: {}, characters: [{ name: 'June', stats: { Comfort: String(Number(bundle.state.characters[0].stats.Comfort) - 3) } }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.characters[0].stats.Relationship = 'Romantic partners';
    assert.ok(failures(bundle, raw).some(check => check.name.includes('relationshipUnchanged')));
});

test('collection-specific scoring rejects additions to an unrelated inventory', async () => {
    const bundle = await fixture('fantasy-first-cantrip');
    const raw = { locationChanged: false, global: {}, player: { collections: {
        abilities: { add: [{ name: 'Wicklight', kind: 'Spell', effect: 'A steady, cool light.' }] },
    } }, characters: [{ name: 'Mira' }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.player.collections.equipment = { add: [{ name: 'light orb', quantity: 1 }] };
    assert.ok(failures(bundle, raw).some(check => check.name.includes('noInventoryAddsOrRemovesIn')));
});

test('holdings scoring accepts repeated entries but rejects newly acquired objects', async () => {
    const bundle = await fixture('dating-mutual-agreement');
    const raw = { locationChanged: false, global: {}, player: {}, characters: [{ name: 'June',
        stats: { Relationship: 'Partner', Affection: String(Number(bundle.state.characters[0].stats.Affection) + 1) },
        collections: { clothing: { add: [{ name: 'cardigan', slot: 'top', color: 'cream', details: 'soft, oversized' }] } },
    }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.characters[0].collections.items = { add: [{ name: 'gold ring', quantity: 1 }] };
    assert.ok(failures(bundle, raw).some(check => check.name === 'sameHoldings '));
});

test('global exclusion scoring rejects forbidden terms in a categorical value', async () => {
    const bundle = await fixture('dating-rain-check');
    const raw = { locationChanged: false, global: {}, player: {}, characters: [{ name: 'June' }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.global.Occasion = 'Sunday breakfast';
    assert.equal(failures(bundle, raw).filter(check => check.name.startsWith('worldExcludes')).length, 2);
});
