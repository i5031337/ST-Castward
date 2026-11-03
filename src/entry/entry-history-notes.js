import { getContext } from '../../../../../st-context.js';
import { getSettings } from '../core/settings.js';
import { LOG_PREFIX, debugLog } from '../core/constants.js';
import { noteHistory, noteFieldNames, stripWorldNote } from '../story/history-notes.js';
import { promptText } from '../prompts/prompt-texts.js';
import { getTokenCountAsync } from '../../../../../tokenizers.js';
import { planHistoryWindow } from '../prompts/history-window.js';

const HISTORY_WINDOW_KEY = 'sillynpc_narrator_history_window';

/** Prepare the narrator's prompt copy without changing saved messages. */
globalThis.sillyNpcHistoryNotes = async function sillyNpcHistoryNotes(chat, _promptBudget, _abort, type) {
    try {
        const settings = getSettings();
        if (!settings.enabled) return;
        const tracker = settings.statusTracker;
        if (tracker?.enabled && tracker.historyNotes) {
            const added = noteHistory(chat, {
                names: noteFieldNames(tracker),
                render: (fields) => promptText('historyNote', { fields }),
            });
            if (added) debugLog(`World notes on ${added} messages of the history`);
        }
        if (!settings.narratorHistoryLimitEnabled
            || (type && !['normal', 'swipe', 'regenerate', 'continue'].includes(type))) return;
        const limits = { min: settings.narratorHistoryMinTokens, max: settings.narratorHistoryMaxTokens };
        const context = getContext();
        const metadata = context?.chatMetadata;
        const chatId = context?.getCurrentChatId?.();
        if (!metadata || chatId == null) return;
        const previous = metadata[HISTORY_WINDOW_KEY];
        const first = previous?.min === limits.min && previous?.max === limits.max
            && Number.isSafeInteger(previous.first) ? previous.first : 0;
        const plan = await planHistoryWindow(chat, { first, ...limits,
            countTokens: getTokenCountAsync });
        if (getContext()?.chatMetadata !== metadata || getContext()?.getCurrentChatId?.() !== chatId) return;
        if (plan.trimmed || (previous && (previous.first !== plan.first
            || previous.min !== limits.min || previous.max !== limits.max))) {
            metadata[HISTORY_WINDOW_KEY] = { first: plan.first, ...limits };
            context.saveMetadataDebounced?.();
        }
        if (plan.start) chat.splice(0, plan.start);
        if (plan.trimmed) debugLog(`Narrator history now starts at message ${plan.first + 1}`);
    } catch (err) {
        console.warn(LOG_PREFIX, 'Could not prepare narrator history', err);
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
