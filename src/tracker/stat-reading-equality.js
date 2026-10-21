const READING = /^(-?\d+(?:\.\d+)?)(?:\s*\/\s*(-?\d+(?:\.\d+)?))?$/;

/** A repeated reading is a no-op; an explicitly different pool maximum is not. */
export function sameStatReading(def, incoming, held, { allowBarePool = true } = {}) {
    if (![incoming, held].every(value => typeof value === 'string' || typeof value === 'number')) return false;
    const next = String(incoming).trim(), previous = String(held).trim();
    if (next === previous) return true;
    if (!next || !previous) return false;
    if (!['number', 'bar'].includes(def?.type)) return false;
    const a = next.match(READING), b = previous.match(READING);
    if (!a || !b || ![a[1], b[1], a[2] ?? '0', b[2] ?? '0'].every(value => Number.isFinite(Number(value)))) return false;
    return Number(a[1]) === Number(b[1])
        && (a[2] === undefined ? b[2] === undefined || allowBarePool
            : b[2] !== undefined && Number(a[2]) === Number(b[2]));
}
