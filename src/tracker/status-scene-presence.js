import { sessionCache } from './status-session-context.js';
import { resolveCanonicalName } from './status-character-match.js';
import { recordTurnEffects, refreshTurnBase, rememberSwipeBase, swipeBaseRecord } from './status-chat-session.js';
import { loadStateFromMetadata, saveStateToMetadata } from './status-state-storage.js';
import { mayJoinScene, mergeDuplicateCharacters } from './status-cast-decisions.js';
import { activeNpcSystem } from '../core/npc-templates.js';
import { buildActorState } from './actor-calculation.js';
import { eventSource } from '../../../../../events.js';
import { getContext } from '../../../../../st-context.js';
import { getSettings } from '../core/settings.js';
import { getAllCharacters } from '../characters/character-repository.js';
import { debugLog } from '../core/constants.js';
import { syncNpcCollectionsToCards } from './npc-collections.js';

function reconcileScenePresence(names, messageId, options = {}) {
    const settings = getSettings().statusTracker;
    const before = sessionCache.state || loadStateFromMetadata();
    const state = structuredClone(before);
    if (!state.presence || typeof state.presence !== 'object') {
        state.presence = { tick: 0, messageId: null, seen: [] };
    }
    const presence = state.presence;
    const key = String(messageId);
    let changed = mergeDuplicateCharacters(state);

    if (presence.messageId !== key) {
        // A new message gets a fresh cast decision and advances the grace clock.
        presence.tick = (Number(presence.tick) || 0) + 1;
        presence.messageId = key;
        presence.seen = [];
        presence.suppressed = [];
        presence.authoritative = false;
        changed = true;
    }
    const suppressed = new Set((presence.suppressed || [])
        .map(name => resolveCanonicalName(name).toLowerCase()));

    // Collapse aliases before anything is matched or created, or the same character
    // arrives twice under two spellings and gets two rows with two sets of stats.
    // Anyone the reader has been told is not a character is dropped here rather than
    // admitted and removed again - both the decorator and the extractor arrive through
    // this function, which is what makes one decision cover both.
    const incoming = (names || []).map(n => resolveCanonicalName(n))
        .filter(n => n && !suppressed.has(n.toLowerCase())
            && mayJoinScene(n, { speaker: !options.authoritative }));

    // Signals recorded before aliases were resolved are still in alias form, and would
    // read as absent against the canonical cast.
    const normalisedSeen = [];
    for (const name of presence.seen || []) {
        const canonical = resolveCanonicalName(name);
        if (suppressed.has(canonical.toLowerCase())) continue;
        if (!normalisedSeen.some(n => n.toLowerCase() === canonical.toLowerCase())) {
            normalisedSeen.push(canonical);
        }
    }
    if (normalisedSeen.join('|') !== (presence.seen || []).join('|')) changed = true;
    presence.seen = normalisedSeen;

    if (options.authoritative) {
        // The reader's cast is complete for this message. A later portrait redraw
        // must not add a guessed speaker back to it.
        presence.seen = [];
        presence.authoritative = true;
        changed = true;
    }
    if (!presence.authoritative || options.authoritative) {
        for (const name of incoming) {
            if (!presence.seen.some(n => n.toLowerCase() === name.toLowerCase())) presence.seen.push(name);
        }
    }

    const seenLower = new Set(presence.seen.map(n => n.toLowerCase()));
    const grace = 3;

    // Everyone observed is present now.
    for (const name of presence.seen) {
        const existing = state.characters.find(ch => ch.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            if (existing.lastSeenTick !== presence.tick) { existing.lastSeenTick = presence.tick; changed = true; }
        } else {
            state.characters.push(buildCharacterState(name, state, settings));
            state.characters.at(-1).lastSeenTick = presence.tick;
            changed = true;
        }
    }

    // Anyone unseen for long enough leaves.
    const survivors = state.characters.filter(ch => {
        if (seenLower.has(ch.name.toLowerCase())) return true;
        // A complete cast list makes absence conclusive rather than merely unobserved.
        if (presence.authoritative) return false;
        // Characters that predate presence tracking get this tick as their baseline
        // rather than being dropped immediately.
        if (ch.lastSeenTick === undefined) { ch.lastSeenTick = presence.tick; return true; }
        return (presence.tick - ch.lastSeenTick) < grace;
    });
    if (survivors.length !== state.characters.length) {
        syncNpcCollectionsToCards(state.characters.filter(ch => !survivors.includes(ch)));
        debugLog('Scene presence: dropping',
            state.characters.filter(ch => !survivors.includes(ch)).map(ch => ch.name));
        state.characters = survivors;
        changed = true;
    }

    if (!changed) return false;

    // Speakers arrive during rendering, before the reader starts. Capture their
    // pre-turn cast now, and keep redraws out of any reader update in progress.
    const chat = getContext()?.chat || [];
    const message = chat[Number(messageId)];
    const recordPresence = !options.authoritative && message && !message.is_user
        && !message.is_system && Number(messageId) === chat.length - 1
        && !swipeBaseRecord()?.beforeApply;
    if (recordPresence) {
        rememberSwipeBase(messageId, before);
        refreshTurnBase(messageId);
    }
    state.timestamp = Date.now();
    // Not an undo step. Who is on stage is re-derived from the messages on every render,
    // so this fires several times a second while a chat loads - ten of them wiped the
    // entire undo ring in four seconds, and took the only copy of a story's stats with
    // it. Presence is not something anyone means to undo.
    saveStateToMetadata(state, { label: 'Scene cast', recordHistory: false });
    if (recordPresence) recordTurnEffects(messageId);
    eventSource.emit('sillynpc-status-updated', state);
    return true;
}

