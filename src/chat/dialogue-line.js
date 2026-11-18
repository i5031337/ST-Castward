import { resolveDialogueTemplate } from './dialogue-template.js';

const NAME = "[\\p{L}][\\p{L}\\p{M}\\p{N} ._'’\\-]{0,59}?";
const literal = text => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/[ \t]+/gu, '[ \\t]*');
let cachedTemplate, cachedPattern;

export function dialogueLabels(text, startsLine = true, quoteFollows = false, template) {
    const format = resolveDialogueTemplate(template);
    if (cachedTemplate !== format.template) {
        cachedTemplate = format.template;
        const separator = format.separator.trim() ? `[ \\t]*${literal(format.separator)}` : '[ \\t]+';
        cachedPattern = new RegExp(`(^|\\n)([ \\t]*)(${literal(format.prefix)})(${NAME})(${separator})`
            + (format.quoted ? '(?=["“«「『＂]|$)' : '(?=\\S|$)'), 'gu');
    }
    const source = String(text ?? '');
    const labels = [];
    for (const match of source.matchAll(cachedPattern)) {
        if (match.index === 0 && !match[1] && !startsLine) continue;
        const quoteStart = match.index + match[0].length;
        // Formatting can move quoted speech into a following inline element.
        if (quoteStart === source.length
            && !(typeof quoteFollows === 'function' ? quoteFollows() : quoteFollows)) continue;
        const name = match[4].trim();
        if (!name) continue;
        const start = match.index + match[1].length + match[2].length + match[3].length;
        labels.push({ name, start, end: start + match[4].length, quoteStart });
    }
    return labels;
}
