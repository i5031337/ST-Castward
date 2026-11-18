import { wireForegroundReplyEvents } from '../chat/foreground-replies.js';

/** A queued user render must not start work after cancellation or message replacement. */
export function deferExpressionCompletion(id, { getContext, version, defer, complete }) {
    const captured = version(), token = getContext()?.chat?.[Number(id)];
    defer(() => {
        if (captured === version() && getContext()?.chat?.[Number(id)] === token) void complete(id);
    });
}

/** Finish player work before the reply, retaining the foreground turn's ownership. */
export function createExpressionCompletion({ getContext, version, playerEnabled, complete }) {
    return async id => {
        const chat = getContext()?.chat || [];
        const captured = version(), token = chat[id];
        let playerId = id;
        while (playerId >= 0 && !chat[playerId]?.is_user) playerId--;
        if (playerId >= 0 && playerEnabled()) await complete(playerId);
        if (captured !== version() || getContext()?.chat?.[id] !== token) return;
        if (playerId !== id) await complete(id);
    };
}

/** Preserve displayed expressions across cancellation, clearing them only on chat changes. */
export function wireExpressionEvents({ reset, ...options }) {
    wireForegroundReplyEvents({ ...options,
        cancel: ({ event }) => reset({ clear: event === options.types.CHAT_CHANGED }),
        onError: error => console.warn('[Castward] Expressions failed', error),
    });
}
