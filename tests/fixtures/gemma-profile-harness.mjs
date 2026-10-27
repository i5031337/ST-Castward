import { readerCancellationHarness } from '../helpers/reader-cancellation.mjs';
import { readFileSync } from 'node:fs';
import { createBuiltinSystem } from '../../src/core/builtin-systems.js';
import { defaultTrackerSettings } from '../../src/core/settings-tracker-defaults.js';
import { setProfileSettingsProvider, profileFieldsForCard, profileFieldValue } from '../../src/core/profile-fields.js';
import { hintFor } from '../../src/core/constants-profile.js';
import { promptText, fillPromptText } from '../../src/prompts/prompt-texts.js';
import { DEFAULT_LORE_PROMPT } from '../../src/prompts/default-prompt-texts.js';
import { parseLoreReply } from '../../src/lore/lore-reply.js';
import { parseGeneratedProfileFields, parseLoreContent, mergeLoreValues } from '../../src/lore/lore-format.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const body = (file, start, end) => {
    const text = source(file);
    const a = text.indexOf(start), b = end ? text.indexOf(end, a + start.length) : text.length;
    if (a < 0 || b < 0) throw Error(`Production function not found: ${start}`);
    return text.slice(a, b).replaceAll('export ', '');
};
const functionFrom = (code, dependencies, name) => new Function(...Object.keys(dependencies),
    `${code}\nreturn ${name};`)(...Object.values(dependencies));

const utilsSource = source('../../src/core/utils-format.js').replace(/^import .*;\n/gm, '').replaceAll('export ', '');
const utils = new Function('debugLog', 'getContext', `${utilsSource}\nreturn { extractJSON, safeJsonParse, escapeRegExp };`)(() => {}, () => ({}));
const coerceToUpdate = functionFrom(body('../../src/tracker/extractor/status-extractor-request.js',
    'export function coerceToUpdate'), utils, 'coerceToUpdate');
const macroSource = source('../../src/prompts/macros.js').replace(/^import .*;\n/gm, '').replaceAll('export ', '');
const { fillTemplate } = new Function('substituteParamsExtended', 'debugLog', 'escapeRegExp',
    `${macroSource}\nreturn { fillTemplate };`)((template, own) => String(template).replace(/\{\{(\w+)\}\}/g,
    (whole, key) => Object.hasOwn(own, key) ? own[key] : whole), () => {}, utils.escapeRegExp);

export function profileHarness(scenario) {
    const system = createBuiltinSystem(scenario.system.startsWith('fantasy') ? 'fantasy' : 'dating');
    const root = { activeSystem: system.name, statusTracker: { ...structuredClone(defaultTrackerSettings),
        presets: { [system.name]: { definition: system } } } };
    setProfileSettingsProvider(() => root);
    const card = { name: scenario.name, isPlayer: false, npcTemplateId: 'character', profile: { ...scenario.profile } };
    const fields = profileFieldsForCard(card);
    const describeProfile = functionFrom(body('../../src/api/api-lore-facts.js',
        'export function describeProfile', 'export function liveFactsFor'),
    { fieldsForCard: profileFieldsForCard, profileFieldValue }, 'describeProfile');
    const profileDependencies = { promptText, getPersonaData: () => ({ name: 'Alex' }),
        describeProfile, describeTrackerState: () => scenario.facts || '',
        hintFor, fillTemplate, fieldsForCard: profileFieldsForCard, profileFieldValue };
    const buildProfilePrompt = functionFrom(body('../../src/characters/character-fill.js',
        'export function buildProfilePrompt', 'export async function fillProfile'),
    profileDependencies, 'buildProfilePrompt');
    const missingProfileFields = functionFrom(body('../../src/characters/character-fill.js',
        'export function missingProfileFields', 'export async function fillSources'),
    profileDependencies, 'missingProfileFields');
    const sources = { story: scenario.story || '', lore: scenario.lore || '', personaDescription: '', enough: true };
    const wanted = missingProfileFields(card);
    let raw = '';
    const fillProfile = functionFrom(body('../../src/characters/character-fill.js',
        'export async function fillProfile'), { ...profileDependencies,
        missingProfileFields, fillSources: async () => sources, buildProfilePrompt,
        requestExtraction: async () => raw, coerceToUpdate,
        getSettings: () => root, saveSettings: () => {}, syncProfileToLore: async () => {} }, 'fillProfile');

    let loreResponse = { text: '', truncated: false };
    let capturedLorePrompt = '';
    const generateLoreContent = functionFrom(body('../../src/api/api-lore-generate.js',
        'export async function generateLoreContent', 'export async function saveLoreContent'), {
        ...readerCancellationHarness(),
        loadWorldInfo: async () => ({ entries: {} }), chat: [],
        buildLoreExcerpt: () => ({ text: scenario.story || '', used: 1, available: 1, trimmed: false }),
        retrieveWorldFacts: async () => '', DEFAULT_LORE_PROMPT, mergeLoreValues,
        profileFieldsForCard, hintFor, fillTemplate, fillPromptText, namesFor: char => [char.name],
        describeTrackedFacts: () => scenario.facts || '', getPersonaData: () => null,
        requestLore: async prompt => { capturedLorePrompt = prompt; return loreResponse; },
        parseLoreReply, utils, parseLoreContent, parseGeneratedProfileFields,
        escapeRegExp: utils.escapeRegExp, LOG_PREFIX: '[profile eval]',
    }, 'generateLoreContent');

    return {
        system, card, fields, wanted,
        async prompt() {
            if (scenario.path === 'fill') return buildProfilePrompt(card, wanted, sources);
            await generateLoreContent(card);
            return capturedLorePrompt;
        },
        systemPrompt: promptText(scenario.path === 'fill' ? 'profileSystem' : 'loreSystem'),
        maxTokens: scenario.path === 'fill' ? root.statusTracker.extractionMaxTokens : 2048,
        async apply(text, finishReason = 'stop') {
            if (scenario.path === 'fill') {
                raw = text;
                const result = await fillProfile(card);
                const parsed = coerceToUpdate(text);
                return { result, profile: card.profile, parsed,
                    readable: Boolean(parsed && result.ok && result.filled.length && finishReason === 'stop') };
            }
            loreResponse = { text, truncated: finishReason !== 'stop' };
            const result = await generateLoreContent(card);
            const parsed = parseGeneratedProfileFields(result.content, 'npc');
            for (const field of fields) if (parsed?.[field.id] && !String(profileFieldValue(card.profile, field)).trim()) {
                card.profile[field.id] = parsed[field.id];
            }
            return { result, profile: card.profile, parsed,
                readable: Boolean(parsed && result.followedFormat && !result.truncated) };
        },
    };
}
