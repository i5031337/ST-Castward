import assert from 'node:assert/strict';
import test from 'node:test';
import { describeStatDefinitions, describeReaderStats } from '../src/tracker/stat-prompt-definitions.js';

test('reader and inline definitions describe editable fields without growth mechanics', () => {
    const settings = {
        globalStats: [{ name: 'Weather', type: 'text', options: ['Sunny', 'Rainy'] }],
        playerStats: [{ name: 'Energy', type: 'number', purpose: 'Spent on spells', defaultValue: '8/10' },
            { name: 'Swordplay', type: 'number', locked: true, maxStatValue: '5' }],
        npcStats: [{ name: 'Species', type: 'text', locked: true }],
    };
    const prompt = describeStatDefinitions(settings);
    assert.equal(prompt, describeReaderStats(settings));
    for (const value of ['World.Weather', 'Sunny', 'Rainy', 'Player.Energy', 'Spent on spells']) {
        assert.ok(prompt.includes(value), value);
    }
    assert.doesNotMatch(prompt, /Swordplay|Species/);
});

test('initialization fields retain purposes, choices, defaults, and numeric rating bounds', () => {
    const settings = { npcStats: [
        { name: 'Health', type: 'number', defaultValue: '5/5', min: '0' },
        { name: 'Species', type: 'text', locked: true, options: ['Human', 'Elf'] },
        { name: 'Rank', type: 'number', locked: true, min: '1', maxStatValue: '10' },
    ] };
    assert.doesNotMatch(describeReaderStats(settings), /Species|Rank/);
    const initialization = describeReaderStats(settings, { initializeNpc: true });
    for (const value of ['Health', '5/5', 'Species', 'Human', 'Elf', 'Rank', 'Minimum: 1', 'Maximum: 10']) {
        assert.ok(initialization.includes(value), value);
    }
});

test('pool initialization shows a default reading without exposing growth limits', () => {
    const settings = { npcStats: [{ name: 'Reserve', type: 'number', defaultValue: '4/6', maxStatValue: '20' }] };
    assert.doesNotMatch(describeStatDefinitions(settings), /4\/6|20/);
    const initialization = describeReaderStats(settings, { initializeNpc: true });
    assert.ok(initialization.includes('4/6'));
    assert.ok(!initialization.includes('20'));
});

test('earned experience is distinct from pools and player Level is outside editable fields', () => {
    const settings = { playerStats: [
        { id: 'xp', name: 'Insight', type: 'number', defaultValue: '0/20', maxStatValue: '20' },
        { id: 'level', name: 'Rank', type: 'number' },
    ], progression: { player: { enabled: true, xpFieldId: 'xp', levelFieldId: 'level' } } };
    const prompt = describeReaderStats(settings);
    assert.ok(prompt.includes('Player.Insight'));
    assert.doesNotMatch(prompt, /Rank|pool/);
});

test('NPC Level is offered for initialization rather than ordinary updates', () => {
    const settings = { npcStats: [{ id: 'xp', name: 'Insight', type: 'number', defaultValue: '0/20' },
        { id: 'level', name: 'Rank', type: 'number' }], npcTemplates: [{ id: 'character', progression: {
        enabled: true, xpFieldId: 'xp', levelFieldId: 'level',
    } }] };
    assert.doesNotMatch(describeStatDefinitions(settings), /Rank/);
    assert.ok(describeReaderStats(settings, { initializeNpc: true }).includes('NPC.Rank'));
});
