import { proposedNpcTemplate } from '../../core/npc-templates.js';
import { collectionAppliesTo } from '../../core/collection-targets.js';
/** Repair an omitted collection ID only when the actor has one possible destination. */
export function normalizeCollectionUpdates(update, settings, state = null, cards = []) {
    const warnings = [];
    const normalize = (actor, target) => {
        const collections = actor?.collections;
        if (!collections || typeof collections !== 'object') return;
        if (Array.isArray(collections)) {
            delete actor.collections;
            warnings.push(`Collection changes for ${target === 'player' ? 'Player' : actor.name || 'NPC'} skipped: expected named add, remove or update operations.`);
            return;
        }
        const keys = Object.keys(collections);
        if (keys.length && keys.every(key => ['add', 'remove', 'update'].includes(key))
            && keys.every(key => Array.isArray(collections[key]))) {
            const current = state?.characters?.find(entry => entry.name?.toLowerCase() === actor.name?.toLowerCase())
                || cards.find(entry => entry.name?.toLowerCase() === actor.name?.toLowerCase());
            const selected = target === 'npc' ? proposedNpcTemplate(current || {}, actor) : null;
            const owner = selected ? { npcTemplateId: selected.id } : actor;
            const candidates = (settings.collections || []).filter(col => collectionAppliesTo(col, target, owner));
            if (candidates.length === 1) actor.collections = { [candidates[0].id]: collections };
            else {
                delete actor.collections;
                warnings.push(`Collection changes for ${target === 'player' ? 'Player' : actor.name || 'NPC'} skipped: missing collection name (${candidates.length} possible collections).`);
            }
        }
        for (const [id, reading] of Object.entries(actor.collections || {})) if (Array.isArray(reading)) {
            delete actor.collections[id];
            warnings.push(`Collection ${id} for ${target === 'player' ? 'Player' : actor.name || 'NPC'} skipped: a bare list would repeat held items; use add, remove or update.`);
        }
        if (actor.collections && !Object.keys(actor.collections).length) delete actor.collections;
    };
    normalize(update.player, 'player');
    if (Array.isArray(update.characters)) update.characters.forEach(actor => normalize(actor, 'npc'));
    return warnings;
}
