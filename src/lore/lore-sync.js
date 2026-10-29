import { profileFieldsForCard } from '../core/profile-fields.js';
import { normalizeMemoryStore } from '../core/profile-memories.js';
import { loadWorldInfo, saveWorldInfo } from '../../../../../world-info.js';
import { formatLoreContent, parseLoreContent, mergeLoreValues } from './lore-format.js';
import { saveSettings } from '../core/settings.js';
import { syncEntryIdentity } from './lorebook.js';
import { requireLorebook, lorebookWriteGuard } from './lorebook-write-target.js';
import { createLoreEntry } from './lore-entries.js';
import { inOrder } from './lore-write-queue.js';

export function readLoreValues(content, cardProfile, scope = 'npc') {
    return mergeLoreValues(content, cardProfile, scope);
}

/** Write current structured card values to its linked lorebook entry. */
export async function syncProfileToLore(char, memories, { isCurrent: suppliedCurrent, signal } = {}) {
    const current = lorebookWriteGuard(suppliedCurrent);
    const isCurrent = () => !signal?.aborted && current();
    if (!char?.name || !isCurrent()) return;
    if (!char.lorebook?.world) {
        const hasProfile = Object.values(char.profile || {}).some(value => String(value ?? '').trim());
        if (!hasProfile && !normalizeMemoryStore(memories, 500).entries.length) return;
    }
    const target = await requireLorebook(char, { isCurrent, signal, purpose: 'Save profiles and memories' });
    if (!target || !isCurrent()) return;
    if (!char.lorebook?.world) {
        await createLoreEntry(char, target, char.name, { isCurrent, signal });
    }
    if (!isCurrent() || !char.lorebook) return;
    const { world, uid } = char.lorebook;
    const scope = char.isPlayer ? 'player' : 'npc';
    return inOrder(world, async () => {
        const data = await loadWorldInfo(world);
        if (!isCurrent()) return;
        const entry = data?.entries?.[uid];
        if (!entry) throw new Error(`Lorebook entry ${world} / #${uid} is missing.`);
        const parsed = entry.content ? parseLoreContent(entry.content, { scope }) : {};
        if (!parsed && !char.isPlayer) throw new Error('Character lore does not match the required field format.');
        const values = (entry.content && mergeLoreValues(entry.content, char.profile, scope)) || char.profile;
        const previous = entry.content;
        const title = entry.comment;
        entry.content = formatLoreContent(values, previous, memories, scope, profileFieldsForCard(char));
        const identityChanged = syncEntryIdentity(char, entry);
        entry.comment = title;
        if (entry.content !== previous || identityChanged) await saveWorldInfo(world, data, true);
        if (!isCurrent()) return;
        if (Object.entries(values || {}).some(([id, value]) => char.profile?.[id] !== value)) {
            char.profile = { ...char.profile, ...values };
            saveSettings();
        }
    });
}
