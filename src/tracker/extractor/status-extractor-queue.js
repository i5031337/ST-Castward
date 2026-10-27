/** Serialize readings while retaining the exact chat, persona, System and reply requested. */
export function createExtractionQueue({ getContext, getSettings, getCurrentPersonaKey, startGenerationTask, extract }) {
    const waiting = [];
    let active = null;
    const skipped = reason => ({ applied: false, reason });

    function submit(messageText, messageId, options = {}) {
        const context = getContext();
        const message = context?.chat?.[Number(messageId)];
        const scope = { metadata: context?.chatMetadata, persona: getCurrentPersonaKey(),
            system: getSettings().activeSystem, message, text: message?.mes,
            swipe: Number(message?.swipe_id ?? 0) };
        const same = entry => entry.messageId === Number(messageId)
            && Object.keys(scope).every(key => entry.scope[key] === scope[key])
            && ['force', 'manual', 'regenerate'].every(key => Boolean(entry.options[key]) === Boolean(options[key]));
        const existing = [active, ...waiting].find(entry => entry && !entry.task.signal.aborted && same(entry));
        if (existing) return existing.promise;

        const task = startGenerationTask({ getPersonaKey: getCurrentPersonaKey });
        let resolve, reject;
        const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
        const entry = { messageText, messageId: Number(messageId), options: { ...options }, scope,
            task, promise, resolve, reject };
        entry.cancel = () => {
            const index = waiting.indexOf(entry);
            if (index < 0) return;
            waiting.splice(index, 1);
            finish(entry, skipped('cancelled'));
        };
        task.signal.addEventListener('abort', entry.cancel, { once: true });
        waiting.push(entry);
        drain();
        return promise;
    }

    function finish(entry, result, error) {
        entry.task.signal.removeEventListener('abort', entry.cancel);
        entry.task.finish();
        if (error) entry.reject(error);
        else entry.resolve(result);
    }

    function isCurrent(entry) {
        const context = getContext();
        const scope = entry.scope;
        return context?.chatMetadata === scope.metadata && getCurrentPersonaKey() === scope.persona
            && getSettings().activeSystem === scope.system
            && context?.chat?.[entry.messageId] === scope.message
            && scope.message?.mes === scope.text
            && Number(scope.message?.swipe_id ?? 0) === scope.swipe;
    }

    async function drain() {
        if (active) return;
        while (waiting.length) {
            const entry = waiting.shift();
            active = entry;
            try {
                const result = entry.task.signal.aborted ? skipped('cancelled')
                    : !isCurrent(entry) ? skipped('reply changed while waiting')
                    : await extract(entry.messageText, entry.messageId, entry.options, entry.task.signal);
                finish(entry, result);
            } catch (error) {
                finish(entry, null, error);
            } finally {
                active = null;
            }
        }
    }

    return {
        submit,
        clear() {
            for (const entry of [...waiting]) entry.task.abort();
            active?.task.abort();
        },
        forgetFrom(index) {
            for (const entry of [...waiting]) {
                if (entry.messageId >= index) entry.task.abort();
            }
        },
    };
}
