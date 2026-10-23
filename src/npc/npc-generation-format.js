import { extractJSON, safeJsonParse } from '../core/utils-format.js';
import { isObject, parseResponse } from '../generation/validate-shape.js';
import { LIMITS } from '../generation/contracts.js';
import { describeReaderStats } from '../tracker/stat-prompt-definitions.js';
import { describeCollections } from '../tracker/collection-prompt-definitions.js';
import { configuredNumericMaximum, isPoolStat } from '../tracker/numeric-stat-bounds.js';

/** Share the reader's JSON recovery, then normalize numeric stat readings before validation. */
export function parseNpcResponse(raw, contract) {
    let value;
    if (typeof raw === 'string') {
        if (raw.length > LIMITS.responseChars) throw new Error('Response too large');
        value = safeJsonParse(extractJSON(raw));
        if (!isObject(value)) throw new Error('Malformed or truncated JSON response');
    } else value = raw;
    value = parseResponse(value);
    if (isObject(value.stats)) {
        for (const stat of contract.choices.flatMap(choice => choice.stats)) {
            const reading = value.stats[stat.name];
            if (['number', 'bar'].includes(stat.type) && typeof reading === 'number' && Number.isFinite(reading)) {
                value.stats[stat.name] = String(reading);
            }
        }
    }
    return value;
}

/** Model-facing meanings and initialization rules; editor and persistence flags stay in the contract. */
export function describeNpcGenerationTemplate(choice) {
    const { id, name, description, fields, stats, collections, progression } = choice;
    const tracker = { npcStats: stats, npcTemplates: [{ id, progression }] };
    const statDefinitions = describeReaderStats(tracker, { initializeNpc: true });
    const capacities = stats.filter(stat => isPoolStat(stat) && configuredNumericMaximum(stat) !== null)
        .map(stat => `- ${stat.name}: maximum capacity ${configuredNumericMaximum(stat)}.`).join('\n');
    const level = stats.find(stat => stat.id === progression.levelFieldId)?.name;
    const xp = stats.find(stat => stat.id === progression.xpFieldId);
    return {
        id, name,
        ...(description?.trim() ? { description } : {}),
        ...(fields.length ? { fields: fields.map(field =>
            `- ${field.id} (${field.label}): ${field.hint?.trim() || 'Brief character detail.'}`).join('\n') } : {}),
        ...(stats.length ? { stats: [statDefinitions, capacities].filter(Boolean).join('\n') } : {}),
        ...(collections.length ? { collections: describeCollections({ collections }, { initialize: true }) } : {}),
        ...(progression.enabled ? { progression: `Initialize ${level} as a positive integer and ${xp?.name} as "0/${configuredNumericMaximum(xp)}".` } : {}),
    };
}
