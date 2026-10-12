import { fnv1a } from '../core/hash.js';

export function lastNpcLines(records) {
    const lines = new Map();
    for (const line of records) if (line.npcId && !line.isPersona) lines.set(line.npcId, line);
    return [...lines.values()].sort((a, b) => a.lineIndex - b.lineIndex);
}

export function selectSprite(sprites, label, fallback, identity) {
    for (const candidate of [label, fallback]) {
        const files = sprites.filter(sprite => sprite.label === candidate).map(sprite => sprite.path).sort();
        if (files.length) return files[fnv1a(identity) % files.length];
    }
    return '';
}

/** Bound each request and invalidate the queue without retaining obsolete work. */
export function createExpressionEngine({ classify, isCurrent, apply, limit = 128, timeoutMs = 15000 }) {
    const cache = new Map(), pending = new Map();
    let queue = Promise.resolve(), epoch = 0, controller = new AbortController();
    return {
        reset() {
            epoch++; controller.abort(); controller = new AbortController();
            cache.clear(); pending.clear(); queue = Promise.resolve();
        },
        cached(key) { return cache.get(key); },
        enqueue(job) {
            const vocabulary = [...new Set(job.labels || (job.sprites || []).map(sprite => sprite.label))].sort();
            const key = JSON.stringify([job.line.revision, job.line.npcId, job.line.lineIndex, job.line.text,
                job.config, job.preferences, vocabulary]);
            if (cache.has(key)) {
                if (isCurrent(job)) apply(job, cache.get(key));
                return Promise.resolve(cache.get(key));
            }
            const existing = pending.get(key);
            if (existing && !existing.signal?.aborted) return existing.task;
            const version = epoch, ownerSignal = controller.signal;
            const current = () => version === epoch && !job.signal?.aborted && isCurrent(job);
            const task = queue.then(async () => {
                if (!current()) return;
                const request = new AbortController();
                const signal = AbortSignal.any([ownerSignal, request.signal, ...(job.signal ? [job.signal] : [])]);
                let timer, onAbort;
                const interrupted = new Promise((_, reject) => {
                    onAbort = () => reject(signal.reason || new DOMException('Cancelled', 'AbortError'));
                    signal.addEventListener('abort', onAbort, { once: true });
                    timer = setTimeout(() => request.abort(new DOMException('Expression classification timed out', 'TimeoutError')), timeoutMs);
                });
                try {
                    const label = await Promise.race([classify({ ...job, signal }), interrupted]);
                    if (!current()) return;
                    cache.set(key, label);
                    if (cache.size > limit) cache.delete(cache.keys().next().value);
                    apply(job, label);
                    return label;
                } catch (error) {
                    if (error.name !== 'AbortError') throw error;
                } finally {
                    clearTimeout(timer); signal.removeEventListener('abort', onAbort);
                }
            }).finally(() => { if (pending.get(key)?.task === task) pending.delete(key); });
            pending.set(key, { task, signal: job.signal });
            queue = task.catch(() => {});
            return task;
        },
    };
}
