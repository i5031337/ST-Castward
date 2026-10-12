import { getContext } from '../../../../../st-context.js';
import { dialogueRevision } from '../chat/dialogue-presentation.js';
import { saveChatSoon } from '../tracker/snapshots/status-snapshots.js';
import { selectSprite } from './expression-engine.js';
import { readLinePortrait, writeLinePortrait } from './dialogue-portrait-state.js';

export function portraitFromResult(result, label = result.label) {
    const line = result.line, identity = line.revision + line.npcId + line.lineIndex;
    const path = selectSprite(result.sprites, label, result.fallback, identity);
    return path ? { path, label: label || result.fallback, fallback: result.fallback,
        fallbackPath: selectSprite(result.sprites, result.fallback, '', identity) } : null;
}

export function readDialoguePortrait(line) {
    return readLinePortrait(getContext().chat?.[line.messageId], line);
}

export function rememberDialoguePortrait(result, label, { save = saveChatSoon } = {}) {
    const context = getContext(), line = result.line;
    if (line.streamId) return;
    if (dialogueRevision(context, line.messageId) !== line.revision) return;
    if (writeLinePortrait(context.chat?.[line.messageId], line, portraitFromResult(result, label))) save();
}
