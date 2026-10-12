/** Only a changed, completed foreground reply authorizes automatic presentation work. */
export function wireExpressionEvents({ events, types, renderedEvent, render, reset,
    latestId, revision, sourceToken = revision, defer, complete }) {
    let generation = null;
    let version = 0;
    const invalidate = clear => { version++; generation = null; reset({ clear }); };
    events.on(renderedEvent, render);
    events.on(types.GENERATION_STARTED, (type, _data, dryRun) => {
        if (dryRun || !['normal', 'swipe', 'regenerate', 'continue'].includes(type)) return;
        invalidate(false);
        const id = latestId();
        generation = { before: revision(id), token: sourceToken(id), replacementId: id,
            awaitingDeletion: type === 'regenerate' };
    });
    events.on(types.GENERATION_STOPPED, () => invalidate(false));
    events.on(types.GENERATION_ENDED, () => {
        if (generation === null) return;
        const source = generation;
        generation = null;
        const id = latestId(), identity = revision(id), captured = version;
        if (identity === source.before && sourceToken(id) === source.token) return;
        const token = sourceToken(id);
        defer(() => {
            if (version === captured && sourceToken(id) === token) {
                Promise.resolve(complete(id)).catch(error => console.warn('[SillyNPC] Expressions failed', error));
            }
        });
    });
    events.on(types.MESSAGE_DELETED, newLength => {
        // Regenerate removes exactly the outgoing last reply after GENERATION_STARTED.
        if (generation?.awaitingDeletion && Number(newLength) === generation.replacementId
            && latestId() === generation.replacementId - 1) {
            generation.awaitingDeletion = false;
            version++; reset({ clear: false });
            return;
        }
        invalidate(false);
    });
    for (const event of [types.CHAT_CHANGED, types.MESSAGE_SWIPED, types.MESSAGE_EDITED]) {
        events.on(event, () => invalidate(event === types.CHAT_CHANGED));
    }
}
