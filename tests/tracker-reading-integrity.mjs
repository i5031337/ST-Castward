import assert from 'node:assert/strict';
import test from 'node:test';
import { bind } from './fixtures/stat-values-bind.mjs';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
import { qualitativeScenarios, makeRoleplayState } from './fixtures/gemma-tracker-roleplay-scenarios.mjs';
import { constrainNumericStat } from '../src/tracker/numeric-stat-bounds.js';

const rating = { name: 'Rating', type: 'number', defaultValue: '10', min: '0' };
const pool = { name: 'HP', type: 'bar', defaultValue: '12/12' };
const deps = () => {
    const d = { findMatchingStatKey: (stats, name) => Object.keys(stats || {}).find(key => key.toLowerCase() === name.toLowerCase()),
        findCardForName: () => null };
    bind(d);
    return d;
};

test('model blank numeric readings preserve held ratings and pools in every scope', () => {
    const d = deps();
    const settings = { globalStats: [rating], playerStats: [rating, pool], npcStats: [rating, pool] };
    const state = { global: { Rating: '7' }, player: { stats: { Rating: '8', HP: '6/12' } },
        characters: [{ name: 'Mira', stats: { Rating: '9', HP: '5/12' } }] };
    for (const blank of ['', '   ', '\n\t', null]) {
        const update = { global: { Rating: blank }, player: { stats: { Rating: blank, HP: blank } },
            characters: [{ name: 'Mira', stats: { Rating: blank, HP: blank } }] };
        const warnings = [];
        d.sanitizeModelUpdate(update, state, settings, { warnings });
        assert.deepEqual(update.global, {});
        assert.deepEqual(update.player.stats, {});
        assert.deepEqual(update.characters[0].stats, {});
        assert.equal(warnings.length, 5);
    }
    const flat = { player: { Rating: '' }, characters: [{ name: 'Mira', Rating: '' }] };
    d.sanitizeModelUpdate(flat, state, settings);
    assert.equal(flat.player.Rating, undefined);
    assert.equal(flat.characters[0].Rating, undefined);
});

test('zero, text clearing, and manual numeric clearing keep their existing meaning', () => {
    const d = deps(), text = { name: 'Note', type: 'text' };
    const update = { player: { stats: { Rating: '0', Note: '' } } };
    d.sanitizeModelUpdate(update, { player: { stats: { Rating: '8', Note: 'Old note' } } },
        { playerStats: [rating, text] });
    assert.deepEqual(update.player.stats, { Rating: '0', Note: '' });
    assert.equal(constrainNumericStat(rating, d.mergeStatValue('8', '', { verbatim: true }), '8'), '');
});

test('a blank model pool initialization is omitted rather than becoming a bogus maximum', () => {
    const d = deps(), update = { characters: [{ name: 'Mira', stats: { HP: '' } }] };
    const warnings = [];
    d.sanitizeModelUpdate(update, { characters: [] }, { npcStats: [pool] }, { warnings });
    assert.deepEqual(update.characters[0].stats, {});
    assert.equal(warnings.length, 1);
});

test('production dry run preserves held relationship stats after a blank model reply', async () => {
    const scene = qualitativeScenarios.find(s => s.id === 'dating-q-passing-joke');
    const blank = await harness('dating', {}), state = makeRoleplayState(scene, blank.settings);
    const reader = await harness('dating', state);
    const result = reader.normalize({ locationChanged: false, player: {},
        characters: [{ name: 'June', stats: { Affection: '', Trust: '', Comfort: '' } }] }, scene.text);
    for (const name of ['Affection', 'Trust', 'Comfort']) {
        assert.equal(result.effective.characters[0].stats[name], state.characters[0].stats[name]);
    }
    assert.equal(result.warnings.length, 3);
});
