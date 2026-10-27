import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedValues, findMatchingStatKey } from '../src/tracker/stat-field-utils.js';
import * as constraints from '../src/tracker/status-update-constraints.js';
const bindConstraints = deps => Object.assign(deps, constraints);

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

test('constraint refusals belong to the supplied operation callback', () => {
    const deps = {};
    bindConstraints(deps);
    const field = { name: 'Mood', options: ['Calm'] };
    const refused = [];
    assert.equal(deps.constrainToDefinition(field, 'Angry', 'Calm', undefined, value => refused.push(value)), 'Calm');
    assert.deepEqual(refused, [{ field: 'Mood', wanted: 'Angry', allowed: ['Calm'], kept: 'Calm' }]);
    deps.constrainToDefinition(field, 'Angry', 'Calm');
    assert.equal(refused.length, 1);
    const next = [];
    deps.constrainToOptions(field, 'Calm', 'Calm', value => next.push(value));
    assert.deepEqual(next, []);
});
