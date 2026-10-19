import assert from 'node:assert/strict';
import test from 'node:test';
import { createBuiltinSystem } from '../src/core/builtin-systems.js';
import { SystemGenerationRun } from '../src/generation/generate-system.js';
import { allocatePlan } from '../src/generation/plan.js';
import { validateDefinition } from '../src/generation/validate-definition.js';
import { plan, responseFor } from './fixtures/system-generation.mjs';

test('starter sheets reserve badges for brief identity fields', () => {
    const badgeIds = {
        fantasy: ['ancestry', 'calling'],
        dating: [],
        creature: ['species', 'element', 'nature'],
    };
    for (const [id, expected] of Object.entries(badgeIds)) {
        const system = createBuiltinSystem(id);
        assert.deepEqual(system.profiles.filter(field => !field.multiline).map(field => field.id), expected, id);
        assert.deepEqual(validateDefinition(system), [], id);
        assert.equal(system.profiles.find(field => field.id === 'appearance').multiline, true, id);
    }
});

test('generated profiles preserve explicit badge and text-section choices', async () => {
    const registry = allocatePlan(plan);
    const run = new SystemGenerationRun({ premise: 'A creature expedition.',
        request: ({ stage }) => responseFor(stage, registry) });
    const { definition } = await run.generate();
    for (const id of ['background', 'appearance', 'motivation']) {
        assert.equal(definition.profiles.find(field => field.id === id).multiline, true, id);
    }
    assert.equal(definition.profiles.find(field => field.id === 'species').multiline, false);
    delete definition.profiles[0].multiline;
    assert.ok(validateDefinition(definition).some(error => error.includes('multiline')));
});

test('generation repairs an omitted display choice before accepting profile fields', async () => {
    const registry = allocatePlan(plan);
    let attempts = 0;
    const run = new SystemGenerationRun({ premise: 'A creature expedition.', request: args => {
        const result = responseFor(args.stage, registry);
        if (args.stage === 'profiles') {
            attempts++;
            if (attempts === 1) delete result.section.find(field => field.id === 'appearance').multiline;
            else assert.ok(JSON.parse(args.userPrompt).repair.errors.some(error => error.includes('multiline')));
        }
        return result;
    } });
    const { definition } = await run.generate();
    assert.equal(attempts, 2);
    assert.equal(definition.profiles.find(field => field.id === 'appearance').multiline, true);
    assert.deepEqual(validateDefinition(definition), []);
});
