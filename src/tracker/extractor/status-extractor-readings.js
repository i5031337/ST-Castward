import { progressionFields } from '../progression-fields.js';
import { npcStatsFor, proposedNpcTemplate } from '../../core/npc-templates.js';
import { sameStatReading } from '../stat-reading-equality.js';

const READING = /^\s*(-?\d+(?:\.\d+)?)(?:\s*\/\s*(-?\d+(?:\.\d+)?))?\s*$/;
const FRAGMENT = /_(?:current|cur|now|value|val|maximum|max|total|cap)$/i;

/** Recover one complete numeric reading from surrounding serialization punctuation. */
function repairNumericReadings(values, defs, label, warnings) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return;
    for (const [key, value] of Object.entries(values)) {
        const def = (defs || []).find(def => String(def?.name).toLowerCase() === key.toLowerCase());
        if (!['number', 'bar'].includes(def?.type) || typeof value !== 'string' || READING.test(value)) continue;
        const reading = value.replace(/^[\s{}\[\](),;:"']+|[\s{}\[\](),;:"']+$/g, '');
        const match = reading.match(READING);
        if (!match || ![match[1], match[2] ?? '0'].every(part => Number.isFinite(Number(part)))) continue;
        values[key] = reading;
        warnings.push(`${label} · ${key}: numeric reading ${JSON.stringify(value)} repaired to ${JSON.stringify(reading)}.`);
    }
}

function repairOwnerReadings(owner, defs, label, warnings) {
    if (!owner || typeof owner !== 'object') return;
    repairNumericReadings(owner.stats && typeof owner.stats === 'object' ? owner.stats : owner, defs, label, warnings);
}

function heldValue(values, name) {
    const key = Object.keys(values || {}).find(key => key.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : values[key];
}

function currentReading(value) {
    const match = String(value ?? '').match(READING);
    return match && Number.isFinite(Number(match[1])) ? Number(match[1]) : null;
}

function findCard(cards, name) {
    const lower = String(name ?? '').toLowerCase();
    return cards.find(card => String(card.name ?? '').toLowerCase() === lower
        || (card.aliases || []).some(alias => {
            if (!alias.isRegex) return String(alias.pattern ?? '').toLowerCase() === lower;
            try { return new RegExp(alias.pattern, 'i').test(name); } catch { return false; }
        }));
}

/** Model replies use absolute readings; progression still only accepts earned XP. */
export function normalizeModelReadings(update, state, settings, { cards = [], warnings = [] } = {}) {
    if (!update || typeof update !== 'object') return update;
    const discardDeltas = (owner, key, label) => {
        if (!owner || !Object.hasOwn(owner, key)) return;
        const value = owner[key];
        if (value !== null && value !== undefined && (typeof value !== 'object' || Object.keys(value).length)) {
            warnings.push(`${label} · ${key}: skipped: stat changes must be absolute readings in stats.`);
        }
        delete owner[key];
    };
    const guardXp = (owner, defs, fields, stored, cardStats, label, npc = false) => {
        const name = fields.enabled && fields.xpName;
        const def = name && (defs || []).find(def => def.name === name);
        if (!def || def.locked || !owner || typeof owner !== 'object') return;
        const held = heldValue(stored, name);
        const existing = String(held ?? '').trim() ? held : heldValue(cardStats, name) ?? held;
        const previous = currentReading(existing);
        for (const values of [owner, owner.stats]) {
            if (!values || typeof values !== 'object') continue;
            for (const key of Object.keys(values)) {
                const lower = key.toLowerCase(), base = name.toLowerCase();
                const fragment = key.replace(FRAGMENT, '').toLowerCase() === base;
                if (lower !== base && !fragment) continue;
                // Maximum fragments are refused by the normal stat sanitizer.
                if (lower !== base && /_(?:maximum|max|total|cap)$/i.test(key)) continue;
                if (lower === base && sameStatReading(def, values[key], existing)) {
                    delete values[key];
                    continue;
                }
                const next = currentReading(values[key]);
                let reason = null;
                if (next === null || next < 0) reason = 'XP requires a non-negative numeric reading';
                else if (previous !== null && next < previous) reason = 'earned XP cannot decrease the existing reading';
                else if (previous === null && (!npc || String(existing ?? '').trim())) {
                    reason = 'there is no numeric current XP reading to increase';
                }
                if (reason) {
                    warnings.push(`${label} · ${key}: "${String(values[key])}" skipped: ${reason}.`);
                    delete values[key];
                }
            }
        }
    };

    repairNumericReadings(update.global, settings?.globalStats, 'World', warnings);
    repairOwnerReadings(update.player, settings?.playerStats, 'Player', warnings);
    discardDeltas(update, 'globalDeltas', 'World');
    discardDeltas(update.player, 'deltas', 'Player');
    guardXp(update.player, settings?.playerStats, progressionFields(settings, { isPlayer: true }),
        state?.player?.stats, null, 'Player');
    for (const actor of Array.isArray(update.characters) ? update.characters : []) {
        if (!actor || typeof actor !== 'object') continue;
        const card = findCard(cards, actor.name);
        const held = (state?.characters || []).find(char => [actor.name, card?.name]
            .some(name => name && String(char.name).toLowerCase() === String(name).toLowerCase()));
        const selected = proposedNpcTemplate(held?.npcTemplateId ? held : card, actor);
        const effective = { ...(held || card || actor), npcTemplateId: selected?.id
            || held?.npcTemplateId || card?.npcTemplateId || actor.npcTemplateId };
        const defs = npcStatsFor(effective, settings);
        repairOwnerReadings(actor, defs, actor.name || 'NPC', warnings);
        discardDeltas(actor, 'deltas', actor.name || 'NPC');
        guardXp(actor, defs, progressionFields(settings, { actor: effective }),
            held?.stats, card?.statusOverrides, actor.name || 'NPC', true);
    }
    return update;
}
