/** Supply linked cast lore to the host scan without changing selected lorebooks. */
const identity = (world, uid) => JSON.stringify([String(world), String(uid)]);

export function createCastLoreActivator({ getContext, getSettings, getCharacters, loadWorldInfo, onError = () => {} }) {
    return async function activateCastLore(lore) {
        const context = getContext();
        const settings = getSettings();
        const chatId = context?.getCurrentChatId?.();
        const metadata = context?.chatMetadata;
        if (!settings.enabled || chatId === undefined || !metadata || !Array.isArray(lore?.chatLore)) return 0;
        const system = settings.activeSystem;
        if (metadata.sillynpc_system && metadata.sillynpc_system !== system) return 0;
        const current = () => getSettings().enabled && getSettings().activeSystem === system
            && getContext()?.chatMetadata === metadata && getContext()?.getCurrentChatId?.() === chatId;
        const linked = () => getCharacters().filter(card => card.lorebook?.world
            && card.lorebook.uid !== undefined && card.lorebook.uid !== null);
        const requested = new Map();
        for (const card of linked()) {
            const { world, uid } = card.lorebook;
            if (!requested.has(world)) requested.set(world, new Set());
            requested.get(world).add(String(uid));
        }
        const present = () => new Set(['globalLore', 'characterLore', 'chatLore', 'personaLore']
            .flatMap(key => Array.isArray(lore[key]) ? lore[key] : [])
            .map(entry => identity(entry.world, entry.uid)));
        const existing = present();
        const books = [...requested].filter(([world, ids]) => [...ids].some(uid => !existing.has(identity(world, uid))));
        const loaded = await Promise.all(books.map(async ([world]) => {
            try { return [world, await loadWorldInfo(world)]; }
            catch (error) { onError(world, error); return [world, null]; }
        }));
        if (!current()) return 0;
        const wanted = new Set(linked().map(card => identity(card.lorebook.world, card.lorebook.uid)));
        const seen = present();
        let added = 0;
        for (const [world, data] of loaded) {
            for (const uid of requested.get(world)) {
                const key = identity(world, uid);
                if (!wanted.has(key) || seen.has(key)) continue;
                const entry = data?.entries?.[uid];
                if (!entry) continue;
                lore.chatLore.push({ ...structuredClone(entry), uid: entry.uid ?? Number(uid), world });
                seen.add(key);
                added++;
            }
        }
        return added;
    };
}
