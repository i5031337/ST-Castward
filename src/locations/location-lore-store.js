import { readLocationStore } from './location-store.js';
import { inOrder } from '../lore/lore-write-queue.js';

function locationContent(place, records) {
    const path = [];
    for (let current = place; current; current = records[current.parentId]) path.unshift(current.name);
    return [`Place: ${place.name}`, `Location: ${path.join(' → ')}`, place.description].filter(Boolean).join('\n');
}

/** Mirror chat-owned places without adopting or rewriting other lore entries. */
export function createLocationLoreStore({ load, save, allocate }) {
    return async function sync(world, state, owner, isCurrent = () => true) {
        if (!world || !owner || !isCurrent()) return [];
        const store = readLocationStore(state);
        return inOrder(world, async () => {
            if (!isCurrent()) return [];
            const loaded = await load(world);
            if (!isCurrent()) return [];
            if (!loaded?.entries) throw new Error(`Could not load lorebook “${world}”.`);
            // The host may return its cached object. Work on a private copy until save.
            const data = structuredClone(loaded);
            const owned = new Map();
            let changed = false;
            for (const [uid, entry] of Object.entries(data.entries)) {
                if (entry.castwardPlace?.owner !== owner) continue;
                const id = entry.castwardPlace.id;
                if (!Object.hasOwn(store.records, id) || owned.has(id)) {
                    delete data.entries[uid];
                    changed = true;
                } else owned.set(id, entry);
            }
            const entries = [];
            for (const place of Object.values(store.records)) {
                let entry = owned.get(place.id);
                if (!entry) {
                    entry = allocate(world, data);
                    if (!entry) throw new Error('SillyTavern could not allocate a place lore entry.');
                    Object.assign(entry, { constant: false, vectorized: false, disable: false,
                        matchWholeWords: true, useProbability: false,
                        excludeRecursion: true, preventRecursion: true,
                        castwardPlace: { owner, id: place.id } });
                    changed = true;
                }
                const fields = { comment: place.name, key: [place.name, ...place.aliases],
                    content: locationContent(place, store.records) };
                for (const [field, value] of Object.entries(fields)) {
                    if (JSON.stringify(entry[field]) === JSON.stringify(value)) continue;
                    entry[field] = value;
                    changed = true;
                }
                entries.push({ ...structuredClone(entry), world });
            }
            if (!isCurrent()) return [];
            if (changed) await save(world, data);
            return isCurrent() ? entries : [];
        });
    };
}
