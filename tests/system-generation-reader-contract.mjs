import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemGenerationRun } from '../src/generation/generate-system.js';
import { allocatePlan } from '../src/generation/plan.js';
import { validateDefinition } from '../src/generation/validate-definition.js';
import { plan, responseFor } from './fixtures/system-generation.mjs';

const registry = allocatePlan(plan);
const reply = ({ stage }) => responseFor(stage, registry);

test('generation requests and validates canonical XP defaults and managed levels', async () => {
    const calls = [];
    const { definition } = await new SystemGenerationRun({ premise: 'A monster catching expedition.', request: args => { calls.push(args); return reply(args); } }).generate();
    const request = calls.find(call => call.stage === 'stats.character');
    const requirements = JSON.parse(request.userPrompt).counterRequirements;
    assert.deepEqual(requirements.map(owner => owner.owner), ['player', 'creature']);
    for (const owner of requirements) {
        assert.equal(owner.xp.defaultValueExample, '0/100');
        assert.equal(owner.xp.maxStatValueExample, '100');
        assert.equal(owner.xp.locked, false);
        assert.equal(owner.level.locked, true);
    }
    const xp = definition.stats.character.find(field => field.id === 'xp');
    const level = definition.stats.character.find(field => field.id === 'level');
    assert.equal(xp.defaultValue, '0/100');
    assert.equal(xp.maxStatValue, '100');
    assert.equal(xp.locked, false);
    assert.equal(level.locked, true);
    const bad = structuredClone(definition);
    bad.stats.character.find(field => field.id === 'xp').defaultValue = '119/100';
    assert.ok(validateDefinition(bad).some(error => error.includes('integer remainder/capacity')));
});
