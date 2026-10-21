import { extractJSON, safeJsonParse } from '../../src/core/utils-format.js';

/** Keep raw JSON validity separate from the parser used by production coerceToUpdate. */
export function parseReaderReply(content) {
    let strict = null;
    try { strict = JSON.parse(String(content).replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '')); } catch {}
    const strictJsonValid = Boolean(strict && typeof strict === 'object' && !Array.isArray(strict));
    const parsed = safeJsonParse(extractJSON(String(content)));
    return { parsed, strictJsonValid, parseRecovered: Boolean(!strictJsonValid && parsed) };
}
