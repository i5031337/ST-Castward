import assert from 'node:assert/strict';
import test from 'node:test';
import { profileHarness } from './fixtures/gemma-profile-harness.mjs';
import { profileScenarios } from './fixtures/gemma-profile-scenarios.mjs';

test('frozen profile fixtures use the actual Fantasy and Dating System fields and both production prompts', async () => {
    assert.equal(profileScenarios.filter(s => s.path === 'fill').length, 4);
    assert.equal(profileScenarios.filter(s => s.path === 'auto').length, 2);
    for (const scenario of profileScenarios) {
        const fixture = profileHarness(scenario);
        const prompt = await fixture.prompt();
        assert.ok(prompt.includes(scenario.name));
        for (const field of scenario.path === 'fill' ? fixture.wanted : fixture.fields) {
            assert.ok(prompt.includes(scenario.path === 'fill' ? `- ${field.id}:` : field.label),
            `${scenario.id}: ${field.label}`);
        }
        assert.ok(fixture.systemPrompt.length > 20);
        assert.ok(fixture.maxTokens >= 1280);
    }
});

test('manual Fill applies only missing configured fields using its production parser', async () => {
    const fixture = profileHarness(profileScenarios[1]);
    const applied = await fixture.apply('```json\n{"background":"changed","ancestry":"human","calling":"mapmaker"}\n```');
    assert.equal(applied.readable, true);
    assert.equal(applied.profile.background, 'Born in Blackpine.');
    assert.equal(applied.profile.ancestry, 'human');
    assert.equal(applied.profile.calling, 'mapmaker');
});

test('automatic profile writer parses its YAML envelope and named fields', async () => {
    const fixture = profileHarness(profileScenarios[4]);
    const applied = await fixture.apply('tags: Orin\ncontent: |\n  Ancestry or Species: Halfling\n  Role: Scout');
    assert.equal(applied.readable, true);
    assert.equal(applied.profile.ancestry, 'Halfling');
    assert.equal(applied.profile.calling, 'Scout');
});

test('both profiling paths explicitly keep other characters’ details off the subject card', async () => {
    const fill = profileHarness(profileScenarios[2]);
    const manualPrompt = await fill.prompt();
    assert.match(fill.systemPrompt, /Do not transfer traits, interests, possessions, or history/);
    assert.match(manualPrompt, /A nearby mention of someone else/);
    assert.match(fill.systemPrompt, /"not described"/);
    assert.match(manualPrompt, /leave the field out/);
    const auto = profileHarness(profileScenarios[5]);
    const automaticPrompt = await auto.prompt();
    assert.match(automaticPrompt, /Do not copy details about the player, narrator, or another character/);
    assert.match(automaticPrompt, /unknown or undescribed/);
});
