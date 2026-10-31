import { collectionAppliesTo } from '../core/collection-targets.js';

/** Labeled collection lines for portrait and expression image prompts. */
export function imageItemsFromCollections(collections = {}, definitions = [], isPlayer = false, actor) {
    const lines = [];
    const scope = isPlayer ? 'player' : 'npc';
    for (const collection of definitions) {
        if (!collection?.id || collection.includeInImagePrompt === false || collection.retired
            || !collectionAppliesTo(collection, scope, actor)) continue;
        const names = [], seen = new Set();
        const primary = collection.fields?.find(field => field.isPrimary)?.name || 'name';
        for (const item of collections[collection.id] || []) {
            const name = String(item?.[primary] ?? '').trim();
            const key = name.toLowerCase();
            if (!name || seen.has(key)) continue;
            seen.add(key);
            names.push(name);
        }
        const emptyText = typeof collection.emptyImagePrompt === 'string' ? collection.emptyImagePrompt.trim() : 'none';
        const value = names.length ? names.join(', ') : emptyText;
        if (value) lines.push(`${String(collection.name || collection.id).trim()}: ${value}`);
    }
    return lines.join('\n');
}
