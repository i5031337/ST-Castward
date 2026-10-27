import { allowedValues } from './stat-field-utils.js';
import { constrainNumericStat } from './numeric-stat-bounds.js';
import { sameStatReading } from './stat-reading-equality.js';

/** Option matching is exact; clearing a card field remains allowed. */
export function calculateOptionValue(def, incoming, existing) {
    const allowed = allowedValues(def);
    const wanted = String(incoming ?? '').trim();
    if (!allowed.length || !wanted || allowed.includes(wanted)) return { value: incoming, refusedValues: [] };
    return { value: existing, refusedValues: [{ field: def?.name || 'a field', wanted, allowed, kept: String(existing ?? '') }] };
}

/** Shorten only submitted prose, retaining a useful word boundary where possible. */
export function capToLength(def, value) {
    const limit = Number(def?.maxLength);
    if (!Number.isFinite(limit) || limit <= 0) return value;
    const text = String(value ?? '');
    if (text.length <= limit) return value;
    const cut = text.slice(0, limit);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > limit * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Calculate one field reading and its diagnostics without retaining shared state. */
export function calculateFieldValue(def, incoming, existing) {
    const result = { value: existing, warnings: [], refusedValues: [] };
    if (sameStatReading(def, incoming, existing, { allowBarePool: false })) return result;
    const warn = reason => result.warnings.push(`"${String(incoming)}" skipped: ${reason}; kept "${String(existing ?? '')}".`);
    const text = String(incoming ?? '').trim();
    if (/^current\s*\/\s*maximum$/i.test(text) || /^<[^>]*>$/.test(text)) {
        warn('this is a prompt placeholder, not a value');
        return result;
    }
    const bounded = constrainNumericStat(def, incoming, existing);
    if (bounded !== incoming) {
        result.warnings.push(`"${String(incoming)}" adjusted or refused: outside the numeric bounds or not a valid numeric reading; using "${String(bounded ?? '')}".`);
    }
    const allowed = allowedValues(def);
    if (allowed.length && String(bounded ?? '').trim() && !allowed.includes(String(bounded).trim())) {
        warn(`allowed values are ${allowed.join(', ')}`);
    }
    const options = calculateOptionValue(def, bounded, existing);
    result.refusedValues = options.refusedValues;
    result.value = options.value;
    // Refusing a submitted value must not trim an older, retained reading.
    if (result.value !== incoming) return result;
    const capped = capToLength(def, result.value);
    if (capped !== result.value) result.warnings.push(`"${String(result.value)}" shortened: exceeds the ${def.maxLength} character limit; using "${capped}".`);
    result.value = capped;
    return result;
}
