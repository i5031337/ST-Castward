import { eventSource, event_types } from '../../../../../events.js';
import { isGenerating } from '../../../../../../script.js';

const tasks = new Set();
let observer;
let revealed = false;

/** Host cleanup can hide Stop after an extension task starts in a message-rendered event. */
function refreshStopButton() {
    const button = document.getElementById('mes_stop');
    if (!button) return;
    if ([...tasks].some(task => !task.signal.aborted)) {
        if (button.style.display !== 'flex') {
            revealed = true;
            button.style.display = 'flex';
        }
    } else if (revealed && !isGenerating()) {
        button.style.display = 'none';
        revealed = false;
    }
}

/** Share the host Stop button without changing the host's generation state. */
export function startGenerationTask({ signal: parentSignal } = {}) {
    parentSignal?.throwIfAborted();
    const controller = new AbortController();
    const signal = parentSignal ? AbortSignal.any([parentSignal, controller.signal]) : controller.signal;
    const task = { signal };
    const stop = () => {
        controller.abort();
        refreshStopButton();
    };
    signal.addEventListener('abort', refreshStopButton);
    tasks.add(task);
    eventSource.on(event_types.GENERATION_STOPPED, stop);
    eventSource.on(event_types.CHAT_CHANGED, stop);
    if (!observer) {
        const button = document.getElementById('mes_stop');
        if (button) {
            observer = new MutationObserver(refreshStopButton);
            observer.observe(button, { attributes: true, attributeFilter: ['style'] });
        }
    }
    refreshStopButton();
    return {
        signal,
        abort: stop,
        finish() {
            tasks.delete(task);
            signal.removeEventListener('abort', refreshStopButton);
            eventSource.removeListener(event_types.GENERATION_STOPPED, stop);
            eventSource.removeListener(event_types.CHAT_CHANGED, stop);
            refreshStopButton();
            if (!tasks.size) { observer?.disconnect(); observer = null; revealed = false; }
        },
    };
}

/** Release the UI even when a backend ignores cancellation or returns a late reply. */
export function awaitGenerationRequest(request, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        Promise.resolve(request).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
}
