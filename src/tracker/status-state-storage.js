import { clampToCeiling, getInitialStatValue } from './stat-value-utils.js';
import { findCardForName } from './status-character-match.js';
import { activatePersona, createChatPlayerSeed, getCurrentPersonaKey, getCurrentPersonaName, migrateLegacyPlayer } from './status-persona-state.js';
import { createInitialState } from './status-status-summary.js';
import { HISTORY_KEY, STATE_KEY, alignSwipeBaseAfterSave, currentChatId, getMetadata, hasOpenChat, sessionCache, stateOrigin } from './status-session-context.js';
import { npcStatsFor, npcTemplateFor } from '../core/npc-templates.js';
import { eventSource } from '../../../../../events.js';
import { getContext } from '../../../../../st-context.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { captureNpcRoster } from '../characters/system-npc-roster.js';
import { applyRosterStateSeed } from '../characters/system-roster-state.js';
import { LOG_PREFIX, debugLog } from '../core/constants.js';
import { isTrackerEditLocked } from './tracker-edit-lock.js';

const stateMetadata = new WeakMap();
/** Read the current raw state without repairing or saving an editor's source data. */
function peekStateFromMetadata() {
    if (!hasOpenChat()) return null;
    const metadata = getMetadata();
    if (metadata?.[STATE_KEY]) return metadata[STATE_KEY];
    const cached = sessionCache.state;
    const source = cached && stateMetadata.get(cached);
    return cached && sessionCache.chatId === currentChatId()
        && source?.metadata === metadata && source.storedState === metadata?.[STATE_KEY] ? cached : null;
}

