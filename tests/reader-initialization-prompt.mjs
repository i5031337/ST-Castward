import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { describeReaderStats } from '../src/tracker/stat-prompt-definitions.js';
import { promptText } from '../src/prompts/prompt-texts.js';
import { progressionFields } from '../src/tracker/progression-fields.js';
import { collectionQuantityField } from '../src/core/collection-fields.js';
import { collectionAppliesTo } from '../src/core/collection-targets.js';
import { isImageOnlyMessage } from '../src/tracker/ui/status-ui-placement.js';
import { isPoolStat } from '../src/tracker/numeric-stat-bounds.js';

// Stub host imports, keeping the production prompt builder.
const source = readFileSync(new URL('../src/tracker/extractor/status-extractor-prompt.js', import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replaceAll('export function ', 'function ');
function builder(templates, context = { chat: [] }, personaName = 'Alex', descriptions = {}) {
    const empty = () => '';
    return new Function('npcTemplates', 'npcStatsFor', 'describeReaderStats', 'promptText',
        'describeCurrentState', 'describeAbsentButNamed', 'describeLimits', 'describeNpcTemplates', 'strangerValues', 'describeCollections',
        'buildDeltaExample', 'isReaderStat', 'getCurrentPersonaName', 'getContext',
        'progressionFields', 'collectionAppliesTo', 'collectionQuantityField', 'isPoolStat', 'isImageOnlyMessage',
        `${source}\nreturn { buildNewNpcExample, buildUserPrompt, collectLeadUp };`)(
        () => templates, (_actor, settings) => settings.npcStats || [], describeReaderStats, promptText,
        descriptions.state || empty, empty, empty, empty, () => ({}), descriptions.collections || (settings => settings.collections?.length ? 'Configured collections' : ''), empty,
        stat => !stat.locked, () => personaName, () => context, progressionFields, collectionAppliesTo, collectionQuantityField, isPoolStat, isImageOnlyMessage);
}

test('reader initialization includes locked field purposes, ranges and text choices', () => {
    const settings = { npcStats: [
        { name: 'Rank', type: 'number', locked: true, purpose: 'Combat ability', min: '1', maxStatValue: '10' },
        { name: 'Species', type: 'text', locked: true, options: ['Human', 'Elf'] },
    ] };
    const { buildNewNpcExample, buildUserPrompt } = builder([{ id: 'npc' }]);
    const example = JSON.parse(buildNewNpcExample(settings)).characters[0];
    assert.equal(typeof example.stats.Rank, 'string');
    assert.equal(typeof example.stats.Species, 'string');
    assert.equal(example.npcTemplateId, undefined);
    const prompt = buildUserPrompt({ characters: [] }, 'Mira enters.', settings);
    for (const value of ['Rank', 'Combat ability', 'Minimum: 1', 'Maximum: 10', 'Species', 'Human', 'Elf']) {
        assert.ok(prompt.includes(value), value);
    }
});

test('multiple templates retain the selection ID in the initialization example', () => {
    const { buildNewNpcExample } = builder([{ id: 'human' }, { id: 'elf' }]);
    assert.ok(['human', 'elf'].includes(JSON.parse(buildNewNpcExample()).characters[0].npcTemplateId));
});

test('reader identifies the active player and labels history with player names', () => {
    const { buildUserPrompt, collectLeadUp } = builder([], { chat: [
        { is_user: true, name: 'Alex', mes: 'I enter.' },
        { is_user: false, mes: 'Mira greets Alex.' },
        { is_user: true, mes: 'Hello.' },
        { is_user: false, mes: 'Mira smiles.' },
    ] });
    const earlier = collectLeadUp(3, 3);
    assert.deepEqual(earlier, ['[Player (Alex)] I enter.', '[Narrator] Mira greets Alex.', '[Player (Alex)] Hello.']);
    const prompt = buildUserPrompt({ characters: [] }, 'Mira smiles.', {}, earlier);
    assert.match(prompt, /\[Player \(Alex\)\] I enter\./);
    const renamed = builder([], { chat: [] }, 'Rhea');
    assert.ok(renamed.buildUserPrompt({ characters: [] }, 'Hello.', {}).includes('Rhea'));
});

test('NPC example adds earned XP to its absolute reading and excludes the automatic Level field', () => {
    const template = { id: 'fighter', statIds: ['xp', 'rank'], progression: {
        enabled: true, xpFieldId: 'xp', levelFieldId: 'rank',
    } };
    const settings = { npcTemplates: [template], npcStats: [
        { id: 'rank', name: 'Rank', type: 'number' },
        { id: 'xp', name: 'Experience', type: 'number' },
    ] };
    const state = { characters: [{ name: 'Mira', npcTemplateId: 'fighter', stats: { Rank: '2', Experience: '20/100' } }] };
    const prompt = builder([template]).buildUserPrompt(state, 'Mira wins.', settings);
    const example = JSON.parse(prompt.split('Changed-reply example (illustrative changes):\n')[1].split('\n')[0]);
    assert.deepEqual(example.characters[0].stats, { Experience: '21/100' });
});

test('new NPC example does not seed unsupported collection entries', () => {
    const example = JSON.parse(builder([]).buildNewNpcExample({ collections: [{ id: 'gear', target: 'npc', fields: [
        { name: 'code', isPrimary: true, type: 'number' },
        { name: 'ready', type: 'boolean' },
    ] }] }));
    assert.equal(example.characters[0].collections, undefined);
});

test('recovery covers live pools, excluding progression', () => {
    const settings = { globalStats: [{ name: 'Ward Charge', type: 'number' }], playerStats: [
        { name: 'Social Energy', type: 'bar' }, { name: 'HP', type: 'number' },
        { name: 'Mana', type: 'bar' }, { name: 'XP', type: 'number' },
        { name: 'Armor', type: 'number' }, { name: 'Locked Pool', type: 'bar', locked: true },
    ], npcStats: [{ name: 'HP', type: 'number' }, { name: 'Mana', type: 'bar' },
        { name: 'Experience', type: 'number' }] };
    const state = { global: { 'Ward Charge': '2/8' }, player: { stats: { 'Social Energy': '2/10', HP: '5/12',
        Mana: '1/6', XP: '90/100', Armor: '10', 'Locked Pool': '1/5' } },
    characters: [{ name: 'Mira', stats: { HP: '4/12', Mana: '3/6', Experience: '20/100' } }] };
    const prompt = builder([]).buildUserPrompt(state, 'Alex and Mira sleep soundly and wake refreshed.', settings);
    for (const [field, current, full] of [['World.Ward Charge', '2/8', '8/8'], ['Player.Social Energy', '2/10', '10/10'],
        ['Player.HP', '5/12', '12/12'], ['Player.Mana', '1/6', '6/6'], ['Mira.HP', '4/12', '12/12'], ['Mira.Mana', '3/6', '6/6']]) {
        const line = prompt.split('\n').find(line => line.startsWith(field + ' '));
        assert.ok(line?.includes(current) && line.includes(full), field);
    }
    for (const excluded of ['Player.XP 90/100', 'Mira.Experience 20/100', 'Player.Armor', 'Player.Locked Pool']) {
        assert.ok(!prompt.includes(excluded), excluded);
    }
});

test('renamed XP thresholds are not mistaken for restorative pools', () => {
    const settings = { playerStats: [
        { id: 'xp_custom', name: 'Insight', type: 'number', defaultValue: '0/9' },
        { id: 'level_custom', name: 'Rank', type: 'number', defaultValue: '1' },
        { id: 'mana', name: 'Spell Reserve', type: 'number', defaultValue: '6/6' },
    ], progression: { player: { enabled: true, xpFieldId: 'xp_custom', levelFieldId: 'level_custom' } } };
    const prompt = builder([]).buildUserPrompt({ player: { stats: {
        Insight: '3/9', Rank: '1', 'Spell Reserve': '1/6',
    } }, characters: [] }, 'Alex is renewed after sleep.', settings);
    const line = prompt.split('\n').find(line => line.startsWith('Player.Spell Reserve '));
    assert.ok(line?.includes('1/6') && line.includes('6/6'));
    assert.ok(!prompt.includes('Player.Insight 3/9'));
});

test('state preserves locked string readings, omits retired fields', () => {
    const stateSource = readFileSync(new URL('../src/tracker/extractor/status-extractor-prompt-state.js', import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export function ', 'function ');
    const settings = { npcStats: [{ name: 'Power', locked: true }, { name: 'Health' }], playerStats: [], globalStats: [] };
    const describe = new Function('statsInSystem', 'collectionAppliesTo', 'fieldsForCard', 'getPlayerCard',
        'npcTemplateFor', 'findCardForName', `${stateSource}\nreturn describeCurrentState;`)(
        (values, key) => Object.fromEntries(Object.entries(values || {}).filter(([name]) => settings[key].some(def => def.name === name))),
        () => false, () => [], () => null, () => null, () => null);
    const current = JSON.parse(describe({ global: {}, player: {}, characters: [{ name: 'Mira', stats: {
        Power: 5, Health: '8/10', Retired: 3,
    } }] }, settings));
    assert.deepEqual(current.characters[0].stats, { Power: '5', Health: '8/10' });
});

test('changed reply uses the configured counted removal key and typed identifier', () => {
    const settings = { npcStats: [], collections: [{ id: 'gear', targets: ['npc'], trackQuantity: true,
        fields: [{ name: 'code', type: 'number', isPrimary: true }, { name: 'qty', type: 'number' }] }] };
    const prompt = builder([]).buildUserPrompt({ characters: [{ name: 'Mira' }] }, 'Mira spends an item.', settings);
    const example = JSON.parse(prompt.split('Changed-reply example (illustrative changes):\n')[1].split('\n')[0]);
    assert.deepEqual(example.characters[0].collections.gear.remove, [{ code: 1, qty: 1 }]);
});

test('inline example uses absolute string readings and typed counted collection removals', () => {
    const inlineSource = readFileSync(new URL('../src/tracker/status-scene-prompt.js', import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export function ', 'function ');
    const settings = { playerStats: [{ name: 'HP', type: 'number' }], npcStats: [], collections: [
        { id: 'gear', targets: ['npc'], trackQuantity: true, fields: [
            { name: 'code', type: 'number', isPrimary: true }, { name: 'count', type: 'number' },
        ] },
    ] };
    const deps = { committedState: { player: { stats: { HP: '5/10' } }, characters: [{ name: 'Mira' }] } };
    new Function('getSettings', 'isReaderStat', 'progressionFields', 'collectionAppliesTo',
        'collectionQuantityField', 'promptText', `${inlineSource}\nreturn bind;`)(
        () => ({ statusTracker: settings }), stat => !stat.locked, progressionFields,
        collectionAppliesTo, collectionQuantityField, promptText)(deps);
    const example = JSON.parse(deps.getStatusExample().match(/<status_update>(.*)<\/status_update>/)[1]);
    assert.deepEqual(example.global, {});
    assert.deepEqual(example.player, { stats: { HP: '4/10' } });
    assert.deepEqual(example.characters[0].collections.gear.remove, [{ code: 1, count: 1 }]);
});

test('injury guidance respects pool types and permissions', () => {
    const prompt = stat => builder([]).buildUserPrompt({ player: { stats: { Health: '10/10' } }, characters: [] },
        'Alex is injured.', { playerStats: [{ name: 'Health', ...stat }] });
    assert.match(prompt({ type: 'number', defaultValue: '10/10' }), /player\.stats: Health/);
    assert.doesNotMatch(prompt({ type: 'number', defaultValue: '10' }), /Health fields:/);
    assert.doesNotMatch(prompt({ type: 'number', defaultValue: '10/10', locked: true }), /Health fields:/);
});
