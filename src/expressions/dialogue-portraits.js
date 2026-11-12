import { getContext } from '../../../../../st-context.js';
import { dialogueRevision } from '../chat/dialogue-presentation.js';
import { saveChatSoon } from '../tracker/snapshots/status-snapshots.js';
import { selectSprite } from './expression-engine.js';
import { DIALOGUE_PORTRAITS_KEY, readLinePortrait, writeLinePortrait } from './dialogue-portrait-state.js';

export function portraitFromResult(result, label = result.label) {
    const line = result.line, identity = line.revision + line.npcId + line.lineIndex;
    const path = selectSprite(result.sprites, label, result.fallback, identity);
    return path ? { path, label: label || result.fallback, fallback: result.fallback,
        fallbackPath: selectSprite(result.sprites, result.fallback, '', identity) } : null;
}

export function readDialoguePortrait(line) {
    return readLinePortrait(getContext().chat?.[line.messageId], line);
}

/** Refresh saved selections even when their messages have no rendered dialogue or cached job. */
export function refreshDialoguePortraitPack(card, sprites, { savePortrait = rememberDialoguePortrait } = {}) {
    const context = getContext(), folder = card.presentation?.expressions?.spriteFolder;
    if (!folder) return;
    for (const [messageId, message] of (context.chat || []).entries()) {
        const records = message?.extra?.[DIALOGUE_PORTRAITS_KEY]?.lines || {};
        for (const [index, record] of Object.entries(records)) {
            const lineIndex = Number(index);
            if (!Number.isInteger(lineIndex) || lineIndex < 0 || record?.npcId !== card.id) continue;
            const line = { messageId, lineIndex, npcId: card.id };
            const picture = readLinePortrait(message, line);
            if (!picture || !portraitInFolder(picture.path, folder)) continue;
            line.revision = dialogueRevision(context, messageId);
            savePortrait({ line, sprites, fallback: picture.fallback }, picture.label);
        }
    }
}

function portraitInFolder(path, folder) {
    const directory = value => value.slice(0, value.lastIndexOf('/'));
    const expected = `/characters/${folder}`, saved = directory(path.split('?')[0]);
    if (saved === expected) return true;
    try { return directory(decodeURI(path.split('?')[0])) === expected; }
    catch { return false; }
}

export function rememberDialoguePortrait(result, label, { save = saveChatSoon } = {}) {
    const context = getContext(), line = result.line;
    if (line.streamId) return;
    if (dialogueRevision(context, line.messageId) !== line.revision) return;
    if (writeLinePortrait(context.chat?.[line.messageId], line, portraitFromResult(result, label))) save();
}
