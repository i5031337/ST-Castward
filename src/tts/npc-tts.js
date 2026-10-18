import { eventSource, event_types } from '../../../../../events.js';
import { getContext } from '../../../../../st-context.js';
import { getSettings } from '../core/settings.js';
import { getActiveCharacters } from '../characters/characters.js';
import { dialogueRevision } from '../chat/dialogue-presentation.js';
import { MESSAGE_RENDERED_EVENT } from '../story/beats.js';
import { readSpeechUnits } from './speech-units.js';
import { createSpeechQueue } from './speech-queue.js';
import { hostSpeechEndpoint, synthesizeSpeech, playSpeechAudio } from './openai-speech.js';
import { normalizeTtsSettings, resolveUnitSpeech, ttsConfigError, resolvePreviewSpeech, usesDesignedNpcVoices } from './tts-settings.js';
import { builtInAutoTtsEnabled } from '../ui/tts/ui-tts-settings.js';
import { wireSpeechEvents } from './speech-events.js';
import { completeNpcExpressions, showNpcSpeechExpression } from '../expressions/npc-expressions.js';
import { clearSpeechSprite } from '../expressions/speech-sprite.js';
import { captureVoiceCues, cardWithVoiceCue } from './voice-cues.js';
import { voiceCueKey } from './voice-cue-format.js';
import { initNpcStreaming } from './npc-stream-host.js';

const messageElement = id => document.querySelector(`#chat .mes[mesid="${Number(id)}"]`);
let previewController = null;
let configSignature = '';
let endpointSignature = '';
let streaming = null;

function updateButtons() {
    const current = queue.current();
    document.querySelectorAll('.sillynpc-tts-play').forEach(button => {
        const playing = Number(button.dataset.messageId) === current?.messageId;
        button.textContent = playing ? 'Stop speech' : 'Play speech';
        button.title = playing ? 'Stop Castward speech' : 'Play this message with Castward voices';
    });
}

const queue = createSpeechQueue({
    synthesize: (unit, signal) => synthesizeSpeech(unit, unit.config, signal),
    playAudio: playSpeechAudio,
    prepare: job => job.revision.startsWith('npc-stream-') ? undefined
        : completeNpcExpressions(job.messageId, { signal: job.controller.signal }),
    valid: job => getSettings().enabled && getSettings().tts.enabled
        && (job.revision.startsWith('npc-stream-') ? streaming?.valid(job) && !builtInAutoTtsEnabled()
            : dialogueRevision(getContext(), job.messageId) === job.revision)
        && JSON.stringify(normalizeTtsSettings(getSettings().tts)) === configSignature
        && hostSpeechEndpoint() === endpointSignature,
    onState: (state, _job, detail) => {
        updateButtons();
        if (state === 'playing') showNpcSpeechExpression(detail);
        if (state === 'prepare-error') globalThis.toastr?.warning(detail?.message || String(detail), 'Castward expressions');
        if (state === 'error') globalThis.toastr?.error(detail?.message || String(detail), 'Castward speech');
    },
});

export function stopNpcTts({ preserveGeneration = false } = {}) {
    clearSpeechSprite();
    streaming?.stop({ preserveGeneration });
    queue.stop();
    previewController?.abort();
    previewController = null;
    updateButtons();
}

export async function previewNpcVoice(voice, card) {
    stopNpcTts();
    const config = normalizeTtsSettings(getSettings().tts);
    const issue = ttsConfigError(config, hostSpeechEndpoint());
    if (issue) throw new Error(issue);
    const unit = { kind: 'dialogue', text: 'Hello. It is good to meet you.' };
    const designCard = cardWithVoiceCue(card, card?.name);
    const choice = resolvePreviewSpeech(voice, config, designCard, unit.text);
    const controller = new AbortController(); previewController = controller;
    try {
        const blob = await synthesizeSpeech({ ...unit, ...choice }, config, controller.signal);
        if (!controller.signal.aborted) await playSpeechAudio(blob, controller.signal);
    } finally { if (previewController === controller) previewController = null; }
}

