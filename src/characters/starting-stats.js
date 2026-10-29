import { configuredNumericMaximum, constrainNumericStat, isPoolStat } from '../tracker/numeric-stat-bounds.js';
import { progressionFieldId } from '../core/progression-config.js';

/** Validate absolute starting readings for either player or NPC creation. */
export function validateStartingStats(values, definitions, config) {
    for (const stat of definitions) {
        const reading = values[stat.name].trim();
        if (!reading) throw new Error(`Missing value for ${stat.name}.`);
        const id = progressionFieldId(stat);
        if (config.enabled && id === config.levelFieldId && (!/^\d+$/.test(reading)
            || !Number.isSafeInteger(Number(reading)) || Number(reading) < 1)) {
            throw new Error('Initial Level must be a positive integer.');
        }
        if (config.enabled && id === config.xpFieldId
            && reading !== `0/${configuredNumericMaximum(stat)}`) {
            throw new Error('Initial XP must be zero with its configured capacity.');
        }
        if (stat.type === 'number' || stat.type === 'bar') {
            if (!/^-?\d+(?:\.\d+)?(?:\/-?\d+(?:\.\d+)?)?$/.test(reading)) throw new Error(`Invalid numeric stat: ${stat.name}.`);
            const [current, maximum] = reading.split('/').map(Number);
            const cap = isPoolStat(stat) && !String(stat.maxStatValue ?? '').trim()
                ? null : configuredNumericMaximum(stat);
            if (isPoolStat(stat) && (!Number.isFinite(maximum) || maximum <= 0 || current < 0
                || current > maximum || cap !== null && maximum > cap)) throw new Error(`Invalid pool: ${stat.name}.`);
            if (!isPoolStat(stat) && reading.includes('/')) throw new Error(`Use a plain rating for ${stat.name}.`);
            if (String(constrainNumericStat(stat, reading, '')) !== reading) throw new Error(`Out of bounds: ${stat.name}.`);
        } else if (stat.options?.length && !stat.options.includes(reading)
            || Number(stat.maxLength) > 0 && reading.length > Number(stat.maxLength)) {
            throw new Error(`Invalid value for ${stat.name}.`);
        }
        values[stat.name] = reading;
    }
    return values;
}
