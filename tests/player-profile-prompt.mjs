import { readerCancellationHarness } from './helpers/reader-cancellation.mjs';
import { profileFieldValue } from '../src/core/profile-fields.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { promptText, fillPromptText } from '../src/prompts/prompt-texts.js';
import { DEFAULT_LORE_PROMPT } from '../src/prompts/default-prompt-texts.js';
import { describeKnownStatReadings } from '../src/tracker/stat-prompt-definitions.js';
import { npcStatsFor, setNpcTemplateSettingsProvider } from '../src/core/npc-templates.js';

const persona = { name: 'Player', avatar: 'player.png', description: 'An elven healer with silver hair.' };
const player = { name: 'Player', isPlayer: true, personaKey: persona.avatar, profile: {} };
const fields = [{ id: 'appearance', label: 'Appearance' }];
const load = path => readFileSync(new URL(path, import.meta.url), 'utf8');

function profileFixture(activePersona = persona, facts = {}) {
    const source = load('../src/characters/character-fill.js')
        .replace(/^import .*;\n/gm, '').replace(/^export \{.*;\n/gm, '').replaceAll('export ', '');
    const requests = [];
    const dependencies = { profileFieldValue,
        promptText, getContext: () => ({ chat: [] }), fillTemplate: text => text,
        getSettings: () => ({ statusTracker: {} }), saveSettings() {}, hintFor: () => 'Describe appearance.',
        fieldsForCard: () => fields, requestExtraction: async prompt => {
            requests.push(prompt);
            return { appearance: 'Silver hair' };
        }, coerceToUpdate: value => value, describeTrackerState: () => '', describeProfile: () => '',
        buildLoreExcerpt: () => ({ text: '' }), tryAutoSyncLorebook: async () => false,
        charactersMentionedIn: () => [], getPersonaData: () => activePersona,
        readLoreEntry: async () => '', syncProfileToLore: async () => {},
        ...facts,
    };
    const api = new Function(...Object.keys(dependencies),
        `${source}\nreturn { fillProfile, fillSources, buildProfilePrompt };`)(...Object.values(dependencies));
    return { ...api, requests };
}

test('a persona description alone supports player field generation and reaches the request', async () => {
    const f = profileFixture();
    const card = structuredClone(player);
    const result = await f.fillProfile(card);
    assert.deepEqual(result, { ok: true, filled: ['Appearance'] });
    assert.ok(f.requests[0].includes(persona.description));
    assert.equal(card.profile.appearance, 'Silver hair');
});

test('field generation includes profile context once while lore retains profile and tracker facts', () => {
    const source = load('../src/api/api-lore-facts.js')
        .replace(/^import .*;\n/gm, '').replace(/^export \{.*;\n/gm, '').replaceAll('export ', '');
    const dependencies = {
        profileFieldValue, describeKnownStatReadings,
        fieldsForCard: () => [...fields, { id: 'history', label: 'History' }],
        loadStateFromMetadata: () => ({ characters: [{ name: 'Mira', stats: { HP: '7' },
            collections: { inventory: [{ name: 'Compass', description: 'Brass case' }] } }] }),
        getSettings: () => ({ statusTracker: { collections: [{ id: 'inventory' }] } }),
        npcStatsFor: () => [{ name: 'HP', type: 'number', purpose: 'Vitality definition marker' }], collectionAppliesTo: () => true,
    };
    const facts = new Function(...Object.keys(dependencies),
        `${source}\nreturn { describeProfile, describeTrackedFacts, describeTrackerState };`)(...Object.values(dependencies));
    const card = { name: 'Mira', profile: { appearance: 'Old appearance marker', history: 'Former navigator marker' } };
    const prompt = profileFixture(persona, facts).buildProfilePrompt(card, fields, {});
    assert.equal(prompt.split('Former navigator marker').length - 1, 1);
    assert.ok(!prompt.includes('Old appearance marker'));
    assert.ok(prompt.includes('HP: 7'));
    assert.ok(prompt.includes('Vitality definition marker'));
    assert.ok(prompt.includes('Compass (Brass case)'));
    const loreFacts = facts.describeTrackedFacts(card);
    for (const value of ['Former navigator marker', 'Old appearance marker', 'HP: 7', 'Compass (Brass case)']) {
        assert.ok(loreFacts.includes(value));
    }
});

test('persona descriptions do not support NPCs, other personas, or blank descriptions', async () => {
    for (const [card, active] of [
        [{ name: 'Player', profile: {} }, persona],
        [{ ...player, personaKey: 'other.png' }, persona],
        [player, { ...persona, description: '  ' }],
    ]) {
        const f = profileFixture(active);
        assert.equal((await f.fillSources(card)).enough, false);
        await f.fillProfile(card);
        assert.deepEqual(f.requests, []);
    }
});

test('tracker context uses player and live NPC template definitions and omits unknown stats', () => {
    const source = load('../src/api/api-lore-facts.js')
        .replace(/^import .*;\n/gm, '').replace(/^export \{.*;\n/gm, '').replaceAll('export ', '');
    const playerStat = { id: 'energy', name: 'Energy', type: 'number', targets: ['player'], purpose: 'Player energy marker' };
    const npcStat = { id: 'trust', name: 'Trust', type: 'number', targets: ['template:human'], purpose: 'Human trust marker' };
    const otherStat = { id: 'power', name: 'Power', type: 'number', targets: ['template:creature'], purpose: 'Creature power marker' };
    const root = { activeSystem: 'test', statusTracker: {
        playerStats: [playerStat], npcStats: [npcStat, otherStat], collections: [{ id: 'inventory' }],
        presets: { test: { definition: { stats: { character: [playerStat, npcStat, otherStat] },
            npcTemplates: [{ id: 'human' }, { id: 'creature' }] } } },
    } };
    const state = { player: { stats: { Energy: '0', Trust: '8' } }, characters: [
        { name: 'Mira', npcTemplateId: 'human', stats: { Trust: '6', Power: '9' },
            collections: { inventory: [{ name: 'Compass' }] } },
    ] };
    const dependencies = { profileFieldValue, describeKnownStatReadings, npcStatsFor,
        fieldsForCard: () => [{ id: 'history', label: 'History' }],
        loadStateFromMetadata: () => state, getSettings: () => root, collectionAppliesTo: () => true };
    const facts = new Function(...Object.keys(dependencies),
        `${source}\nreturn { describeTrackedFacts, describeTrackerState };`)(...Object.values(dependencies));
    setNpcTemplateSettingsProvider(() => root);
    try {
        const card = { name: 'Mira', npcTemplateId: 'creature', profile: { history: 'Navigator marker' } };
        const npc = facts.describeTrackerState(card);
        assert.ok(npc.includes('Trust: 6') && npc.includes('Human trust marker'));
        assert.doesNotMatch(npc, /Power|Creature power marker|Player energy marker/);
        const playerFacts = facts.describeTrackerState(player);
        assert.ok(playerFacts.includes('Energy: 0') && playerFacts.includes('Player energy marker'));
        assert.doesNotMatch(playerFacts, /Trust|Human trust marker|Creature power marker/);

        state.characters[0].stats = { Trust: ' ', Power: '9' };
        const withoutStats = facts.describeTrackedFacts(card);
        assert.ok(withoutStats.includes('Navigator marker') && withoutStats.includes('Compass'));
        assert.doesNotMatch(withoutStats, /Known stats|System definition|Human trust marker|Power/);
        state.player.stats = {};
        assert.equal(facts.describeTrackerState(player), '');
        const prompt = profileFixture(persona, facts).buildProfilePrompt(player, fields, {});
        assert.doesNotMatch(prompt, /What the tracker records|Known stats|System definition/);
    } finally { setNpcTemplateSettingsProvider(() => null); }
});

async function lorePrompt(card, activePersona = persona, { worldFacts = '', existingLore = '' } = {}) {
    const source = load('../src/api/api-lore-generate.js')
        .split('export async function generateLoreContent')[1]
        .split('export async function saveLoreContent')[0];
    let sent;
    const dependencies = {
        ...readerCancellationHarness(),
        buildLoreExcerpt: () => ({ text: '' }), chat: [], retrieveWorldFacts: async () => worldFacts,
        loadWorldInfo: async () => ({ entries: { 1: { content: existingLore } } }),
        DEFAULT_LORE_PROMPT, fillPromptText,
        mergeLoreValues: () => ({}), profileFieldsForCard: () => fields, hintFor: () => 'Describe appearance.',
        fillTemplate: (template, values) => template.replace(/{{(\w+)}}/g, (_, key) => values[key] ?? ''),
        namesFor: card => [card.name], describeTrackedFacts: () => '', getPersonaData: () => activePersona,
        requestLore: async prompt => { sent = prompt; return { text: '', truncated: false }; },
        parseLoreReply: () => ({ tags: '', content: '', followedSections: false }),
        escapeRegExp: text => text, parseLoreContent: () => null,
    };
    const generate = new Function(...Object.keys(dependencies),
        `return async function generateLoreContent${source}`)(...Object.values(dependencies));
    await generate(card, existingLore ? 'World' : null, 1);
    return sent;
}

test('the combined profile and lore request includes the player persona description', async () => {
    assert.ok((await lorePrompt(player)).includes(persona.description));
    for (const card of [{ name: 'Player' }, { ...player, personaKey: 'other.png' }]) {
        assert.ok(!(await lorePrompt(card)).includes(persona.description));
    }
});

test('lore prompts omit empty setting and existing-entry sections and retain available sources', async () => {
    for (const worldFacts of ['', 'The setting reference marker']) {
        for (const existingLore of ['', 'The existing lore marker']) {
            const prompt = await lorePrompt(player, persona, { worldFacts, existingLore });
            assert.equal(prompt.includes('Setting reference:'), Boolean(worldFacts));
            assert.equal(prompt.includes('Existing entry:'), Boolean(existingLore));
            if (worldFacts) assert.ok(prompt.includes(worldFacts));
            if (existingLore) assert.ok(prompt.includes(existingLore));
            assert.ok(!prompt.includes('(Nothing found in the Data Bank)'));
            assert.ok(!prompt.includes('(No existing lore yet)'));
            assert.ok(!prompt.includes('(Nothing tracked yet)'));
            assert.ok(!prompt.includes('Established facts -'));
            assert.ok(!prompt.includes('{{#'));
        }
    }
});