function loadStateFromMetadata({ preferCache = false } = {}) {
    // Belongs to a chat that is no longer open, whatever the event order was.
    const currentMetadata = getMetadata();
    const cachedSource = sessionCache.state && stateMetadata.get(sessionCache.state);
    if (sessionCache.state && (sessionCache.chatId !== currentChatId()
        || cachedSource && (cachedSource.metadata !== currentMetadata
            || cachedSource.storedState !== currentMetadata?.[STATE_KEY])
        || currentMetadata?.[STATE_KEY] && currentMetadata[STATE_KEY] !== sessionCache.state)) {
        sessionCache.state = null;
    }

    // Update calculations may reuse the cache, but never skip ownership checks.
    if (preferCache && sessionCache.state) {
        stateMetadata.set(sessionCache.state, { metadata: currentMetadata, storedState: currentMetadata?.[STATE_KEY] });
        return sessionCache.state;
    }

    let stateToReturn = sessionCache.state;
    let stateChanged = false;

    if (!stateToReturn) {
        const metadata = getMetadata();
        if (metadata && metadata[STATE_KEY]) {
            stateToReturn = metadata[STATE_KEY];
            
            // Fill missing state containers.
            if (!stateToReturn.global) stateToReturn.global = {};
            if (!stateToReturn.characters) stateToReturn.characters = [];
            
            // The chat owns what is here. A different persona is a switch, handled in one
            // place; the same persona means this chat's record is already theirs and
            // nothing outside the chat gets a say in it.
            if (stateToReturn.player) {
                activatePersona(stateToReturn, getCurrentPersonaKey(), getCurrentPersonaName());
            } else {
                // Written before there was a player object at all.
                const name = getCurrentPersonaName();
                const key = getCurrentPersonaKey();
                stateToReturn.player = { name, personaKey: key, ...migrateLegacyPlayer(key, name) };
                stateChanged = true;
            }
        } else {
            const name = getCurrentPersonaName();
            const key = getCurrentPersonaKey();
            stateToReturn = createInitialState();
            stateToReturn.player = { name, personaKey: key, ...createChatPlayerSeed() };
        }
        sessionCache.state = stateToReturn;
        sessionCache.chatId = currentChatId();
        stateOrigin.set(stateToReturn, sessionCache.chatId);
    }

    stateMetadata.set(stateToReturn, { metadata: currentMetadata, storedState: currentMetadata?.[STATE_KEY] });
    if (applyRosterStateSeed(stateToReturn, currentMetadata)) stateChanged = true;

    // Fill declared stats and repair casing; retain undeclared values for archived history.
    const settings = getSettings().statusTracker;
    // Place records belong to the chat; discovery is a rule of its selected System.
    stateToReturn.locations ||= { currentId: '', records: {} };
    stateToReturn.locations.enabled = settings.locations?.enabled !== false;

    // Ensure missing global stats from settings are added
    (settings.globalStats || []).forEach(stat => {
        if (stat && stat.name) {
            const existingKey = Object.keys(stateToReturn.global).find(k => k.toLowerCase() === stat.name.toLowerCase());
            if (!existingKey) {
                stateToReturn.global[stat.name] = getInitialStatValue(stat.defaultValue);
                stateChanged = true;
            } else {
                if (existingKey !== stat.name) {
                    // Non-destructive rename
                    stateToReturn.global[stat.name] = stateToReturn.global[existingKey];
                    delete stateToReturn.global[existingKey];
                    stateChanged = true;
                }
                const clamped = clampToCeiling(stateToReturn.global[stat.name]);
                if (clamped !== stateToReturn.global[stat.name]) {
                    stateToReturn.global[stat.name] = clamped;
                    stateChanged = true;
                }
            }
        }
    });

    // Validate Player stats
    if (stateToReturn.player && stateToReturn.player.stats) {
        // Ensure missing player stats from settings are added
        (settings.playerStats || []).forEach(stat => {
            if (stat && stat.name) {
                const existingKey = Object.keys(stateToReturn.player.stats).find(k => k.toLowerCase() === stat.name.toLowerCase());
                if (!existingKey) {
                    stateToReturn.player.stats[stat.name] = getInitialStatValue(stat.defaultValue);
                    stateChanged = true;
                } else {
                    if (existingKey !== stat.name) {
                        // Non-destructive rename
                        stateToReturn.player.stats[stat.name] = stateToReturn.player.stats[existingKey];
                        delete stateToReturn.player.stats[existingKey];
                        stateChanged = true;
                    }
                    const clamped = clampToCeiling(stateToReturn.player.stats[stat.name]);
                    if (clamped !== stateToReturn.player.stats[stat.name]) {
                        stateToReturn.player.stats[stat.name] = clamped;
                        stateChanged = true;
                    }
                }
            }
        });
    }

    // Ensure recently_deleted exists
    if (!stateToReturn.recently_deleted) {
        stateToReturn.recently_deleted = {};
        stateChanged = true;
    }

    // The standing-decision lists from before they were scoped per character: collection
    // -> [names], where they are now actor -> collection -> [names]. Ignored on read ever
    // since, so they have been inert - but a chat file carrying a shape nothing
    // understands is a puzzle for whoever opens it next, including us.
    for (const key of ['dismissed', 'protected']) {
        const map = stateToReturn[key];
        if (map && typeof map === 'object' && Object.values(map).some(Array.isArray)) {
            delete stateToReturn[key];
            stateChanged = true;
        }
    }

    stateToReturn.characters.forEach(char => {
        if (!char.stats) {
            char.stats = {};
            stateChanged = true;
        }

        if (!char.npcTemplateId) {
            const selected = npcTemplateFor(char) || npcTemplateFor(findCardForName(char.name));
            if (selected) { char.npcTemplateId = selected.id; stateChanged = true; }
        }
        // Optimization: Use a map for existing stats lookup
        const charStatsLower = new Map(Object.keys(char.stats).map(k => [k.toLowerCase(), k]));

        // Ensure missing NPC stats from settings are added
        npcStatsFor(char, settings).forEach(stat => {
            if (stat && stat.name) {
                const lowerName = stat.name.toLowerCase();
                const existingKey = charStatsLower.get(lowerName);
                if (!existingKey) {
                    char.stats[stat.name] = getInitialStatValue(stat.defaultValue);
                    charStatsLower.set(lowerName, stat.name);
                    stateChanged = true;
                } else {
                    if (existingKey !== stat.name) {
                        // Non-destructive rename
                        char.stats[stat.name] = char.stats[existingKey];
                        delete char.stats[existingKey];
                        charStatsLower.delete(existingKey.toLowerCase());
                        charStatsLower.set(lowerName, stat.name);
                        stateChanged = true;
                    }
                    const clamped = clampToCeiling(char.stats[stat.name]);
                    if (clamped !== char.stats[stat.name]) {
                        char.stats[stat.name] = clamped;
                        stateChanged = true;
                    }
                }
            }
        });
    });

    if (stateChanged) {
        debugLog('State repaired during load, saving back to chat metadata.');
        saveStateToMetadata(stateToReturn, { recordHistory: false });
        eventSource.emit('sillynpc-status-updated', stateToReturn);
    }

    return stateToReturn;
}

