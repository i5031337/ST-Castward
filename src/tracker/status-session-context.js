import { getContext } from '../../../../../st-context.js';
import { getSettings } from '../core/settings.js';
import { restoreNpcRoster } from '../characters/system-npc-roster-runtime.js';

export const STATE_KEY = 'sillynpc_status_state';
export const HISTORY_KEY = 'sillynpc_status_history';
export const SWIPE_BASE_KEY = 'sillynpc_swipe_base';
export const PERSONA_KEY = 'sillynpc_persona';
export const SYSTEM_KEY = 'sillynpc_system';

/** Transient state provenance, separate from lifecycle event coordination. */
export const sessionCache = { state: null, chatId: undefined };
export const stateOrigin = new WeakMap();

export function currentChatId() {
    return getContext()?.getCurrentChatId?.();
}

export function getMetadata() {
    return getContext()?.chatMetadata ?? null;
}

export function hasOpenChat() {
    return getContext()?.getCurrentChatId?.() !== undefined;
}

export function getChatSystem() {
    const name = getMetadata()?.[SYSTEM_KEY];
    return (typeof name === 'string' && name) ? name : null;
}

export function chatHasStarted() {
    return Boolean(getContext()?.chat?.some(message => message?.is_user && !message?.is_system));
}

export function resetUnplayedChatState() {
    if (chatHasStarted()) return false;
    const metadata = getMetadata();
    if (!metadata) return false;
    const locations = metadata[STATE_KEY]?.locations;
    delete metadata[STATE_KEY];
    // Choosing rules for an unplayed chat resets stat defaults, not its places.
    if (locations) metadata[STATE_KEY] = { global: {}, characters: [], locations: structuredClone(locations) };
    delete metadata[HISTORY_KEY];
    delete metadata[SWIPE_BASE_KEY];
    sessionCache.state = null;
    sessionCache.chatId = undefined;
    getContext()?.saveMetadataDebounced?.();
    return true;
}

export function rememberChatSystem() {
    const metadata = getMetadata();
    if (!metadata || !hasOpenChat()) return false;

    const active = getSettings().activeSystem || '';
    if (!active || metadata[SYSTEM_KEY] === active) return false;

    metadata[SYSTEM_KEY] = active;
    restoreNpcRoster();
    getContext()?.saveMetadataDebounced?.();
    return true;
}

let alignSwipeBase = null;

/** Wire snapshot alignment after startup without importing the snapshot consumer. */
export function setSwipeBaseAligner(fn) {
    alignSwipeBase = typeof fn === 'function' ? fn : null;
}

export function alignSwipeBaseAfterSave() {
    return alignSwipeBase?.();
}
