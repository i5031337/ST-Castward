import assert from 'node:assert/strict';
import test from 'node:test';
import { bind } from './fixtures/stat-values-bind.mjs';
import { normalizeModelReadings } from '../src/tracker/extractor/status-extractor-readings.js';

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

test('repeating absolute XP is quiet while higher totals still apply', () => {
    const settings = { globalStats: [], npcStats: [], playerStats: [
        { name: 'XP', type: 'number' }, { name: 'Level', type: 'number' }] };
    const state = { player: { stats: { XP: '90/100', Level: '1' } } };
    const warnings = [];
    const echo = { player: { stats: { XP: '90.0/100' } } };
    normalizeModelReadings(echo, state, settings, { warnings });
    assert.deepEqual(echo.player.stats, {});
    const update = { player: { stats: { XP: '110/100' } } };
    normalizeModelReadings(update, state, settings, { warnings });
    assert.equal(update.player.stats.XP, '110/100');
    assert.deepEqual(warnings, []);
    normalizeModelReadings({ player: { stats: { XP: '80/100' } } }, state, settings, { warnings });
    assert.equal(warnings.length, 1);
});

test('repeated NPC XP uses card fallback when the live reading is blank', () => {
    const stats = [{ id: 'xp', name: 'XP', type: 'number' }, { id: 'level', name: 'Level', type: 'number' }];
    const settings = { globalStats: [], playerStats: [], npcStats: stats,
        npcTemplates: [{ id: 'character', statIds: ['xp', 'level'], progression: { enabled: true, xpFieldId: 'xp', levelFieldId: 'level' } }] };
    const state = { characters: [{ name: 'Mira', npcTemplateId: 'character', stats: { XP: '', Level: '1' } }] };
    const cards = [{ name: 'Mira', npcTemplateId: 'character', statusOverrides: { XP: '20/100', Level: '1' } }];
    const warnings = [];
    const update = { characters: [{ name: 'Mira', stats: { XP: '20/100' } }] };
    normalizeModelReadings(update, state, settings, { cards, warnings });
    assert.deepEqual(warnings, []);
    assert.deepEqual(update.characters[0].stats, {});
});
