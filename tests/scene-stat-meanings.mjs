import { bindStatusModule } from './helpers/status-module.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { npcStatsFor } from '../src/core/npc-templates.js';
import { promptText } from '../src/prompts/prompt-texts.js';

function renderer(tracker, referenced = [], renderPrompt = promptText) {
    const deps = {};
    const getSettings = () => ({ statusTracker: tracker });
    bindStatusModule(new URL('../src/tracker/status-stat-filter.js', import.meta.url), deps, {
        getSettings, npcStatsFor: (actor, settings) => npcStatsFor(actor, settings, {
            npcTemplates: [{ id: 'human', statIds: ['hp', 'resolve'] }],
        }),
    });
    bindStatusModule(new URL('../src/tracker/status-status-summary.js', import.meta.url), deps, {
        getSettings, promptText: renderPrompt, charactersFromActivatedLore: () => referenced,
    });
    return (state, places = '') => deps.formatCompactStatus(state, true, places);
}

test('scene meanings follow injected stats, deduplicate NPCs, and preserve scope-specific purposes', () => {
    const render = renderer({ collections: [], historyNotes: false,
        globalStats: [{ name: 'Threat', purpose: 'World danger.' }],
        playerStats: [
            { name: 'HP', purpose: ' Player health. ', hint: 'READER_ONLY', locked: true },
            { name: 'Empty', purpose: 'EMPTY_PURPOSE' },
            { name: 'Missing', purpose: 'MISSING_PURPOSE' },
            { name: 'No meaning', purpose: '  ' },
        ],
        npcStats: [
            { id: 'hp', name: 'HP', purpose: 'NPC health.' },
            { id: 'resolve', name: 'Resolve', purpose: 'Mental endurance.' },
            { id: 'mana', name: 'Mana', purpose: 'EXCLUDED_PURPOSE' },
        ],
    }, [{ name: 'Referenced', statusOverrides: { Resolve: 2 } }]);
    const state = { global: { Threat: 0, Deleted: 4 },
        player: { name: 'Hero', stats: { hp: 0, Empty: '', Deleted: 2, 'No meaning': false } },
        characters: ['Mira', 'Elza'].map(name => ({ name, npcTemplateId: 'human', stats: { HP: 8, Mana: 5 } })),
    };
    const scene = render(state);
    for (const meaning of ['World.Threat: World danger.', 'Player.HP: Player health.',
        'NPC.HP: NPC health.', 'NPC.Resolve: Mental endurance.']) {
        assert.ok(scene.includes(meaning), meaning);
    }
    assert.equal(scene.split('NPC.HP:').length - 1, 1);
    for (const unwanted of ['EMPTY_PURPOSE', 'MISSING_PURPOSE', 'EXCLUDED_PURPOSE', 'READER_ONLY', 'Deleted', 'Mana=']) {
        assert.ok(!scene.includes(unwanted), scene);
    }
    assert.match(scene, /Player \(Hero\): hp=0, No meaning=false/);
    assert.match(scene, /Referenced - Resolve=2/);
});

test('custom scene templates receive known places through the existing status value', () => {
    const render = renderer({ collections: [], globalStats: [], npcStats: [], playerStats: [] }, [],
        (_id, values) => `Custom scene:\n${values.status}`);
    const scene = render({ global: {}, player: { stats: {} }, characters: [] },
        'Known places:\n- Lantern Inn (last confirmed setting)');
    assert.ok(scene.includes('Lantern Inn'));
    assert.ok(scene.startsWith('Custom scene:'));
});
