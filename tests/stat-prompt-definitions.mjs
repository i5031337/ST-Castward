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
    assert.match(prompt, /World\.Weather: text\. choose: Sunny, Rainy\./);
    assert.match(prompt, /Player\.Energy: pool \(current\/maximum\)\. Spent on spells\./);
    assert.doesNotMatch(prompt, /Swordplay|Species|growth|level-up|code|threshold/);
});

test('initialization fields retain purposes, choices, defaults, and numeric rating bounds', () => {
    const settings = { npcStats: [
        { name: 'Health', type: 'number', defaultValue: '5/5', min: '0' },
        { name: 'Species', type: 'text', locked: true, options: ['Human', 'Elf'] },
        { name: 'Rank', type: 'number', locked: true, min: '1', maxStatValue: '10' },
    ] };
    assert.equal(describeReaderStats(settings), '- NPC.Health: pool (current/maximum).');
    assert.equal(describeReaderStats(settings, { initializeNpc: true }),
        '- NPC.Health: pool (current/maximum). Default: 5/5. Minimum: 0.\n'
        + '- NPC.Species: text. choose: Human, Elf.\n'
        + '- NPC.Rank: number. Minimum: 1. Maximum: 10.');
});

test('pool initialization shows a default reading without exposing growth limits', () => {
    const settings = { npcStats: [{ name: 'Reserve', type: 'number', defaultValue: '4/6', maxStatValue: '20' }] };
    assert.equal(describeStatDefinitions(settings), '- NPC.Reserve: pool (current/maximum).');
    assert.equal(describeReaderStats(settings, { initializeNpc: true }),
        '- NPC.Reserve: pool (current/maximum). Default: 4/6.');
});

test('earned experience is distinct from pools and player Level is outside editable fields', () => {
    const settings = { playerStats: [
        { id: 'xp', name: 'Insight', type: 'number', defaultValue: '0/20', maxStatValue: '20' },
        { id: 'level', name: 'Rank', type: 'number' },
    ], progression: { player: { enabled: true, xpFieldId: 'xp', levelFieldId: 'level' } } };
    assert.equal(describeReaderStats(settings), '- Player.Insight: earned experience.');
});

test('NPC Level is offered for initialization rather than ordinary updates', () => {
    const settings = { npcStats: [{ id: 'xp', name: 'Insight', type: 'number', defaultValue: '0/20' },
        { id: 'level', name: 'Rank', type: 'number' }], npcTemplates: [{ id: 'character', progression: {
        enabled: true, xpFieldId: 'xp', levelFieldId: 'level',
    } }] };
    assert.equal(describeStatDefinitions(settings), '- NPC.Insight: earned experience.');
    assert.match(describeReaderStats(settings, { initializeNpc: true }), /NPC.Rank: number\./);
});
