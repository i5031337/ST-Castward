/** Choose a stable, whole-turn history window for the narrator prompt. */
export async function planHistoryWindow(chat, { first = 0, min, max, countTokens }) {
    if (!Array.isArray(chat) || !chat.length || !Number.isFinite(max) || max <= 0) {
        return { first: 0, start: 0, trimmed: false };
    }
    const indexOf = (message, position) => Number.isSafeInteger(message?.index)
        ? message.index : position;
    let start = chat.findIndex((message, position) => indexOf(message, position) >= first);
    if (start < 0) start = 0;

    let tokens = 0;
    let lowWaterStart = -1;
    for (let i = chat.length - 1; i >= start; i--) {
        const count = await countTokens(String(chat[i]?.mes ?? ''));
        tokens += Math.max(0, Number(count) || 0);
        // Starting at a user message keeps that user's entire exchange together.
        if (i > start && chat[i]?.is_user && !chat[i - 1]?.is_user && tokens <= min) {
            lowWaterStart = i;
        }
        if (tokens >= max) {
            if (lowWaterStart < 0) return { first: indexOf(chat[start], start), start, trimmed: false };
            return { first: indexOf(chat[lowWaterStart], lowWaterStart),
                start: lowWaterStart, trimmed: true };
        }
    }
    return { first: indexOf(chat[start], start), start, trimmed: false };
}

