/** Generated chat books use this reserved prefix; other user books are never candidates. */
export function isCastwardLorebook(name) {
    return typeof name === 'string' && name.startsWith('Castward Chat ') && name.length > 14;
}

/** Conservatively preserve any book named in settings or metadata, including nested saved rosters and places. */
export function referencedLorebooks(sources, names) {
    const available = new Set(names);
    const keep = new Set();
    const visited = new WeakSet();
    const visit = value => {
        if (typeof value === 'string') {
            if (available.has(value)) keep.add(value);
        } else if (value && typeof value === 'object' && !visited.has(value)) {
            visited.add(value);
            for (const child of Object.values(value)) visit(child);
        }
    };
    visit(sources);
    return keep;
}

export function createLorebookCleanup({ getNames, getSources, listHeaders, deleteBook }) {
    async function unused() {
        const headers = await listHeaders();
        // Missing metadata must not turn an unreadable saved chat into an orphaned book.
        if (headers.some(header => !header?.chat_metadata || typeof header.chat_metadata !== 'object')) {
            throw new Error('Could not read all chat metadata. No lorebooks were deleted.');
        }
        const names = [...getNames()];
        const keep = referencedLorebooks([getSources(), headers.map(header => header.chat_metadata)], names);
        return names.filter(name => isCastwardLorebook(name) && !keep.has(name));
    }
    return {
        find: unused,
        async remove(names) {
            const allowed = new Set(await unused());
            let deleted = 0, failed = 0, skipped = 0;
            for (const name of new Set(names)) {
                if (!allowed.has(name)) { skipped++; continue; }
                // Recheck live references after each asynchronous host deletion.
                if (referencedLorebooks(getSources(), [name]).has(name)) { skipped++; continue; }
                try {
                    if (await deleteBook(name)) deleted++; else failed++;
                } catch { failed++; }
            }
            return { deleted, failed, skipped };
        },
    };
}
