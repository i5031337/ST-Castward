import assert from 'node:assert/strict';
import test from 'node:test';
import { sameStatReading } from '../src/tracker/stat-reading-equality.js';

test('numeric equivalents are repeats, while malformed readings and changed maxima are not', () => {
    for (const [incoming, held] of [[1, '1'], ['1.0', '1'], ['5.0 / 12.0', '5/12'], [5, '5/12'], ['0', '0'], ['', '']]) {
        assert.equal(sameStatReading({ type: 'number' }, incoming, held), true);
    }
    for (const [incoming, held] of [['5/20', '5/12'], ['5/12', '5'], [', 5', '5'], ['NaN', '5'],
        ['0', ''], ['', undefined], [0, null], [{ value: 1 }, '1'], ['6/12', '5/12']]) {
        assert.equal(sameStatReading({ type: 'number' }, incoming, held), false);
    }
});

test('text retains exact spelling and never assumes numeric equivalence', () => {
    assert.equal(sameStatReading({ type: 'text' }, ' Calm ', 'Calm'), true);
    assert.equal(sameStatReading({ type: 'text' }, 'calm', 'Calm'), false);
    assert.equal(sameStatReading({ type: 'text' }, '01', '1'), false);
});

test('whole-value edits can remove a maximum while bare reader readings retain it', () => {
    assert.equal(sameStatReading({ type: 'number' }, '6', '6/20'), true);
    assert.equal(sameStatReading({ type: 'number' }, '6', '6/20', { allowBarePool: false }), false);
    assert.equal(sameStatReading({ type: 'number' }, '6.0/20.0', '6/20', { allowBarePool: false }), true);
});
