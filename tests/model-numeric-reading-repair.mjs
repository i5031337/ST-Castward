import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeModelReadings } from '../src/tracker/extractor/status-extractor-readings.js';
import { constrainNumericStat } from '../src/tracker/numeric-stat-bounds.js';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
import { makeState } from './fixtures/gemma-tracker-scenarios.mjs';

const defs = [{ name: 'Rating', type: 'number' }, { name: 'Pool', type: 'bar' }, { name: 'Note', type: 'text' }];
const settings = { globalStats: defs, playerStats: defs, npcStats: defs };

function normalize(update) {
    const warnings = [];
    normalizeModelReadings(update, {}, settings, { warnings });
    return warnings;
}

test('serialization punctuation is repaired for numeric readings across model scopes', () => {
    for (const [raw, expected] of [['{21}', '21'], ['}18,{', '18'], ['));10', '10'], [', 23', '23'],
        ['[(-3.5)]', '-3.5'], [' {8/12} ', '8/12'], ['"0"', '0'], ["'4.5'", '4.5']]) {
        const update = { global: { Rating: raw }, player: { stats: { Rating: raw } },
            characters: [{ name: 'Mira', stats: { Pool: raw } }] };
        const warnings = normalize(update);
        assert.equal(update.global.Rating, expected);
        assert.equal(update.player.stats.Rating, expected);
        assert.equal(update.characters[0].stats.Pool, expected);
        assert.equal(warnings.length, 3);
    }
});

test('ambiguous and digitless numeric strings are left for validation to reject', () => {
    for (const raw of ['', ' ', ',', '));', '>15', '+1', '1,000', '18 19', '18 HP', '{8}/{12}',
        '10%', '10-20', '{Infinity}', '{NaN}', '{1e3}', '{' + '9'.repeat(400) + '}']) {
        const update = { player: { stats: { Rating: raw } } };
        assert.deepEqual(normalize(update), [], raw);
        assert.equal(update.player.stats.Rating, raw);
    }
});

test('valid values, text, unknown fields, identifiers and collection quantities are untouched', () => {
    const update = { global: { Rating: ' 17 ' }, player: { stats: { Rating: 0, Pool: '8/12', Note: '{21}', Unknown: '{22}' },
        collections: { items: { add: [{ name: '{23}', quantity: '{2}' }] } } },
        characters: [{ name: '{24}', stats: { Note: '{25}' } }] };
    const original = structuredClone(update);
    assert.deepEqual(normalize(update), []);
    assert.deepEqual(update, original);
    assert.equal(constrainNumericStat(defs[0], '{21}', '15'), '15');
});

test('supported flat model stat objects receive the same repair', () => {
    const update = { player: { Rating: '{18}' }, characters: [{ name: 'Mira', Rating: '));10' }] };
    assert.equal(normalize(update).length, 2);
    assert.equal(update.player.Rating, '18');
    assert.equal(update.characters[0].Rating, '10');
});

async function fantasy() {
    const blank = await harness('fantasy', {});
    const state = makeState({ system: 'fantasy', xp: '90/100', hp: '5/12' }, blank.settings);
    const reader = await harness('fantasy', state);
    return { reader, state };
}

test('repaired earned XP reaches production progression before rollover', async () => {
    const { reader, state } = await fantasy();
    const result = reader.normalize({ player: { stats: { XP: '{110/100}' } } }, 'Alex earns 20 XP.');
    assert.equal(result.update.player.stats.XP, '110/100');
    assert.equal(result.effective.player.stats.XP, '10/100');
    assert.equal(result.effective.player.stats.Level, '2');
    assert.equal(state.player.stats.XP, '90/100');
});

test('repair preserves XP decrease, locked stat, level, maximum and bounds safeguards', async () => {
    const { reader } = await fantasy();
    reader.settings.playerStats.find(stat => stat.name === 'Strength').locked = true;
    const result = reader.normalize({ player: { stats: {
        XP: '{89/100}', Strength: '{50}', Level: '{8}', HP: '{99/999}', Currency: '{-3}',
    } } }, 'A malformed tracker reading.');
    assert.equal(result.effective.player.stats.XP, '90/100');
    assert.equal(result.effective.player.stats.Strength, '10');
    assert.equal(result.effective.player.stats.Level, '1');
    assert.equal(result.effective.player.stats.HP, '12/12');
    assert.equal(result.effective.player.stats.Currency, '0');
});

test('new NPC numeric initialization keeps its individual pool capacity', async () => {
    const { reader } = await fantasy();
    const result = reader.normalize({ characters: [{ name: 'Mira', stats: { HP: '{8/8}', Level: '{2}' } }] }, 'Mira arrives.');
    const actor = result.update.characters.find(actor => actor.name === 'Mira');
    assert.equal(actor.stats.HP, '8/8');
    assert.equal(actor.stats.Level, '2');
});
