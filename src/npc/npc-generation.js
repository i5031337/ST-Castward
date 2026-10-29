import { npcTemplates, activeNpcSystem, npcStatsFor } from '../core/npc-templates.js';
import { profileFieldsForCard } from '../core/profile-fields.js';
import { validateShape } from '../generation/validate-shape.js';
import { validateStartingStats } from '../characters/starting-stats.js';
import { resolveProgressionConfig } from '../core/progression-config.js';
import { randomIndex, buildNpcNamingBrief, NPC_NAME_CANDIDATE_COUNT } from './npc-naming.js';
import { npcStartingCollections, npcCollectionsSchema, validateNpcStartingCollections, NPC_COLLECTION_INSTRUCTIONS } from './npc-collection-generation.js';
import { parseNpcResponse, describeNpcGenerationTemplate } from './npc-generation-format.js';
export { randomIndex } from './npc-naming.js';

const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const text = (maxLength = 2000) => ({ type: 'string', maxLength });
export const NPC_TOOL_PARAMETERS = object({
    requestKey: { ...text(100), description: 'Stable, unique identifier for this character, e.g. north-dock-ferryman. Reuse it when retrying this same creation; use another key for another character.' },
    role: { ...text(300), description: 'The new NPC’s story role, occupation or function.' },
    situation: { ...text(2000), description: 'Setting, immediate scene and why this character is needed.' },
    requirements: { ...text(2000), description: 'Established facts to preserve, relationships, capabilities and constraints. Empty if none.' },
    nameStyle: { ...text(300), description: 'Naming culture, language or style for a randomized name; empty lets the generator choose. Ignored when name is supplied.' },
    name: { ...text(80), pattern: '^[^\\r\\n<>:"{}]*$', description: 'Optional exact name for a previously mentioned or canon NPC without a card. Preserve their identity and established facts in requirements. Omit or leave empty for a randomized name. An existing matching card is returned unchanged.' },
    npcTemplateId: { ...text(100), description: 'The configured NPC template ID for this character. Choose from the offered types, keeping an established NPC’s assignment.' },
}, ['requestKey', 'role', 'situation', 'requirements', 'nameStyle']);

/** Only names and assignment guidance go to the narrator; field catalogs stay in generation. */
export function npcToolParameters(settings) {
    const templates = npcTemplates(activeNpcSystem(settings) ?? null);
    const schema = structuredClone(NPC_TOOL_PARAMETERS);
    schema.properties.npcTemplateId.enum = templates.length ? templates.map(template => template.id) : [''];
    schema.properties.npcTemplateId.description += templates.length
        ? '\n' + templates.map(template => `${template.id} (${template.name || template.id}): ${template.description || 'No assignment guidance.'}`).join('\n')
        : ' No NPC templates are configured; omit this argument or use an empty string.';
    if (templates.length > 1) schema.required.push('npcTemplateId');
    return schema;
}

export function npcGenerationContract(settings, { name = '', npcTemplateId = '' } = {}) {
    name = name.trim();
    const system = activeNpcSystem(settings) ?? null;
    const templates = npcTemplates(system);
    const assigned = templates.find(template => template.id === npcTemplateId);
    if (npcTemplateId && !assigned) throw new Error(`Unknown NPC template: ${npcTemplateId}.`);
    const choices = (assigned ? [assigned] : templates.length ? templates : [{ id: '', name: 'NPC', description: '' }]).map(template => {
        const actor = { npcTemplateId: template.id };
        return { ...template, fields: profileFieldsForCard(actor, settings),
            stats: npcStatsFor(actor, settings.statusTracker, system),
            collections: npcStartingCollections(settings, actor, system),
            progression: resolveProgressionConfig(settings.statusTracker, { templateId: template.id, template }) };
    });
    const fields = Object.fromEntries(choices.flatMap(choice => choice.fields.map(field =>
        [field.id, { ...text(), description: field.hint || field.label }])));
    const stats = Object.fromEntries(choices.flatMap(choice => choice.stats.map(stat =>
        [stat.name, { ...text(300), description: stat.purpose || stat.name }])));
    const schema = object({
        ...(!name ? { nameCandidates: { type: 'array', minItems: 1, maxItems: NPC_NAME_CANDIDATE_COUNT, items: text(80) } } : {}),
        npcTemplateId: { type: 'string', enum: choices.map(choice => choice.id) },
        profile: { type: 'object', properties: fields, additionalProperties: false },
        stats: { type: 'object', properties: stats, additionalProperties: false },
        collections: npcCollectionsSchema(choices),
    });
    return { choices, schema, name };
}

