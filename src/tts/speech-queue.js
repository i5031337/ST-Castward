/** Keep synthesis ahead of ordered playback without buffering an entire message. */
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
    const play = async (messageId, revision, units) => {
        stop();
        const job = { id: ++serial, messageId, revision, controller: new AbortController() };
        active = job;
        const current = () => active === job && !job.controller.signal.aborted && valid(job);
        onState('working', job);
        // Expression classification must not delay or prevent speech.
        Promise.resolve().then(() => current() && prepare(job)).catch(error => {
            if (current()) onState('prepare-error', job, error);
        });
        if (active !== job || job.controller.signal.aborted || !valid(job)) {
            if (active === job) stop();
            return;
        }
        const spoken = units.filter(unit => unit.voice);
        const consumed = spoken.map(() => {
            let release;
            const promise = new Promise(resolve => { release = resolve; });
            return { promise, release };
        });
        const ready = [];
        for (let i = 0; i < spoken.length; i++) {
            const previous = i ? ready[i - 1] : Promise.resolve(null);
            const space = i >= 3 ? consumed[i - 3].promise : Promise.resolve();
            ready.push(Promise.all([previous, space]).then(async ([prior]) => {
                if (prior?.error || prior?.skip || !current()) return { skip: true };
                return { blob: await synthesize(spoken[i], job.controller.signal) };
            }).catch(error => ({ error })));
        }
        try {
            for (let i = 0; i < spoken.length; i++) {
                const result = await ready[i];
                ready[i] = null;
                if (!current()) { delete result.blob; break; }
                if (result.error) throw result.error;
                if (result.skip) break;
                try {
                    await playAudio(result.blob, job.controller.signal, () => {
                        if (current()) onState('playing', job, spoken[i]);
                    });
                } finally { delete result.blob; }
                if (current()) onState('ended', job, spoken[i]);
                consumed[i].release();
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
    };
    return { play, stop, current: () => active };
}
