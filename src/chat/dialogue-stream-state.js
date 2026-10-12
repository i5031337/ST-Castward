import { getContext } from '../../../../../st-context.js';
import { dialogueRevision } from './dialogue-presentation.js';

let active = null;
export function setDialogueStream(state) { active = state; }
export function clearDialogueStream() { active = null; }
export function streamDialogueRecords(messageId) {
    return active?.messageId === Number(messageId) && !active.finished && !active.cancelled
        && active.current() ? active.records : null;
}
export function dialogueLineCurrent(line) {
    if (!line.streamId) return dialogueRevision(getContext(), line.messageId) === line.revision;
    return active?.id === line.streamId && !active.cancelled && active.current()
        && active.records.some(record => record.lineIndex === line.lineIndex
            && record.npcId === line.npcId && record.text === (line.dialogueText ?? line.text));
}