export async function playNpcMessage(messageId, { automatic = false } = {}) {
    stopNpcTts();
    const settings = getSettings();
    const config = normalizeTtsSettings(settings.tts);
    const issue = !settings.enabled ? 'Enable Castward first.' : ttsConfigError(config, hostSpeechEndpoint());
    if (issue) { if (!automatic) globalThis.toastr?.warning(issue, 'Castward speech'); return; }
    if (automatic && (!config.autoPlay || builtInAutoTtsEnabled())) return;
    const id = Number(messageId);
    const message = getContext()?.chat?.[id];
    if (!message || message.is_user || message.is_system) return;
    const element = messageElement(id);
    if (!element) return;
    captureVoiceCues(id);
    const units = readSpeechUnits(element);
    if (!units.length) return;
    const cards = new Map(getActiveCharacters().map(card => [card.id, card]));
    const prepared = units.map(unit => ({ ...unit,
        ...resolveUnitSpeech(unit, config,
            unit.kind === 'dialogue' ? cardWithVoiceCue(cards.get(unit.npcId), unit.speakerLabel) : null), config }));
    if (!prepared.some(unit => unit.voice)) return;
    configSignature = JSON.stringify(config);
    endpointSignature = hostSpeechEndpoint();
    await queue.play(id, units[0].revision, prepared);
}

export function renderNpcTtsControl(mesEl) {
    if (!mesEl) return;
    const id = Number(mesEl.getAttribute('mesid'));
    const message = getContext()?.chat?.[id];
    const old = mesEl.querySelector('.sillynpc-tts-play');
    if (!getSettings().enabled || !getSettings().tts.enabled || !message || message.is_user || message.is_system) {
        old?.remove(); return;
    }
    if (old) { updateButtons(); return; }
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'menu_button sillynpc-tts-play';
    button.dataset.messageId = String(id);
    button.textContent = 'Play speech';
    button.title = 'Play this message with Castward voices';
    button.addEventListener('click', () => {
        if (queue.current()?.messageId === id) stopNpcTts();
        else playNpcMessage(id).catch(error => globalThis.toastr?.error(error.message, 'Castward speech'));
    });
    (mesEl.querySelector('.mes_buttons') || mesEl.querySelector('.mes_header') || mesEl).append(button);
}

/** Only a changed foreground reply can initiate automatic speech. */
export function initNpcTts() {
    document.addEventListener('input', event => {
        if (event.target?.matches?.('#openai_compatible_tts_endpoint')) stopNpcTts();
    });
    document.addEventListener('change', event => {
        if (event.target?.matches?.('#tts_enabled, #tts_auto_generation, #tts_periodic_auto_generation')
            && queue.current()?.revision.startsWith('npc-stream-') && builtInAutoTtsEnabled()) stopNpcTts();
    });
    wireSpeechEvents({ events: eventSource, types: event_types, renderedEvent: MESSAGE_RENDERED_EVENT,
        render: renderNpcTtsControl, stop: stopNpcTts,
        latestId: () => (getContext()?.chat?.length ?? 0) - 1,
        revision: id => dialogueRevision(getContext(), id),
        sourceToken: id => getContext()?.chat?.[id],
        defer: requestAnimationFrame,
        complete: id => {
            if (streaming?.handled(id)) return;
            const settings = getSettings();
            if (settings.enabled && settings.tts?.enabled && usesDesignedNpcVoices(settings.tts))
                captureVoiceCues(id);
            return playNpcMessage(id, { automatic: true });
        } });
    streaming = initNpcStreaming({ renderControl: renderNpcTtsControl,
        cancelSpeech: () => { queue.stop(); clearSpeechSprite(); },
        close: state => state.speech?.close(),
        enqueue: (state, units) => {
            const settings = getSettings(), config = normalizeTtsSettings(settings.tts);
            if (!config.autoPlay || builtInAutoTtsEnabled() || !settings.enabled
                || ttsConfigError(config, hostSpeechEndpoint())) {
                if (state.speech) queue.stop();
                return;
            }
            if (state.speech && !queue.current()) return;
            if (!state.speech) {
                configSignature = JSON.stringify(config); endpointSignature = hostSpeechEndpoint();
                state.speech = queue.start(state.messageId, state.id);
            }
            const cards = new Map(getActiveCharacters().map(card => [card.id, card]));
            state.speech.append(units.map(unit => {
                let card = unit.kind === 'dialogue' ? cardWithVoiceCue(cards.get(unit.npcId), unit.speakerLabel) : null;
                if (unit.kind === 'dialogue' && !card?.presentation?.voiceDesign?.description) {
                    const provisional = state.cueCards?.get(voiceCueKey(unit.speakerLabel));
                    if (provisional) card = { ...card, ...provisional, presentation: {
                        ...card?.presentation, ...provisional.presentation,
                    } };
                }
                return { ...unit, ...resolveUnitSpeech(unit, config, card), config };
            }));
        } });
}
