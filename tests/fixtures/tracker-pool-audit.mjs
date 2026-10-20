/** Check raw reader proposals before sanitation can restore an established capacity. */
export function changedPoolMaxima(update, state) {
    const changes = [];
    const inspect = (label, proposed, stored) => {
        for (const [name, before] of Object.entries(stored || {})) {
            const capacity = String(before).match(/^\s*-?\d+(?:\.\d+)?\s*\/\s*(\d+(?:\.\d+)?)\s*$/)?.[1];
            if (capacity === undefined) continue;
            const after = String(proposed?.[name] ?? '').split('/');
            if (after.length === 2 && Number(after[1]) !== Number(capacity)) changes.push(`${label}.${name}`);
            for (const suffix of ['_max', '_maximum', '_cap', '_total']) {
                const value = proposed?.[name + suffix];
                if (value !== undefined && Number(value) !== Number(capacity)) changes.push(`${label}.${name + suffix}`);
            }
        }
    };
    inspect('World', update?.global, state?.global);
    inspect('Player', update?.player?.stats || update?.player, state?.player?.stats);
    for (const actor of update?.characters || []) {
        const stored = state?.characters?.find(known => known.name === actor.name);
        inspect(actor.name, actor.stats || actor, stored?.stats);
    }
    return changes;
}
