import { npcStatsFor } from '../core/npc-templates.js';
import { getSettings } from '../core/settings.js';

/** Filter values through the active schema without deleting archived stat history. */
export function statsInSystem(stored, listKey, actor) {
    if (!stored || typeof stored !== 'object') return {};
    const declared = new Set((listKey === 'npcStats' && actor ? npcStatsFor(actor, getSettings().statusTracker)
        : getSettings().statusTracker?.[listKey] || []).map(stat => String(stat?.name ?? '').trim().toLowerCase()).filter(Boolean));
    return Object.fromEntries(Object.entries(stored).filter(([key]) => declared.has(String(key).trim().toLowerCase())));
}
