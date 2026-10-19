/** Inspect matching CSS rules and inline display changes for HUD portrait diagnostics. */

/** Where a rule came from, short enough to read in a data attribute. */
function sheetName(sheet) {
    const href = sheet?.href;
    if (!href) return 'a <style> tag';
    return href.split('/').slice(-2).join('/');
}

/**
 * Every rule that gives `property` the value `value` and matches `el`.
 *
 * @param {Element} el
 * @param {string} property A camelCase CSSStyleDeclaration name, e.g. 'display'.
 * @param {string} value
 * @returns {string[]} Selectors, each with the stylesheet it came from.
 */
export function rulesSetting(el, property, value) {
    const found = [];
    if (!el) return found;

    const scan = (rules, sheet) => {
        for (const rule of rules ?? []) {
            /* Inspect style rules and their nested rules; CSS nesting gives ordinary rules a cssRules list. */
            if (rule.selectorText && rule.style?.[property] === value) {
                try {
                    if (el.matches(rule.selectorText)) {
                        found.push(`${rule.selectorText} @ ${sheetName(sheet)}`);
                    }
                } catch { /* a selector this browser will not parse */ }
            }

            /* Recurse into grouping rules and nested style rules. */
            if (rule.cssRules?.length) scan(rule.cssRules, sheet);
        }
    };

    for (const sheet of document.styleSheets) {
        // Reading cssRules on a cross-origin sheet throws; it is not ours anyway.
        try { scan(sheet.cssRules, sheet); } catch { /* cross-origin */ }
    }

    return found;
}

/**
 * Intercept inline display assignments synchronously to record the caller stack.
 * Always apply the assigned value; the trap only observes.
 *
 * @param {HTMLElement} el
 * @param {(value: string, stack: string) => void} report
 */
export function trapInlineDisplay(el, report) {
    if (!el || el.dataset.displayTrapped === 'true') return;
    el.dataset.displayTrapped = 'true';

    Object.defineProperty(el.style, 'display', {
        configurable: true,
        get() { return this.getPropertyValue('display'); },
        set(value) {
            // setProperty rather than the shadowed accessor, or this calls itself.
            this.setProperty('display', value);
            try { report(String(value), new Error().stack ?? ''); } catch { /* never break a write */ }
        },
    });
}

/** Shorten the caller stack, putting the first non-library frame before library frames. */
export function shortenStack(stack, frames = 10) {
    const lines = String(stack ?? '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('at ') && !line.includes('css-origin.js'))
        .map(line => line.replace(/^at\s+/, '').replace(/https?:\/\/[^/]+\//, ''));

    if (!lines.length) return 'no stack';

    const isLibrary = (line) => line.includes('lib/') || line.includes('node_modules');
    const caller = lines.findIndex(line => !isLibrary(line));

    const ordered = caller > 0
        ? [`CALLER: ${lines[caller]}`, ...lines.slice(0, caller), ...lines.slice(caller + 1)]
        : lines;

    return ordered.slice(0, frames).join(' <- ');
}

/**
 * Report inline and matching stylesheet rules that hide the element.
 *
 * @param {HTMLElement} el
 * @returns {string}
 */
export function whyHidden(el) {
    if (!el) return 'no element';

    const found = [];
    if (el.style.display) found.push(`inline:${el.style.display}`);
    if (el.style.visibility) found.push(`inline-vis:${el.style.visibility}`);

    found.push(...rulesSetting(el, 'display', 'none'));
    found.push(...rulesSetting(el, 'visibility', 'hidden'));

    return found.join(' ; ') || 'no rule found';
}
