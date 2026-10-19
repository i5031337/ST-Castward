import { getContext } from '../../../../../st-context.js';
import { getSettings } from '../core/settings.js';
import { LOG_PREFIX, debugLog } from '../core/constants.js';
import { noteHistory, noteFieldNames, stripWorldNote } from '../story/history-notes.js';
import { promptText } from '../prompts/prompt-texts.js';

/** Generation interceptor named in manifest.json. Add per-message world notes to copied history; failures must not interrupt generation. */
globalThis.sillyNpcHistoryNotes = function sillyNpcHistoryNotes(chat) {
    try {
        const tracker = getSettings().statusTracker;
        if (!getSettings().enabled || !tracker?.enabled || !tracker.historyNotes) return;
        const added = noteHistory(chat, {
            names: noteFieldNames(tracker),
            render: (fields) => promptText('historyNote', { fields }),
        });
        if (added) debugLog(`World notes on ${added} messages of the history`);
    } catch (err) {
        console.warn(LOG_PREFIX, 'Could not put the world notes on the history', err);
    }
};

/**
 * Remove echoed world notes before rendering and after streamed replies render.
 *
 * @param {string|number} messageId
 * @param {boolean} redraw Whether the message is already on screen.
 */
export function dropCopiedWorldNote(messageId, redraw) {
    try {
        const tracker = getSettings().statusTracker;
        if (!getSettings().enabled || !tracker?.enabled || !tracker.historyNotes) return;
        const context = getContext();
        const message = context?.chat?.[Number(messageId)];
        if (!message || message.is_user) return;
        if (!stripWorldNote(message, noteFieldNames(tracker))) return;

        debugLog(`Took a copied world note off message ${messageId}`);
        if (redraw) context.updateMessageBlock?.(Number(messageId), message);
        context.saveChat?.();
    } catch (err) {
        console.warn(LOG_PREFIX, 'Could not take the copied world note off the reply', err);
    }
}
