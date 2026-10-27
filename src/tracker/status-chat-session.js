import { HISTORY_KEY, PERSONA_KEY, STATE_KEY, SWIPE_BASE_KEY, SYSTEM_KEY, chatHasStarted,
    currentChatId, getChatSystem, getMetadata, hasOpenChat, rememberChatSystem,
    resetUnplayedChatState, setSwipeBaseAligner, stateOrigin, sessionCache } from './status-session-context.js';
import { getActiveSystem, migrateToActiveSystem, setActiveSystem } from './status-system-presets.js';
import { activatePersona, getCurrentPersonaKey, getCurrentPersonaName, getPlayerCard, personaDescription, resolvePersonaAvatarAndName } from './status-persona-state.js';
import { loadStateFromMetadata, saveStateToMetadata } from './status-state-storage.js';
import { getThumbnailUrl } from '../../../../../../script.js';
import { 
    eventSource, 
    event_types, 
} from '../../../../../events.js';
import { getContext } from '../../../../../st-context.js';
import { setUserAvatar } from '../../../../../personas.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { getAllCharacters } from '../characters/character-repository.js';
import { LOG_PREFIX, debugLog } from '../core/constants.js';
import { diffTurnValues, applyTurnValues } from './snapshots/status-turn-delta.js';
import { restoreNpcRoster } from '../characters/system-npc-roster-runtime.js';
import { createTrackerLifecycle } from './tracker-lifecycle.js';

let lifecycle;
let refreshPrompts = () => {};
function getLifecycle() {
    return lifecycle ||= createTrackerLifecycle({
        readSession: () => ({ chatId: currentChatId(), metadata: getMetadata(),
            systemKey: getSettings().activeSystem }),
        clearState: () => { sessionCache.state = null; sessionCache.chatId = undefined; },
        restoreSystem: restoreChatSystem,
        restoreRoster: restoreNpcRoster,
        restorePersona: restoreChatPersona,
        recordedPersona: getChatPersona,
        currentPersona: () => ({ key: getCurrentPersonaKey(), name: getCurrentPersonaName() }),
        loadState: (...args) => loadStateFromMetadata(...args),
        selectPersona: (...args) => activatePersona(...args),
        saveState: (...args) => saveStateToMetadata(...args),
        rememberPersona: rememberChatPersona,
        refresh: state => {
            refreshPrompts();
            eventSource.emit('sillynpc-status-updated', state);
        },
    });
}
/**
 * Robustly gets persona avatar and description from ST context.
 * Uses official ST persona management structures and utility functions.
 */
function getPersonaData() {
    const { avatar: avatarFilename, name: officialName } = resolvePersonaAvatarAndName();

    const officialDescription = personaDescription(avatarFilename);
    
    // 3. Native Asset Loading
    //
    // Two URLs, because the two consumers want different things. SillyTavern renders
    // persona thumbnails at 96x144 (config.yaml), which is right for the 60px HUD circle
    // and visibly soft anywhere larger - a 768x1408 avatar arrives at an eighth of its
    // resolution. Anything bigger than a favicon should ask for the file itself.
    const FALLBACK_AVATAR = '../../../../../img/twemoji/1f464.png'; // Default silhouette
    let avatarUrl = FALLBACK_AVATAR;
    let avatarThumbUrl = FALLBACK_AVATAR;

    if (avatarFilename && avatarFilename !== 'default_user.png') {
        avatarThumbUrl = getThumbnailUrl('persona', avatarFilename);
        avatarUrl = `/User Avatars/${encodeURIComponent(avatarFilename)}`;
    }

    const result = {
        name: officialName,
        avatar: avatarFilename,
        avatarUrl: avatarUrl,
        avatarThumbUrl: avatarThumbUrl,
        description: officialDescription,
        method: 'official-st-lookup'
    };

    return result;
}

/** One pre-turn base per chat; only the latest reply can be swiped. */
function rememberSwipeBase(messageId, state) {
    const metadata = getMetadata();
    if (!metadata || !state) return false;

    const key = String(messageId);
    // Only the first read of a message sets it. A later swipe of the same message must
    // rebuild from the same starting point, not from what the previous swipe produced.
    if (metadata[SWIPE_BASE_KEY]?.messageId === key) return false;

    metadata[SWIPE_BASE_KEY] = {
        messageId: key,
        state: structuredClone(state),
        profiles: snapshotProfiles(),
    };
    debugLog(`Remembered the state before message ${key}, for swipes`);
    return true;
}

