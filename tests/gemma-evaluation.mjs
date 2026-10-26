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

test('evaluation applies actual collection removals and does not forgive changed primary identifiers', async () => {
    const { reader } = await setup('fantasy-travel');
    const read = name => reader.normalize({ global: {}, player: { collections: { equipment: {
        remove: [{ name, quantity: 1 }],
    } } }, characters: [] }, '').holdings.player.collections.equipment[0].quantity;
    assert.equal(read('red healing potion'), 2);
    assert.equal(read('red healing potions'), 3);
});

test('raw reader capacity audit distinguishes initialization, current changes, and capacity changes', async () => {
    const { changedPoolMaxima } = await import('./fixtures/tracker-pool-audit.mjs');
    const state = { global: { Ward: '3/8' }, player: { stats: { HP: '4/12' } },
        characters: [{ name: 'Mira', stats: { HP: '5/10' } }] };
    assert.deepEqual(changedPoolMaxima({ player: { stats: { HP: '6/12' } },
        characters: [{ name: 'New', stats: { HP: '20/20' } }, { name: 'Mira', stats: { HP: '6/10' } }] }, state), []);
    assert.deepEqual(changedPoolMaxima({ global: { Ward: '4/9' }, player: { stats: { HP: '5/15' } },
        characters: [{ name: 'Mira', stats: { HP_max: 11 } }] }, state), ['World.Ward', 'Player.HP', 'Mira.HP_max']);
});

test('location scoring accepts a current subplace through its actual parent chain', async () => {
    const { currentPlaceContains } = await import('./fixtures/gemma-location-check.mjs');
    const rows = [
        { kind: 'location-create', location: { id: 'keep', record: { name: 'Emberwatch Keep', parentId: '' } } },
        { kind: 'location-current', actor: 'Guardroom', location: {
            id: 'room', record: { name: 'Guardroom', parentId: 'keep' },
        } },
    ];
    assert.equal(currentPlaceContains(rows, {}, 'Emberwatch Keep'), true);
    assert.equal(currentPlaceContains(rows, {}, 'Guardroom'), true);
    assert.equal(currentPlaceContains(rows, {}, 'Other Keep'), false);
    assert.equal(currentPlaceContains(rows.slice(0, 1), {}, 'Emberwatch Keep'), false);
    rows[0].location.record.parentId = 'room';
    assert.equal(currentPlaceContains(rows, {}, 'Other Keep'), false);
});

test('parallel evaluation batches cap each endpoint and retain every trial once', async () => {
    const { requestBatches } = await import('./fixtures/gemma-request-batches.mjs');
    const jobs = Array.from({ length: 19 }, (_, id) => ({ id }));
    const endpoints = ['http://localhost:8080/v1', 'http://localhost:9931/v1'];
    const batches = requestBatches(jobs, endpoints, 4);
    assert.deepEqual(batches.flat().map(job => job.id), jobs.map(job => job.id));
    assert.deepEqual(batches.map(batch => batch.length), [8, 8, 3]);
    for (const batch of batches) for (const endpoint of endpoints) {
        assert.ok(batch.filter(job => job.endpoint === endpoint).length <= 4);
    }
    assert.throws(() => requestBatches(jobs, endpoints, 0));
    assert.throws(() => requestBatches(jobs, [], 4));
});
