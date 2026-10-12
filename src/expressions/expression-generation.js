import { EMOTION_LABELS } from './expression-prompts.js';

/** Serialize edits, reuse missing-emotion jobs, and leave automatic failures for explicit retry. */
export function createExpressionGenerator({ edit, loadPack, upload }) {
    const pending = new Map(), failed = new Map();
    let queue = Promise.resolve();
    return {
        generate(job, { retry = false, replace = false } = {}) {
            const key = JSON.stringify([job.owner, job.npcId, job.reference, job.folder, job.label,
                job.workflow, job.prompt, job.negativePrompt]);
            if (pending.has(key)) return pending.get(key);
            if (!retry && failed.has(key)) return Promise.reject(failed.get(key));
            if (retry) failed.delete(key);
            const check = () => {
                if (job.signal?.aborted || !job.isCurrent()) throw new DOMException('Expression generation cancelled.', 'AbortError');
            };
            const task = queue.then(async () => {
                check();
                if (!EMOTION_LABELS.includes(job.label)) throw new Error('Choose a supported emotion.');
                if (!job.reference || !job.folder || !job.prompt?.trim()) throw new Error('Choose an NPC reference image, sprite folder and expression prompt first.');
                const sprites = await loadPack(job.folder);
                check();
                if (!replace && sprites.some(sprite => sprite.label === job.label)) return sprites;
                const url = await edit({ reference: job.reference, prompt: job.prompt,
                    negativePrompt: job.negativePrompt, workflow: job.workflow || undefined, signal: job.signal });
                check();
                await upload({ url, folder: job.folder, label: job.label, signal: job.signal, check });
                check();
                const refreshed = await loadPack(job.folder);
                check();
                if (!refreshed.some(sprite => sprite.label === job.label)) throw new Error('Generated sprite was not found in the pack.');
                return refreshed;
            }).catch(error => {
                if (error.name !== 'AbortError') {
                    failed.set(key, error);
                    if (failed.size > 128) failed.delete(failed.keys().next().value);
                }
                throw error;
            }).finally(() => { if (pending.get(key) === task) pending.delete(key); });
            pending.set(key, task);
            queue = task.catch(() => {});
            return task;
        },
    };
}
