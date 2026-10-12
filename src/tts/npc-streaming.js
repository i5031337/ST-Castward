import { createCompletedLineStream } from './line-stream.js';

export const speechUnitKey = unit => JSON.stringify([unit.kind, unit.npcId, unit.speakerLabel, unit.text, unit.dialogueLineIndex]);
let serial = 0;

/** Generation-scoped producer. Reads and playback are adapters so raw boundaries stay testable. */
export function createNpcStreaming({ read, publish, enqueue, classify, finalize, cancel }) {
    let state = null;
    function stop() {
        if (state) state.cancelled = true;
        cancel();
    }
    function begin({ messageId, baseline = '', current }) {
        state = { id: `npc-stream-${++serial}`, messageId, baseline, current,
            parser: createCompletedLineStream({ baseline }), raw: '', records: [], keys: [],
            cancelled: false, finished: false, seen: false };
        return state;
    }
    function push(raw, { final = false } = {}) {
        const job = state;
        if (!job || job.cancelled || job.finished || !job.current()) return false;
        job.seen = true; job.raw = raw;
        const update = job.parser.push(raw, { final });
        if (update.invalidated) { stop(); return true; }
        job.committed = update.committed;
        job.finishing = final;
        if (update.lines.length || final) {
            const { records, units } = read(update.committed, job);
            const keys = units.map(speechUnitKey);
            if (job.keys.some((key, index) => keys[index] !== key)) { stop(); return true; }
            const previous = job.records;
            job.records = records;
            publish(job);
            const added = records.filter(line => !previous.some(old => old.lineIndex === line.lineIndex
                && old.npcId === line.npcId && old.text === line.text));
            Promise.resolve(classify(job, added)).catch(error => console.warn('[SillyNPC] Streaming expressions failed', error));
            enqueue(job, units.slice(job.keys.length));
            job.keys = keys;
        }
        if (final) { job.finished = true; finalize(job); }
        return true;
    }
    return { begin, push, stop, current: () => state,
        handled: messageId => state?.messageId === Number(messageId) && state.seen };
}
