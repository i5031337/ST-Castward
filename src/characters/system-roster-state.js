import { readLocationStore } from '../locations/location-store.js';
import { normalizeMemoryStore } from '../core/profile-memories.js';
import { readNpcMemories, writeNpcMemories } from '../tracker/npc-memories.js';

const STATE = 'sillynpc_status_state';
const PENDING = 'sillynpc_roster_state_seed';
const PLACE_SEED = 'sillynpc_roster_places_seed';
const PLACE_READ = 'sillynpc_roster_places_read';
const MEMORY_READS = 'sillynpc_roster_memory_reads';

export function carriesNpcMemories(settings, name = settings.activeSystem) {
    return settings.statusTracker.presets?.[name]?.definition?.memories?.carryOver === true;
}

/** Imported knowledge has no reply provenance in its destination conversation. */
export function portableMemories(store) {
    const normalized = normalizeMemoryStore(store, 500);
    const convert = values => values.map(({ id, text, fieldId }) => ({ id, text,
        ...(fieldId ? { fieldId } : {}), manual: true }));
    return { entries: convert(normalized.entries), archive: convert(normalized.archive) };
}

function seedState(metadata) {
    return metadata[STATE] || (metadata[PENDING] ||= {});
}

/** Defer new tracker containers until the loader has seeded the chat's own player. */
export function applyRosterStateSeed(state, metadata) {
    const seed = metadata?.[PENDING];
    if (!seed) return false;
    if (seed.locations) state.locations = structuredClone(seed.locations);
    if (seed.npcMemories) state.npcMemories = { ...seed.npcMemories, ...state.npcMemories };
    delete metadata[PENDING];
    return true;
}

export function captureRosterState(roster, metadata, carryMemories = false) {
    const state = metadata[STATE] || metadata[PENDING];
    let changed = false;
    if (roster.reusePlaces && state?.locations) {
        const records = readLocationStore(state).records;
        const signature = JSON.stringify(records);
        if (metadata[PLACE_READ] !== signature) {
            roster.places = structuredClone(records);
            metadata[PLACE_READ] = signature;
            changed = true;
        }
    }
    if (roster.enabled && carryMemories) {
        metadata[MEMORY_READS] ||= {};
        roster.memories ||= {};
        for (const card of metadata.sillynpc_npcs || []) {
            if (!card.rosterSourceId) continue;
            const store = portableMemories(readNpcMemories(state, card));
            const signature = JSON.stringify(store);
            if (metadata[MEMORY_READS][card.id] === signature) continue;
            roster.memories[card.rosterSourceId] = store;
            metadata[MEMORY_READS][card.id] = signature;
            changed = true;
        }
    }
    return changed;
}

export function seedRosterMemories(roster, metadata, card, carryMemories = false) {
    if (!carryMemories || !roster.memories?.[card.rosterSourceId]) return;
    const store = portableMemories(roster.memories[card.rosterSourceId]);
    writeNpcMemories(seedState(metadata), card, store);
    metadata[MEMORY_READS] ||= {};
    metadata[MEMORY_READS][card.id] = JSON.stringify(store);
}

export function removeSeededMemories(metadata, ids) {
    for (const id of ids) {
        for (const state of [metadata[STATE], metadata[PENDING]]) {
            if (state?.npcMemories) delete state.npcMemories[`id:${id}`];
        }
        if (metadata[MEMORY_READS]) delete metadata[MEMORY_READS][id];
    }
}

/** Place IDs are chat-scoped; copy the graph, retaining parent IDs and lore references. */
export function seedRosterPlaces(roster, metadata, context, systemName, locationsEnabled = true) {
    let changed = false;
    const previous = metadata[PLACE_SEED];
    const started = context.chat?.some(message => message.is_user && !message.is_system);
    if (started) {
        if (roster?.reusePlaces && previous?.system !== systemName) {
            metadata[PLACE_SEED] = { system: systemName, ids: [] };
            return true;
        }
        return false;
    }
    if (previous && previous.system !== systemName) {
        const state = seedState(metadata);
        if (state.locations) {
            for (const id of previous.ids) delete state.locations.records?.[id];
            state.locations = readLocationStore(state);
        }
        delete metadata[PLACE_SEED];
        delete metadata[PLACE_READ];
        changed = true;
    }
    if (!roster?.reusePlaces || metadata[PLACE_SEED]?.system === systemName) return changed;
    const state = seedState(metadata);
    metadata[PLACE_SEED] = { system: systemName, ids: [] };
    // A user-created map takes precedence over a saved starting map.
    if (Object.keys(readLocationStore(state).records).length) return true;
    const store = readLocationStore({ locations: { records: roster.places || {} } });
    store.enabled = locationsEnabled !== false;
    state.locations = store;
    metadata[PLACE_SEED].ids = Object.keys(store.records);
    metadata[PLACE_READ] = JSON.stringify(store.records);
    return true;
}

export function clearRosterState(roster) {
    delete roster.places;
    delete roster.memories;
}
