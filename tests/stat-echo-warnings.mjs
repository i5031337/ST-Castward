import assert from 'node:assert/strict';
import test from 'node:test';
import { bind } from './fixtures/stat-values-bind.mjs';

test('unchanged readings across scopes are quiet, including locked stats and card-held values', () => {
    const deps = { findMatchingStatKey: (stats, name) => Object.keys(stats || {}).find(key => key.toLowerCase() === name.toLowerCase()),
        findCardForName: name => name === 'Away' ? { name, statusOverrides: { Power: '4' } } : null };
    bind(deps);
    const power = { name: 'Power', type: 'number', locked: true };
    const settings = { globalStats: [{ name: 'Weather', locked: true }],
        playerStats: [power, { name: 'HP', type: 'number' }], npcStats: [power] };
    const state = { global: { Weather: 'sunny' }, player: { stats: { Power: '3', HP: '5/10' } },
        characters: [{ name: 'Mira', stats: { Power: '4' } }] };
    const update = { global: { Weather: ' sunny ' }, player: { stats: { Power: 3, HP: '5.0/10.0' } },
        characters: [{ name: 'Mira', stats: { Power: '4' } }, { name: 'Away', stats: { Power: 4 } }] };
    const warnings = [];
    deps.sanitizeModelUpdate(update, state, settings, { warnings });
    assert.deepEqual(warnings, []);
    assert.deepEqual(update.global, {});
    assert.deepEqual(update.player.stats, {});
    assert.ok(update.characters.every(actor => Object.keys(actor.stats).length === 0));
});

test('managed Level echoes are quiet while changed Levels and fresh initialization keep their rules', () => {
    const deps = { findMatchingStatKey: (stats, name) => Object.keys(stats || {}).find(key => key.toLowerCase() === name.toLowerCase()),
        findCardForName: () => null };
    bind(deps);
    const stats = [{ id: 'level', name: 'Level', type: 'number', locked: true },
        { id: 'xp', name: 'XP', type: 'number' }];
    const settings = { globalStats: [], playerStats: stats, npcStats: stats,
        npcTemplates: [{ id: 'character', statIds: ['level', 'xp'], progression: { enabled: true, xpFieldId: 'xp', levelFieldId: 'level' } }] };
    const state = { player: { stats: { Level: '1', XP: '0/100' } },
        characters: [{ name: 'Mira', npcTemplateId: 'character', stats: { Level: '1', XP: '0/100' } }] };
    for (const value of ['1', 1, '1.0', '2', 'nonsense']) {
        const warnings = [];
        const update = { player: { stats: { Level: value } }, characters: [{ name: 'Mira', stats: { Level: value } }] };
        deps.sanitizeModelUpdate(update, state, settings, { warnings });
        assert.equal(warnings.length, ['2', 'nonsense'].includes(value) ? 2 : 0, String(value));
        assert.deepEqual(update.player.stats, {});
        assert.deepEqual(update.characters[0].stats, {});
    }
    const fresh = { characters: [{ name: 'New', npcTemplateId: 'character', stats: { Level: '3' } }] };
    const warnings = [];
    deps.sanitizeModelUpdate(fresh, state, settings, { warnings });
    assert.equal(fresh.characters[0].stats.Level, '3');
    assert.deepEqual(warnings, []);
});
