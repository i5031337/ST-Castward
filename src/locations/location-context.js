import { readLocationStore } from './location-store.js';

const wordCharacter = value => !!value && /[\p{L}\p{N}_]/u.test(value);

/** Names are literal data; punctuation in an alias never becomes a regular expression. */
export function mentionsLocation(text, name) {
    const haystack = String(text ?? '').toLowerCase();
    const needle = String(name ?? '').trim().toLowerCase();
    if (!needle) return false;
    let from = 0;
    while (from <= haystack.length) {
        const at = haystack.indexOf(needle, from);
        if (at < 0) return false;
        const before = Array.from(haystack.slice(0, at)).at(-1);
        const after = Array.from(haystack.slice(at + needle.length))[0];
        if ((!wordCharacter(needle[0]) || !wordCharacter(before))
            && (!wordCharacter(needle.at(-1)) || !wordCharacter(after))) return true;
        from = at + needle.length;
    }
    return false;
}

/** Include the player's latest input even when several narrator messages followed it. */
export function recentLocationMessages(chat = []) {
    const messages = Array.isArray(chat) ? chat.filter(message => !message?.is_system && typeof message?.mes === 'string') : [];
    const recent = messages.slice(-6);
    const lastUser = messages.findLast(message => message.is_user);
    if (lastUser && !recent.includes(lastUser)) recent.unshift(lastUser);
    return recent.map(message => message.mes.slice(-1200));
}

function selectedPlaces(store, messages, limit = 12) {
    const records = Object.values(store.records);
    const identities = new Map();
    for (const place of records) {
        for (const name of [place.name, ...place.aliases]) {
            const key = name.toLowerCase();
            if (!identities.has(key)) identities.set(key, new Set());
            identities.get(key).add(place.id);
        }
    }
    const selected = new Map();
    const addChain = id => {
        const visited = new Set();
        for (let depth = 0; id && depth < 6 && selected.size < limit; depth++) {
            if (visited.has(id)) break;
            visited.add(id);
            const place = store.records[id];
            if (!place) break;
            selected.set(id, place);
            id = place.parentId;
        }
    };
    addChain(store.currentId);
    const text = messages.map(message => String(message ?? '').slice(-1200)).slice(-7).join('\n');
    for (const place of records) {
        const matched = [place.name, ...place.aliases].some(name =>
            identities.get(name.toLowerCase())?.size === 1 && mentionsLocation(text, name));
        if (matched) addChain(place.id);
    }
    return [...selected.values()];
}

function promptPlace(place, store, description = true, descriptionLimit = 1000) {
    return {
        name: place.name,
        ...(place.aliases.length ? { aliases: place.aliases.slice(0, 8) } : {}),
        ...(store.records[place.parentId] ? { parent: store.records[place.parentId].name } : {}),
        ...(description && place.description ? { description: place.description.slice(0, descriptionLimit) } : {}),
    };
}

/** Plain scene facts for the narrator; internal place references stay with the reader. */
export function buildLocationSceneContext(state, messages = []) {
    const store = readLocationStore(state);
    if (!store.enabled) return '';
    const places = selectedPlaces(store, messages);
    if (!places.length) return '';
    const lines = [];
    for (const place of places) {
        const details = [];
        if (place.id === store.currentId) details.push('last confirmed setting');
        const parent = store.records[place.parentId];
        if (parent) details.push(`in ${parent.name}`);
        if (place.aliases.length) details.push(`also known as ${place.aliases.slice(0, 8).join(', ')}`);
        const description = place.description.slice(0, 1000).replace(/\s+/g, ' ').trim();
        const line = `- ${place.name}${details.length ? ` (${details.join('; ')})` : ''}${description ? ` — ${description}` : ''}`;
        if (lines.join('\n').length + line.length > 14000) break;
        lines.push(line);
    }
    return lines.length ? `Known places:\n${lines.join('\n')}` : '';
}

/** A bounded name directory keeps stored IDs out of reader requests. */
export function buildLocationReaderNotes(state, messageText, earlier = []) {
    const store = readLocationStore(state);
    if (!store.enabled) return '';
    const selected = selectedPlaces(store, [...earlier, messageText]);
    const order = new Map(selected.map(place => [place.id, place]));
    for (const place of Object.values(store.records)) order.set(place.id, place);
    const full = new Set(selected.map(place => place.id));
    const directory = [];
    for (const place of order.values()) {
        const next = promptPlace(place, store, full.has(place.id), 4000);
        if (directory.length >= 80 || JSON.stringify([...directory, next]).length > 24000) break;
        directory.push(next);
    }
    return [
        '\n### PLACES',
        'Note when the current scene’s location changes.',
        'Set "locations.current" to the opening setting or the place reached.',
        'Record newly established places and details in "locations.places".',
        'Put "locations" beside "global", "player", and "characters".',
        '{"global":{},"player":{},"characters":[],"locations":{"places":[{"name":"<parent place>"},{"name":"<place>","parent":"<parent place>","description":"<complete established description>","aliases":["<alternate name>"]}],"current":"<place>"}}',
        'Replace placeholders with established story facts.',
        'Identify places by name or a known alias.',
        'Include changed details.',
        'Write a complete description that preserves established facts.',
        'Use "parent" for the containing place.',
        'Include newly discovered parents in "places".',
        'Use "" for an explicit departure with unknown destination.',
        'Omit unchanged "current" and "parent" fields.',
        'Plans, rumours, invitations, and mentions remain context until established.',
        directory.length < order.size ? 'The directory is partial.' : '',
        'Known places: ' + JSON.stringify({ current: store.records[store.currentId]?.name || '', places: directory }),
    ].filter(Boolean).join('\n');
}

export function locationExtractionSchema() {
    const string = () => ({ type: 'string' });
    return {
        type: 'object',
        properties: {
            places: { type: 'array', items: {
                type: 'object', required: ['name'],
                properties: {
                    name: string(), aliases: { type: 'array', items: string() },
                    description: string(), parent: string(),
                },
            } },
            current: string(),
        },
    };
}
