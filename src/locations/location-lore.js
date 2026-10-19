import { world_names, loadWorldInfo } from '../../../../../world-info.js';

/** Location links are read-only: chat history must never rewrite a shared lorebook. */
export function listLocationLorebooks() {
    return Array.isArray(world_names) ? [...world_names] : [];
}

export async function listLocationLoreEntries(world) {
    if (!world || !listLocationLorebooks().includes(world)) return [];
    const data = await loadWorldInfo(world);
    return Object.values(data?.entries || {}).map(entry => ({
        uid: entry.uid,
        name: String(entry.comment || (Array.isArray(entry.key) ? entry.key.join(', ') : '') || entry.uid),
        content: String(entry.content ?? ''),
    }));
}

/** Callers explicitly choose whether to copy this content into the chat-owned description. */
export async function readLocationLoreEntry(world, uid) {
    return (await listLocationLoreEntries(world)).find(entry => String(entry.uid) === String(uid)) || null;
}
