/** Coordinate a completed reply's image work with its background tracker read. */
export function shouldWaitForTrackerRead(settings, hasChat) {
    return Boolean(hasChat && settings.npcExpressionsRefreshOnImagePrompt
        && settings.statusTracker?.enabled && ['extract', 'inline'].includes(settings.statusTracker.extractionMode));
}

export function createTrackerReadGate() {
    const entries = new WeakMap();
    const entryFor = message => {
        let entry = entries.get(message);
        if (!entry) {
            entry = { finished: false };
            entry.promise = new Promise(resolve => { entry.resolve = resolve; });
            entries.set(message, entry);
        }
        return entry;
    };
    const release = entry => {
        if (entry.finished) return;
        entry.finished = true;
        entry.resolve();
    };
    return {
        register(message, task) {
            if (!message) return;
            const entry = entryFor(message);
            entry.registered = true;
            Promise.resolve(task).then(() => release(entry), () => release(entry));
        },
        hasRegistration(message) { return Boolean(message && entries.get(message)?.registered); },
        forget(message) { if (message) entries.delete(message); },
        wait(message, signal) {
            if (!message) return Promise.resolve();
            const pending = entryFor(message).promise;
            if (!signal) return pending;
            if (signal.aborted) return Promise.reject(signal.reason || new DOMException('Cancelled', 'AbortError'));
            return new Promise((resolve, reject) => {
                const abort = () => reject(signal.reason || new DOMException('Cancelled', 'AbortError'));
                signal.addEventListener('abort', abort, { once: true });
                pending.then(() => { signal.removeEventListener('abort', abort); resolve(); });
            });
        },
    };
}

export const trackerReadGate = createTrackerReadGate();
