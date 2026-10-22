import { collectionAppliesTo } from '../core/collection-targets.js';
import { collectionQuantityField } from '../core/collection-fields.js';
import { validateRewardEntry } from '../core/collection-rewards.js';

/** Use the same targets, identifiers and typed fields as the story reader. */
export function npcStartingCollections(settings, actor, system) {
    return (settings.statusTracker?.collections ?? system?.collections ?? [])
        .filter(collection => collection?.id && collectionAppliesTo(collection, 'npc', actor, system))
        .map(collection => ({ id: collection.id, name: collection.name,
            guidance: collection.guidance || collection.hint || '', trackQuantity: collection.trackQuantity,
            fields: (collection.fields || []).filter(field => !field.retired).map(field => ({ ...field,
                guidance: field.guidance || field.hint || '' })) }));
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

export const NPC_COLLECTION_INSTRUCTIONS = `Initialize the selected template's applicable collections as starting holdings in this same response. Use collection IDs as keys and full arrays of typed entry objects, not add/remove/update operations. Include every applicable collection; use [] where the person has no appropriate entries. Use configured field names, identifiers, defaults, allowed choices, bounds and collection/field guidance. Stat readings are strings, but collection numbers and booleans are native JSON numbers and booleans.
Starting entries describe what this person already wears, carries, owns or knows. Use established possessions and capabilities first. For a newly invented person, give them a small, plausible starting set consistent with the profile, role, species, level and setting: worn clothing, ordinary equipment, and innate or learned abilities/knowledge should have suitable entries where applicable. Include useful supported details, including shared descriptions when adding entries. Keep appearance and clothing consistent. Treat scene props as part of the setting, not automatically as possessions. Reusable abilities and knowledge remain held after use. Use one entry per identifier; quantity is the total held, not a delta, and must be positive. This is initialization, not an acquisition, transfer, XP award or level-up reward. Do not backfill reward schedules or invent unsupported collection types, fields, rules, events or accomplishments. Leave inapplicable or event-dependent collections empty. For previously mentioned or canon people, preserve established facts; do not claim speculative possessions or abilities are established. For collections already present in establishedActor.collections, return []: code restores those exact held entries, including intentionally empty arrays, without adding or removing anything.`;
