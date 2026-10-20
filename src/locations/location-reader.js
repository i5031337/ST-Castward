import { readLocationStore } from './location-store.js';
import { locationExtractionSchema, mentionsLocation } from './location-context.js';
import { promptText } from '../prompts/prompt-texts.js';
import { requestExtraction, coerceToUpdate } from '../tracker/extractor/status-extractor-request.js';

const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const messageTextOf = message => typeof message === 'string' ? message : String(message?.mes ?? message?.content ?? '');

/** Names and complete records keep the place reader independent of stored identifiers. */
function knownPlaceContext(state, messages) {
    const store = readLocationStore(state);
    const current = store.records[store.currentId];
    const chain = [], selected = new Set();
    for (let place = current; place && !selected.has(place.id); place = store.records[place.parentId]) {
        selected.add(place.id);
        chain.push(place);
    }
    const all = Object.values(store.records);
    const mentioned = all.filter(place => !selected.has(place.id)
        && messages.some(message => [place.name, ...place.aliases].some(name => mentionsLocation(message, name))));
    mentioned.forEach(place => selected.add(place.id));
    const ordered = [...chain, ...mentioned, ...all.filter(place => !selected.has(place.id))];
    const directory = [];
    let length = 0;
    for (const place of ordered) {
        const record = { name: place.name, aliases: place.aliases,
            description: place.description, parent: store.records[place.parentId]?.name || '' };
        const size = JSON.stringify(record).length + 1;
        if (length + size > 40000) continue;
        directory.push(record);
        length += size;
    }
    return JSON.stringify({ current: current?.name || null,
        containingPlaces: chain.slice(1).map(place => place.name),
        directory, directoryComplete: directory.length === all.length });
}

/** Build the dedicated user message without mutating chat state. */
export function buildLocationPrompt({ state, messageText, earlier = [], playerName = '' } = {}) {
    const previous = (Array.isArray(earlier) ? earlier : []).slice(-8).map(messageTextOf)
        .filter(Boolean).map(message => message.slice(-2400));
    const latest = String(messageText ?? '');
    return promptText('locationReader', {
        player: String(playerName || '(player character)'),
        knownPlaces: knownPlaceContext(state, [...previous, latest]),
        earlier: previous.join('\n\n'), message: latest,
    });
}

function checkedText(value, label, limit, { empty = true } = {}) {
    if (typeof value !== 'string' || value.trim().length > limit || (!empty && !value.trim())) {
        throw new Error(`Invalid location reading: ${label} must be ${empty ? '' : 'nonempty '}text within ${limit} characters.`);
    }
    return value.trim();
}

function warnExtraFields(value, allowed, path, warnings) {
    const extra = Object.keys(value).filter(key => !allowed.includes(key));
    if (extra.length) warnings.push(`Location reading ignored unsupported fields at ${path}: ${extra.map(key => JSON.stringify(key)).join(', ')}.`);
}

/** Validate supported fields and retain usable facts when a model adds extra fields. */
export function parseLocationReading(raw, { warnings = [] } = {}) {
    if (raw === null || raw === undefined) return null;
    const parsed = coerceToUpdate(raw);
    if (!object(parsed)) throw new Error('Invalid location reading: expected a JSON object.');
    warnExtraFields(parsed, ['places', 'current'], 'response', warnings);
    const output = {};
    if (own(parsed, 'current')) output.current = checkedText(parsed.current, 'current', 200);
    if (own(parsed, 'places')) {
        if (!Array.isArray(parsed.places) || parsed.places.length > 40) {
            throw new Error('Invalid location reading: places must be an array of at most 40 entries.');
        }
        output.places = parsed.places.map((place, index) => {
            if (!object(place)) {
                throw new Error('Invalid location reading: each place needs named place fields.');
            }
            warnExtraFields(place, ['name', 'description', 'aliases', 'parent'], `places[${index}]`, warnings);
            const result = { name: checkedText(place.name, 'place name', 200, { empty: false }) };
            if (own(place, 'description')) result.description = checkedText(place.description, 'description', 4000);
            if (own(place, 'parent')) result.parent = checkedText(place.parent, 'parent', 200);
            if (own(place, 'aliases')) {
                if (!Array.isArray(place.aliases) || place.aliases.length > 30) {
                    throw new Error('Invalid location reading: aliases must be an array of at most 30 names.');
                }
                result.aliases = place.aliases.map(alias => checkedText(alias, 'alias', 200, { empty: false }));
            }
            return result;
        });
    }
    return own(output, 'current') || output.places?.length ? output : null;
}

/** Use the configured reader connection and leave proposal review to the caller. */
export async function requestLocationReading({ state, messageText, earlier = [], trackerSettings = {}, playerName = '' } = {}) {
    const raw = await requestExtraction(
        buildLocationPrompt({ state, messageText, earlier, playerName }),
        locationExtractionSchema(), trackerSettings, promptText('locationReaderSystem'), { usageKind: 'location' },
    );
    try {
        const warnings = [];
        return { output: parseLocationReading(raw, { warnings }), raw, warnings };
    } catch (error) {
        error.output = raw;
        throw error;
    }
}
