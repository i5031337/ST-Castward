export const DEFAULT_DIALOGUE_TEMPLATE = '{name}: "{dialogue}"';
export const DIALOGUE_QUOTES = new Map([['"', '"'], ['“', '”'], ['«', '»'], ['「', '」'], ['『', '』'], ['＂', '＂']]);

/** Templates describe rendered text, with a single speaker followed by their speech. */
export function parseDialogueTemplate(value) {
    if (typeof value !== 'string' || value.length > 300 || /[\r\n]/u.test(value)) return null;
    const parts = value.trim().match(/^(.*?)\{name\}(.+?)\{dialogue\}(.*?)$/u);
    if (!parts || /\{(?:name|dialogue)\}/u.test(parts.slice(1).join(''))) return null;
    let [, prefix, separator, suffix] = parts;
    const open = separator.at(-1);
    const quoted = DIALOGUE_QUOTES.has(open) && suffix === DIALOGUE_QUOTES.get(open);
    if (quoted) { separator = separator.slice(0, -1); suffix = ''; }
    if (!separator.length || (!quoted && !separator.trim())) return null;
    return { template: value.trim(), prefix, separator, suffix, quoted };
}

export function resolveDialogueTemplate(value) {
    return parseDialogueTemplate(value) || parseDialogueTemplate(DEFAULT_DIALOGUE_TEMPLATE);
}
