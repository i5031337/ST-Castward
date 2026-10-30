import { stripSpeechFences } from './stream-format-source.js';

const CUE = /^\s*\[\[NPC_VOICE (?:speaker=)?(?:"([^"\r\n]{1,80})"|([^\s"=\[\]\r\n]{1,80})) description="([^"\r\n]{1,200})"\]\]\s*$/u;
const INLINE_CUE = /\[\[NPC_VOICE (?:speaker=)?(?:"[^"\r\n]{1,80}"|[^\s"=\[\]\r\n]{1,80}) description="[^"\r\n]{1,200}"\]\]/gu;
export const voiceCueKey = value => String(value ?? '').trim().toLowerCase();

/** Complete cue lines outside code fences, including tags without dialogue. */
export function standaloneVoiceCues(source) {
    const found = new Map();
    for (const line of stripSpeechFences(source).split(/\r?\n/u)) {
        const match = line.match(CUE);
        if (!match) continue;
        const speaker = (match[1] || match[2]).trim(), description = match[3].trim();
        const key = voiceCueKey(speaker);
        if (!key || !description || found.has(key)) continue;
        found.set(key, { speaker, description });
    }
    return [...found.values()];
}

/** A complete line is data for one recognized speaker, never spoken dialogue. */
export function parseVoiceCues(source, records) {
    const speakers = new Set(records.filter(record => !record.isPersona && record.text)
        .map(record => voiceCueKey(record.speakerLabel)));
    return standaloneVoiceCues(source).filter(cue => speakers.has(voiceCueKey(cue.speaker)));
}

/** Remove complete, recognized cue lines after their voice has been retained elsewhere. */
export function withoutVoiceCueLines(source, speakers) {
    const keys = new Set(speakers.map(voiceCueKey));
    if (!keys.size) return source;
    const lines = String(source ?? '').split('\n');
    let fence = null, removed = false, skipBlank = false;
    const kept = [];
    for (const line of lines) {
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})([^\n]*)/u);
        if (fence) {
            kept.push(line);
            if (marker && marker[1][0] === fence.marker && marker[1].length >= fence.length
                && !marker[2].trim()) fence = null;
            skipBlank = false;
            continue;
        }
        if (marker) {
            kept.push(line);
            fence = { marker: marker[1][0], length: marker[1].length };
            skipBlank = false;
            continue;
        }
        const cue = line.replace(/\r$/u, '').match(CUE);
        if (cue && keys.has(voiceCueKey(cue[1] || cue[2]))) {
            removed = true;
            skipBlank = true;
            continue;
        }
        if (skipBlank && !line.trim()) { skipBlank = false; continue; }
        skipBlank = false;
        kept.push(line);
    }
    const cleaned = kept.join('\n');
    return removed ? (cleaned.trim() ? cleaned : '') : source;
}

/** Strip annotations from rendered text and from clones read by speech discovery. */
export function stripVoiceCueNodes(container) {
    if (!container?.ownerDocument) return;
    // SillyTavern turns the annotation's quoted values into separate <q> nodes.
    // Remove the complete block before walking text nodes.
    // Speech discovery also passes a paragraph itself as the clone root.
    if (container.matches?.('p, li, blockquote') && CUE.test(container.textContent)) {
        container.replaceChildren();
        return;
    }
    container.querySelectorAll('p, li, blockquote').forEach(block => {
        if (CUE.test(block.textContent)) block.remove();
    });
    const walker = container.ownerDocument.createTreeWalker(container, 4);
    const touched = new Set();
    let node;
    while ((node = walker.nextNode())) {
        if (!node.nodeValue.includes('[[NPC_VOICE') || node.parentElement?.closest('pre, code, script, style')) continue;
        const clean = node.nodeValue.replace(INLINE_CUE, '');
        if (clean !== node.nodeValue) { touched.add(node.parentElement); node.nodeValue = clean; }
    }
    for (const parent of touched) {
        const block = parent?.closest('p, li, blockquote');
        if (block && !block.textContent.trim() && !block.querySelector('img, audio, video')) block.remove();
    }
}
