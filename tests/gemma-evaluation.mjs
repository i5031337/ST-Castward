import assert from 'node:assert/strict';
import test from 'node:test';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
import { makeState, scenarios } from './fixtures/gemma-tracker-scenarios.mjs';

async function setup(id) {
    const scenario = scenarios.find(entry => entry.id === id);
    const base = await harness(scenario.system, { global: {}, player: { stats: {} }, characters: [] });
    const state = makeState(scenario, base.settings);
    return { scenario, state, reader: await harness(scenario.system, state) };
}
test('real-model fixture carries Fantasy items in its configured equipment collection', async () => {
    const { reader, state } = await setup('fantasy-travel');
    assert.equal(state.player.collections.equipment[0].quantity, 3);
    assert.match(reader.prompt('Alex waits.'), /"equipment":\[\{"name":"red healing potion","quantity":3\}\]/);
});
test('evaluation applies actual collection removals and does not forgive changed primary identifiers', async () => {
    const { reader } = await setup('fantasy-travel');
    const read = name => reader.normalize({ global: {}, player: { collections: { equipment: {
        remove: [{ name, quantity: 1 }],
    } } }, characters: [] }, '').holdings.player.collections.equipment[0].quantity;
    assert.equal(read('red healing potion'), 2);
    assert.equal(read('red healing potions'), 3);
});
test('real numeric sanitation and progression turn earned XP into remainder and next level', async () => {
    const { reader } = await setup('fantasy-battle');
    const result = reader.normalize({ global: {}, player: { deltas: { XP: 20, HP: -3 } }, characters: [] }, '');
    assert.equal(result.update.player.HP, '9/12');
    assert.equal(result.update.player.XP, '110/100');
    assert.deepEqual(result.progression, { xp: '10/100', level: '2', levelsGained: 1 });
});
