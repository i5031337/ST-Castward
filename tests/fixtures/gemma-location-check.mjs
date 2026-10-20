/** A current room also places the player inside its recorded containing venue. */
export function currentPlaceContains(rows, state, expected) {
    const matches = name => String(name || '').toLowerCase().includes(expected.toLowerCase());
    const records = { ...state?.locations?.records };
    for (const row of rows) {
        if (row.location?.record) records[row.location.id] = row.location.record;
    }
    return rows.filter(row => row.kind === 'location-current').some(row => {
        if (matches(row.actor)) return true;
        const seen = new Set();
        for (let id = row.location?.id; id && !seen.has(id);) {
            seen.add(id);
            const place = records[id];
            if (!place) break;
            if (matches(place.name)) return true;
            id = place.parentId;
        }
        return false;
    });
}
