import { wireForegroundReplyEvents } from '../chat/foreground-replies.js';

/** Preserve displayed expressions across cancellation, clearing them only on chat changes. */
export function wireExpressionEvents({ reset, ...options }) {
    wireForegroundReplyEvents({ ...options,
        cancel: ({ event }) => reset({ clear: event === options.types.CHAT_CHANGED }),
        onError: error => console.warn('[Castward] Expressions failed', error),
    });
}
