import assert from 'node:assert/strict';
import test from 'node:test';
import { approximateTokens } from '../src/core/tokens.js';
import { profileBasePrompts } from '../src/prompts/profile-base-prompt.js';
import { loreProfileValues } from '../src/prompts/profile-prompt-fields.js';
import { harness } from './fixtures/gemma-tracker-harness.mjs';

function profileSettings() {
    return { activeSystem: 'Custom', statusTracker: { presets: { Custom: { definition: {
        profiles: [
            { id: 'appearance', label: 'Appearance', targets: ['player', 'npc'], guidance: 'Describe distinguishing features.' },
            { id: 'training', label: 'Training', targets: ['template:mage'], guidance: 'Describe magical training.' },
        ],
        npcTemplates: [{ id: 'civilian' }, { id: 'mage' }],
    } } } } };
}

test('profile instruction estimates follow field guidance and NPC template assignments', () => {
    const settings = profileSettings();
    const before = structuredClone(settings);
    const prompts = profileBasePrompts(settings);
    assert.deepEqual(settings, before);
    assert.equal(prompts.Player.length, 1);
    assert.equal(prompts.NPC.length, 2);
    assert.match(prompts.Player[0], /Appearance: <Describe distinguishing features\.>/);
    assert.doesNotMatch(prompts.Player[0], /Training/);
    assert.doesNotMatch(prompts.NPC[0], /Training/);
    assert.match(prompts.NPC[1], /Training: <Describe magical training\.>/);
    assert.ok(approximateTokens(prompts.NPC[1]) > approximateTokens(prompts.NPC[0]));
    assert.doesNotMatch(prompts.NPC[1], /{{\w+}}|Established facts|Setting reference|Existing entry/);
    settings.statusTracker.presets.Custom.definition.profiles[0].guidance += ' Additional guidance.'.repeat(30);
    assert.ok(approximateTokens(profileBasePrompts(settings).Player[0]) > approximateTokens(prompts.Player[0]));
    settings.activeSystem = 'Other';
    settings.statusTracker.presets.Other = { definition: { profiles: [], npcTemplates: [] } };
    assert.doesNotMatch(profileBasePrompts(settings).Player[0], /Appearance/);
});

test('profile base guidance uses the same field formatting as requests with established values', () => {
    const fields = [{ id: 'appearance', label: 'Appearance', hint: 'Keep distinguishing features.' }];
    const baseline = loreProfileValues(fields);
    const request = loreProfileValues(fields, { appearance: 'Silver hair' });
    assert.equal(baseline.profileTemplate, '  Appearance: <Keep distinguishing features.>');
    assert.match(request.profileTemplate, /Keep distinguishing features\. Established: Silver hair/);
    assert.match(request.profileFields, /\(established: Silver hair\)/);
    assert.doesNotMatch(baseline.profileTemplate, /Silver hair/);
});

test('tracker instruction estimates respond to definitions and reasons without reading chat state', async () => {
    const state = { global: { Location: 'Secret location marker' },
        player: { name: 'Private persona marker', stats: { HP: '4/20' } },
        characters: [{ name: 'Private NPC marker', profile: { appearance: 'Private profile marker' }, stats: { HP: '2/10' } }] };
    const h = await harness('fantasy', state, { chat: [{ mes: 'Private story marker' }] });
    const before = structuredClone(state);
    const baseline = h.basePrompt();
    assert.deepEqual(state, before);
    assert.match(baseline, /HP|Health/);
    assert.doesNotMatch(baseline, /Private .* marker|Secret location marker|4\/20|2\/10|{{\w+}}/);
    const original = h.settings.playerStats[0].purpose;
    h.settings.playerStats[0].purpose += ' Definition cost marker.'.repeat(40);
    const expanded = h.basePrompt();
    assert.match(expanded, /Definition cost marker/);
    assert.ok(approximateTokens(expanded) > approximateTokens(baseline));
    h.settings.playerStats[0].purpose = original;
    h.settings.collections.push({ id: 'keepsakes', name: 'Keepsakes', target: 'player', hint: 'Permanent mementos.',
        fields: [{ name: 'title', isPrimary: true }, { name: 'story', hint: 'Why it matters.' }] });
    assert.match(h.basePrompt(), /keepsakes.*Permanent mementos/);
    h.settings.extractionReasons = true;
    const withReasons = approximateTokens(h.basePrompt());
    h.settings.extractionReasons = false;
    assert.ok(approximateTokens(h.basePrompt()) < withReasons);
});