export const NPC_GENERATION_INSTRUCTIONS = `Create one supporting NPC for the supplied role and situation.
Use the request, story and field guidance as reference material.
Return raw JSON matching responseSchema.

### CHARACTER
Preserve established facts and match the setting and tone.
For request.name, preserve that character's identity and canon; explicit story and alternate-universe facts take precedence.
Fill unspecified details that fit the context. Leave uncertain history and relationships unspecified.
For a new character, give them a distinct appearance, voice, motive and personal tension where the fields allow.
Use establishedActor's held stats and possessions to inform the profile.

### NAMES
For an unnamed character, generate ${NPC_NAME_CANDIDATE_COUNT} distinct, pronounceable alternatives for the same character's name.
Follow nameStyle and namingBrief, with natural names for the culture and setting taking priority.
Choose names unused in unavailableNames and vary their sounds and endings.
Write profile prose using pronouns or occupation so it works with any candidate.
For request.name, fill the profile for that exact character and omit nameCandidates.

### PROFILE AND STATS
Use the selected NPC template and its exact npcTemplateId.
Fill its configured profile fields and stats, keyed by field ID and stat name respectively.
Write concise plain prose for profile values.
Write absolute stat readings as JSON strings, such as "25", "8/12", or "Calm".
Choose plausible individual ratings within the configured bounds and allowed values.
Write resource pools as "current/maximum" with a positive individual capacity within the configured maximum.
When progression is enabled, start Level at a positive integer and XP at zero with its configured capacity.

### STARTING COLLECTIONS
${NPC_COLLECTION_INSTRUCTIONS}`;

export function npcGenerationPrompt(request, contract, context, pick = randomIndex) {
    const { namingUsedNames = [], establishedActor, setting, story, unavailableNames } = context;
    const storyContext = { setting, story, ...(!contract.name ? { unavailableNames } : {}) };
    const { requestKey, nameStyle, ...details } = request;
    const generationRequest = Object.fromEntries(Object.entries({ ...details, ...(!contract.name ? { nameStyle } : {}) })
        .filter(([, value]) => value !== ''));
    if (establishedActor) {
        storyContext.establishedActor = {
            name: establishedActor.name,
            stats: Object.fromEntries(contract.choices.flatMap(choice => choice.stats
                .filter(stat => Object.hasOwn(establishedActor.stats || {}, stat.name))
                .map(stat => [stat.name, establishedActor.stats[stat.name]]))),
            collections: Object.fromEntries(contract.choices.flatMap(choice => choice.collections
                .filter(collection => Object.hasOwn(establishedActor.collections || {}, collection.id))
                .map(collection => [collection.id, establishedActor.collections[collection.id]]))),
        };
    }
    const nudges = ['Favor an understated, practical character with an unexpected personal priority.',
        'Give them a specific social background and a recognizable speech rhythm.',
        'Find an unusual but believable combination of occupation, temperament and ambition.',
        'Give them a memorable everyday habit or practical concern.'];
    return JSON.stringify({ request: generationRequest,
        ...(!contract.name ? { creativeNudge: nudges[pick(nudges.length)] } : {}),
        ...(!contract.name ? { namingBrief: buildNpcNamingBrief(namingUsedNames, pick) } : {}), context: storyContext,
        templates: contract.choices.map(describeNpcGenerationTemplate), responseSchema: contract.schema });
}

export function normalizedNpcName(name) {
    return String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Canonical names win over aliases, with chat cards ordered before reusable cards. */
export function findNamedNpc(cards, name) {
    const key = normalizedNpcName(name);
    if (!key) return null;
    const npcs = cards.filter(card => !card.isPlayer);
    return npcs.find(card => normalizedNpcName(card.name) === key)
        || npcs.find(card => (card.aliases || []).some(alias => !alias.isRegex && normalizedNpcName(alias.pattern) === key))
        || npcs.find(card => (card.aliases || []).some(alias => {
            if (!alias.isRegex || !alias.pattern) return false;
            try { return new RegExp(`^(?:${alias.pattern})$`, 'iu').test(name); } catch { return false; }
        })) || null;
}

/** Validate before touching live cards. Reject incomplete or off-template output. */
export function validateGeneratedNpc(raw, contract, forbiddenNames, pick = randomIndex) {
    const value = parseNpcResponse(raw, contract);
    const errors = validateShape(value, contract.schema);
    if (errors.length) throw new Error(errors.slice(0, 4).join('; '));
    const choice = contract.choices.find(choice => choice.id === value.npcTemplateId);
    const validateKeys = (values, definitions, key) => {
        const allowed = definitions.map(def => def[key]);
        if (Object.keys(values).some(id => !allowed.includes(id))
            || allowed.some(id => !Object.hasOwn(values, id) || !values[id].trim())) {
            throw new Error(`Incomplete or off-template ${key === 'id' ? 'profile' : 'stats'}.`);
        }
    };
    validateKeys(value.profile, choice.fields, 'id');
    validateKeys(value.stats, choice.stats, 'name');
    const blocked = new Set(forbiddenNames.map(normalizedNpcName));
    const candidates = contract.name ? [] : [...new Map(value.nameCandidates.map(name => [normalizedNpcName(name), name.trim().replace(/\s+/g, ' ')])).values()]
        .filter(name => name && !/[\n\r<>:"{}]/.test(name) && !blocked.has(normalizedNpcName(name)));
    if (!contract.name && !candidates.length) throw new Error('No usable unused name candidates.');
    validateStartingStats(value.stats, choice.stats, choice.progression);
    return { name: contract.name || candidates[pick(candidates.length)], npcTemplateId: choice.id,
        profile: Object.fromEntries(Object.entries(value.profile).map(([id, text]) => [id, text.trim()])),
        statusOverrides: value.stats, statusCollections: validateNpcStartingCollections(value.collections, choice.collections) };
}
