import { splitValue, ceilingFromValue } from '../core/utils-format.js';

/**
 * Merges old and new stat values.
 *
 * A reported value keeps the ceiling the actor already carries: "50/100" updated with a
 * bare 40 is "40/100". A value written by hand does not, because it is the whole value.
 *
 * @param {*} oldVal
 * @param {*} newVal
 * @param {{ verbatim?: boolean }} [options] verbatim means the new value is the whole
 *   value, not a reading of part of one - see rule 2 below.
 */
export function mergeStatValue(oldVal, newVal, options = {}) {
    const { verbatim = false } = options;
    if (newVal === undefined || newVal === null) return newVal;
    const strOld = oldVal !== undefined && oldVal !== null ? String(oldVal) : '';
    const strNew = String(newVal);
    
    // 1. The incoming value brought its own. "280/350" states a ceiling outright.
    if (strNew.includes('/')) return clampToCeiling(strNew.trim());

    // Preserve a valid held pool ceiling for reader updates; manual edits replace it.
    const parts = strOld.split('/');
    if (!verbatim && parts.length === 2 && ceilingFromValue(strOld) !== null) {
        return clampToCeiling(`${strNew.trim()}/${parts[1].trim()}`);
    }

    /* And deliberately no third. The configured maximum is a *starting* maximum: it seeds a
       stat the first time an actor is given one, and from then on the value is the only
       thing that carries a pool ceiling. Plain numeric ratings are bounded separately by
       constrainNumericStat without adding a denominator. */
    return clampToCeiling(strNew.trim());
}

/** The configured starting maximum, falling back to the default pool denominator. */
export function resolveMaxValue(statDef) {
    if (!statDef) return '';
    const explicit = statDef.maxStatValue;
    if (explicit !== undefined && String(explicit).trim() !== '') return String(explicit).trim();
    const fallback = statDef.defaultValue;
    if (typeof fallback === 'string' && fallback.includes('/')) {
        const denominator = fallback.split('/')[1]?.trim();
        if (denominator) return denominator;
    }
    return '';
}

/** The actor's live maximum, or the configured starting maximum without a pool. */
export function promptCeiling(statDef, storedValue) {
    const held = storedValue !== undefined && storedValue !== null && String(storedValue).trim() !== '';
    if (!held || ceilingFromValue(storedValue) === null) {
        // The default pool denominator seeds capacity; maxStatValue only limits growth.
        const startingCap = ceilingFromValue(statDef?.defaultValue);
        return startingCap === null ? resolveMaxValue(statDef) : String(startingCap);
    }
    return String(splitValue(storedValue).max).trim();
}

/** Numeric fields also accept the saved 'bar' type before normalization. */
export function isNumericStat(statDef) {
    const type = statDef?.type;
    return type === 'number' || type === 'bar';
}

/**
 * The ceiling a value carries, if it carries one - regardless of what it is for.
 *
 * @param {{maxStatValue?: string, defaultValue?: string}} statDef Unused for the ceiling
 *   itself; kept so callers read as "this stat, this value".
 * @param {string|number} rawValue
 */
export function meterHasCeiling(statDef, rawValue) {
    // Through the shared reader rather than a parseFloat of its own, or this says yes to a
    // date: "14/01/2012" splits to a denominator of "01/2012", which parseFloat reads as 1.
    return ceilingFromValue(rawValue) !== null;
}

/**
 * Whether a stat is drawn as a meter.
 *
 * One function because there were two, in two files, disagreeing: the tracker box asked
 * the field type (status-ui.js) and the HUD asked the value (ui-hud.js), so a field
 * switched back to Text kept its meter on the HUD for as long as its value had a slash.
 * Both halves have to hold - it must be a quantity, and the quantity must have a ceiling
 * to fill. A bare 53 is just 53, and a bar pinned at 100% for the life of the chat was
 * never information.
 *
 * @param {object} statDef
 * @param {string|number} rawValue
 */
export function drawsMeter(statDef, rawValue) {
    return isNumericStat(statDef) && meterHasCeiling(statDef, rawValue);
}

/**
 * Holds a value at its own ceiling.
 *
 * A value written as "cur/max" carries its ceiling with it, and that ceiling belongs to
 * the actor rather than to the stat definition: one character's Energy caps at 350 while
 * another's caps at 40, with nothing configured globally.
 *
 * This replaces a rule that did the opposite. When a stat had no configured maximum, the
 * "/max" was deleted from every value on load - so a character given a ceiling of 350 lost
 * it silently a few messages later, and with nothing left to cap them their Energy
 * climbed past 350 unopposed. Only characters who had been on stage were affected, which
 * is why some cards kept "150/150" while others had been flattened to a bare number.
 *
 * Non-numeric values are left alone: "???" and "Healthy" have no arithmetic to do.
 *
 * @param {string|number} value
 * @returns {string|number} The value, with its current half held at its maximum.
 */
export function clampToCeiling(value) {
    if (value === undefined || value === null) return value;
    const text = String(value);
    if (!text.includes('/')) return value;

    const { current, max } = splitValue(text);
    const currentNum = Number(current);
    const maxNum = Number(max);
    if (!Number.isFinite(currentNum) || !Number.isFinite(maxNum)) return value;
    if (currentNum <= maxNum) return value;
    return `${max}/${max}`;
}

export function getInitialStatValue(defaultValue) {
    return defaultValue || '';
}