/** Commit chat state, saving the outgoing state as an undo point unless disabled. */
function saveStateToMetadata(state, options = {}) {
    const { recordHistory = true, label = 'Change', partOfMessage = false, isCurrent, beforeCommit } = options;
    const metadata = getMetadata();
    if (!metadata) return false;

    // Between chats, SillyTavern leaves the last chat's metadata object in place - a read
    // there hands back whichever story was open before, and a write lands in an object
    // that belongs to nothing and is about to be replaced. Neither is anything anyone
    // asked for, so the write is refused where it can still be said out loud.
    if (!hasOpenChat()) {
        console.warn(LOG_PREFIX, 'Refused to write tracker state with no chat open.');
        return false;
    }

    // A state read from one chat must never be written into another. SillyTavern swaps
    // chat_metadata inside getChat() and only fires CHAT_CHANGED after the conversation
    // has been re-rendered, so anything holding a state across that gap is pointing at
    // the wrong file - and this is the write that loses work rather than merely showing
    // the wrong number. A state built fresh is unmarked and always allowed.
    const here = currentChatId();
    const origin = stateOrigin.get(state);
    if (origin !== undefined && origin !== here) {
        console.error(LOG_PREFIX,
            `Refused to write state from chat "${origin}" into "${here}".`);
        return false;
    }
    // The callback only installs in-memory card/library plans; it cannot save or emit.
    // Recheck after all host getters, immediately before the first accepted effect.
    if (isCurrent && !isCurrent()) return false;
    beforeCommit?.();
    stateOrigin.set(state, here);
    stateMetadata.set(state, { metadata, storedState: state });

    // The very first change in a chat has no committed predecessor in metadata yet -
    // the initial state exists only in the in-memory cache. Fall back to it so that
    // first change is undoable too.
    const previous = metadata[STATE_KEY] ?? sessionCache.state;
    if (recordHistory && !partOfMessage && previous) {
        if (!Array.isArray(metadata[HISTORY_KEY])) metadata[HISTORY_KEY] = [];
        const history = metadata[HISTORY_KEY];
        history.push({
            state: structuredClone(previous),
            timestamp: Date.now(),
            label,
        });
        // The rewrite keeps only the immediately previous user change.
        if (history.length > 1) history.splice(0, history.length - 1);
    }

    metadata[STATE_KEY] = state;
    sessionCache.state = state;
    sessionCache.chatId = currentChatId();
    if (captureNpcRoster(getSettings(), getContext())) saveSettings();

    /* Anything saved here that is not a message being read is a correction from the sheet
       or item editor. The swipe base has to learn about it, or
       swiping the newest reply quietly rolls it back along with the reply.

       partOfMessage is the load-bearing half - a reply folded into its own base is a swipe
       that undoes nothing. recordHistory is not: the internal rebuilds pass false, and
       aligning after one of them would change nothing, because a rebuild leaves the state
       equal to the base everywhere the message did not touch. It is here as a guard on
       re-entrancy - the aligner reads through loadStateFromMetadata, which can itself save
       while repairing - and no test distinguishes it, which is why this says so. */
    if (recordHistory && !partOfMessage) {
        try {
            alignSwipeBaseAfterSave();
        } catch (err) {
            debugLog('Could not keep the swipe base in step', err);
        }
    }

    getContext()?.saveMetadataDebounced?.();
    return true;
}

/**
 * Undo history for the current chat, oldest first.
 * @returns {{ state: StatusState, timestamp: number, label: string }[]}
 */
function getHistoryEntries() {
    const history = getMetadata()?.[HISTORY_KEY];
    return Array.isArray(history) ? history.slice(-1) : [];
}

/**
 * Steps back one change.
 * @returns {{ state: StatusState, timestamp: number, label: string } | null}
 *   The entry restored, or null when there is nothing to undo.
 */
function undoLastChange() {
    if (isTrackerEditLocked()) return null;
    const metadata = getMetadata();
    const history = metadata?.[HISTORY_KEY];
    if (!Array.isArray(history) || history.length === 0) return null;

    const entry = history.pop();
    history.length = 0;
    saveStateToMetadata(entry.state, { recordHistory: false });
    eventSource.emit('sillynpc-status-updated', entry.state);
    return entry;
}

export { peekStateFromMetadata, loadStateFromMetadata, saveStateToMetadata, getHistoryEntries, undoLastChange };
