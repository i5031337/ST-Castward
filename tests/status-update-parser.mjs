import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessageForUpdates, splitStatKeyPart, groupIncomingStats } from '../src/tracker/status-update-parser.js';

test('inline update parsing preserves story prose while removing tagged or bare tracker output', () => {
    const update = { player: { stats: { HP: '8/10' } } };
    for (const block of [JSON.stringify(update), `<status_update>${JSON.stringify(update)}</status_update>`]) {
        const text = `Mira closes the door.\n${block}`;
        const parsed = parseMessageForUpdates(text);
        assert.deepEqual(parsed.update, update);
        assert.equal(parsed.cleanedText, 'Mira closes the door.');
        assert.equal(parsed.matchLength, text.length - parsed.cleanedText.length);
    }
    assert.deepEqual(parseMessageForUpdates('Ordinary story text.'), {
        cleanedText: 'Ordinary story text.', update: null, matchLength: 0,
    });
});

test('grouped stat fragments preserve exact configured names and ignore metadata', () => {
    const keys = ['HP', 'Energy_max'];
    const resolve = name => keys.find(key => key.toLowerCase() === name.toLowerCase());
    const unknown = [];
    const groups = groupIncomingStats({ name: 'Mira', hp_max: '10', hp_current: '8', Energy_max: '6', typo: '2' },
        resolve, key => keys.includes(key), key => key === 'name', key => unknown.push(key));
    assert.deepEqual([...groups], [['HP', { max: '10', current: '8' }], ['Energy_max', { whole: '6' }]]);
    assert.deepEqual(unknown, ['typo']);
    assert.deepEqual(splitStatKeyPart('HP_CURRENT'), { base: 'HP', part: 'current' });
    assert.deepEqual(splitStatKeyPart('Mood'), { base: 'Mood', part: null });
});
