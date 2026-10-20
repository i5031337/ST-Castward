import assert from 'node:assert/strict';
import test from 'node:test';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
import { locationChangeScenarios, makeLocationChangeState } from './fixtures/gemma-location-change-scenarios.mjs';

test('real reader requests a top-level boolean alongside normal tracker output', async () => {
    const empty = await harness('fantasy', { player: { stats: {} }, characters: [] });
    const scene = locationChangeScenarios.find(scene => scene.id === 'alias-stay');
    const state = makeLocationChangeState(scene, empty.settings);
    const reader = await harness('fantasy', state);
    const prompt = reader.prompt(scene.text);
    assert.deepEqual(reader.schema.properties.locationChanged, { type: 'boolean' });
    assert.ok(reader.schema.required.includes('locationChanged'));
    assert.equal(reader.schema.properties.locations, undefined);
    assert.match(prompt, /"aliases":\["the Lantern"\]/);
    assert.doesNotMatch(prompt, /"locations"|"parent"|complete description|Known places:/);
    const examples = [...prompt.slice(prompt.indexOf('### OUTPUT FORMAT')).matchAll(/\{"(?:why|locationChanged|global)".*\}/g)];
    assert.ok(examples.length >= 2);
    for (const [example] of examples) assert.equal(typeof JSON.parse(example).locationChanged, 'boolean');
});

test('flag fixtures cover movement and stationary controls with code-owned opening initialization', () => {
    const flags = scene => scene.checks.find(([name]) => name === 'locationFlag')[1];
    assert.equal(new Set(locationChangeScenarios.map(scene => scene.id)).size, locationChangeScenarios.length);
    for (const scene of locationChangeScenarios.filter(scene => scene.opening)) assert.equal(flags(scene), 'no');
    for (const id of ['room-arrival', 'departure-unknown', 'implicit-arrival', 'second-person-arrival']) {
        assert.equal(flags(locationChangeScenarios.find(scene => scene.id === id)), 'yes');
    }
    for (const id of ['alias-stay', 'same-room-movement', 'invitation-threshold', 'npc-departs-alone',
        'return-to-same-place', 'known-place-description']) {
        assert.equal(flags(locationChangeScenarios.find(scene => scene.id === id)), 'no');
    }
});
