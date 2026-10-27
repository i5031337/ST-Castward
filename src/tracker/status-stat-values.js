import { progressionFields } from './progression-fields.js';
import { npcStatsFor, proposedNpcTemplate } from '../core/npc-templates.js';
import { getSettings } from '../core/settings.js';
import { ceilingFromValue } from '../core/utils-format.js';
import { isNumericStat, promptCeiling } from './stat-value-utils.js';
import { allowedValues, findMatchingStatKey } from './stat-field-utils.js';
import { configuredNumericMaximum, keepNumericMaximum, isPoolStat } from './numeric-stat-bounds.js';
import { sameStatReading } from './stat-reading-equality.js';

export function bind(deps) {
/**
 * What a model's reply may not do to the stats, taken out before it is applied.
 *
 * Only for replies from a model - the tracker's reader and the inline block. Your own edits
 * never come through here, so typing "120/150" on the sheet still sets a ceiling.
 *
 * - Blank NPC fields may be initialized, including locked fields and Level.
 *   Configured level growth and direct edits may change locked fields later.
 * - New NPC pools take their individual maximum from the initial reading.
 *   Ordinary reader updates retain the existing maximum;
 *   a configured starting maximum also bounds values saved as plain numbers.
 *
 * @param {object} update Changed in place, and returned.
 * @param {object} state The state the reply is applied to.
 */
function sanitizeModelUpdate(update, state, trackerSettings = getSettings().statusTracker, { warnings = [] } = {}) {
    if (!update || typeof update !== 'object') return update;
    // Model replies never select level-derived stat growth or write narrative bonuses.

    const clean = (stats, defs, stored, { npc = false, player = false, cardStats = {}, progression = {}, owner = 'World' } = {}) => {
        if (!stats || typeof stats !== 'object') return;
        for (const key of Object.keys(stats)) {
            const def = (defs || []).find(d => String(d?.name).toLowerCase() === key.toLowerCase());
            const held = stored?.[findMatchingStatKey(stored || {}, key) || key];
            const cardHeld = cardStats?.[findMatchingStatKey(cardStats || {}, key) || key];
            const existing = String(held ?? '').trim() ? held : cardHeld ?? held;
            if (def && sameStatReading(def, stats[key], existing)) {
                delete stats[key];
                continue;
            }
            const reject = reason => {
                warnings.push(`${owner} · ${key}: "${String(stats[key])}" skipped: ${reason}.`);
                delete stats[key];
            };
            const fragment = key.replace(/_(?:current|cur|now|value|val|maximum|max|total|cap)$/i, '');
            const levelField = progression.enabled && fragment.toLowerCase() === progression.levelName?.toLowerCase();
            const levelHeld = stored?.[findMatchingStatKey(stored || {}, fragment) || fragment];
            const levelCardHeld = cardStats?.[findMatchingStatKey(cardStats || {}, fragment) || fragment];
            if (levelField && (!npc || key.toLowerCase() !== progression.levelName.toLowerCase()
                || String(levelHeld ?? '').trim() || String(levelCardHeld ?? '').trim())) {
                reject('Level is managed by XP progression'); continue;
            }
            const maxFragment = key.match(/^(.*)_(?:maximum|max|total|cap)$/i);
            if (!def && maxFragment && (defs || []).some(d => d?.name?.toLowerCase() === maxFragment[1].toLowerCase()
                && isNumericStat(d))) {
                reject('the reader cannot change a numeric maximum');
                continue;
            }
            if (!def) continue;
            if (isNumericStat(def) && !String(stats[key] ?? '').trim()) {
                reject('numeric readings must not be blank; omit unchanged fields'); continue;
            }
            if (levelField && (!Number.isSafeInteger(Number(stats[key])) || Number(stats[key]) < 1)) {
                reject('initial Level must be a positive whole number'); continue;
            }
            if (def.locked) {
                // A locked NPC stat may be seeded once, but a value already on its
                // card must also protect it while the character is off stage.
                if (!npc || String(held ?? '').trim() || String(cardHeld ?? '').trim()) {
                    reject('this stat is locked');
                    continue;
                }
            }
            const incoming = String(stats[key] ?? '');
            if (isNumericStat(def)) {
                const storedValue = String(held ?? '').trim() ? held : cardHeld;
                const initializing = npc && !String(held ?? '').trim() && !String(cardHeld ?? '').trim();
                if (initializing && isPoolStat(def) && def.name !== progression.xpName) {
                    // A bare initial pool reading means a full pool of that size.
                    const reading = incoming.trim();
                    stats[key] = /^-?\d+(?:\.\d+)?$/.test(reading) ? `${reading}/${reading}` : incoming;
                    continue;
                }
                const fixedCap = !isPoolStat(def) && !isPoolStat(def, storedValue) ? configuredNumericMaximum(def) : null;
                const plainReading = !isPoolStat(def) && String(storedValue ?? '').trim() && ceilingFromValue(storedValue) === null;
                const liveCap = plainReading ? '' : fixedCap ?? promptCeiling(def, storedValue);
                stats[key] = keepNumericMaximum(incoming, liveCap);
                const requestedCap = incoming.split('/')[1]?.trim();
                if (requestedCap !== undefined && requestedCap !== String(stats[key]).split('/')[1]?.trim()) {
                    warnings.push(`${owner} · ${key}: maximum "${requestedCap}" skipped: the reader keeps the existing maximum (using "${stats[key]}").`);
                }
            }
        }
    };

    clean(update.global, trackerSettings.globalStats, state?.global);
    if (update.player && typeof update.player === 'object') {
        // applyUpdate reads update.player.stats, or update.player itself when it is flat.
        const playerStats = update.player.stats && typeof update.player.stats === 'object'
            ? update.player.stats : update.player;
        clean(playerStats, trackerSettings.playerStats, state?.player?.stats, { player: true, owner: 'Player', progression: progressionFields(trackerSettings, { isPlayer: true }) });
    }
    for (const actor of Array.isArray(update.characters) ? update.characters : []) {
        const current = (state?.characters || [])
            .find(c => String(c?.name).toLowerCase() === String(actor?.name).toLowerCase());
        const selected = proposedNpcTemplate(current?.npcTemplateId ? current : deps.findCardForName(actor?.name), actor);
        clean(actor?.stats && typeof actor.stats === 'object' ? actor.stats : actor,
            npcStatsFor({ npcTemplateId: selected?.id }, trackerSettings), current?.stats,
            { npc: true, owner: actor.name || 'NPC', cardStats: deps.findCardForName(actor?.name)?.statusOverrides,
                progression: progressionFields(trackerSettings, { actor: { npcTemplateId: selected?.id
                    || current?.npcTemplateId || deps.findCardForName(actor?.name)?.npcTemplateId || actor?.npcTemplateId } }) });
    }
    return update;
}

/** The configured NPC fields, included in both tracker prompts for new arrivals. */
function describeNpcStatFields(trackerSettings) {
    return (trackerSettings?.npcStats || [])
        .filter(stat => stat?.name)
        .map(stat => {
            const details = [isNumericStat(stat) ? 'number' : 'text'];
            if (String(stat.purpose ?? '').trim()) details.push(`purpose: ${stat.purpose.trim()}`);
            const choices = allowedValues(stat);
            if (choices.length) details.push(`choose one of ${choices.join(', ')}`);
            else if (isNumericStat(stat)) {
                if (stat.min !== undefined && String(stat.min).trim() !== '') details.push(`minimum ${stat.min}`);
                if (!isPoolStat(stat) && String(stat.maxStatValue ?? '').trim()) details.push(`maximum ${stat.maxStatValue}`);
            }
            if (String(stat.defaultValue ?? '').trim()) details.push(`default ${stat.defaultValue}`);
            return `- ${stat.name}: ${details.map(part => /[.!?]$/.test(part) ? part : `${part}.`).join(' ')}`;
        })
        .join('\n');
}

Object.defineProperties(deps, {
    sanitizeModelUpdate: { enumerable: true, configurable: true, get: () => sanitizeModelUpdate },
    describeNpcStatFields: { enumerable: true, configurable: true, get: () => describeNpcStatFields },
});
}
