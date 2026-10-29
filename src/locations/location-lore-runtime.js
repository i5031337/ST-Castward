import { getContext } from '../../../../../st-context.js';
import { user_avatar } from '../../../../../../script.js';
import { eventSource, event_types } from '../../../../../events.js';
import { loadWorldInfo, saveWorldInfo, createWorldInfoEntry, world_names } from '../../../../../world-info.js';
import { getSettings } from '../core/settings.js';
import { requireLorebook } from '../lore/lorebook-write-target.js';
import { getChatLorebookName } from '../lore/lorebook.js';
import { createLocationLoreStore } from './location-lore-store.js';
import { createLocationLoreRuntime } from './location-lore.js';

const sync = createLocationLoreStore({ load: loadWorldInfo, save: (world, data) => saveWorldInfo(world, data, true), allocate: createWorldInfoEntry });
const update = createLocationLoreRuntime({
    getContext, getSettings, sync, getPersona: () => user_avatar,
    getTarget: ({ isCurrent, hasPlaces }) => hasPlaces
        ? requireLorebook(null, { isCurrent, purpose: 'Save places' })
        : getChatLorebookName() || (world_names?.includes(getSettings().defaultLorebook) ? getSettings().defaultLorebook : ''),
});

function report(error) {
    if (error.name === 'AbortError') return;
    console.warn('Castward: Could not save place lore', error);
    toastr.warning(`Could not save place lore: ${error.message || error}`, 'Castward', { escapeHtml: true });
}

export async function activateLocationLore(lore) {
    try { await update(lore); }
    catch (error) { report(error); }
}

export function initPlaceLore() {
    const refresh = () => { void update().catch(report); };
    eventSource.on('sillynpc-status-updated', refresh);
    eventSource.on(event_types.CHAT_CHANGED, refresh);
}
