import { collectionAppliesTo } from '../core/collection-targets.js';
import { npcStatsFor } from '../core/npc-templates.js';
import { executeSlashCommandsOnChatInput } from '../../../../../slash-commands.js';
import { LOG_PREFIX, debugLog } from '../core/constants.js';
import { profileFieldValue, profileFieldsForCard as fieldsForCard } from '../core/profile-fields.js';
import { applyMacros, modernisePlaceholders } from '../prompts/macros.js';
import { getSettings } from '../core/settings.js';
import { loadStateFromMetadata } from '../tracker/status-logic.js';
import { imageItemsFromCollections } from './api-image-items.js';

export { createLoreEntry } from '../lore/lore-entries.js';


/** Profile fields for a prompt, excluding fields being regenerated. */
export function describeProfile(char, except = null) {
    const profile = char?.profile || {};
    const skip = except instanceof Set ? except : new Set(except || []);
    return fieldsForCard(char)
        .filter(field => !skip.has(field.id))
        .map(field => {
            const value = String(profileFieldValue(profile, field)).trim();
            return value ? `${field.label}: ${value}` : null;
        })
        .filter(Boolean)
        .join('\n');
}

/** Live chat facts, falling back to the card when absent; player state lives outside the NPC cast. */
export function liveFactsFor(char) {
    let state = null;
    try { state = loadStateFromMetadata(); } catch { /* no chat open */ }

    if (char?.isPlayer) {
        const tracker = getSettings().statusTracker;
        const names = new Set((tracker.playerStats || []).map(stat => stat.name.toLowerCase()));
        return {
            stats: Object.fromEntries(Object.entries(state?.player?.stats || char.stats || {})
                .filter(([name]) => names.has(name.toLowerCase()))),
            collections: Object.fromEntries(Object.entries(state?.player?.collections || char.collections || {})
                .filter(([id]) => collectionAppliesTo(tracker.collections?.find(col => col.id === id), 'player'))),
        };
    }

    const wanted = String(char?.name ?? '').toLowerCase();
    const actor = (state?.characters || []).find(c => String(c.name).toLowerCase() === wanted) || null;
    return {
        stats: Object.fromEntries(Object.entries(actor?.stats || char?.statusOverrides || {})
            .filter(([name]) => npcStatsFor(actor?.npcTemplateId ? actor : char, getSettings().statusTracker)
                .some(stat => stat.name.toLowerCase() === name.toLowerCase()))),
        collections: Object.fromEntries(Object.entries(actor?.collections || char?.statusCollections || {})
            .filter(([id]) => collectionAppliesTo(getSettings().statusTracker.collections?.find(col => col.id === id),
                'npc', actor?.npcTemplateId ? actor : char))),
    };
}

export function describeTrackedFacts(char, except = null) {
    if (!char?.name) return '';

    const { stats, collections } = liveFactsFor(char);
    const lines = [];

    // Apply regeneration exclusions to this copy of the profile too.
    const profile = describeProfile(char, except);
    if (profile) lines.push(profile);

    const statLine = Object.entries(stats)
        .filter(([, value]) => String(value ?? '').trim() !== '')
        .map(([name, value]) => `${name}: ${value}`)
        .join(', ');
    if (statLine) lines.push(statLine);

    for (const [colId, items] of Object.entries(collections)) {
        const named = (items || [])
            .map(item => {
                const name = String(item?.name ?? '').trim();
                if (!name) return null;
                // A one-line description is worth carrying; a paragraph is not.
                const detail = String(item?.description ?? '').trim().split('\n')[0];
                return detail && detail.length <= 120 ? `${name} (${detail})` : name;
            })
            .filter(Boolean);
        if (named.length) lines.push(`${colId}: ${named.join(', ')}`);
    }

    return lines.join('\n');
}

export function fillImagePrompt(template, { name, lore, items } = {}) {
    const own = { name, lore, items };
    let out = modernisePlaceholders(template, Object.keys(own));

    for (const [key, value] of Object.entries({ lore, items })) {
        if (value) continue;
        out = out.replace(new RegExp(`^[ \\t]*\\{\\{${key}\\}\\}[ \\t]*(?:\\r?\\n|$)`, 'gmi'), '');
        out = out.replace(new RegExp(`(?:[^\\n:]*:[^\\S\\n]*)?\\{\\{${key}\\}\\}`, 'gi'), '');
    }

    out = out.replace(/,[^\S\n]*(?=,|[^\S\n]*(?:\r?\n|$))/g, '');
    return applyMacros(out, {
        name: name || 'a character',
        lore: lore || '',
        items: items || '',
    }).trim();
}

export function describeCarriedItems(char) {
    if (!char?.name) return '';
    const { collections } = liveFactsFor(char);
    return imageItemsFromCollections(collections, getSettings().statusTracker.collections, char.isPlayer, char);
}

/** How much retrieved reference text the prompt will take. */
const WORLD_FACTS_CAP = 8000;

/** Explicit Data Bank lookup by name, using the host chunk-count setting.
 * Quiet lore requests do not trigger host Vector Storage retrieval.
 * @returns {Promise<string>} Empty when disabled, unavailable, or unmatched.
 */
export async function retrieveWorldFacts(name) {
    if (!getSettings().loreUseDataBank) return '';

    // Escape slash-command separators and quotes in names.
    const query = String(name ?? '')
        .replace(/\r?\n/g, ' ')
        .replace(/\|/g, ' ')
        .replace(/"/g, '\\"')
        .trim();
    if (!query) return '';

    try {
        const result = await executeSlashCommandsOnChatInput(
            `/db-search return=chunks ${query}`, { clearChatInput: false });
        const text = typeof result === 'string' ? result : (result?.pipe ?? '');
        const trimmed = String(text ?? '').trim();
        if (!trimmed) return '';

        debugLog('Data Bank chunks for lore', { name, chars: trimmed.length });
        // Chunk size is configurable, so three of them need not be small.
        return trimmed.length > WORLD_FACTS_CAP
            ? trimmed.slice(0, WORLD_FACTS_CAP)
            : trimmed;
    } catch (err) {
        // Retrieval failure must not block lore generation.
        console.warn(LOG_PREFIX, 'Data Bank search unavailable, writing without it', err);
        return '';
    }
}
