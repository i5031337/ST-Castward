const QUOTES = new Map([['"', '"'], ['“', '”'], ['«', '»'], ['「', '」'], ['『', '』'], ['＂', '＂']]);
const EXCLUDED_TAGS = new Set(['pre', 'code', 'script', 'style', 'table', 'svg', 'canvas', 'video', 'summary', 'status_update']);

/** Omit fenced content before tracker cleanup can turn an emptied code block into prose. */
export function stripSpeechFences(value) {
    const output = [];
    let fence = null;
    for (const line of String(value ?? '').split(/(?<=\n)/u)) {
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})([^\n]*)/u);
        if (fence) {
            if (marker && marker[1][0] === fence.marker && marker[1].length >= fence.length
                && !marker[2].trim()) fence = null;
            continue;
        }
        if (marker) {
            fence = { marker: marker[1][0], length: marker[1].length };
            output.push('\n');
        } else output.push(line);
    }
    return output.join('');
}

/** Withhold unresolved markup whose final rendering can hide or reattribute earlier text. */
export function streamFormatSource(value) {
    const source = String(value ?? '');
    let fence = null, quote = null, hidden = null;
    let offset = 0, tagEnd = 0;
    for (const line of source.split(/(?<=\n)/u)) {
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})([^\n]*)/u);
        if (fence) {
            if (marker && marker[1][0] === fence.marker && marker[1].length >= fence.length
                && !marker[2].trim()) fence = null;
            offset += line.length; continue;
        }
        if (!hidden && marker) {
            fence = { marker: marker[1][0], length: marker[1].length, start: offset };
            offset += line.length; continue;
        }
        for (let i = 0; i < line.length; i++) {
            if (offset + i < tagEnd) continue;
            if (line[i] === '<') {
                const remaining = source.slice(offset + i);
                const tag = remaining.match(/^<(\/?)([a-z][\w-]*)([^>]*?)>/iu);
                if (tag) {
                    const name = tag[2].toLowerCase();
                    if (hidden && name === hidden.tag) {
                        hidden.depth += tag[1] ? -1 : /\/$/u.test(tag[3]) ? 0 : 1;
                        if (!hidden.depth) hidden = null;
                    } else if (!hidden && !tag[1] && !/\/$/u.test(tag[3])
                        && (EXCLUDED_TAGS.has(name) || /(?:^|\s)(?:hidden|data-sillynpc-hidden)(?:\s|=|$)/iu.test(tag[3])
                            || /display\s*:\s*none/iu.test(tag[3]))) {
                        hidden = { tag: name, depth: 1, start: offset + i };
                    }
                    tagEnd = offset + i + tag[0].length;
                    i += tag[0].length - 1; continue;
                }
                // A tag split over tokens/lines must not expose content before its attributes finish.
                if (/^<[a-z][\w-]*(?:\s|$)/iu.test(remaining) && !remaining.includes('>')) {
                    return source.slice(0, offset + i);
                }
            }
            if (hidden) continue;
            if (line[i] === '\\') { i++; continue; }
            if (quote) {
                if (line[i] === quote.close) quote = null;
            } else if (QUOTES.has(line[i])) quote = { close: QUOTES.get(line[i]), start: offset };
        }
        offset += line.length;
    }
    return source.slice(0, Math.min(source.length, ...[fence, quote, hidden].filter(Boolean).map(item => item.start)));
}
