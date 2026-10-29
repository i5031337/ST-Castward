import { getContext } from '../../../../../../st-context.js';
import { getSettings } from '../../core/settings.js';
import { getSwipeBase } from '../status-logic.js';
import { getExtractionReport } from '../extractor/status-extraction-report.js';
import { trackerMessageIndex } from './status-ui-placement.js';

const pending = new WeakSet();

function updateButton(button) {
    const id = Number(button.dataset.messageId);
    const chat = getContext()?.chat || [];
    const message = chat[id];
    const report = getExtractionReport(id);
    const missingRewards = message?.extra?.sillynpc_level_reading?.failures?.length;
    button.hidden = !getSettings().enabled || !getSettings().statusTracker.enabled
        || id !== trackerMessageIndex(chat) || !message
        || !(report?.status === 'running' || report?.status === 'failed' || missingRewards || getSwipeBase(id));
    button.disabled = report?.status === 'running' || report?.npcProfiles?.status === 'running' || Boolean(message && pending.has(message));
    button.title = missingRewards ? 'Retry missing level-up rewards'
        : report?.status === 'failed' ? 'Retry tracker reading' : 'Regenerate tracker reading';
    button.setAttribute('aria-label', button.title);
}

/** Reports refresh independently of the tracker box when a reading starts or finishes. */
export function refreshTrackerReadButtons() {
    document.querySelectorAll('.sillynpc-status-refresh-btn').forEach(updateButton);
}

export function buildTrackerReadButton(messageId, onRedraw) {
    const message = getContext()?.chat?.[messageId];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sillynpc-status-refresh-btn fa-solid fa-arrows-rotate';
    button.dataset.messageId = String(messageId);
    updateButton(button);
    button.addEventListener('click', async event => {
        event.stopPropagation();
        updateButton(button);
        if (button.hidden || button.disabled || getContext()?.chat?.[messageId] !== message) return;
        pending.add(message);
        button.disabled = true;
        refreshTrackerReadButtons();
        try {
            if (message.extra?.sillynpc_level_reading?.failures?.length) {
                const { retryLevelReading } = await import('../extractor/status-level-reading.js');
                const result = await retryLevelReading(messageId);
                if (result.applied && message.extra.sillynpc_reader_report) {
                    message.extra.sillynpc_reader_report.summary = '0 applied · 0 awaiting review'
                        + (result.failures ? ` · ${result.failures} choices still failed` : '');
                }
            } else {
                const { extractStateFromMessage } = await import('../extractor/status-extractor-run.js');
                await extractStateFromMessage(message.mes, messageId, {
                    manual: true, regenerate: Boolean(getSwipeBase(messageId)),
                });
            }
        } catch (error) {
            console.error('Castward: tracker retry failed', error);
            toastr.error(String(error?.message || error), 'Castward');
        } finally {
            pending.delete(message);
            updateButton(button);
            refreshTrackerReadButtons();
            onRedraw?.();
        }
    });
    return button;
}
