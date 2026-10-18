/** Authorize automatic speech only for changed, completed foreground replies. */
export function wireSpeechEvents({ events, types, renderedEvent, render, stop,
    latestId, revision, sourceToken, defer, complete }) {
    let generation = null;
    let version = 0;
    const invalidate = () => { version++; generation = null; stop(); };
    events.on(renderedEvent, render);
    events.on(types.GENERATION_STARTED, (type, _data, dryRun) => {
        if (dryRun || !['normal', 'swipe', 'regenerate', 'continue'].includes(type)) return;
        invalidate();
        const id = latestId();
        generation = { before: revision(id), token: sourceToken(id), replacementId: id,
            awaitingDeletion: type === 'regenerate' };
    });
    events.on(types.GENERATION_STOPPED, invalidate);
    events.on(types.GENERATION_ENDED, () => {
        if (generation === null) return;
        const before = generation;
        generation = null;
        const id = latestId(), after = revision(id), token = sourceToken(id), captured = version;
        if (after === before.before && token === before.token) return;
        defer(() => {
            if (version !== captured || sourceToken(id) !== token) return;
            Promise.resolve(complete(id)).catch(error => console.warn('[Castward] Automatic speech failed', error));
        });
    });
    events.on(types.MESSAGE_DELETED, newLength => {
        if (generation?.awaitingDeletion && Number(newLength) === generation.replacementId
            && latestId() === generation.replacementId - 1) {
            generation.awaitingDeletion = false;
            version++; stop({ preserveGeneration: true });
            return;
        }
        invalidate();
    });
    for (const event of [types.CHAT_CHANGED, types.MESSAGE_SWIPED, types.MESSAGE_EDITED]) events.on(event, invalidate);
}
