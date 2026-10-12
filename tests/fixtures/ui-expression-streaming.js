/** Unsaved host-context checks for committed lines and expression finalization. */
export async function verifyExpressionStreaming({ root, runtime, context, fixture, chatLength, sprites }) {
    const { readDialogueRecords } = await import(root + 'src/chat/dialogue-presentation.js');
    const { setDialogueStream, clearDialogueStream } = await import(root + 'src/chat/dialogue-stream-state.js');
    const { rememberDialoguePortrait } = await import(root + 'src/expressions/dialogue-portraits.js');
    const result = {}, message = context.chat[chatLength], source = message.mes;
    const originalExtra = structuredClone(message.extra);
    const ordinary = readDialogueRecords(fixture, { streaming: false });
    const records = ordinary.slice(0, 2).map(line => ({ ...line, streamId: 'expression-stream-fixture', revision: 'expression-stream-fixture' }));
    const state = { id: 'expression-stream-fixture', messageId: chatLength, records: [records[0]], current: () => context.chat[chatLength] === message };
    let calls = 0, portraitWrites = 0, spriteWrites = 0, release, pending;
    const adapters = {
        saveBinding: () => {}, loadPack: async () => sprites,
        rememberSprite: () => spriteWrites++,
        savePortrait: (job, label) => rememberDialoguePortrait(job, label, { save: () => portraitWrites++ }),
        classify: async job => {
            calls++;
            if (job.line.lineIndex === 1) return new Promise(resolve => { release = resolve; });
            return 'neutral';
        },
    };
    try {
        runtime.resetNpcExpressions();
        delete message.extra;
        message.mes = 'Expression A: "First."\nExpression B: "Sec';
        setDialogueStream(state);
        await runtime.completeNpcExpressions(chatLength, { ...adapters, records: state.records });
        message.mes += 'ond."\nExpression A: "La';
        const growing = readDialogueRecords(fixture);
        result.streamExpressionIdentityStable = growing[0] === records[0] && growing[0].revision === state.id;
        await runtime.completeNpcExpressions(chatLength, { ...adapters, records: state.records });
        runtime.renderNpcExpressions(fixture);
        result.streamExpressionClassifiedOnce = calls === 1;
        result.streamStaticPortrait = fixture.querySelector('.sillynpc-chat-avatar').dataset.sillynpcExpression === 'neutral';
        result.streamExpressionNoWrites = portraitWrites === 0 && spriteWrites === 0 && !message.extra;

        state.records.push(records[1]);
        pending = runtime.completeNpcExpressions(chatLength, { ...adapters, records: [records[1]] });
        for (let i = 0; i < 50 && !release; i++) await new Promise(resolve => setTimeout(resolve, 10));
        if (!release) throw new Error('Streaming expression classifier did not start.');
        message.mes = source;
        state.finished = true;
        const finalRecords = readDialogueRecords(fixture, { streaming: false });
        runtime.adoptStreamExpressions(chatLength, finalRecords);
        await runtime.completeNpcExpressions(chatLength, { ...adapters, records: finalRecords.slice(0, 2) });
        release('joy'); await pending;
        result.streamPendingExpressionAdopted = calls === 2 && portraitWrites === 2 && spriteWrites === 2;
        const beforeSpeech = [...fixture.querySelectorAll('.sillynpc-chat-avatar')].map(avatar => avatar.src).join('|');
        runtime.showNpcSpeechExpression({ ...records[1], kind: 'dialogue', dialogueLineIndex: 1, dialogueText: records[1].text });
        result.streamSpeechUsesFinalExpression = document.querySelector('#sillynpc-speech-sprite img')?.src.includes('expression=joy') === true;
        result.streamSpeechKeepsStaticPortraits = beforeSpeech === [...fixture.querySelectorAll('.sillynpc-chat-avatar')].map(avatar => avatar.src).join('|');
        runtime.resetNpcExpressions();
        runtime.renderNpcExpressions(fixture);
        result.streamFinalPortraitSurvivesReset = [...fixture.querySelectorAll('.sillynpc-chat-avatar')]
            .slice(0, 2).map(avatar => avatar.dataset.sillynpcExpression).join(',') === 'neutral,joy';
    } finally {
        clearDialogueStream();
        runtime.resetNpcExpressions();
        release?.('joy');
        await pending;
        message.mes = source;
        if (originalExtra === undefined) delete message.extra;
        else message.extra = originalExtra;
    }
    return result;
}
