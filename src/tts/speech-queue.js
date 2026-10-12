/** Keep synthesis ahead of ordered playback while completed lines arrive. */
export function createSpeechQueue({ synthesize, playAudio, valid, prepare = async () => {}, onState = () => {} }) {
    let active = null;
    let serial = 0;
    const stop = () => {
        if (!active) return;
        const job = active;
        active = null;
        job.controller.abort();
        onState('idle', job);
    };
    const start = (messageId, revision) => {
        stop();
        const job = { id: ++serial, messageId, revision, controller: new AbortController() };
        active = job;
        const current = () => active === job && !job.controller.signal.aborted && valid(job);
        const spoken = [], ready = [], consumed = [];
        let closed = false, wake = () => {};
        job.controller.signal.addEventListener('abort', () => wake(), { once: true });
        job.append = units => {
            if (closed || !current()) return false;
            for (const unit of units.filter(unit => unit.voice)) {
                const i = spoken.length;
                spoken.push(unit);
                let release;
                consumed.push({ promise: new Promise(resolve => { release = resolve; }), release });
                const previous = i ? ready[i - 1] || Promise.resolve(null) : Promise.resolve(null);
                const space = i >= 3 ? consumed[i - 3].promise : Promise.resolve();
                ready.push(Promise.all([previous, space]).then(async ([prior]) => {
                    if (prior?.error || prior?.skip || !current()) return { skip: true };
                    return { blob: await synthesize(unit, job.controller.signal) };
                }).catch(error => ({ error })));
            }
            wake();
            return true;
        };
        job.close = () => { closed = true; wake(); };
        onState('working', job);
        // Expression classification must not delay or prevent speech.
        Promise.resolve().then(() => current() && prepare(job)).catch(error => {
            if (current()) onState('prepare-error', job, error);
        });
        job.done = (async () => {
            try {
                let i = 0;
                while (current()) {
                    if (i === spoken.length) {
                        if (closed) break;
                        await new Promise(resolve => { wake = resolve; });
                        continue;
                    }
                    const result = await ready[i];
                    ready[i] = null;
                    if (!current()) { delete result.blob; break; }
                    if (result.error) throw result.error;
                    if (result.skip) break;
                    const unit = spoken[i];
                    try {
                        await playAudio(result.blob, job.controller.signal, () => {
                            if (current()) onState('playing', job, unit);
                        });
                    } finally { delete result.blob; }
                    if (current()) onState('ended', job, unit);
                    consumed[i].release();
                    i++;
                }
            } catch (error) {
                if (active === job && !job.controller.signal.aborted) onState('error', job, error);
            } finally {
                job.controller.abort();
                consumed.forEach(item => item.release());
                // Pending synthesis can settle after Stop; discard its retained audio too.
                for (const result of ready) result?.then(value => { delete value.blob; });
                ready.length = 0;
                if (active === job) { active = null; onState('idle', job); }
            }
        })();
        return job;
    };
    const play = (messageId, revision, units) => {
        const job = start(messageId, revision);
        job.append(units);
        job.close();
        return job.done;
    };
    return { start, play, stop, current: () => active };
}
