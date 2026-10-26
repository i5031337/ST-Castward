import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemGenerationRun } from '../src/generation/generate-system.js';
import { allocatePlan } from '../src/generation/plan.js';
import { validateDefinition } from '../src/generation/validate-definition.js';
import { plan, responseFor } from './fixtures/system-generation.mjs';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
const registry = allocatePlan(plan);
const reply = ({ stage }) => responseFor(stage, registry);
const runWith = request => new SystemGenerationRun({ premise: 'A monster catching expedition.', request });

test('generated stat guidance survives assembly and blank purposes are rejected', async () => {
    const result = await runWith(reply).generate();
    const vigor = result.definition.stats.character.find(field => field.id === 'vigor');
    assert.match(vigor.purpose, /Partial recovery increases current Vigor below maximum while symptoms remain/);
    assert.match(vigor.purpose, /established complete recovery restores the maximum/);
    assert.deepEqual(validateDefinition(result.definition), []);
    const previousDefault = vigor.defaultValue;
    vigor.defaultValue = '11/10';
    assert.ok(validateDefinition(result.definition).some(error => error.includes('invalid pool capacity')));
    vigor.defaultValue = previousDefault;
    vigor.purpose = '   ';
    assert.ok(validateDefinition(result.definition).some(error => error.includes('.purpose:')));
});

test('injury reminder covers present NPC pools when player health is unavailable', async () => {
    const state = { global: {}, player: { stats: {} }, characters: [{ name: 'Mira', npcTemplateId: 'character', stats: { HP: '8/12' } }] };
    const reader = await harness('fantasy', state);
    reader.settings.playerStats = [];
    let prompt = reader.prompt('Mira scrapes her arm.');
    assert.match(prompt, /characters\[\]\.stats \(Mira\): HP/);
    assert.match(prompt, /including minor scrapes/);
    reader.settings.npcStats.find(stat => stat.name === 'HP').locked = true;
    prompt = reader.prompt('Mira scrapes her arm.');
    assert.doesNotMatch(prompt, /Health fields:/);
});
