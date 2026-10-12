/** Commit actual generated lines, without trusting the host's repaired streaming markup. */
export function createCompletedLineStream({ baseline = '' } = {}) {
    baseline = String(baseline ?? '');
    let source = baseline;
    let committed = baseline;
    let nextIndex = 0;
    let invalidated = false;
    let closed = false;

    function push(raw, { final = false } = {}) {
        if (closed || invalidated) {
            return { source, committed, lines: [], changed: false, invalidated, closed };
        }
        const next = baseline + String(raw ?? '');
        const changed = source !== next;
        // Providers may revise an unfinished tail, but already delivered speech cannot be revised.
        if (!next.startsWith(committed)) {
            invalidated = true;
            return { source, committed, lines: [], changed, invalidated, closed };
        }
        source = next;
        const lines = [];
        let cursor = committed.length;
        while (cursor < source.length) {
            const newline = source.indexOf('\n', cursor);
            if (newline < 0 && !final) break;
            const end = newline < 0 ? source.length : newline + 1;
            const start = source.lastIndexOf('\n', cursor - 1) + 1;
            const contentEnd = newline < 0 ? end : newline;
            const index = nextIndex++;
            lines.push({
                id: index, index, start, end,
                text: source.slice(start, contentEnd).replace(/\r$/u, ''),
                appendedText: source.slice(cursor, end),
            });
            cursor = end;
        }
        committed = source.slice(0, cursor);
        closed = final;
        return { source, committed, lines, changed, invalidated, closed };
    }

    return { push };
}