/** Profile and memory snapshots for cards visible to this chat. */
function snapshotProfiles() {
    const out = {};
    const record = (card) => {
        const name = String(card?.name ?? '').trim();
        if (name) out[name.toLowerCase()] = {
            profile: structuredClone(card.profile || {}),
            npcTemplateId: card.npcTemplateId || '',
            memories: structuredClone(card.memories || []),
        };
    };
    for (const card of getAllCharacters()) record(card);
    try { record(getPlayerCard()); } catch { /* no persona yet */ }
    return out;
}

/** Restores profile and memory values without saving unchanged cards. */
function restoreProfiles(profiles) {
    if (!profiles || typeof profiles !== 'object') return 0;

    let restored = 0;
    const touched = new Set();
    const put = (card) => {
        const was = profiles[String(card?.name ?? '').trim().toLowerCase()];
        if (!was) return;
        if (Object.hasOwn(was, 'npcTemplateId') && (card.npcTemplateId || '') !== was.npcTemplateId) {
            card.npcTemplateId = was.npcTemplateId;
            restored += 1;
            touched.add(card);
        }
        // Older bases stored the profile directly; new bases include memories too.
        const profile = was.profile && typeof was.profile === 'object' ? was.profile : was;
        if (JSON.stringify(card.profile || {}) !== JSON.stringify(profile)) {
            card.profile = structuredClone(profile);
            restored += 1;
            touched.add(card);
        }
        if (Array.isArray(was.memories)
            && JSON.stringify(card.memories || []) !== JSON.stringify(was.memories)) {
            card.memories = structuredClone(was.memories);
            restored += 1;
            touched.add(card);
        }
    };
    for (const card of getAllCharacters()) put(card);
    try { put(getPlayerCard()); } catch { /* no persona yet */ }

    if (restored) {
        saveSettings();
        debugLog(`Put ${restored} profile field(s) back to before that message`);
    }
    return [...touched];
}

/** The pre-turn state for this message, when available. */
function getSwipeBase(messageId) {
    const stored = getMetadata()?.[SWIPE_BASE_KEY];
    if (!stored || stored.messageId !== String(messageId)) return null;
    return structuredClone(stored.state);
}

/** Mutable base for recording turn effects and manual corrections. */
function swipeBaseRecord() {
    return getMetadata()?.[SWIPE_BASE_KEY] ?? null;
}

/** The profiles as they stood before that message, or null when none were recorded. */
function getProfileBase(messageId) {
    const stored = getMetadata()?.[SWIPE_BASE_KEY];
    if (!stored || stored.messageId !== String(messageId)) return null;
    return stored.profiles ? structuredClone(stored.profiles) : null;
}

/** Records all turn-owned writes, including presence and profile memories. */
function recordTurnEffects(messageId) {
    const base = swipeBaseRecord();
    const message = getContext()?.chat?.[Number(messageId)];
    if (!base || base.messageId !== String(messageId) || !message) return false;
    const state = structuredClone(loadStateFromMetadata());
    const profiles = snapshotProfiles();
    const effectsState = base.beforeApply
        ? applyTurnValues(base.applied?.state || base.state, diffTurnValues(base.beforeApply.state, state)) : state;
    const effectsProfiles = base.beforeApply
        ? applyTurnValues(base.applied?.profiles || base.profiles, diffTurnValues(base.beforeApply.profiles, profiles)) : profiles;
    message.extra ||= {};
    base.turnId ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    message.extra.sillynpc_turn_id = base.turnId;
    message.extra.sillynpc_turn_effects = {
        swipe: Number(message.swipe_id ?? 0),
        text: String(message.mes ?? ''),
        state: diffTurnValues(base.state, effectsState),
        profiles: diffTurnValues(base.profiles, effectsProfiles),
    };
    base.applied = { state: effectsState, profiles: effectsProfiles };
    delete base.beforeApply;
    return true;
}

/** Keeps edits made while the reader was waiting outside its reply-owned changes. */
function refreshTurnBase(messageId) {
    const base = swipeBaseRecord();
    if (!base || base.messageId !== String(messageId)) return false;
    const state = structuredClone(loadStateFromMetadata());
    const profiles = snapshotProfiles();
    if (base.applied) base.beforeApply = { state, profiles };
    else {
        base.state = state;
        base.profiles = profiles;
    }
    return true;
}

/**
 * Initialize status tracker logic
 */
function initStatusLogic({ refreshPrompts: refresh = () => {}, onGenerationStarted } = {}) {
    refreshPrompts = refresh;
    debugLog('Initializing Status Tracker Logic');
    // Before anything reads configuration, so the world in use belongs to a system.
    migrateToActiveSystem();
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    if (onGenerationStarted) eventSource.on(event_types.GENERATION_STARTED, onGenerationStarted);
    eventSource.on(event_types.PERSONA_CHANGED, onPersonaChanged);
    eventSource.on(event_types.CHARACTER_EDITED, onCharacterEdited);
}