/** Seed presence from the captured card catalog and the active System. */
function buildCharacterState(charName, state, trackerSettings) {
    return buildActorState({ name: charName, state, tracker: trackerSettings,
        system: activeNpcSystem(getSettings()) ?? null, cards: getAllCharacters() });
}

/**
 * Registers a character as active in the scene based on a matched setting character.
 */
function registerActiveCharacter(charName) {
    if (!charName) return;
    if (!mayJoinScene(charName)) return false;

    const state = structuredClone(sessionCache.state || loadStateFromMetadata());
    const settings = getSettings();
    const trackerSettings = settings.statusTracker;
    
    const existingChar = state.characters.find(c => c.name.toLowerCase() === charName.toLowerCase());
    if (existingChar) return false; // Already registered

    const charData = buildCharacterState(charName, state, trackerSettings);

    state.characters.push(charData);
    if (state.presence?.suppressed) {
        state.presence.suppressed = state.presence.suppressed
            .filter(name => name.toLowerCase() !== charName.toLowerCase());
    }
    // A manual addition must survive redraws of the reader's complete cast for this
    // message. On the next message it follows the same presence rules as everyone else.
    if (state.presence?.authoritative && state.presence.messageId !== null) {
        if (!state.presence.seen.some(name => name.toLowerCase() === charName.toLowerCase())) {
            state.presence.seen.push(charName);
        }
        charData.lastSeenTick = state.presence.tick;
    }
    state.timestamp = Date.now();
    saveStateToMetadata(state);
    return true; // Indicates state changed
}

/**
 * Removes an active character from the scene.
 */
function removeActiveCharacter(charName) {
    if (!charName) return;
    
    const state = JSON.parse(JSON.stringify(sessionCache.state || loadStateFromMetadata()));
    const initialLen = state.characters.length;
    syncNpcCollectionsToCards(state.characters.filter(c => c.name.toLowerCase() === charName.toLowerCase()));
    
    state.characters = state.characters.filter(c => c.name.toLowerCase() !== charName.toLowerCase());
    
    if (state.characters.length !== initialLen) {
        if (state.presence?.messageId !== undefined && state.presence.messageId !== null) {
            const lower = resolveCanonicalName(charName).toLowerCase();
            state.presence.seen = (state.presence.seen || [])
                .filter(name => resolveCanonicalName(name).toLowerCase() !== lower);
            if (!Array.isArray(state.presence.suppressed)) state.presence.suppressed = [];
            if (!state.presence.suppressed.some(name => name.toLowerCase() === lower)) {
                state.presence.suppressed.push(charName);
            }
        }
        state.timestamp = Date.now();
        saveStateToMetadata(state);
        return true;
    }
    return false;
}

export { reconcileScenePresence, registerActiveCharacter, removeActiveCharacter };
