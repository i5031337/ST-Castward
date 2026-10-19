import { LOG_PREFIX, debugLog } from '../core/constants.js';
import { getSettings } from '../core/settings.js';
import { getContext } from '../../../../../st-context.js';
import { processStatusUpdate, renderStatusTrackerBox, redrawStatusBoxes } from '../tracker/ui/status-ui.js';
import { updateHUD } from '../ui/hud/ui-hud.js';
import { getTrackerView, setTrackerView, nextTrackerView } from '../tracker/tracker-view.js';
import { eventSource } from '../../../../../events.js';
import { MESSAGE_RENDERED_EVENT } from '../story/beats.js';
import { chatRenderSignature } from './chat-signature.js';
import { applyPlayerPortrait, injectCharacterImages } from './chat-portraits.js';
import { stripVoiceCueNodes } from '../tts/voice-cue-format.js';

function runReprocessLogic(mesEl) {
    if (!mesEl) return;
    try {
        const message = getContext()?.chat?.[Number(mesEl.getAttribute('mesid'))];
        if (message && !message.is_user && !message.is_system)
            stripVoiceCueNodes(mesEl.querySelector('.mes_text'));
        if (!getSettings().enabled) {
            mesEl.querySelectorAll('.sillynpc-refresh-btn, .sillynpc-tracker-eye, .sillynpc-status-tracker-container, .sillynpc-review-panel, .sillynpc-reader-report').forEach(el => el.remove());
            applyPlayerPortrait(mesEl);
            injectCharacterImages(mesEl);
            return;
        }
        // Isolate rendering failures so the remaining decorations can still update.
        
        try {
            addRefreshButtonToMessage(mesEl);
        } catch (e) { console.error(LOG_PREFIX, 'addRefreshButton failed', e); }

        try {
            addTrackerEyeToMessage(mesEl);
        } catch (e) { console.error(LOG_PREFIX, 'addTrackerEye failed', e); }

        mesEl.removeAttribute('data-sillynpc-status-hidden');
        
        const tasks = [
            { name: 'processStatusUpdate', fn: processStatusUpdate },
            { name: 'applyPlayerPortrait', fn: applyPlayerPortrait },
            { name: 'injectCharacterImages', fn: injectCharacterImages },
            { name: 'renderStatusTrackerBox', fn: renderStatusTrackerBox }
        ];

        for (const task of tasks) {
            try {
                if (typeof task.fn === 'function') {
                    task.fn(mesEl);
                }
            } catch (e) {
                console.error(LOG_PREFIX, `${task.name} failed`, e);
            }
        }

        /** Notify readers after avatar decoration makes speaker identities available. Emitted per message; expensive listeners should debounce. */
        eventSource.emit(MESSAGE_RENDERED_EVENT, mesEl);
    } catch (err) {
        console.error(LOG_PREFIX, 'reprocessMessage failed', err);
    }
}

export function reprocessMessage(mesEl) {
    if (!mesEl) return;
    
    // Decorate after the host finishes its current rendering work.
    requestAnimationFrame(() => runReprocessLogic(mesEl));
}

let reprocessAllTimer = null;

/** Coalesce whole-chat redraw requests from listeners firing in the same tick. */
/**
 * Last rendered signature. Null forces the initial redraw.
 *
 * @type {string|null}
 */
let lastDrawnSignature = null;

/** Forces the next redraw to run, whatever the signature says. */
export function invalidateChatRender() {
    lastDrawnSignature = null;
}

export function reprocessAllMessages() {
    if (reprocessAllTimer) clearTimeout(reprocessAllTimer);
    reprocessAllTimer = setTimeout(() => {
        reprocessAllTimer = null;

        // Skip the full DOM pass when rendering inputs have not changed.
        const signature = chatRenderSignature();
        if (signature === lastDrawnSignature) {
            debugLog('Reprocess skipped: nothing that reaches the chat changed');
            return;
        }
        lastDrawnSignature = signature;

        runReprocessAllNow();
    }, 150);
}

function runReprocessAllNow() {
    const messages = Array.from(document.querySelectorAll('#chat .mes'));
    if (messages.length === 0) return;
    
    // Improvement: Batch the processing using small groups to avoid blocking the main thread.
    // Use a single requestAnimationFrame to start the batch.
    requestAnimationFrame(() => {
        const CHUNK_SIZE = 5; // Process in small batches
        let index = 0;

        function processBatch() {
            const end = Math.min(index + CHUNK_SIZE, messages.length);
            for (; index < end; index++) {
                runReprocessLogic(messages[index]);
            }

            if (index < messages.length) {
                // Schedule next batch
                requestAnimationFrame(processBatch);
            }
        }

        processBatch();
    });
}

/** Icons and labels for the tracker visibility states. */
export const TRACKER_EYE = {
    full: { icon: 'fa-eye', title: 'Tracker: showing everything. Click for world stats only.' },
    globals: { icon: 'fa-eye-low-vision', title: 'Tracker: world stats only. Click to hide it.' },
    hidden: { icon: 'fa-eye-slash', title: 'Tracker: hidden. Click to show it again.' },
};

/** Puts the eye in the state given, without rebuilding it. */
export function paintTrackerEye(btn, view) {
    const { icon, title } = TRACKER_EYE[view] || TRACKER_EYE.full;
    // mes_button so it looks and sizes like SillyTavern's own toolbar buttons, which
    // is where it now lives.
    btn.className = `mes_button sillynpc-tracker-eye fa-solid ${icon}`;
    btn.title = title;
    btn.dataset.view = view;
}

/** Place the tracker visibility control in the message toolbar so it remains accessible when the box is hidden. */
function addTrackerEyeToMessage(mesEl) {
    if (!getSettings().statusTracker?.enabled) {
        mesEl.querySelector('.sillynpc-tracker-eye')?.remove();
        return;
    }

    const toolbar = mesEl.querySelector('.extraMesButtons');
    if (!toolbar) return;

    const existing = mesEl.querySelector('.sillynpc-tracker-eye');
    if (existing) {
        // A redraw must not stack copies, and the one already here may be showing a
        // state from before the last click.
        paintTrackerEye(existing, getTrackerView());
        return;
    }

    const btn = document.createElement('div');
    paintTrackerEye(btn, getTrackerView());
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = nextTrackerView(getTrackerView());
        setTrackerView(next);
        // Every message's eye, not just this one: the others are only hidden by CSS, and
        // "show under every message" puts a box under each of them.
        document.querySelectorAll('.sillynpc-tracker-eye')
            .forEach(el => paintTrackerEye(el, next));
        redrawStatusBoxes();
    });

    toolbar.insertBefore(btn, toolbar.firstChild);
}

function addRefreshButtonToMessage(mesEl) {
    const toolbar = mesEl.querySelector('.extraMesButtons');
    if (!toolbar || toolbar.querySelector('.sillynpc-refresh-btn')) return;

    const btn = document.createElement('div');
    btn.className = 'mes_button sillynpc-refresh-btn fa-solid fa-arrows-rotate';
    btn.title = 'Refresh Tracking-bar and Chat';
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // It used to re-parse this message for a <status_update> block and apply it. That
        // only ever worked in inline mode: with a separate extraction pass - the default -
        // messages carry no block, so the button did nothing but warn. Restoring an
        // earlier state has its own control on the player sheet, so this is what its name
        // says instead: draw the tracker and the chat decorations again.
        reprocessAllMessages();
        updateHUD();
        if (typeof toastr !== 'undefined') {
            toastr.info('Tracker and chat redrawn.', 'Castward');
        }
    });
    toolbar.insertBefore(btn, toolbar.firstChild);
}
