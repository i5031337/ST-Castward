import assert from 'node:assert/strict';
import test from 'node:test';
import { qualitativeScenarios, makeRoleplayState } from './fixtures/gemma-tracker-roleplay-scenarios.mjs';
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

{
    const player = (name, reading) => ({ stats: { [name]: reading } });
    const npc = (name, field, reading) => ({ name, ...player(field, reading) });

    test(`player range scoring accepts bounded decreases and rejects unchanged or reversed readings`, async () => {
        const bundle = await fixture('dating-q-closing-shift');
        for (const energy of [3, 5, 7, 8, 9]) {
            const raw = { locationChanged: false, player: player('Social Energy', `${energy}/10`),
                characters: [npc('Sam', 'Affection', '18')] };
            assert.equal(failures(bundle, raw).length, energy < 8 ? 0 : 1, String(energy));
        }
    });

    test(`partial-recovery scoring requires both actor gains below capacity`, async () => {
        const bundle = await fixture('fantasy-q-sheltered-breather');
        const raw = { locationChanged: false, player: player('HP', '7/12'), characters: [npc('Mira', 'HP', '8/12')] };
        assert.deepEqual(failures(bundle, raw), []);
        raw.characters = [{ name: 'Mira' }];
        assert.ok(failures(bundle, raw).some(check => check.name.startsWith('npcChangeBetween')));
        raw.characters = [npc('Mira', 'HP', '12/12')];
        assert.ok(failures(bundle, raw).some(check => check.name.startsWith('npcBelowCapacity')));
    });

}

test('NPC pattern scoring accepts equivalent text while range checks include both boundaries', async () => {
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
    raw.characters[0].stats.Comfort = '33';
    raw.characters[0].stats.Mood = 'Calm';
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('npcStatMatches')));
});

test('consumption scoring rejects double removal and unexpected present NPCs', async () => {
    const bundle = await fixture('dating-q-candy-before-call');
    const raw = { locationChanged: false, player: { collections: { items: { remove: [{ name: 'mint candy', quantity: 1 }] } } } };
    assert.deepEqual(failures(bundle, raw), []);
    raw.player.collections.items.remove[0].quantity = 2;
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('itemRemove')));
    raw.characters = [{ name: 'Sam' }];
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('npcAbsent')));
});

test('holdings scoring permits description-only changes while unchanged-stat checks reject damage', async () => {
    const bundle = await fixture('fantasy-q-brief-soaking');
    const raw = { locationChanged: false, characters: [{ name: 'Mira' }] };
    assert.deepEqual(failures(bundle, raw), []);
    raw.player = { collections: { equipment: { update: [{ name: 'travel cloak', description: 'Damp wool cloak' }] } } };
    assert.deepEqual(failures(bundle, raw), []);
    raw.player.stats = { HP: '11/12' };
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('playerUnchanged HP')));
});

test('XP scoring bounds player awards independently of NPC XP', async () => {
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

test('player recovery scoring combines numeric bounds, capacity and Condition patterns', async () => {
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
    raw.player.stats.HP = '8/12';
    raw.player.stats.Condition = 'Healthy';
    assert.ok(failures(bundle, raw).some(check => check.name.startsWith('playerStatMatches')));
});
