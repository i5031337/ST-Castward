import { getContext } from '../../../../../st-context.js';
import { eventSource, event_types } from '../../../../../events.js';
import { backgroundImageUrl, readLocationStore } from './location-store.js';
import { getSettings } from '../core/settings.js';

let last;

/** Apply a confirmed place's linked image using SillyTavern's chat background metadata. */
export function syncPlaceBackground(context = getContext(), background = document.querySelector('#bg1'), force = false) {
    const metadata = context?.chatMetadata;
    const chatId = context?.getCurrentChatId?.();
    if (!chatId || !metadata || !background) { last = null; return false; }
    const store = readLocationStore(metadata.sillynpc_status_state);
    const image = store.enabled ? store.records[store.currentId]?.backgroundImage : '';
    if (!backgroundImageUrl(image)) { last = null; return false; }
    if (!force && last?.metadata === metadata && last.chatId === chatId
        && last.currentId === store.currentId && last.image === image) return false;
    last = { metadata, chatId, currentId: store.currentId, image };
    if (metadata.custom_background !== image) {
        metadata.custom_background = image;
        context.saveMetadataDebounced?.();
    }
    background.style.backgroundImage = image;
    return true;
}

export function initPlaceBackgrounds() {
    const active = () => getSettings().enabled;
    eventSource.on('sillynpc-status-updated', () => { if (active()) syncPlaceBackground(); });
    eventSource.on(event_types.CHAT_CHANGED, () => setTimeout(() => {
        if (active()) syncPlaceBackground(undefined, undefined, true);
    }, 0));
    setTimeout(() => { if (active()) syncPlaceBackground(undefined, undefined, true); }, 0);
}
