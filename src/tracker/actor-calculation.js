import { npcStatsFor, npcTemplateFor } from '../core/npc-templates.js';
import { getInitialStatValue, combineStatValue } from './stat-value-utils.js';
import { findMatchingStatKey } from './stat-field-utils.js';
import { calculateFieldValue } from './stat-field-calculation.js';
import { groupIncomingStats } from './status-update-parser.js';
import { progressionFields } from './progression-fields.js';
import { progressXp } from './progression.js';

/** Seed a detached NPC from captured cards, assignments and the selected System. */
export function buildActorState({ name, state, tracker, system = null, cards = [] }) {
    const actor = { name, npcTemplateId: '', stats: {}, collections: {} };
    const card = cards.find(entry => (entry.name || '').toLowerCase() === name.toLowerCase());
    if (card?.id) actor.id = card.id;
    const remembered = state.npcTemplateAssignments?.[card?.id || name.toLowerCase()];
    const template = npcTemplateFor(remembered ? { npcTemplateId: remembered } : card, system);
    if (template) actor.npcTemplateId = template.id;
    for (const stat of npcStatsFor(actor, tracker, system)) {
        let value = stat.defaultValue || '';
        const override = card?.statusOverrides?.[stat.name];
        if (override !== undefined && String(override).trim() !== '') value = override;
        actor.stats[stat.name] = getInitialStatValue(value);
    }
    if (card?.statusCollections) actor.collections = structuredClone(card.statusCollections);
    return actor;
}

/** Calculate NPC stat readings and local diagnostics without changing the card or actor. */
export function calculateActorStats({ actor, update, tracker, system = null,
    verbatim = false, progressionResolved = false, skipProgression = false }) {
    const next = structuredClone(actor);
    const warnings = [], refusedValues = [], changedStatKeys = [];
    const definitions = npcStatsFor(next, tracker, system);
    const validKeys = new Set(definitions.map(stat => stat.name.toLowerCase()));
    const collectionIds = new Set((tracker.collections || []).map(collection => collection.id.toLowerCase()));
    const metadata = new Set(['name', 'stats', 'boundto', 'collections', 'npctemplateid', 'offstage', 'profile']);
    const groups = groupIncomingStats(update.stats || update,
        name => {
            const matched = findMatchingStatKey(next.stats, name) || name;
            return validKeys.has(matched.toLowerCase()) ? matched : null;
        },
        key => validKeys.has(key.toLowerCase()),
        key => metadata.has(key.toLowerCase()) || collectionIds.has(key.toLowerCase()),
        key => warnings.push(`${update.name} · ${key}: skipped: no configured stat matches this name.`));

    const { xpName, levelName, enabled } = progressionFields(tracker, { actor: next, system });
    const xpGroup = groups.get(xpName);
    const progression = enabled && !verbatim && !progressionResolved && !skipProgression && xpGroup
        ? progressXp(next.stats[xpName], xpGroup.whole ?? xpGroup.current, next.stats[levelName]) : null;
    if (progression) {
        groups.set(xpName, { whole: progression.xp });
        if (progression.levelsGained > 0) groups.set(levelName, { whole: progression.level });
    }
    for (const [key, group] of groups) {
        const definition = definitions.find(stat => stat.name.toLowerCase() === key.toLowerCase());
        const merged = combineStatValue(next.stats[key], group, definition, { verbatim });
        const incoming = group.current ?? group.whole;
        const wanted = String(incoming ?? '').split('/')[0].trim();
        const used = String(merged ?? '').split('/')[0].trim();
        if (wanted && Number.isFinite(Number(wanted)) && Number(wanted) !== Number(used)) {
            warnings.push(`${update.name} · ${key}: "${incoming}" adjusted: exceeds the pool maximum; using "${merged}".`);
        }
        const reading = calculateFieldValue(definition, merged, next.stats[key]);
        next.stats[key] = reading.value;
        warnings.push(...reading.warnings.map(warning => `${update.name} · ${key}: ${warning}`));
        refusedValues.push(...reading.refusedValues);
        changedStatKeys.push(key);
    }
    return { actor: next, warnings, refusedValues, changedStatKeys };
}