/** The persona this chat was last used with, or null if it has never recorded one. */
function getChatPersona() {
    const avatar = getMetadata()?.[PERSONA_KEY];
    return (typeof avatar === 'string' && avatar) ? avatar : null;
}

/**
 * Records the persona in use against the open chat.
 *
 * Called whenever you switch persona, which is what makes a change mid-chat stick: the
 * chat remembers whoever you last played it as, not whoever was active when the
 * application last closed.
 *
 * @returns {boolean} False when there was nothing to record.
 */
function rememberChatPersona() {
    const metadata = getMetadata();
    if (!metadata || !hasOpenChat()) return false;

    const { avatar } = resolvePersonaAvatarAndName();
    // A restore also lands here, via the PERSONA_CHANGED it emits - and needs no special
    // case, because it can only ever be writing back the value it just read.
    if (!avatar || metadata[PERSONA_KEY] === avatar) return false;

    metadata[PERSONA_KEY] = avatar;
    getContext()?.saveMetadataDebounced?.();
    debugLog(`Chat persona recorded: ${avatar}`);
    return true;
}

/**
 * Puts a chat back to the persona it was last played with.
 *
 * A chat that has never recorded one adopts whoever is active now, so nothing is guessed
 * about chats that predate this and the first open of an old chat simply claims it.
 *
 * One sharp edge worth knowing: setUserAvatar re-triggers the greeting on an *empty*
 * chat. A chat with no record returns before that point, so it only applies to an empty
 * chat that recorded a different persona earlier - rare, and still the right outcome.
 *
 * @returns {Promise<boolean>} Whether a switch actually happened.
 */
async function restoreChatPersona(isCurrent = () => true) {
    if (!hasOpenChat() || !isCurrent()) return false;

    const recorded = getChatPersona();
    if (!recorded) {
        rememberChatPersona();
        return false;
    }

    const { avatar } = resolvePersonaAvatarAndName();
    if (recorded === avatar) return false;

    try {
        await setUserAvatar(recorded, { toastPersonaNameChange: false });
        if (!isCurrent()) return false;
        debugLog(`Chat persona restored: ${recorded}`);
        return true;
    } catch (err) {
        // A persona deleted since the chat was last opened is the ordinary failure. The
        // chat stays on whoever is active rather than refusing to open.
        console.warn(LOG_PREFIX, 'Could not restore this chat\'s persona', err);
        return false;
    }
}

/** Restore the chat's recorded System, or adopt the active one on first open. */
function restoreChatSystem() {
    if (!hasOpenChat()) return false;

    const recorded = getChatSystem();
    if (!recorded) {
        rememberChatSystem();
        return false;
    }
    if (recorded === getActiveSystem()) return false;

    if (!getSettings().statusTracker.presets?.[recorded]) {
        // Deleted since the chat was last opened. Staying put is the safe reading: the
        // alternative is loading a world at random and writing this chat's state into it.
        console.warn(LOG_PREFIX,
            `This chat belongs to a system that no longer exists: "${recorded}"`);
        return false;
    }
    return setActiveSystem(recorded);
}

async function onChatChanged() {
    return getLifecycle().activateChat();
}

function onCharacterEdited(data) {
    // A redraw, nothing more. This used to pull master over the chat's player data, so
    // editing a persona's description or picture rewrote their HP - which is not a thing
    // anyone editing a description is asking for.
    const personaName = getCurrentPersonaName();
    if (data && (data.name === personaName || data.name === getContext()?.name1)) {
        debugLog('Current persona edited, redrawing');
        eventSource.emit('sillynpc-status-updated', loadStateFromMetadata());
    }
}

function onPersonaChanged() {
    return getLifecycle().activatePlayer();
}

export { STATE_KEY, HISTORY_KEY, currentChatId, stateOrigin, getPersonaData, getMetadata, rememberSwipeBase, restoreProfiles, getSwipeBase, swipeBaseRecord, setSwipeBaseAligner, getProfileBase, snapshotProfiles, recordTurnEffects, refreshTurnBase, initStatusLogic, PERSONA_KEY, hasOpenChat, getChatPersona, rememberChatPersona, restoreChatPersona, SYSTEM_KEY, getChatSystem, chatHasStarted, resetUnplayedChatState, rememberChatSystem, restoreChatSystem };
