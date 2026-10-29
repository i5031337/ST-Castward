/** Deferred profile work stores names and provenance, never an unreviewed starting sheet. */
export function createNpcProfileFollowups({ getContext, getSettings, getPersona, latestIndex,
    ruleSignature, pendingChanges, generate, onChange = () => {} }) {
    const known = new Map();
    const active = new Map();
    const reportFor = message => message?.extra?.sillynpc_reader_report;
    const enabled = () => getSettings().enabled && getSettings().statusTracker.enabled
        && getSettings().statusTracker.autoGenerateNpcProfiles === true;
    function current(job) {
        const context = getContext();
        const scope = job.record;
        return enabled() && context?.chatMetadata === job.metadata && context.chat?.[job.id] === job.message
            && reportFor(job.message) === job.report && job.report.npcProfiles === scope
            && latestIndex(context.chat) === job.id && context.getCurrentChatId?.() === scope.chatId
            && job.message.mes === scope.text && Number(job.message.swipe_id ?? 0) === scope.swipe
            && getSettings().activeSystem === scope.system && getPersona() === scope.persona
            && ruleSignature(getSettings()) === scope.rules;
    }
    function changed(job) {
        const context = getContext();
        if (context?.chatMetadata === job.metadata && context.chat?.[job.id] === job.message
            && reportFor(job.message) === job.report) onChange(job.id, job.message, job.report);
    }
    function cancel(job) {
        const running = active.get(job.message);
        if (running?.job === job) { running.controller.abort(); active.delete(job.message); }
        job.record.status = 'cancelled';
        if (known.get(job.message) === job) known.delete(job.message);
        changed(job);
    }
    function resume(messageId, { signal } = {}) {
        const id = Number(messageId);
        const context = getContext();
        const message = context?.chat?.[id];
        const report = reportFor(message);
        const record = report?.npcProfiles;
        if (!record || !['waiting', 'running'].includes(record.status)) return Promise.resolve({});
        const job = known.get(message) || [...known.values()].find(entry => entry.record === record)
            || { id, message, report, record, metadata: context.chatMetadata };
        known.set(job.message, job);
        if (!current(job) || signal?.aborted) { cancel(job); return Promise.resolve({ cancelled: true }); }
        if (pendingChanges(id).length) {
            if (active.has(message)) cancel(job);
            return Promise.resolve({ deferred: true });
        }
        if (active.has(message)) return active.get(message).promise;
        const controller = new AbortController();
        const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
        const isCurrent = () => !combined.aborted && current(job) && pendingChanges(id).length === 0;
        record.status = 'running';
        changed(job);
        const promise = Promise.resolve().then(async () => {
            try {
                if (!isCurrent()) return { cancelled: true };
                const result = await generate(record.names, isCurrent, combined);
                if (!isCurrent()) { record.status = 'cancelled'; return { cancelled: true }; }
                Object.assign(record, result, { status: 'done' });
                return result;
            } catch (error) {
                record.status = combined.aborted || error?.name === 'AbortError' ? 'cancelled' : 'failed';
                if (record.status === 'failed') record.error = error?.message || String(error);
                return { cancelled: record.status === 'cancelled', failed: record.status === 'failed' ? 1 : 0 };
            } finally {
                if (record.status === 'running') record.status = 'cancelled';
                if (active.get(message)?.controller === controller) active.delete(message);
                if (known.get(message) === job) known.delete(message);
                changed(job);
            }
        });
        active.set(message, { job, controller, promise });
        return promise;
    }
    return {
        schedule(messageId, names, { signal } = {}) {
            if (!enabled() || !names.length) return Promise.resolve({});
            const id = Number(messageId), context = getContext(), message = context?.chat?.[id];
            const report = reportFor(message);
            if (!report) return Promise.resolve({});
            const previous = known.get(message);
            if (previous) cancel(previous);
            report.npcProfiles = { status: 'waiting', names: [...new Set(names)],
                chatId: context.getCurrentChatId?.(), text: message.mes, swipe: Number(message.swipe_id ?? 0),
                system: getSettings().activeSystem, persona: getPersona(), rules: ruleSignature(getSettings()) };
            const job = { id, message, report, record: report.npcProfiles, metadata: context.chatMetadata };
            known.set(message, job);
            changed(job);
            return resume(id, { signal });
        },
        resume,
        clear(from = 0) {
            const context = getContext();
            for (const [id, message] of (context?.chat || []).entries()) {
                const report = reportFor(message), record = report?.npcProfiles;
                if (id >= from && ['waiting', 'running'].includes(record?.status) && !known.has(message)) {
                    known.set(message, { id, message, report, record, metadata: context.chatMetadata });
                }
            }
            for (const job of [...known.values()]) if (job.id >= from) cancel(job);
        },
    };
}

export function npcProfileFollowupSummary(record) {
    if (!record) return '';
    if (record.status === 'waiting') return 'NPC profiles waiting for review';
    if (record.status === 'running') return 'Filling NPC profiles';
    if (record.status === 'cancelled') return 'NPC profile filling cancelled';
    if (record.status === 'failed') return 'NPC profile filling failed';
    return [record.generated ? `${record.generated} NPC profile(s) generated` : '',
        record.failed ? `${record.failed} NPC profile(s) failed` : ''].filter(Boolean).join(' · ');
}
