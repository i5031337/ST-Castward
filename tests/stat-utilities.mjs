import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedValues, findMatchingStatKey } from '../src/tracker/stat-field-utils.js';
import { bind as bindConstraints } from '../src/tracker/status-update-constraints.js';

test('stat names prefer exact readings before aliases and current/max prefixes', () => {
    const stats = { Health: '8/12', HP: '3/4', Energy: '10/10' };
    assert.equal(findMatchingStatKey(stats, 'hp'), 'HP');
    assert.equal(findMatchingStatKey(stats, 'hitpoints'), 'Health');
    assert.equal(findMatchingStatKey(stats, 'mana'), 'Energy');
    assert.equal(findMatchingStatKey(stats, 'HP_current'), 'HP');
    assert.equal(findMatchingStatKey(stats, 'Unknown'), null);
    assert.deepEqual(allowedValues({ options: [' Calm ', '', null, 'Worried'] }), ['Calm', 'Worried']);
    assert.deepEqual(allowedValues({ type: 'number', options: ['1', '2'] }), []);
});

test('independent constraint bindings keep refusal diagnostics isolated', () => {
    const first = {}, second = {};
    bindConstraints(first);
    bindConstraints(second);
    const field = { name: 'Mood', options: ['Calm'] };
    assert.equal(first.constrainToDefinition(field, 'Angry', 'Calm'), 'Calm');
    assert.deepEqual(second.takeRefusedValues(), []);
    assert.deepEqual(first.takeRefusedValues(), [{ field: 'Mood', wanted: 'Angry', allowed: ['Calm'], kept: 'Calm' }]);
    assert.deepEqual(first.takeRefusedValues(), []);
});
