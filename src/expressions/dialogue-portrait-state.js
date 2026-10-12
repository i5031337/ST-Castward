import { fnv1a } from '../core/hash.js';

export const DIALOGUE_PORTRAITS_KEY = 'sillynpc_expression_portraits';
const spritePath = path => typeof path === 'string' && path.startsWith('/characters/');

/** Content identity is portable across reloads, exports and copies of a chat. */
export function portraitSource(message) {
    return fnv1a(JSON.stringify([message.swipe_id ?? 0, message.mes, message.extra?.display_text ?? null]));
}

export function readLinePortrait(message, line) {
    const saved = message?.extra?.[DIALOGUE_PORTRAITS_KEY];
    const record = saved?.lines?.[line.lineIndex];
    if (!message || saved?.source !== portraitSource(message) || record?.npcId !== line.npcId
        || !spritePath(record.path) || typeof record.label !== 'string') return null;
    return { path: record.path, label: record.label, fallback: record.fallback,
        fallbackPath: spritePath(record.fallbackPath) ? record.fallbackPath : '' };
}

/** The host owns swipe storage; synchronize only our field in the active swipe's extra. */
export function writeLinePortrait(message, line, picture) {
    if (!message || !line.npcId || !picture || !spritePath(picture.path)) return false;
    message.extra ||= {};
    const source = portraitSource(message);
    let saved = message.extra[DIALOGUE_PORTRAITS_KEY];
    if (!saved || saved.source !== source || !saved.lines || typeof saved.lines !== 'object') saved = { source, lines: {} };
    const record = { npcId: line.npcId, label: picture.label, path: picture.path,
        fallback: picture.fallback, fallbackPath: picture.fallbackPath || '' };
    if (JSON.stringify(saved.lines[line.lineIndex]) === JSON.stringify(record)) return false;
    saved.lines[line.lineIndex] = record;
    message.extra[DIALOGUE_PORTRAITS_KEY] = saved;
    const swipe = message.swipe_info?.[message.swipe_id ?? 0];
    if (swipe) {
        swipe.extra ||= {};
        swipe.extra[DIALOGUE_PORTRAITS_KEY] = structuredClone(saved);
    }
    return true;
}
