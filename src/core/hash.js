/** Preserve each hash algorithm: saved colors, portraits, and redraw signatures depend on their outputs. */

/**
 * FNV-1a, 32 bits, as an unsigned number. Spreads a change of one character well.
 * Used to fingerprint image URLs for the chat redraw signature.
 *
 * @param {string} text
 * @returns {number}
 */
export function fnv1a(text) {
    const value = String(text ?? '');
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * `hash * 31 + c`, kept to 32 signed bits. Used for a stranger's steady fallback face.
 *
 * @param {string} text
 * @returns {number} May be negative; take Math.abs before using it as an index.
 */
export function hash31(text) {
    const value = String(text ?? '');
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
    return hash;
}

/**
 * djb2 (`hash * 33 + c`), 32 signed bits. Used to spot a saved state that has not changed.
 *
 * @param {string} text
 * @returns {number}
 */
export function djb2(text) {
    const value = String(text ?? '');
    let hash = 5381;
    for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
    return hash;
}

/** Palette index by Unicode code point; unlike hash31, emoji count as one character. */
export function paletteIndexFor(name, size) {
    if (!(size > 0)) return 0;
    let index = 0;
    for (const ch of String(name ?? '')) {
        index = (index * 31 + ch.codePointAt(0)) % size;
    }
    return index;
}
