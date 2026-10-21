const text = value => typeof value === 'string' ? value.trim() : '';
const key = value => text(value).normalize('NFKC').toLowerCase();
const safeId = value => typeof value === 'string' && value === text(value) && value.length > 0
    && value.length <= 200 && !['__proto__', 'constructor', 'prototype'].includes(value);

export function normalizeLocationRecord(input, id = input?.id) {
    const name = text(input?.name);
    const seen = new Set([key(name)]);
    const aliases = [];
    for (const value of Array.isArray(input?.aliases) ? input.aliases : []) {
        const alias = text(value);
        if (alias && !seen.has(key(alias))) { aliases.push(alias); seen.add(key(alias)); }
    }
    return { id: text(id), name, aliases, description: text(input?.description),
        parentId: text(input?.parentId), lorebook: text(input?.lorebook),
        loreEntryId: typeof input?.loreEntryId === 'number' && Number.isInteger(input.loreEntryId) && input.loreEntryId >= 0
            ? input.loreEntryId : null };
}

/** Locations belong to the chat, independently of persona and scene membership. */
export function readLocationStore(state) {
    const source = state?.locations;
    const records = {};
    for (const [id, value] of Object.entries(source?.records || {})) {
        if (!safeId(id) || !value || typeof value !== 'object' || !text(value.name)) continue;
        records[id] = normalizeLocationRecord(value, id);
    }
    for (const record of Object.values(records)) {
        const visited = new Set([record.id]);
        let parent = record.parentId;
        while (parent) {
            if (!Object.hasOwn(records, parent) || visited.has(parent)) { record.parentId = ''; break; }
            visited.add(parent);
            parent = records[parent].parentId;
        }
    }
    return { enabled: source?.enabled === true,
        currentId: Object.hasOwn(records, source?.currentId) ? source.currentId : '', records };
}

/** Records from the outermost parent to the confirmed current place. */
export function currentLocationTrail(state) {
    const store = readLocationStore(state);
    if (!store.enabled) return [];
    const path = [];
    for (let id = store.currentId; id; id = store.records[id]?.parentId) path.unshift(store.records[id]);
    return path;
}

export function currentLocationPath(state) {
    return currentLocationTrail(state).map(place => place.name);
}

export function createLocationId() {
    return `place-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function validateRecord(store, record) {
    if (!safeId(record.id)) throw new Error('Invalid place ID.');
    if (!record.name || record.name.length > 200) throw new Error('A place needs a name of at most 200 characters.');
    if (record.description.length > 4000) throw new Error('Keep the place description within 4000 characters.');
    if (record.aliases.length > 30 || record.aliases.some(alias => alias.length > 200)) {
        throw new Error('Use at most 30 aliases of at most 200 characters each.');
    }
    const names = new Set([record.name, ...record.aliases].map(key));
    for (const other of Object.values(store.records)) {
        if (other.id !== record.id && [other.name, ...other.aliases].some(name => names.has(key(name)))) {
            throw new Error(`The place name or alias already belongs to ${other.name}.`);
        }
    }
    const seen = new Set([record.id]);
    let parentId = record.parentId;
    while (parentId) {
        if (seen.has(parentId)) throw new Error('A place cannot contain itself, directly or indirectly.');
        if (!Object.hasOwn(store.records, parentId)) throw new Error('The parent place does not exist.');
        seen.add(parentId);
        parentId = store.records[parentId].parentId;
    }
}

/** All edits return a new state; callers own persistence and chat-boundary checks. */
export function editLocation(state, input, { makeId = createLocationId } = {}) {
    if (input?.id !== undefined && typeof input.id !== 'string') throw new Error('Invalid place ID.');
    for (const field of ['name', 'description', 'parentId', 'lorebook']) {
        if (Object.hasOwn(input || {}, field) && typeof input[field] !== 'string') {
            throw new Error(`The place ${field} must be text.`);
        }
    }
    if (Object.hasOwn(input || {}, 'aliases') && (!Array.isArray(input.aliases)
        || input.aliases.some(alias => typeof alias !== 'string'))) throw new Error('Place aliases must be a list of names.');
    if (Object.hasOwn(input || {}, 'loreEntryId') && input.loreEntryId !== null
        && (!Number.isInteger(input.loreEntryId) || input.loreEntryId < 0)) throw new Error('Invalid lore entry ID.');
    const store = readLocationStore(state);
    const existingId = text(input?.id);
    if (existingId && !Object.hasOwn(store.records, existingId)) throw new Error('The place no longer exists.');
    const id = existingId || makeId();
    if (!safeId(id)) throw new Error('Invalid place ID.');
    if (!existingId && Object.hasOwn(store.records, id)) throw new Error('The new place ID already exists.');
    const record = normalizeLocationRecord({ ...store.records[id], ...input }, id);
    validateRecord(store, record);
    store.records[id] = record;
    return { ...state, locations: store };
}

export function deleteLocation(state, id) {
    const store = readLocationStore(state);
    delete store.records[id];
    for (const record of Object.values(store.records)) if (record.parentId === id) record.parentId = '';
    if (store.currentId === id) store.currentId = '';
    return { ...state, locations: store };
}

export function setCurrentLocation(state, id = '') {
    const store = readLocationStore(state);
    if (typeof id !== 'string') throw new Error('Invalid current place ID.');
    if (id && !Object.hasOwn(store.records, id)) throw new Error('The current place does not exist.');
    store.currentId = id;
    return { ...state, locations: store };
}

export function setLocationsEnabled(state, enabled) {
    return { ...state, locations: { ...readLocationStore(state), enabled: enabled === true } };
}
