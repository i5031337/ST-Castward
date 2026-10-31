import { eventSource, event_types } from '../../../../../events.js';
import { getContext } from '../../../../../st-context.js';
import { cleanUpMessage } from '../../../../../../script.js';
import { getSettings } from '../core/settings.js';
import { parseMessageForUpdates } from '../tracker/status-logic.js';
import { readDialogueRecords, dialogueRevision } from '../chat/dialogue-presentation.js';
import { setDialogueStream, clearDialogueStream } from '../chat/dialogue-stream-state.js';
import { decorateStreamingDialogue } from '../chat/chat-portraits.js';
import { completeNpcExpressions, adoptStreamExpressions, renderNpcExpressions } from '../expressions/npc-expressions.js';
import { readSpeechUnits } from './speech-units.js';
import { createNpcStreaming, speechUnitKey } from './npc-streaming.js';
import { parseVoiceCues, stripVoiceCueNodes, voiceCueKey } from './voice-cue-format.js';
import { makeId } from '../core/utils.js';
import { retainVoiceCues } from './voice-cues.js';
import { usesDesignedNpcVoices } from './tts-settings.js';
import { streamFormatSource, stripSpeechFences } from './stream-format-source.js';

const elementFor = id => document.querySelector(`#chat .mes[mesid="${Number(id)}"]`);
const chatIdentity = context => JSON.stringify([context.getCurrentChatId?.(), context.characterId, context.groupId]);

/** Feed only actual completed source lines through the host's normal formatter. */
export function readStreamingMessage(source, state, context = getContext()) {
    const message = context.chat[state.messageId];
    const fixture = document.createElement('div');
    fixture.setAttribute('mesid', state.messageId);
    const text = document.createElement('div'); text.className = 'mes_text'; fixture.append(text);
    const format = value => {
        let source = streamFormatSource(cleanUpMessage({ getMessage: streamFormatSource(value),
            isContinue: Boolean(state.baseline), displayIncompleteSentences: true,
            // The host's temporary permission for persona dialogue is restored before our final frame.
            trimWrongNames: !getSettings().dialogueFormatEnabled,
            stoppingStrings: state.stoppingStrings }));
        source = stripSpeechFences(source);
        if (getSettings().statusTracker?.enabled) source = parseMessageForUpdates(source).cleanedText;
        return context.messageFormatting(source, message.name, message.is_system, message.is_user, state.messageId, {}, false);
    };
    text.innerHTML = format(source);
    const records = readDialogueRecords(fixture, { context, streaming: false }).map(line => ({
        ...line, revision: state.id, streamId: state.id,
    }));
    const units = readSpeechUnits(fixture, { context, streaming: false, revision: state.id });
    let skipped = 0, oldRecords = 0;
    if (state.baseline) {
        // If Continue resumes an old line, exclude that entire line rather than replay its prefix.
        const end = state.baseline.endsWith('\n') ? state.baseline.length
            : source.indexOf('\n', state.baseline.length);
        text.innerHTML = format(end < 0 ? source : source.slice(0, end + (state.baseline.endsWith('\n') ? 0 : 1)));
        skipped = readSpeechUnits(fixture, { context, streaming: false }).length;
        oldRecords = readDialogueRecords(fixture, { context, streaming: false }).length;
    }
    state.newRecords = records.slice(oldRecords);
    state.skippedUnits = skipped;
    return { records, units: units.slice(skipped).map(unit => ({ ...unit, streamId: state.id,
        dialogueText: records.find(line => line.lineIndex === unit.dialogueLineIndex)?.text })) };
}

