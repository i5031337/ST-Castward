import assert from 'node:assert/strict';
import test from 'node:test';
import { qualitativeScenarios, roleplayScenarios, makeRoleplayState } from './fixtures/gemma-tracker-roleplay-scenarios.mjs';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
import { score } from './fixtures/gemma-tracker-score.mjs';

async function fixture(id) {
    const scenario = qualitativeScenarios.find(scene => scene.id === id);
    const blank = await harness(scenario.system, {});
    const state = makeRoleplayState(scenario, blank.settings);
    const reader = await harness(scenario.system, state);
    return { scenario, state, reader };
}
function failures(bundle, raw) {
    return score(bundle, bundle.reader.normalize(raw, bundle.scenario.text), raw, 'stop').filter(check => !check.passed);
}

test('new comparison set has twenty distinct reviewed qualitative scenes, separate from the original set', () => {
    assert.equal(qualitativeScenarios.length, 20);
    assert.equal(new Set([...roleplayScenarios, ...qualitativeScenarios].map(scene => scene.id)).size, 40);
    for (const system of ['fantasy', 'dating']) assert.equal(qualitativeScenarios.filter(scene => scene.system === system).length, 10);
    for (const scene of qualitativeScenarios) {
        assert.equal(scene.holdout, true);
        assert.deepEqual(scene.history.map(message => message.role), ['user', 'assistant', 'user', 'assistant']);
        assert.ok(scene.history.every(message => message.content.trim()));
        assert.ok(scene.user.trim());
        assert.ok(scene.text.split(/\s+/).length >= 150, scene.id);
        assert.equal(scene.generation.finishReason, 'stop');
        assert.match(scene.generation.model, /31B/i);
        assert.equal(scene.review?.status, 'reviewed');
        assert.ok(!/\b(?:HP|XP|mana points?|social energy|\d+\s*\/\s*\d+)\b/i.test(scene.text), scene.id);
    }
});

test('all twenty prompts include the exchange and exclude authoring and scoring material', async () => {
    for (const scene of qualitativeScenarios) {
        const bundle = await fixture(scene.id);
        const prompt = bundle.reader.prompt(scene.text, scene.earlier);
        assert.ok(prompt.includes(scene.user), scene.id);
        assert.ok(prompt.includes(scene.text), scene.id);
        assert.ok(!prompt.includes(scene.generationBrief), scene.id);
        assert.ok(!prompt.includes('playerChangeBetween'), scene.id);
        assert.ok(!prompt.includes(scene.review.note), scene.id);
        const checks = score(bundle, bundle.reader.normalize({ locationChanged: false }), { locationChanged: false }, 'stop');
        assert.equal(checks.length, scene.checks.length + 2, scene.id);
    }
});

{
    const player = (name, reading) => ({ stats: { [name]: reading } });
    const npc = (name, field, reading) => ({ name, ...player(field, reading) });

    test(`absolute: clear fatigue accepts several magnitudes but rejects unchanged or reversed readings`, async () => {
        const bundle = await fixture('dating-q-closing-shift');
        for (const energy of [3, 5, 7, 8, 9]) {
            const raw = { locationChanged: false, player: player('Social Energy', `${energy}/10`),
                characters: [npc('Sam', 'Affection', '18')] };
            assert.equal(failures(bundle, raw).length, energy < 8 ? 0 : 1, String(energy));
        }
    });

    test(`absolute: partial rest must affect both actors without fully healing either`, async () => {
        const bundle = await fixture('fantasy-q-sheltered-breather');
        const raw = { locationChanged: false, player: player('HP', '7/12'), characters: [npc('Mira', 'HP', '8/12')] };
        assert.deepEqual(failures(bundle, raw), []);
        raw.characters = [{ name: 'Mira' }];
        assert.ok(failures(bundle, raw).some(check => check.name.startsWith('npcChangeBetween')));
        raw.characters = [npc('Mira', 'HP', '12/12')];
        assert.ok(failures(bundle, raw).some(check => check.name.startsWith('npcBelowCapacity')));
    });

    test(`absolute: mixed feelings require trust and affection to move independently`, async () => {
        const bundle = await fixture('dating-q-misplaced-confidence');
        const raw = { locationChanged: false, characters: [{ name: 'Sam', stats: { Trust: '10', Affection: '22' } }] };
        assert.deepEqual(failures(bundle, raw), []);
        raw.characters = [npc('Sam', 'Affection', '22')];
        assert.ok(failures(bundle, raw).some(check => check.name.startsWith('npcChangeBetween Sam Trust')));
    });
}

test('minor pleasant exchanges permit unchanged ratings and reject a large trust jump', async () => {
    const bundle = await fixture('dating-q-passing-joke');
    const raw = { locationChanged: false, characters: [{ name: 'June' }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.characters[0].stats = { Trust: '30' };
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('npcChangeBetween June Trust')));
});

test('fresh user consumption counts once and does not bring the contemplated caller onstage', async () => {
    const bundle = await fixture('dating-q-candy-before-call');
    const raw = { locationChanged: false, player: { collections: { items: { remove: [{ name: 'mint candy', quantity: 1 }] } } } };
    assert.deepEqual(failures(bundle, raw), []);
    raw.player.collections.items.remove[0].quantity = 2;
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('itemRemove')));
    raw.characters = [{ name: 'Sam' }];
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('npcAbsent')));
});
