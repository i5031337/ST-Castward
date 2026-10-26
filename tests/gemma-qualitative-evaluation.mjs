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

    test(`absolute: mixed feelings permit small easing of low Trust while Affection increases`, async () => {
        const bundle = await fixture('dating-q-misplaced-confidence');
        const raw = { locationChanged: false, characters: [{ name: 'Sam', stats: { Trust: '10', Affection: '30' } }] };
        assert.deepEqual(failures(bundle, raw), []);
        raw.characters = [npc('Sam', 'Affection', '22')];
        assert.deepEqual(failures(bundle, raw), []);
        raw.characters[0].stats.Trust = '13';
        assert.deepEqual(failures(bundle, raw), []);
        raw.characters[0].stats.Trust = '14';
        assert.deepEqual(failures(bundle, raw), []);
        raw.characters[0].stats.Trust = '15';
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

test('outside anxiety accepts equivalent distressed Moods while retaining player-specific relationship checks', async () => {
    const bundle = await fixture('dating-q-unwelcome-notification');
    const raw = { locationChanged: false, characters: [{ name: 'June', stats: { Mood: 'Strained' } }] };
    for (const mood of ['Strained', 'Upset', 'Agitated']) {
        raw.characters[0].stats.Mood = mood;
        assert.deepEqual(failures(bundle, raw), []);
    }
    raw.characters[0].stats.Comfort = '33';
    assert.deepEqual(failures(bundle, raw), []);
    raw.characters[0].stats.Comfort = '34';
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('npcChangeBetween June Comfort')));
    raw.characters[0].stats.Comfort = '27';
    assert.deepEqual(failures(bundle, raw), []);
    raw.characters[0].stats.Comfort = '25';
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('npcChangeBetween June Comfort')));
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

test('accepted boundary permits modest easing of Comfort and Trust', async () => {
    const bundle = await fixture('dating-q-accepted-boundary');
    const raw = { locationChanged: false, player: { stats: { 'Social Energy': '5/10' } },
        characters: [{ name: 'Sam', stats: { Comfort: '15', Trust: '8' } }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.characters[0].stats.Comfort = '20';
    assert.deepEqual(failures(bundle, raw), []);
    raw.characters[0].stats.Comfort = '21';
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('npcChangeBetween Sam Comfort')));
});

test('brief rain permits unchanged Condition and a garment-only description update', async () => {
    const bundle = await fixture('fantasy-q-brief-soaking');
    const raw = { locationChanged: false, characters: [{ name: 'Mira' }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.player = { collections: { equipment: { update: [{ name: 'travel cloak', description: 'Damp wool cloak' }] } } };
    assert.deepEqual(failures(bundle, raw), []);
    raw.player.stats = { HP: '11/12' };
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('playerUnchanged HP')));
});

test('current Dating prompts and schemas use descriptive-name Clothing and bidirectional Trust', async () => {
    const bundle = await fixture('dating-q-accepted-boundary');
    const clothing = bundle.reader.settings.collections.find(col => col.id === 'clothing');
    assert.deepEqual(clothing.fields.map(field => field.name), ['name']);
    assert.ok(!bundle.reader.settings.playerStats.some(field => field.name === 'Mood'));
    assert.ok(bundle.reader.settings.npcStats.some(field => field.name === 'Mood'));
    assert.ok(!bundle.reader.schema.properties.player.properties.stats.properties.Mood);
    assert.ok(bundle.reader.schema.properties.characters.items.properties.stats.properties.Mood);
    assert.match(clothing.guidance, /Initialize from the character’s established outfit/);
    const prompt = bundle.reader.prompt(bundle.scenario.text, bundle.scenario.earlier);
    assert.match(prompt, /Increase when actions earn confidence; decrease when actions undermine it/);
    assert.match(prompt, /Match mentioned possessions to the owner’s recorded entries/);
    assert.doesNotMatch(prompt, /slot, color, details/);
    assert.doesNotMatch(JSON.stringify(bundle.reader.schema), /"(?:slot|color|details)":/);
});

test('explicit relationship improvements allow broad plausible magnitudes', async () => {
    const confidence = await fixture('dating-q-kept-confidence');
    const raw = { locationChanged: false, player: { stats: { 'Social Energy': '5/10' } },
        characters: [{ name: 'June', stats: { Trust: '24' } }] };
    assert.deepEqual(failures(confidence, raw), []);
    raw.characters[0].stats.Trust = '60';
    assert.ok(failures(confidence, raw).some(check => check.name.startsWith('npcChangeBetween June Trust')));
    const quiet = await fixture('dating-q-quiet-company');
    const rested = { locationChanged: false, player: { stats: { 'Social Energy': '8/10' } },
        characters: [{ name: 'June', stats: { Comfort: '25' } }] };
    assert.deepEqual(failures(quiet, rested), []);
    rested.characters[0].stats.Comfort = '80';
    assert.ok(failures(quiet, rested).some(check => check.name.startsWith('npcChangeBetween June Comfort')));
});

test('a successful soothing spell permits a small caster XP award while preserving NPC XP', async () => {
    const bundle = await fixture('fantasy-q-pain-easing-spell');
    const raw = { locationChanged: false, player: { stats: { Mana: '7/10', XP: '1/100' } },
        characters: [{ name: 'Mira', stats: { Condition: 'Injured ankle; cramp eased' } }] };
    for (const xp of [0, 1, 5]) {
        raw.player.stats.XP = `${xp}/100`;
        assert.deepEqual(failures(bundle, raw), []);
    }
    raw.player.stats.XP = '6/100';
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('playerChangeBetween XP')));
    raw.player.stats.XP = '1/100';
    raw.characters[0].stats.XP = '1/100';
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('noNpcXp')));
});

test('fever recovery accepts a four-point gain while retaining capacity and remaining-symptom checks', async () => {
    const bundle = await fixture('fantasy-q-fever-easing');
    const raw = { locationChanged: false, player: { stats: { HP: '8/12', Condition: 'Fever easing; weak limbs' } },
        characters: [{ name: 'Mira' }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.player.stats.Condition = 'Exhausted; limbs heavy';
    assert.deepEqual(failures(bundle, raw), []);
    raw.player.stats.HP = '9/12';
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('playerChangeBetween HP')));
    raw.player.stats.HP = '12/12';
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('playerBelowCapacity HP')));
    assert.match(bundle.reader.prompt(bundle.scenario.text, bundle.scenario.earlier), /Cuts, bruises, pain, and illness lower current HP/);
});