export function initNpcStreaming({ enqueue, close, cancelSpeech, renderControl,
    context: contextFor = getContext, events = eventSource, types = event_types,
    completeFinalExpressions = completeNpcExpressions }) {
    let authorized = null, observer = null, scheduled = false, controller = null;
    let epoch = 0, suppressedEpoch = -1;
    const disconnect = () => { observer?.disconnect(); observer = null; };
    const scheduleRender = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            const state = streaming.current();
            if (!state || state.cancelled || state.finished || !state.current()) return;
            const element = elementFor(state.messageId), text = element?.querySelector('.mes_text');
            if (!text) return;
            disconnect();
            stripVoiceCueNodes(text);
            decorateStreamingDialogue(element);
            renderNpcExpressions(element); renderControl(element);
            observer = new MutationObserver(scheduleRender);
            observer.observe(text, { childList: true, subtree: true, characterData: true });
        });
    };
    const streaming = createNpcStreaming({
        read: (source, state) => {
            const data = readStreamingMessage(source, state, contextFor());
            if (state.finishing) {
                const finalUnits = readSpeechUnits(elementFor(state.messageId), { context: contextFor(), streaming: false })
                    .slice(state.skippedUnits);
                let end = state.keys.length;
                while (end < data.units.length && finalUnits[end]
                    && speechUnitKey(data.units[end]) === speechUnitKey(finalUnits[end])) end++;
                // Host sentence trimming may remove the unfinished tail; don't enqueue removed words.
                data.units = data.units.slice(0, end);
            }
            return data;
        },
        publish: state => { setDialogueStream(state); scheduleRender(); },
        classify: (state, records) => completeNpcExpressions(state.messageId, {
            records: records.filter(line => state.newRecords.includes(line)), signal: controller.signal,
        }),
        enqueue: (state, units) => {
            if (usesDesignedNpcVoices(getSettings().tts)) {
                state.cueCards ||= new Map();
                for (const cue of parseVoiceCues(streamFormatSource(state.committed), state.newRecords)) {
                    const key = voiceCueKey(cue.speaker);
                    if (!state.cueCards.has(key)) state.cueCards.set(key, { id: makeId(),
                        presentation: { voiceDesign: { description: cue.description, version: 1 } } });
                }
            }
            enqueue(state, units);
        },
        finalize: state => {
            disconnect();
            const finalUnits = readSpeechUnits(elementFor(state.messageId), { context: contextFor(), streaming: false })
                .slice(state.skippedUnits);
            if (state.keys.some((key, index) => key !== (finalUnits[index] && speechUnitKey(finalUnits[index])))) {
                streaming.stop(); return;
            }
            const finalRecords = readDialogueRecords(elementFor(state.messageId), { streaming: false });
            // Completed source must agree with the final visible dialogue before it is saved.
            state.records = state.records.filter(line => finalRecords.some(final => final.lineIndex === line.lineIndex
                && final.npcId === line.npcId && final.text === line.text));
            adoptStreamExpressions(state.messageId, finalRecords);
            if (usesDesignedNpcVoices(getSettings().tts))
                retainVoiceCues(state.messageId, finalRecords, contextFor(), state.cueCards, state.parserSource);
            state.finalRevision = dialogueRevision(contextFor(), state.messageId);
            close(state);
            if (getSettings().npcExpressionsPerMessage) {
                void Promise.resolve().then(() => completeFinalExpressions(state.messageId, { records: finalRecords }))
                    .catch(error => console.warn('[Castward] Finalized message expressions failed', error));
            }
        },
        cancel: () => { disconnect(); controller?.abort(); clearDialogueStream(); cancelSpeech(); },
    });
    events.on(types.GENERATION_STARTED, (type, _data, dryRun) => {
        if (dryRun || !['normal', 'swipe', 'regenerate', 'continue'].includes(type)) return;
        epoch++;
        authorized = type;
    });
    events.on(types.STREAM_TOKEN_RECEIVED, raw => {
        if (!authorized || !getSettings().enabled) return;
        const context = contextFor(), processor = context.streamingProcessor;
        if (!processor || processor.type === 'impersonate' || processor.type === 'quiet') return;
        let state = streaming.current();
        if (!state || state.epoch !== epoch || state.processor !== processor) {
            const messageId = processor.messageId, token = context.chat[messageId];
            if (!token || token.is_user || token.is_system) return;
            controller = new AbortController();
            const identity = chatIdentity(context), swipe = token.swipe_id;
            state = streaming.begin({ messageId, baseline: processor.continueMessage || '',
                current: () => getSettings().enabled && chatIdentity(contextFor()) === identity
                    && contextFor().chat[messageId] === token && token.swipe_id === swipe
                    && (!state.finished || !state.finalRevision
                        || dialogueRevision(contextFor(), messageId) === state.finalRevision) });
            state.processor = processor; state.stoppingStrings = processor.stoppingStrings;
            state.epoch = epoch;
        }
        state.parserSource = state.baseline + raw;
        try { streaming.push(raw); scheduleRender(); }
        catch (error) { streaming.stop(); console.warn('[Castward] Streaming failed', error); }
    });
    events.on(types.GENERATION_ENDED, () => {
        authorized = null;
        const state = streaming.current();
        if (!state?.seen || state.finished || state.cancelled) return;
        // The host emits ended before its final rendering notifications complete.
        requestAnimationFrame(() => {
            if (streaming.current() !== state) return;
            try { streaming.push(state.raw, { final: true }); }
            catch (error) { streaming.stop(); console.warn('[Castward] Streaming finalization failed', error); }
        });
    });
    return { stop: ({ preserveGeneration = false } = {}) => {
        if (!preserveGeneration) { authorized = null; suppressedEpoch = epoch; }
        streaming.stop();
    },
        handled: id => suppressedEpoch === epoch
            || (streaming.current()?.epoch === epoch && streaming.handled(id)),
        valid: job => { const state = streaming.current(); return state?.id === job.revision
            && !state.cancelled && state.current(); } };
}
