import test from 'node:test';
import assert from 'node:assert/strict';
import { allocatePlan } from '../src/generation/plan.js';
import { SystemGenerationRun } from '../src/generation/generate-system.js';
import { plan, responseFor } from './fixtures/system-generation.mjs';

test('unassigned counters and unknown targets report actionable errors', () => {
    const bad = structuredClone(plan);
    bad.playerProgression.xp = '0/100';
    bad.stats.character.find(f => f.name === 'Level').targets = ['Creature'];
    bad.profiles[0].targets = ['Unknown'];
    assert.throws(() => allocatePlan(bad), error => {
        assert.match(error.message, /playerProgression.xp: unresolved name "0\/100".*stats.character/);
        assert.match(error.message, /playerProgression.level: unresolved name "Level"/);
        assert.match(error.message, /profiles.Background.targets: unresolved name "Unknown"/);
        return true;
    });
});

test('planner repairs invalid counter names without changing allocated shared fields', async () => {
    const allocated = allocatePlan(plan), requests = [];
    const run = new SystemGenerationRun({ premise: 'Basic monster adventure', request: args => {
        requests.push(args);
        if (requests.length === 1) {
            const bad = structuredClone(plan); bad.playerProgression.xp = '0/100';
            return { section: bad, assumptions: [] };
        }
        return responseFor(args.stage, allocated);
    } });
    const result = await run.generate();
    assert.equal(requests.filter(r => r.stage === 'plan').length, 2);
    assert.ok(JSON.parse(requests[1].userPrompt).repair.errors.some(message => message.includes('stats.character')));
    assert.equal(result.definition.stats.character.filter(f => f.name === 'XP').length, 1);
});
