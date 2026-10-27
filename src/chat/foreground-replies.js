/** Authorize automatic presentation only for changed, completed foreground replies. */
export function wireForegroundReplyEvents({ events, types, renderedEvent, render, cancel, onError,
    latestId, revision, sourceToken = revision, defer, complete }) {
    let generation = null;
    let version = 0;
    const invalidate = event => {
        version++;
        generation = null;
        cancel({ event, preserveGeneration: false });
    };
    events.on(renderedEvent, render);
    events.on(types.GENERATION_STARTED, (type, _data, dryRun) => {
        if (dryRun || !['normal', 'swipe', 'regenerate', 'continue'].includes(type)) return;
        invalidate(types.GENERATION_STARTED);
        const id = latestId();
        generation = { before: revision(id), token: sourceToken(id), replacementId: id,
            awaitingDeletion: type === 'regenerate' };
    });
    events.on(types.GENERATION_ENDED, () => {
        if (generation === null) return;
        const before = generation;
        generation = null;
        const id = latestId(), after = revision(id), token = sourceToken(id), captured = version;
        if (after === before.before && token === before.token) return;
        defer(() => {
            if (version !== captured || sourceToken(id) !== token) return;
            Promise.resolve(complete(id)).catch(onError);
        });
    });
    events.on(types.MESSAGE_DELETED, newLength => {
        // Regenerate removes exactly the outgoing last reply after GENERATION_STARTED.
        if (generation?.awaitingDeletion && Number(newLength) === generation.replacementId
            && latestId() === generation.replacementId - 1) {
            generation.awaitingDeletion = false;
            version++;
            cancel({ event: types.MESSAGE_DELETED, preserveGeneration: true });
            return;
        }
        invalidate(types.MESSAGE_DELETED);
    });
    for (const event of [types.GENERATION_STOPPED, types.CHAT_CHANGED, types.MESSAGE_SWIPED, types.MESSAGE_EDITED]) {
        events.on(event, () => invalidate(event));
    }
}
