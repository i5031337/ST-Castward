import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { extractJSON, safeJsonParse } from '../src/core/utils-format.js';
import { parseReaderReply } from './fixtures/gemma-reply-parsing.mjs';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
import { roleplayScenarios, makeRoleplayState } from './fixtures/gemma-tracker-roleplay-scenarios.mjs';
import { score } from './fixtures/gemma-tracker-score.mjs';

const reply = readFileSync(new URL('./fixtures/reader-swapped-closers.txt', import.meta.url), 'utf8');
const expected = { locationChanged: false, global: {}, player: {}, characters: [{ name: 'June',
    stats: { Mood: 'Joyful', Affection: '55', Trust: '40', Comfort: '60', Relationship: 'Committed Partners' },
    collections: { clothing: [{ name: 'cardigan', slot: 'top', color: 'cream', details: 'soft, oversized' }], items: [] },
}] };

test('observed reply is repaired completely, preserving text after commas and sibling fields', () => {
    const text = extractJSON(reply);
    assert.throws(() => JSON.parse(text));
    assert.deepEqual(safeJsonParse(text), expected);
});

test('production response coercion uses the repair with the actual fenced model reply', () => {
    const source = readFileSync(new URL('../src/tracker/extractor/status-extractor-request.js', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('export function coerceToUpdate')).replace('export ', '');
    const coerce = new Function('extractJSON', 'safeJsonParse', `${body}\nreturn coerceToUpdate;`)(extractJSON, safeJsonParse);
    assert.deepEqual(coerce(reply), expected);
});

test('strict validity remains false when production recovery succeeds', () => {
    const parsed = parseReaderReply(reply);
    assert.equal(parsed.strictJsonValid, false);
    assert.equal(parsed.parseRecovered, true);
    assert.deepEqual(parsed.parsed, expected);
});

test('recovered reply passes the scenario state checks without credit for raw JSON validity', async () => {
    const scenario = roleplayScenarios.find(scene => scene.id === 'dating-mutual-agreement');
    const blank = await harness('dating', {});
    const state = makeRoleplayState(scenario, blank.settings);
    const reader = await harness('dating', state);
    const parsed = parseReaderReply(reply);
    const checks = score({ scenario, state }, reader.normalize(parsed.parsed), parsed.parsed, 'stop', parsed);
    assert.deepEqual(checks.filter(check => !check.passed).map(check => check.name), ['validJsonAndNotTruncated']);
});

test('valid JSON punctuation inside strings is never treated as a trailing comma or closer', () => {
    const value = { a: 'literal , ] and , }', b: 'quotes: " } ] and backslash \\', c: ['9/12', 17, false, null] };
    const text = JSON.stringify(value);
    assert.deepEqual(safeJsonParse(text), value);
    assert.deepEqual(parseReaderReply('```json\n' + text + '\n```'), {
        parsed: value, strictJsonValid: true, parseRecovered: false,
    });
});

test('reverse transposition respects escaped quotes and brackets within string values', () => {
    const value = { a: ['literal } ] " and slash \\', 17, null] };
    const valid = JSON.stringify(value);
    const transposed = valid.slice(0, -2) + valid.at(-1) + valid.at(-2);
    assert.throws(() => JSON.parse(transposed));
    assert.deepEqual(safeJsonParse(transposed), value);
});

test('existing trailing-comma and unfinished-container repairs remain available', () => {
    assert.deepEqual(safeJsonParse('{"a":[1,2,],}'), { a: [1, 2] });
    assert.deepEqual(safeJsonParse('{"a":[1,2'), { a: [1, 2] });
});
