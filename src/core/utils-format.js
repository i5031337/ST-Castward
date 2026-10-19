import { debugLog } from './constants.js';

export function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escape text for HTML content or quoted attributes. */
export function escapeHtml(unsafe) {
    if (unsafe === undefined || unsafe === null) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return String(unsafe).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Robustly extracts a JSON object from text using brace matching.
 * @param {string} text 
 * @returns {string|null}
 */
export function extractJSON(text) {
    if (!text) return null;
    let i = text.indexOf('{');
    if (i === -1) return null;

    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let start = i;

    for (let j = i; j < text.length; j++) {
        const char = text[j];
        if (escapeNext) {
            escapeNext = false;
        } else if (char === '\\') {
            escapeNext = true;
        } else if (char === '"') {
            inString = !inString;
        } else if (!inString) {
            if (char === '{') depth++;
            else if (char === '}') {
                depth--;
                if (depth === 0) {
                    return text.substring(start, j + 1);
                }
            }
        }
    }
    
    // Fallback: if no matching brace, return from start to last }
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace > start) {
        return text.substring(start, lastBrace + 1);
    }
    
    return null;
}

function closeOpenStructures(str) {
    let repaired = str.trim();
    let inString = false;
    let escapeNext = false;
    const stack = [];

    for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (escapeNext) {
            escapeNext = false;
        } else if (char === '\\') {
            escapeNext = true;
        } else if (char === '"') {
            inString = !inString;
        } else if (!inString) {
            if (char === '{') {
                stack.push('}');
            } else if (char === '[') {
                stack.push(']');
            } else if (char === '}') {
                if (stack[stack.length - 1] === '}') {
                    stack.pop();
                }
            } else if (char === ']') {
                if (stack[stack.length - 1] === ']') {
                    stack.pop();
                }
            }
        }
    }

    if (inString) {
        repaired += '"';
    }

    repaired = repaired.replace(/,\s*$/, '');
    repaired = repaired.replace(/:\s*$/, '');

    // Close open structures in reverse order of the stack
    for (let i = stack.length - 1; i >= 0; i--) {
        repaired += stack[i];
    }

    return repaired;
}

function tryRepairAndParse(str) {
    let candidate = closeOpenStructures(str);
    try {
        return JSON.parse(candidate);
    } catch (e) {
        let current = str;
        for (let attempt = 0; attempt < 10; attempt++) {
            const lastComma = current.lastIndexOf(',');
            const lastOpenBrace = current.lastIndexOf('{');
            const lastOpenBracket = current.lastIndexOf('[');
            const cutIdx = Math.max(lastComma, lastOpenBrace, lastOpenBracket);
            
            if (cutIdx <= 0) break;
            
            current = current.substring(0, cutIdx);
            if (current.endsWith(',')) {
                current = current.slice(0, -1);
            }
            
            candidate = closeOpenStructures(current);
            try {
                return JSON.parse(candidate);
            } catch (err) {
                // Continue trimming
            }
        }
    }
    return null;
}

/** Parse model JSON, then try trailing-comma, truncation, and bare-key repairs.
 * Each repair must pass JSON.parse; returns null if all attempts fail.
 */
export function safeJsonParse(jsonStr) {
    if (!jsonStr) return null;
    let repaired = jsonStr.trim();
    
    // Remove trailing commas in objects and arrays
    repaired = repaired.replace(/,(\s*[\]}])/g, '$1');
    
    try {
        return JSON.parse(repaired);
    } catch (e) {
        // Try truncated repair
        const fixed = tryRepairAndParse(repaired);
        if (fixed) return fixed;

        // Try more aggressive repair if needed, or just fail
        try {
            // Fix missing quotes on keys (simple cases)
            let fixedQuotes = repaired.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
            return JSON.parse(fixedQuotes);
        } catch (e2) {
            debugLog('JSON parse failed even after repair', e2, repaired);
            return null;
        }
    }
}

