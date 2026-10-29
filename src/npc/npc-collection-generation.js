import { collectionAppliesTo } from '../core/collection-targets.js';
import { collectionQuantityField } from '../core/collection-fields.js';
import { validateRewardEntry } from '../core/collection-rewards.js';

/** Use the same targets, identifiers and typed fields as the story reader. */
export function startingCollections(settings, scope, actor, system) {
    return (settings.statusTracker?.collections ?? system?.collections ?? [])
        .filter(collection => collection?.id && collectionAppliesTo(collection, scope, actor, system))
        .map(collection => ({ id: collection.id, name: collection.name,
            guidance: collection.guidance || collection.hint || '', trackQuantity: collection.trackQuantity,
            fields: (collection.fields || []).filter(field => !field.retired).map(field => ({ ...field,
                guidance: field.guidance || field.hint || '' })) }));
}

export function npcStartingCollections(settings, actor, system) {
    return startingCollections(settings, 'npc', actor, system);
}

function entrySchema(collection) {
    const primary = collection.fields.find(field => field.isPrimary) || collection.fields[0];
    return { type: 'object', additionalProperties: false, required: primary ? [primary.name] : [],
        properties: Object.fromEntries(collection.fields.map(field => [field.name, {
            type: ['number', 'boolean'].includes(field.type) ? field.type : 'string',
            ...(!['number', 'boolean'].includes(field.type) ? { maxLength: 2000 } : {}),
            description: [field.label || field.name, field.guidance,
                field.isPrimary ? 'Identifies this entry.' : '',
                field.defaultValue !== undefined && field.defaultValue !== '' ? `Default: ${field.defaultValue}.` : '',
            ].filter(Boolean).join(' '),
        }])) };
}

export function npcCollectionsSchema(choices) {
    return { type: 'object', additionalProperties: false,
        properties: Object.fromEntries(choices.flatMap(choice => choice.collections.map(collection =>
            [collection.id, { type: 'array', maxItems: 24, items: entrySchema(collection) }]))),
    };
}

/** Initial holdings are full arrays, not the reader's add/remove/update operations. */
export function validateNpcStartingCollections(source, definitions) {
    const allowed = definitions.map(collection => collection.id);
    if (Object.keys(source).some(id => !allowed.includes(id)) || allowed.some(id => !Object.hasOwn(source, id))) {
        throw new Error('Incomplete or off-template collections. Include every applicable collection, using [] when empty.');
    }
    const result = {};
    for (const collection of definitions) {
        const primary = collection.fields.find(field => field.isPrimary) || collection.fields[0];
        if (!primary) throw new Error(`Collection ${collection.id} needs an identifier field.`);
        const quantity = collectionQuantityField(collection);
        const seen = new Set();
        result[collection.id] = source[collection.id].map(item => {
            const validated = validateRewardEntry(collection, item);
            if (!validated.entry) throw new Error(`${collection.id}: ${validated.errors.join(' ')}`);
            const entry = validated.entry;
            if (typeof entry[primary.name] === 'string') entry[primary.name] = entry[primary.name].trim();
            const key = String(entry[primary.name]).normalize('NFKC').toLowerCase();
            if (seen.has(key)) throw new Error(`Duplicate entry in ${collection.id}: ${entry[primary.name]}.`);
            seen.add(key);
            if (quantity && !(entry[quantity.name] > 0)) throw new Error(`${collection.id}: starting quantity must be positive.`);
            return entry;
        });
    }
    return result;
}

/** A mentioned NPC can already be in tracker state before its first profile card exists. */
export function seedKnownNpcCollections(state, card) {
    const actor = state?.characters?.find(actor => String(actor.name).normalize('NFKC').trim().toLowerCase()
        === String(card.name).normalize('NFKC').trim().toLowerCase());
    if (!actor) return false;
    const missing = Object.entries(card.statusCollections || {}).filter(([id]) => !Object.hasOwn(actor.collections || {}, id));
    if (!missing.length) return false;
    actor.collections ||= {};
    for (const [id, entries] of missing) actor.collections[id] = structuredClone(entries);
    return true;
}

export const NPC_COLLECTION_INSTRUCTIONS = `Describe what this character already wears, carries, owns or knows.
Use established possessions and capabilities first.
For a new character, choose a small, plausible starting set fitting their profile, role, species, level and setting.
Include worn clothing, ordinary equipment, and innate or learned abilities/knowledge where applicable.
Keep clothing consistent with the profile. Treat scene props as part of the setting.
Leave inapplicable or event-dependent collections empty.
For collections already in establishedActor.collections, return []; their held entries are preserved.

Use each applicable collection ID as a key with a full array of entry objects, or [] when empty.
Use configured field names, identifiers, defaults, allowed choices, bounds and field guidance.
Include supported details and shared descriptions.
Use native JSON numbers and booleans for collection fields of those types.
Keep one entry per identifier, with a positive total quantity for counted entries.`;
