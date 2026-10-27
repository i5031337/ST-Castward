import { wireForegroundReplyEvents } from '../chat/foreground-replies.js';

/** Stop audio on cancellation while preserving streaming authorization for regeneration's deletion. */
export function wireSpeechEvents({ stop, ...options }) {
    wireForegroundReplyEvents({ ...options,
        cancel: ({ preserveGeneration }) => preserveGeneration ? stop({ preserveGeneration: true }) : stop(),
        onError: error => console.warn('[Castward] Automatic speech failed', error),
    });
}