/** Split a current/maximum reading, trimming both halves; a plain value has no maximum. */
export function splitValue(value) {
    const text = value === undefined || value === null ? '' : String(value).trim();
    const slash = text.indexOf('/');
    if (slash === -1) return { current: text, max: '' };
    return { current: text.slice(0, slash).trim(), max: text.slice(slash + 1).trim() };
}


/** Read an inline maximum; a second slash marks a date rather than a numeric ceiling. */
export function ceilingFromValue(rawValue) {
    const { max } = splitValue(rawValue);
    // A denominator is one number. A second slash means this is a date, not "cur/max".
    if (String(max).includes('/')) return null;
    const parsed = parseFloat(max);
    return Number.isFinite(parsed) ? parsed : null;
}

/** Resolve signed readings and bounds into a clamped meter percentage. */
export function computeStatBar({ rawValue, min, max }) {
    const { current: currentText } = splitValue(rawValue);
    const impliedMax = ceilingFromValue(rawValue);

    // Exclude clocks and dates while allowing negative values and unit-bearing readings.
    const clocklike = String(currentText).includes(':');
    const datelike = /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(String(rawValue ?? ''));
    const signed = (clocklike || datelike) ? null : String(currentText).match(/-?\d+(?:\.\d+)?/);
    const current = signed ? parseFloat(signed[0]) : NaN;

    const lower = Number.isFinite(parseFloat(min)) ? parseFloat(min) : 0;
    let upper = Number.isFinite(parseFloat(max)) ? parseFloat(max) : impliedMax;
    if (!Number.isFinite(upper)) upper = Number.isFinite(current) ? Math.max(current, lower + 1) : lower + 1;

    if (!Number.isFinite(current) || upper <= lower) {
        return { current: 0, min: lower, max: upper, percent: 0, numeric: false };
    }

    const clamped = Math.min(upper, Math.max(lower, current));
    const percent = ((clamped - lower) / (upper - lower)) * 100;
    return { current, min: lower, max: upper, percent, numeric: true };
}

/** Resolve {{value}}, {{name}}, and {{max}}; callers escape parts for their output context. */
export function applyStatFormat(format, { value = '', name = '', max = '' } = {}) {
    let out = String(format || '{{value}}');
    out = out.split('{{value}}').join(value);
    out = out.split('{{name}}').join(name);
    out = out.split('{{max}}').join(max);
    return out;
}

/** Resolve a persona filename from a thumbnail URL or legacy User Avatars/ path. */
export function personaFileFromAvatar(src) {
    const text = String(src ?? '');
    if (!text) return '';

    const query = text.indexOf('?');
    if (query >= 0) {
        const params = new URLSearchParams(text.slice(query + 1));
        if (params.get('type') !== 'persona') return '';
        return params.get('file') || '';
    }

    const prefix = 'User Avatars/';
    const at = text.indexOf(prefix);
    if (at < 0) return '';
    try {
        return decodeURIComponent(text.slice(at + prefix.length));
    } catch {
        // A stray % in a filename is not an escape, and is not worth throwing over.
        return text.slice(at + prefix.length);
    }
}

/** Add keyboard activation and accessibility attributes to a custom control.
 * Enter and Space trigger the existing click handler.
 * @param {HTMLElement} el
 * @param {{ label?: string, role?: string }} [options]
 * @returns {HTMLElement}
 */
export function makeActivatable(el, { label, role = 'button' } = {}) {
    if (!el) return el;

    el.setAttribute('role', role);
    // Not overwritten: a caller may have put it in a particular tab order on purpose.
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;

    const announced = label ?? el.title ?? '';
    if (announced && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', announced);

    // So the focus ring can be styled once rather than per component.
    el.classList.add('sillynpc-activatable');

    if (el.dataset.activatable === 'true') return el;
    el.dataset.activatable = 'true';

    el.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        // Prevent scrolling or form submission alongside activation.
        event.preventDefault();
        el.click();
    });

    return el;
}
