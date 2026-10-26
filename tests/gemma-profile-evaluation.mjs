import assert from 'node:assert/strict';
import test from 'node:test';
import { profileHarness } from './fixtures/gemma-profile-harness.mjs';
import { profileScenarios } from './fixtures/gemma-profile-scenarios.mjs';

test('manual Fill applies only missing configured fields using its production parser', async () => {
    const fixture = profileHarness(profileScenarios[1]);
    const applied = await fixture.apply('```json\n{"background":"changed","ancestry":"human","calling":"mapmaker"}\n```');
    assert.equal(applied.readable, true);
    assert.equal(applied.profile.background, 'Born in Blackpine.');
    assert.equal(applied.profile.ancestry, 'human');
    assert.equal(applied.profile.calling, 'mapmaker');
});
