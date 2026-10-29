import { readLocationStore } from './location-store.js';
import { applyLocationLore } from './location-lore-scan.js';

/** Sync the latest chat snapshot and supply its managed entries to the host scan. */
export function createLocationLoreRuntime({ getContext, getSettings, getTarget, sync,
    getPersona = () => getContext()?.user_avatar }) {
    const ownerFor = context => JSON.stringify(['place', context?.groupId || null,
        context?.characters?.[context.characterId]?.avatar || null, context?.getCurrentChatId?.()]);
    const snapshot = () => {
        const context = getContext();
        const settings = getSettings();
        const state = context?.chatMetadata?.sillynpc_status_state;
        return { locations: { ...readLocationStore(state), enabled: !!settings.enabled
            && !!settings.statusTracker?.enabled && settings.statusTracker.locations?.enabled !== false } };
    };
    return async function update(lore) {
        // Suppress saved entries from disabled features and other chats before any await.
        if (lore) applyLocationLore(lore, [], { locations: { enabled: false } }, '');
        const context = getContext();
        const settings = getSettings();
        const metadata = context?.chatMetadata;
        const chatId = context?.getCurrentChatId?.();
        if (!metadata || !chatId || !settings.enabled || !settings.statusTracker?.enabled) return 0;
        if (metadata.sillynpc_system && metadata.sillynpc_system !== settings.activeSystem) return 0;
        const state = snapshot();
        if (!state.locations.enabled) return 0;
        const system = settings.activeSystem;
        const persona = getPersona();
        const signature = JSON.stringify(state);
        const owner = ownerFor(context);
        const isCurrent = () => getContext()?.chatMetadata === metadata
            && getContext()?.getCurrentChatId?.() === chatId && getSettings().activeSystem === system
            && (!metadata.sillynpc_system || metadata.sillynpc_system === system)
            && getPersona() === persona && ownerFor(getContext()) === owner
            && JSON.stringify(snapshot()) === signature;
        const world = await getTarget({ isCurrent, hasPlaces: !!Object.keys(state.locations.records).length });
        if (!world || !isCurrent()) return 0;
        const entries = await sync(world, state, owner, isCurrent);
        if (!isCurrent()) return 0;
        return lore ? applyLocationLore(lore, entries, state, owner) : entries.length;
    };
}
