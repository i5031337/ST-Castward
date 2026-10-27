/** Name aliases shared by model readings and tracker edits. */
const STAT_SYNONYMS = {
    // NOTE: deliberately no *_max / *_current entries here. Those address one half of
    // a "cur/max" value and are handled by splitStatKeyPart(); listing them as synonyms
    // made hp_max and hp_current both write the whole HP stat, so whichever the model
    // emitted last silently destroyed the other.
    'hp': ['health', 'hitpoints', 'life'],
    'energy': ['mana', 'mp', 'essence', 'power', 'stamina'],
    'condition': ['status', 'state', 'conditions', 'status_effects', 'effect']
};

/** The values a field is allowed to hold, or an empty list when it allows anything. */
export function allowedValues(def) {
    if (def?.type === 'number' || def?.type === 'bar') return [];
    return (def?.options || [])
        .map(value => String(value ?? '').trim())
        .filter(Boolean);
}

/**
 * Finds the most likely existing key for a given stat name, handling synonyms.
 */
export function findMatchingStatKey(existingStats, searchKey) {
    const keys = Object.keys(existingStats);
    const searchLower = searchKey.toLowerCase();
    
    // 1. Exact match
    const exact = keys.find(k => k.toLowerCase() === searchLower);
    if (exact) return exact;
    
    // 2. Synonym match
    for (const [canonical, synonyms] of Object.entries(STAT_SYNONYMS)) {
        if (searchLower === canonical || synonyms.includes(searchLower)) {
            // Check if any of our existing keys are in this synonym group
            const match = keys.find(k => {
                const kLower = k.toLowerCase();
                return kLower === canonical || synonyms.includes(kLower);
            });
            if (match) return match;
        }
    }
    
    // 3. Fuzzy prefix match (e.g. "hp_current" matches "hp")
    const prefixMatch = keys.find(k => {
        const kLower = k.toLowerCase();
        return searchLower.startsWith(kLower) || kLower.startsWith(searchLower);
    });
    if (prefixMatch) return prefixMatch;

    return null;
}

