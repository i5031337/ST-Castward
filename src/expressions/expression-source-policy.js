import { imageItemsFromCollections } from '../api/api-image-items.js';
import { collectionAppliesTo } from '../core/collection-targets.js';

/** Existing sprites without a recorded source may have been supplied by the user. */
export function needsExpressionRefresh(generation, label, source, exists) {
    const previous = generation?.imageSources?.[label];
    return Boolean(exists && previous && previous !== source);
}

/** Match the profile and item selection used by the character image prompt. */
export function captureExpressionImageSource(card, fields, collections, definitions, prefix = '') {
    const profile = fields.filter(field => field.includeInImagePrompt === true)
        .map(field => [field.label, String(card.profile?.[field.id]
            ?? (field.legacyId ? card.profile?.[field.legacyId] : '') ?? '').trim()])
        .filter(([, value]) => value);
    const items = imageItemsFromCollections(collections, definitions, card.isPlayer, card);
    return JSON.stringify([card.imageUrl, prefix.trim(), profile, items]);
}

export function hasPendingImageCollection(rows, card, definitions) {
    const included = new Set(definitions.filter(collection => collection?.id
        && collection.includeInImagePrompt !== false && !collection.retired
        && collectionAppliesTo(collection, 'npc', card)).map(collection => collection.id));
    return rows.some(row => row.scope === 'npc' && included.has(row.collectionId)
        && String(row.actor || '').toLowerCase() === String(card.name || '').toLowerCase());
}
