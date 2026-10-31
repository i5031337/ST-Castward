const result = {};
let context, chatLength, fixture, settings, savedCards, savedNpcs, savedCast, savedExpressions, savedPerMessage, savedTts, savedEnabled, savedTracker, bridge;
try {
    const entry = [...document.scripts].find(script => script.src.includes('/SillyNPC-XP/index.js'));
    const root = new URL('.', entry.src).href;
    const { messageFormatting } = await import('/script.js');
    const { createCompletedLineStream } = await import(root + 'src/tts/line-stream.js');
    const { createNpcStreaming } = await import(root + 'src/tts/npc-streaming.js');
    const { readSpeechUnits } = await import(root + 'src/tts/speech-units.js');
    const { readDialogueRecords } = await import(root + 'src/chat/dialogue-presentation.js');
    const { streamFormatSource } = await import(root + 'src/tts/stream-format-source.js');
    const { readStreamingMessage, initNpcStreaming } = await import(root + 'src/tts/npc-stream-host.js');
    const { event_types } = await import('/scripts/events.js');
    const { getSettings } = await import(root + 'src/core/settings.js');
    context = SillyTavern.getContext();
    chatLength = context.chat.length;
    context.chat.push({ mes: '', is_user: false, swipe_id: 0 });
    fixture = document.createElement('div'); fixture.className = 'mes'; fixture.setAttribute('mesid', chatLength);
    fixture.innerHTML = '<div class="mes_text"></div>';
    document.querySelector('#chat').append(fixture);
    const cards = [{ id: 'streaming-ui-fixture', name: 'Streaming NPC', aliases: [] }];
    settings = getSettings(); savedCards = settings.characters; settings.characters = cards;
    savedExpressions = settings.autoGenerateNpcExpressions; settings.autoGenerateNpcExpressions = false;
    savedPerMessage = settings.npcExpressionsPerMessage;
    savedTts = settings.tts;
    savedEnabled = settings.enabled; settings.enabled = true;
    savedTracker = settings.statusTracker; settings.statusTracker = { ...savedTracker, enabled: true };
    savedNpcs = context.chatMetadata.sillynpc_npcs; savedCast = context.chatMetadata.sillynpc_cast;
    context.chatMetadata.sillynpc_npcs = [];
    context.chatMetadata.sillynpc_cast = { categories: null, include: [], exclude: [] };
    const units = source => {
        context.chat[chatLength].mes = source;
        fixture.querySelector('.mes_text').innerHTML = messageFormatting(streamFormatSource(source), 'Fixture', false, false, chatLength);
        return readSpeechUnits(fixture, { context, characters: cards,
            settings: { caseInsensitive: false }, ignoredLabels: [], personaFor: () => null, streaming: false });
    };
    const parser = createCompletedLineStream();
    const partial = parser.push('Streaming NPC: "A partial sentence');
    // Even if the display repairs a partial quotation, raw newline commitment remains empty.
    units(partial.source);
    result.partialHeld = units(partial.committed).length === 0;
    const first = parser.push('Streaming NPC: "A complete sentence."\nThe wind');
    const firstUnits = units(first.committed);
    result.firstLineAvailable = firstUnits.length === 1 && firstUnits[0].kind === 'dialogue'
        && firstUnits[0].text === 'A complete sentence.';
    const final = parser.push('Streaming NPC: "A complete sentence."\nThe wind blows.', { final: true });
    result.finalTail = final.lines.length === 1 && units(final.committed).at(-1).text === 'The wind blows.';
    result.finalNoRepeat = parser.push(final.source, { final: true }).lines.length === 0;
    const exclusions = createCompletedLineStream();
    const openFence = exclusions.push('```text\nStreaming NPC: "Hidden."\n');
    const openUnits = units(openFence.committed);
    result.openFenceExcluded = openUnits.length === 0;
    const source = '```text\nStreaming NPC: "Hidden."\n```\n\n<div hidden>Hidden prose.</div>\n\nStreaming NPC: "Visible."\n';
    const closedFence = exclusions.push(source);
    const visible = units(closedFence.committed);
    result.fencesAndHiddenExcluded = visible.length === 1 && visible[0].text === 'Visible.';
    const repeat = createCompletedLineStream().push('Streaming NPC: "Same."\nStreaming NPC: "Same."\n');
    result.repeatedLinesDistinct = repeat.lines.length === 2 && repeat.lines[0].id !== repeat.lines[1].id
        && units(repeat.committed).filter(unit => unit.text === 'Same.').length === 2;
    const baseline = 'Streaming NPC: "Old unfinished';
    const continuation = createCompletedLineStream({ baseline }).push(' quote."\nStreaming NPC: "New."\n');
    result.continuationExcludesOldLine = continuation.lines.filter(line => line.start >= baseline.length)
        .map(line => line.text).join('') === 'Streaming NPC: "New."';
    const rewrite = createCompletedLineStream();
    rewrite.push('Streaming NPC: "First."\n');
    result.committedRewriteRejected = rewrite.push('Streaming NPC: "Replaced."\n').invalidated === true;
    const queued = [], classified = [], published = [];
    let finalized = 0, cancelled = 0;
    const coordinator = createNpcStreaming({
        read: (source, state) => readStreamingMessage(source, { ...state, stoppingStrings: [] }, context),
        enqueue: (_state, added) => queued.push(...added.map(unit => unit.text)),
        classify: (_state, added) => classified.push(...added.map(line => line.text)),
        publish: state => published.push(state.records.length),
        finalize: () => finalized++, cancel: () => cancelled++,
    });
    const generation = coordinator.begin({ messageId: chatLength, current: () => true });
    coordinator.push('Streaming NPC: "First');
    result.coordinatorHoldsPartial = queued.length === 0;
    coordinator.push('Streaming NPC: "First."\nStreaming NPC: "Second');
    result.coordinatorEarlyPlayback = queued.join(',') === 'First.' && !generation.finished;
    coordinator.push('Streaming NPC: "First."\nStreaming NPC: "Second."', { final: true });
    coordinator.push('Streaming NPC: "First."\nStreaming NPC: "Second."', { final: true });
    result.coordinatorFinalNoReplay = queued.join(',') === 'First.,Second.' && finalized === 1;
    result.coordinatorClassifiesOnce = classified.join(',') === 'First.,Second.' && published.join(',') === '1,2';
    coordinator.begin({ messageId: chatLength, current: () => true });
    coordinator.push('Streaming NPC: "Stopped');
    coordinator.stop();
    coordinator.push('Streaming NPC: "Stopped."', { final: true });
    result.coordinatorStop = cancelled === 1 && queued.length === 2 && finalized === 1;
    const safeState = { messageId: chatLength, baseline: '', id: 'safe-reader', stoppingStrings: [] };
    result.readerOpenFence = readStreamingMessage('```text\nStreaming NPC: "Hidden."\n', safeState, context).units.length === 0;
    result.readerOpenHidden = readStreamingMessage('<div hidden>\nStreaming NPC: "Hidden."\n', safeState, context).units.length === 0;
    result.readerOpenQuote = readStreamingMessage('Streaming NPC: "Unfinished\n', safeState, context).units.length === 0;
    const trackerPrefix = 'Streaming NPC: "Before tracker."\n';
    const trackerPartial = trackerPrefix + '<status_update>\n{"player":{}}\n';
    const trackerComplete = trackerPartial + '</status_update>\n';
    const beforeTracker = readStreamingMessage(trackerPrefix, safeState, context);
    const duringTracker = readStreamingMessage(trackerPartial, safeState, context);
    const afterTracker = readStreamingMessage(trackerComplete, safeState, context);
    result.readerIncompleteTrackerExcluded = duringTracker.units.length === 1 && duringTracker.units[0].text === 'Before tracker.';
    result.readerCompleteTrackerExcluded = afterTracker.units.length === 1 && afterTracker.units[0].text === 'Before tracker.';
    result.readerTrackerKeepsDialogue = beforeTracker.records[0].text === duringTracker.records[0].text
        && beforeTracker.records[0].text === afterTracker.records[0].text;
    const earlierClassifications = classified.length;
    coordinator.begin({ messageId: chatLength, current: () => true });
    coordinator.push(trackerPrefix); coordinator.push(trackerPartial); coordinator.push(trackerComplete);
    result.trackerDoesNotReclassifyDialogue = classified.length === earlierClassifications + 1;
    coordinator.stop();
    const codeTracker = '```text\n<status_update>\n{"player":{}}\n</status_update>\n```\n';
    const codeTrackerUnits = readStreamingMessage(codeTracker, safeState, context).units;
    result.readerCodeTrackerExcluded = codeTrackerUnits.length === 0;
    const listeners = new Map();
    const events = { on: (name, callback) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); } };
    const emit = (name, ...args) => { for (const callback of listeners.get(name) || []) callback(...args); };
    const bridgeUnits = [], completedExpressions = []; let closes = 0, speechCancelled = 0, enqueuedState;
    settings.npcExpressionsPerMessage = true;
    const hostContext = { ...context, streamingProcessor: { messageId: chatLength, type: 'normal', continueMessage: '', stoppingStrings: [] } };
    bridge = initNpcStreaming({ context: () => hostContext, events, types: event_types,
        enqueue: (state, added) => { enqueuedState = state; bridgeUnits.push(...added.map(unit => unit.text)); },
        close: () => closes++, cancelSpeech: () => speechCancelled++, renderControl: () => {},
        completeFinalExpressions: (id, { records }) => completedExpressions.push({ id, records }) });
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    emit(event_types.GENERATION_STARTED, 'normal', {}, false);
    emit(event_types.STREAM_TOKEN_RECEIVED, 'Streaming NPC: "Wire partial');
    result.wirePartialHeld = bridgeUnits.length === 0;
    const wireSource = 'Streaming NPC: "Wire first."\nStreaming NPC: "Wire tail."';
    emit(event_types.STREAM_TOKEN_RECEIVED, wireSource);
    result.wireEarlyPlayback = bridgeUnits.join(',') === 'Wire first.' && closes === 0;
    units(wireSource);
    emit(event_types.GENERATION_ENDED);
    await frame();
    result.wireFinalFlush = bridgeUnits.join(',') === 'Wire first.,Wire tail.' && closes === 1 && bridge.handled(chatLength);
    result.wireMessageExpressionsAfterFinalization = completedExpressions.length === 1
        && completedExpressions[0].id === chatLength
        && completedExpressions[0].records.map(line => line.text).join(',') === 'Wire first.,Wire tail.'
        && completedExpressions[0].records.every(line => !line.streamId);
    emit(event_types.GENERATION_ENDED); await frame();
    result.wireFinalNoReplay = bridgeUnits.length === 2 && closes === 1;
    bridge.stop();
    hostContext.streamingProcessor = { messageId: chatLength, type: 'continue', continueMessage: wireSource, stoppingStrings: [] };
    emit(event_types.GENERATION_STARTED, 'continue', {}, false);
    emit(event_types.STREAM_TOKEN_RECEIVED, '\nStreaming NPC: "Wire continued."\n');
    result.wireContinueNoReplay = bridgeUnits.join(',') === 'Wire first.,Wire tail.,Wire continued.';
    bridge.stop();
    emit(event_types.STREAM_TOKEN_RECEIVED, '\nStreaming NPC: "Stopped."\n');
    emit(event_types.GENERATION_ENDED); await frame();
    result.wireStop = speechCancelled === 2 && bridgeUnits.length === 3 && closes === 1;
    emit(event_types.GENERATION_STARTED, 'regenerate', {}, false);
    bridge.stop({ preserveGeneration: true });
    context.chat[chatLength] = { mes: '', is_user: false, swipe_id: 0 };
    hostContext.streamingProcessor = { messageId: chatLength, type: 'regenerate', continueMessage: '', stoppingStrings: [] };
    emit(event_types.STREAM_TOKEN_RECEIVED, 'Streaming NPC: "Regenerated."\n');
    result.wireRegenerateDeletion = bridgeUnits.at(-1) === 'Regenerated.' && bridge.handled(chatLength);
    bridge.stop();
    emit(event_types.GENERATION_STARTED, 'normal', {}, false);
    bridge.stop();
    result.wireStopBeforeTokenSuppressesCompletion = bridge.handled(chatLength);
    emit(event_types.GENERATION_STARTED, 'normal', {}, false);
    result.wireLaterNonstreamGenerationAllowed = !bridge.handled(chatLength);
    bridge.stop();
    settings.tts = { ...savedTts, npcVoiceMode: 'designed' };
    emit(event_types.GENERATION_STARTED, 'normal', {}, false);
    hostContext.streamingProcessor = { messageId: chatLength, type: 'normal', continueMessage: '', stoppingStrings: [] };
    const voiceDialogue = 'Streaming NPC: "Voice fixture."\n';
    const pendingCue = '[[NPC_VOICE speaker="Streaming NPC" description="low provisional voice"]]';
    emit(event_types.STREAM_TOKEN_RECEIVED, voiceDialogue + pendingCue);
    result.wirePendingVoiceCueHeld = enqueuedState.cueCards.size === 0;
    const committedCue = '[[NPC_VOICE speaker="Streaming NPC" description="high committed voice"]]\n';
    emit(event_types.STREAM_TOKEN_RECEIVED, voiceDialogue + committedCue);
    result.wireRevisedVoiceCueCommitted = enqueuedState.cueCards.size === 1
        && enqueuedState.cueCards.get('streaming npc').presentation.voiceDesign.description === 'high committed voice';
    const cueCard = enqueuedState.cueCards.get('streaming npc');
    emit(event_types.STREAM_TOKEN_RECEIVED, voiceDialogue + committedCue + 'Streaming NPC: "Again."\n');
    result.wireVoiceCueIdentityStable = enqueuedState.cueCards.get('streaming npc') === cueCard;
    bridge.stop();
    settings.tts = savedTts;
    const beforeTrimmed = bridgeUnits.length, beforeTrimmedClose = closes;
    hostContext.streamingProcessor = { messageId: chatLength, type: 'normal', continueMessage: '', stoppingStrings: [] };
    emit(event_types.GENERATION_STARTED, 'normal', {}, false);
    emit(event_types.STREAM_TOKEN_RECEIVED, 'Streaming NPC: "Kept."\nAn unfinished tail');
    units('Streaming NPC: "Kept."');
    emit(event_types.GENERATION_ENDED); await frame();
    result.wireHostTrimmedTail = bridgeUnits.length === beforeTrimmed + 1
        && bridgeUnits.at(-1) === 'Kept.' && closes === beforeTrimmedClose + 1;
    bridge.stop();
    const beforeChangedClose = closes, beforeChangedCancel = speechCancelled;
    hostContext.streamingProcessor = { messageId: chatLength, type: 'normal', continueMessage: '', stoppingStrings: [] };
    emit(event_types.GENERATION_STARTED, 'normal', {}, false);
    emit(event_types.STREAM_TOKEN_RECEIVED, 'Streaming NPC: "Original."\n');
    units('Streaming NPC: "Translated."');
    emit(event_types.GENERATION_ENDED); await frame();
    result.wireChangedFinalDisplayCancels = closes === beforeChangedClose
        && speechCancelled === beforeChangedCancel + 1;
} catch (error) { result.error = String(error.stack || error); }
finally {
    bridge?.stop();
    if (context && chatLength !== undefined) context.chat.splice(chatLength);
    if (settings) {
        settings.characters = savedCards; settings.autoGenerateNpcExpressions = savedExpressions;
        settings.npcExpressionsPerMessage = savedPerMessage;
        settings.tts = savedTts; settings.enabled = savedEnabled; settings.statusTracker = savedTracker;
    }
    if (context) {
        if (savedNpcs === undefined) delete context.chatMetadata.sillynpc_npcs;
        else context.chatMetadata.sillynpc_npcs = savedNpcs;
        if (savedCast === undefined) delete context.chatMetadata.sillynpc_cast;
        else context.chatMetadata.sillynpc_cast = savedCast;
    }
    fixture?.remove();
}
document.documentElement.setAttribute('data-npc-streaming-fixture', JSON.stringify(result));
