import { EMOTION_LABELS, selectExpressionPrompt } from './expression-prompts.js';

function cancellableResult(task, signal) {
    if (!signal) return task;
    return new Promise((resolve, reject) => {
        const abort = () => reject(new DOMException('Expression generation cancelled.', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
}

/** Serialize edits, reuse missing-emotion jobs, and leave automatic failures for explicit retry. */
export function createExpressionGenerator({ edit, loadPack, upload, cleanup = async () => {} }) {
    const pending = new Map(), failed = new Map();
    let queue = Promise.resolve();
    return {
        generate(job, { retry = false, replace = false } = {}) {
            const key = JSON.stringify([job.owner, job.npcId, job.reference, job.folder, job.label,
                job.workflow, job.prompt, job.promptVariants, job.negativePrompt, job.imageSource, replace]);
            const existing = pending.get(key);
            if (existing && existing.job.signal === job.signal && !existing.job.signal?.aborted
                && existing.job.isCurrent()) return existing.task;
            if (!retry && failed.has(key)) return Promise.reject(failed.get(key));
            if (retry) failed.delete(key);
            const check = () => {
                if (job.signal?.aborted || !job.isCurrent()) throw new DOMException('Expression generation cancelled.', 'AbortError');
            };
            const execution = queue.then(async () => {
                check();
                if (!EMOTION_LABELS.includes(job.label)) throw new Error('Choose a supported emotion.');
                if (!job.reference || !job.folder || !(job.promptVariants?.some(prompt => prompt?.trim()) || job.prompt?.trim())) {
                    throw new Error('Choose an NPC reference image, sprite folder and expression prompt first.');
                }
                const sprites = await loadPack(job.folder);
                check();
                if (!replace && sprites.some(sprite => sprite.label === job.label)) return sprites;
                let url;
                try {
                    url = await edit({ reference: job.reference, prompt: selectExpressionPrompt(job),
                        negativePrompt: job.negativePrompt, workflow: job.workflow || undefined, signal: job.signal });
                    check();
                    await upload({ url, folder: job.folder, label: job.label, signal: job.signal, check });
                    check();
                    const refreshed = await loadPack(job.folder);
                    check();
                    if (!refreshed.some(sprite => sprite.label === job.label)) throw new Error('Generated sprite was not found in the pack.');
                    job.onSaved?.();
                    failed.delete(key);
                    return refreshed;
                } finally {
                    if (url) await Promise.resolve().then(() => cleanup(url))
                        .catch(error => console.warn('[Castward] Expression source cleanup failed:', error));
                }
            }).catch(error => {
                if (error.name !== 'AbortError' && !job.signal?.aborted && job.isCurrent()) {
                    failed.set(key, error);
                    if (failed.size > 128) failed.delete(failed.keys().next().value);
                }
                throw error;
            }).finally(() => { if (pending.get(key)?.execution === execution) pending.delete(key); });
            const task = cancellableResult(execution, job.signal);
            pending.set(key, { task, execution, job });
            queue = execution.catch(() => {});
            return task;
        },
    };
}
