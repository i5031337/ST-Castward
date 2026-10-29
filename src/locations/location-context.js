import { readLocationStore, currentLocationTrail } from './location-store.js';

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

/** Descriptions arrive through lore; the scene marker distinguishes the current setting. */
export function buildLocationSceneContext(state) {
    const path = currentLocationTrail(state).map(place => place.name);
    return path.length ? `Last confirmed setting: ${path.join(' → ')}` : '';
}

/** The tracker classifies movement; a separate reader will supply place details. */
export function buildLocationReaderNotes(state) {
    const store = readLocationStore(state);
    if (!store.enabled) return '';
    const current = store.records[store.currentId];
    const path = [], seen = new Set();
    for (let place = current; place && !seen.has(place.id); place = store.records[place.parentId]) {
        seen.add(place.id);
        path.push({ name: place.name, ...(place.aliases.length ? { aliases: place.aliases } : {}) });
    }
    return [
        '\n### SCENE LOCATION',
        'Compare the player’s final location with the recorded location.',
        'Put "locationChanged" at the top level as a JSON boolean.',
        'Use true when the player finishes elsewhere or leaves for an unknown destination.',
        'Entering a different room counts as changing place.',
        'Use false when the player finishes in the recorded place, even if another character travels.',
        'Plans, invitations, rumours, and mentions leave the player’s location unchanged.',
        'Use false when the recorded location is unknown.',
        'Recorded location (current place first, then containing places): ' + JSON.stringify(path.length ? path : null),
    ].join('\n');
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
