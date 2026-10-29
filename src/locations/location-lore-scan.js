import { currentLocationTrail, readLocationStore } from './location-store.js';

/** Chat-owned entries participate in the host scan; the current setting stays available. */
export function applyLocationLore(lore, entries, state, owner) {
    for (const key of ['chatLore', 'personaLore', 'characterLore', 'globalLore']) {
        if (!Array.isArray(lore?.[key])) continue;
        const external = lore[key].filter(entry => !entry.castwardPlace);
        lore[key].splice(0, lore[key].length, ...external);
    }
    const store = readLocationStore(state);
    if (!store.enabled || !owner || !Array.isArray(lore?.chatLore)) return 0;
    const current = new Set(currentLocationTrail(state).map(place => place.id));
    const seen = new Set();
    for (const entry of entries || []) {
        const marker = entry.castwardPlace;
        if (marker?.owner !== owner || !Object.hasOwn(store.records, marker.id) || seen.has(marker.id)) continue;
        const copy = structuredClone(entry);
        if (current.has(marker.id)) {
            Object.assign(copy, { constant: true, ignoreBudget: true, useProbability: false,
                group: '', delay: 0, cooldown: 0, sticky: 0, delayUntilRecursion: false });
        }
        lore.chatLore.push(copy);
        seen.add(marker.id);
    }
    return seen.size;
}
