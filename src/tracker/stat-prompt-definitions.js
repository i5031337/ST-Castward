import { progressionFields } from './progression-fields.js';
import { isPoolStat } from './numeric-stat-bounds.js';

/** Shared editable field meanings for the reader and inline tracker. */
export function describeStatDefinitions(settings) {
    return describeReaderStats(settings);
}

/** Reader instructions describe writable fields; enforcement belongs to the tracker. */
export function describeReaderStats(settings, { initializeNpc = false } = {}) {
    const npcProgression = (settings.npcTemplates || []).map(template =>
        progressionFields(settings, { actor: { npcTemplateId: template.id } }));
    const scopes = initializeNpc ? [['NPC', settings.npcStats]] : [
        ['World', settings.globalStats], ['Player', settings.playerStats], ['NPC', settings.npcStats],
    ];
    const lines = [];
    for (const [scope, stats] of scopes) {
        for (const stat of stats || []) {
            if (!stat?.name || (!initializeNpc && stat.locked)) continue;
            const config = scope === 'Player' ? progressionFields(settings, { isPlayer: true }) : {};
            if (scope === 'Player' && (stat.name === config.levelName || stat.name.toLowerCase() === 'level bonus')) continue;
            if (!initializeNpc && scope === 'NPC' && npcProgression.length
                && npcProgression.every(fields => fields.enabled && fields.levelName === stat.name)) continue;
            const numeric = stat.type === 'number' || stat.type === 'bar';
            const xp = config.enabled && stat.name === config.xpName || scope === 'NPC'
                && npcProgression.some(fields => fields.enabled && stat.name === fields.xpName);
            const pool = isPoolStat(stat) && !xp;
            const parts = [numeric ? (xp ? 'earned experience'
                : pool ? 'pool (current/maximum)' : 'number') : 'text'];
            if (String(stat.purpose ?? '').trim()) parts.push(stat.purpose.trim());
            if (!numeric) {
                if (stat.options?.length) parts.push(`choose: ${stat.options.join(', ')}`);
                if (String(stat.hint ?? '').trim()) parts.push(stat.hint.trim());
                if (Number(stat.maxLength) > 0) parts.push(`up to ${stat.maxLength} characters`);
            }
            if (initializeNpc) {
                if (String(stat.defaultValue ?? '').trim()) parts.push(`Default: ${stat.defaultValue}`);
                if (numeric) {
                    if (String(stat.min ?? '').trim()) parts.push(`Minimum: ${stat.min}`);
                    if (!isPoolStat(stat) && String(stat.maxStatValue ?? '').trim()) parts.push(`Maximum: ${stat.maxStatValue}`);
                }
            }
            lines.push(`- ${scope}.${stat.name}: ${parts.map(part => /[.!?]$/.test(part) ? part : `${part}.`).join(' ')}`);
        }
    }
    return lines.join('\n');
}
