import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { describeReaderStats } from '../src/tracker/stat-prompt-definitions.js';
import { promptText } from '../src/prompts/prompt-texts.js';
import { progressionFields } from '../src/tracker/progression-fields.js';
import { numericDeltaNames, progressionXpName } from '../src/tracker/extractor/status-extractor-deltas.js';
import { collectionQuantityField } from '../src/core/collection-fields.js';
import { collectionAppliesTo } from '../src/core/collection-targets.js';
import { isPoolStat } from '../src/tracker/numeric-stat-bounds.js';
import { SYSTEM_PROMPT } from '../src/core/constants-prompts.js';
import { defaultPromptText, PROMPT_TEXTS } from '../src/prompts/prompt-texts.js';

// Replace host-dependent imports while exercising the actual prompt builder.
const source = readFileSync(new URL('../src/tracker/extractor/status-extractor-prompt.js', import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replaceAll('export function ', 'function ');
function builder(templates, context = { chat: [] }, personaName = 'Alex', descriptions = {}) {
    const empty = () => '';
    return new Function('npcTemplates', 'npcStatsFor', 'describeReaderStats', 'promptText',
        'describeCurrentState', 'describeAbsentButNamed', 'describeLimits', 'describeNumericDeltas',
        'progressionXpName', 'describeNpcTemplates', 'strangerValues', 'describeCollections',
        'buildDeltaExample', 'numericDeltaNames', 'isReaderStat', 'getCurrentPersonaName', 'getContext',
        'progressionFields', 'collectionAppliesTo', 'collectionQuantityField', 'isPoolStat',
        `${source}\nreturn { buildNewNpcExample, buildUserPrompt, collectLeadUp };`)(
        () => templates, (_actor, settings) => settings.npcStats || [], describeReaderStats, promptText,
        descriptions.state || empty, empty, empty, descriptions.numericDeltas || empty,
        progressionXpName, empty, () => ({}), descriptions.collections || (settings => settings.collections?.length ? 'Configured collections' : ''), empty, numericDeltaNames,
        stat => !stat.locked, () => personaName, () => context, progressionFields, collectionAppliesTo, collectionQuantityField, isPoolStat);
}

test('reader initialization includes locked field purposes, ranges and text choices', () => {
    const settings = { npcStats: [
        { name: 'Rank', type: 'number', locked: true, purpose: 'Combat ability', min: '1', maxStatValue: '10' },
        { name: 'Species', type: 'text', locked: true, options: ['Human', 'Elf'] },
    ] };
    const { buildNewNpcExample, buildUserPrompt } = builder([{ id: 'npc' }]);
    const example = JSON.parse(buildNewNpcExample(settings)).characters[0];
    assert.equal(example.stats.Rank, '<initial reading>');
    assert.equal(example.stats.Species, '<initial reading>');
    assert.equal(example.npcTemplateId, undefined);
    const prompt = buildUserPrompt({ characters: [] }, 'Mira enters.', settings);
    assert.match(prompt, /NPC initialization fields/);
    assert.match(prompt, /NPC.Rank: number\. Combat ability\. Minimum: 1\. Maximum: 10\./);
    assert.match(prompt, /filled fields outside the editable list provide context/);
});

test('battle reader permits prose-derived damage and records demonstrated abilities for existing NPCs', () => {
    const settings = { npcStats: [
        { name: 'HP', type: 'bar', defaultValue: '10/10', purpose: 'Health remaining' },
        { name: 'ATK', type: 'number', locked: true },
    ], collections: [{ id: 'moves', name: 'Moves', target: 'npc', fields: [
        { name: 'Name', type: 'text', isPrimary: true },
    ] }] };
    const state = { characters: [
        { name: 'Mudkip', stats: { HP: '10/10', ATK: '5' }, collections: { moves: [{ Name: 'Water Gun' }] } },
        { name: 'Poochyena', stats: { HP: '10/10', ATK: '5' }, collections: { moves: [] } },
    ] };
    const message = 'Mudkip uses Water Gun. Poochyena yelps as the hit knocks him back, '
        + 'then uses Tackle, painfully knocking Mudkip onto the grass.';
    const prompt = builder([], { chat: [] }, 'Redd', {
        state: value => JSON.stringify(value),
        numericDeltas: () => 'Mudkip: HP\nPoochyena: HP',
        collections: () => '- "moves" (Moves) for NPCs. Fields: Name [identifies the item]',
    }).buildUserPrompt(state, message, settings);
    assert.ok(prompt.includes(message));
    assert.match(prompt, /effect is clear but its amount is unstated/);
    assert.match(prompt, /Use the field's current scale for estimates/);
    assert.match(prompt, /"characters\[\]\.deltas"/);
    assert.match(prompt, /Add missing abilities or knowledge when demonstrated, including during a failed action/);
    assert.match(prompt, /Reusable entries stay held after use/);
    assert.match(prompt, /interpret resolved events/);
    assert.match(prompt, /Keep one entry per identifier/);
    assert.match(prompt, /For a pool, report the change to its current amount/);
    assert.match(prompt, /Label estimated amounts and NPC initial estimates/);
});

test('system and inline prompts share general inference and ability discovery guidance', () => {
    assert.match(SYSTEM_PROMPT, /Report resolved events/);
    assert.match(SYSTEM_PROMPT, /Use earlier messages as context/);
    assert.match(SYSTEM_PROMPT, /Follow the output format in the request/);
    assert.match(SYSTEM_PROMPT, /Use configured fields and exact names/);
    const inline = promptText('storyBlock', { status: '{}', rules: '', schemas: 'Configured ability collection' });
    assert.match(inline, /Estimate conservatively when an effect is clear but its amount is unstated/);
    assert.match(inline, /Track resolved story events/);
    assert.match(inline, /Add missing abilities or knowledge when demonstrated, including during a failed action/);
    assert.match(inline, /Reusable entries stay held after use/);
    for (const text of [defaultPromptText('reader'), inline]) {
        for (const path of ['global', 'globalDeltas', 'player.stats', 'player.deltas', 'characters[].stats', 'characters[].deltas']) {
            assert.ok(text.includes(`"${path}"`), path);
        }
        assert.doesNotMatch(text, /level-up code|capacity growth|growth capacity limit|calculates remaining/);
    }
    for (const text of [SYSTEM_PROMPT, defaultPromptText('reader'), defaultPromptText('storyBlock')]) {
        assert.doesNotMatch(text, /pok[eé]mon|Mudkip|Poochyena|Water Gun|Tackle/i);
    }
});

test('tracker prompts use configured fields without assuming an active stat or mechanic', () => {
    const settings = { npcStats: [{ name: 'Focus', type: 'number', purpose: 'Concentration remaining' }] };
    const state = { characters: [{ name: 'Mira', stats: { Focus: '10' } }] };
    const reader = builder([]).buildUserPrompt(state, 'Mira completes a demanding task.', settings);
    const inline = promptText('storyBlock', { status: '{}', rules: '', statDefinitions: 'NPC.Focus: number' });
    for (const text of [SYSTEM_PROMPT, reader, inline, defaultPromptText('scanSystem')]) {
        assert.doesNotMatch(text, /\bhealth\b|\bhp\b|\bmana\b|\bcondition\b|\binjur(?:y|ies)\b|\breputation\b|\brelationship\b|public-standing|\bHealthy\b/i);
    }
    assert.match(reader, /Use configured field purposes/);
    assert.match(reader, /Apply configured persistence and reset rules/);
    assert.doesNotMatch(reader, /### EXPERIENCE|WHEN A COLLECTION CHANGES/);
    assert.doesNotMatch(inline, /Experience:|### COLLECTIONS/);
    assert.match(SYSTEM_PROMPT, /return a JSON tracker update/);
    assert.match(defaultPromptText('scanSystem'), /Follow each collection's configured purpose and rules/);
    assert.doesNotMatch(defaultPromptText('scanSystem'), /An abstract fact is not a skill/);
});

test('built-in model prompts do not assume dice mechanics', () => {
    for (const text of [SYSTEM_PROMPT, ...PROMPT_TEXTS.map(entry => entry.text)]) {
        assert.doesNotMatch(text, /\bdice\b|\broll(?:s|ed)?\b|\bd\d+\b|saving throw|skill check/i);
    }
    assert.match(defaultPromptText('reader'), /Apply costs when incurred/);
});

test('multiple templates retain the selection ID in the initialization example', () => {
    const { buildNewNpcExample } = builder([{ id: 'human' }, { id: 'elf' }]);
    assert.equal(JSON.parse(buildNewNpcExample()).characters[0].npcTemplateId, 'human');
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
    assert.match(prompt, /Alex is the player-controlled character\. Put their changes under "player"\./);
    assert.match(prompt, /\[Player \(Alex\)\] I enter\./);
    const renamed = builder([], { chat: [] }, 'Rhea');
    assert.match(renamed.buildUserPrompt({ characters: [] }, 'Hello.', {}), /Rhea is the player-controlled character/);
});

test('NPC example awards positive XP and excludes the automatic Level field', () => {
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
    assert.deepEqual(example.characters[0].deltas, { Experience: 1 });
    assert.match(prompt, /Player: "player\.stats"/);
    assert.match(prompt, /World: "globalDeltas"/);
    assert.match(prompt, /New NPC example/);
    assert.match(prompt, /rumours, and routine conversation leave XP unchanged/);
    assert.match(prompt, /once per concrete accomplishment/);
    assert.match(promptText('storyBlock', { status: '{}', rules: '', xpProgression: 'on' }), /rumours, and routine conversation leave XP unchanged/);
    assert.doesNotMatch(prompt, /NPC INITIALIZATION TEMPLATE|a plain number stays a plain number/);
});

test('new NPC example does not seed unsupported collection entries', () => {
    const example = JSON.parse(builder([]).buildNewNpcExample({ collections: [{ id: 'gear', target: 'npc', fields: [
        { name: 'code', isPrimary: true, type: 'number' },
        { name: 'ready', type: 'boolean' },
    ] }] }));
    assert.equal(example.characters[0].collections, undefined);
    const prompt = builder([]).buildUserPrompt({ characters: [] }, 'Mira enters without any gear.', {
        collections: [{ id: 'gear', target: 'npc', fields: [{ name: 'code', isPrimary: true }] }],
    });
    assert.match(prompt, /Use established possessions for a new NPC's starting items/);
});

test('recovery guidance covers every live player and NPC pool except progression counters', () => {
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
    for (const reading of ['World.Ward Charge 2/8 needs +6', 'Player.Social Energy 2/10 needs +8', 'Player.HP 5/12 needs +7',
        'Player.Mana 1/6 needs +5', 'Mira.HP 4/12 needs +8', 'Mira.Mana 3/6 needs +3']) {
        assert.ok(prompt.includes(reading), reading);
    }
    for (const excluded of ['Player.XP 90/100', 'Mira.Experience 20/100', 'Player.Armor', 'Player.Locked Pool']) {
        assert.ok(!prompt.includes(excluded), excluded);
    }
    assert.match(prompt, /Match recovery to the affected owner and pools/);
    assert.match(prompt, /Sound sleep followed by waking refreshed/);
    assert.match(prompt, /Use a smaller gain for partial recovery/);
    const unrelated = builder([]).buildUserPrompt({ player: { stats: { Focus: '2' } }, characters: [] },
        'Alex rests.', { playerStats: [{ name: 'Focus', type: 'number' }] });
    assert.doesNotMatch(unrelated, /Sound sleep followed by waking refreshed/);
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
    assert.match(prompt, /Player\.Spell Reserve 1\/6 needs \+5/);
    assert.doesNotMatch(prompt, /Player\.Insight 3\/9 needs/);
});

test('configured health pools keep narrated injury from becoming only a text condition', () => {
    const settings = { playerStats: [{ name: 'Health', type: 'bar', purpose: 'Remaining bodily health' }] };
    const prompt = builder([]).buildUserPrompt({ player: { stats: { Health: '10/10' } }, characters: [] },
        'Alex falls and bruises a shoulder.', settings);
    assert.match(prompt, /Report bodily injury as a decrease in player\.deltas\.Health/);
    assert.match(prompt, /Report effective wound care or healing as an increase in that field/);
    assert.match(prompt, /Include any text condition change separately/);
});

test('current state includes filled locked readings as strings while omitting retired fields', () => {
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


test('reader groups definitions and state before evidence, with examples after the output contract', () => {
    const settings = { npcStats: [{ name: 'HP', type: 'number', defaultValue: '5/5' }] };
    const prompt = builder([], { chat: [] }, 'Alex', { state: () => '{}' }).buildUserPrompt(
        { characters: [] }, 'Mira arrives.', settings, ['Earlier context.']);
    const sections = ['### EVIDENCE RULES', '### CONFIGURED FIELDS', '### CURRENT STATE',
        '### EARLIER MESSAGES', '### LATEST MESSAGE', '### OUTPUT FORMAT', 'No-change example:', 'New NPC example'];
    const positions = sections.map(section => prompt.indexOf(section));
    assert.ok(positions.every(index => index >= 0));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
    assert.doesNotMatch(prompt, /level-up code|capacity growth|growth capacity limit|threshold stays fixed/);
});

test('changed reply uses the configured counted removal key and typed identifier', () => {
    const settings = { npcStats: [], collections: [{ id: 'gear', targets: ['npc'], trackQuantity: true,
        fields: [{ name: 'code', type: 'number', isPrimary: true }, { name: 'qty', type: 'number' }] }] };
    const prompt = builder([]).buildUserPrompt({ characters: [{ name: 'Mira' }] }, 'Mira spends an item.', settings);
    const example = JSON.parse(prompt.split('Changed-reply example (illustrative changes):\n')[1].split('\n')[0]);
    assert.deepEqual(example.characters[0].collections.gear.remove, [{ code: 1, qty: 1 }]);
});

test('inline example uses numeric deltas and typed counted collection removals', () => {
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
    assert.deepEqual(example.player, { deltas: { HP: -1 } });
    assert.deepEqual(example.characters[0].collections.gear.remove, [{ code: 1, count: 1 }]);
});


test('injury guidance recognizes current numeric pools and respects reader permissions', () => {
    const prompt = stat => builder([]).buildUserPrompt({ player: { stats: { Health: '10/10' } }, characters: [] },
        'Alex is injured.', { playerStats: [{ name: 'Health', ...stat }] });
    assert.match(prompt({ type: 'number', defaultValue: '10/10' }), /Report bodily injury as a decrease in player\.deltas\.Health/);
    assert.doesNotMatch(prompt({ type: 'number', defaultValue: '10' }), /Report bodily injury as a decrease/);
    assert.doesNotMatch(prompt({ type: 'number', defaultValue: '10/10', locked: true }), /Report bodily injury as a decrease/);
});
