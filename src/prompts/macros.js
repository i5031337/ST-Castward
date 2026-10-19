import { substituteParamsExtended } from '../../../../../../script.js';
import { debugLog } from '../core/constants.js';
import { escapeRegExp } from '../core/utils.js';

/**
 * Editable prompts share SillyTavern's macro resolver. Prompt-specific values use
 * {{name}} syntax; legacy [NAME] placeholders are rewritten before substitution.
 * Unrecognized macros remain in the text.
 */

/**
 * Rewrites the extension's old [TAG] spelling into SillyTavern's {{tag}}.
 *
 * Rewrite the template before substitution so placeholders inside inserted values
 * are not expanded again.
 *
 * @param {string} text
 * @param {string[]} names The macro names this prompt offers, lowercase.
 * @returns {string}
 */
export function modernisePlaceholders(text, names) {
    let out = String(text ?? '');
    for (const name of names) {
        // Macro names are literal text, even when they contain regex metacharacters.
        out = out.replace(new RegExp(`\\[${escapeRegExp(name.toUpperCase())}\\]`, 'g'), `{{${name}}}`);
    }
    return out;
}

/**
 * Resolves every macro in one piece of text the user wrote.
 *
 * @param {string} text
 * @param {Record<string, string>} [own] This prompt's own values, offered as {{key}}.
 *   A macro SillyTavern has registered under the same name wins - populateEnv writes over
 *   the passed-in environment - so these are additions, not overrides.
 * @returns {string}
 */
export function applyMacros(text, own = {}) {
    const body = String(text ?? '');
    // Nothing to resolve, and no reason to walk several dozen regexes over a long prompt.
    if (!body.includes('{{')) return body;

    try {
        return substituteParamsExtended(body, own);
    } catch (err) {
        // Preserve the prompt if a host macro fails.
        debugLog('A macro could not be resolved - sending the text as written', err);
        return body;
    }
}

/**
 * Both steps, for a prompt that has placeholders of its own.
 *
 * @param {string} text
 * @param {Record<string, string>} own
 * @returns {string}
 */
export function fillTemplate(text, own) {
    return applyMacros(modernisePlaceholders(text, Object.keys(own)), own);
}
