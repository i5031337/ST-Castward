import { eventSource, event_types } from '../../../../../events.js';
import { getContext } from '../../../../../st-context.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { getActiveCharacters } from '../characters/characters.js';
import { isChatCharacter } from '../characters/character-repository.js';
import { normalizeCharacterPresentation } from '../core/npc-presentation.js';
import { readDialogueRecords, dialogueRevision } from '../chat/dialogue-presentation.js';
import { MESSAGE_RENDERED_EVENT } from '../story/beats.js';
import { createExpressionEngine } from './expression-engine.js';
import { classifierConfig, classifierHint, classifyDialogue, loadSpritePack } from './host-expressions.js';
import { clearSpeechSprite, showSpeechSprite } from './speech-sprite.js';
import { wireExpressionEvents } from './expression-events.js';
import { EMOTION_LABELS, prepareExpressionReference, expressionWorkflow } from './expression-prompts.js';
import { expressionGenerator, expressionJob } from './host-expression-generation.js';
import { rememberNpcSprite, initSceneSprites } from './scene-sprites.js';
import { portraitFromResult, readDialoguePortrait, rememberDialoguePortrait } from './dialogue-portraits.js';

const results = new Map();
const warned = new Set();
const resultKey = line => JSON.stringify([line.revision, line.npcId, line.lineIndex]);
let epoch = 0;
let generationController = new AbortController();
const cardFor = id => getActiveCharacters().find(card => card.id === id);
const preferences = card => {
    const settings = getSettings();
    return JSON.stringify([card?.presentation?.expressions, expressionWorkflow(card, settings),
        settings.npcExpressionIpAdapterMode, settings.npcExpressionIpAdapterMode ? [settings.imgGenPromptPrefix, card?.profile, card?.lorebook] : null]);
};
const messageElement = id => document.querySelector(`#chat .mes[mesid="${Number(id)}"]`);
function saveExpressionBinding(card) {
    if (isChatCharacter(card.id)) getContext()?.saveMetadataDebounced?.();
    else saveSettings();
}
function isCurrent(job, pending = true) {
    return (!pending || !job.signal?.aborted) && (!pending || job.epoch === epoch) && getSettings().enabled
        && getSettings().autoGenerateNpcExpressions === true
        && getContext().chat?.[job.line.messageId] === job.sourceToken
        && dialogueRevision(getContext(), job.line.messageId) === job.line.revision
        && preferences(cardFor(job.line.npcId)) === job.preferences
        && JSON.stringify(classifierConfig()) === JSON.stringify(job.config);
}

const engine = createExpressionEngine({ classify: job => job.classify(job), isCurrent,
    apply(job, label) {
        results.set(resultKey(job.line), { ...job, label, classified: true });
        job.savePortrait(job, label);
        job.rememberSprite(cardFor(job.line.npcId), job.sprites, label, job.line);
        while (results.size > 128) results.delete(results.keys().next().value);
        renderNpcExpressions(messageElement(job.line.messageId), job.line);
        if (job.generate && EMOTION_LABELS.includes(label) && !job.sprites.some(sprite => sprite.label === label)) {
            // Editing runs in the background; classification and speech remain free to proceed.
            const card = cardFor(job.line.npcId);
            const image = card?.imageUrl;
            const current = () => isCurrent(job) && cardFor(job.line.npcId) === card && card.imageUrl === image;
            expressionJob(card, label, current, generationController.signal).then(input => expressionGenerator.generate(input)).then(sprites => {
                if (!current()) return;
                job.rememberSprite(card, sprites, label, job.line);
                for (const result of results.values()) {
                    if (result.line.npcId === card.id && result.preferences === job.preferences && isCurrent(result, false)) {
                        result.sprites = sprites;
                        result.savePortrait(result, result.label);
                        renderNpcExpressions(messageElement(result.line.messageId), result.line);
                    }
                }
                // Speech portraits advance only on the next audio playing event.
            }).catch(error => {
                if (error.name === 'AbortError') return;
                const key = JSON.stringify([card.id, label, job.preferences, error.message]);
                if (warned.has(key)) return;
                warned.add(key);
                if (warned.size > 128) warned.delete(warned.values().next().value);
                console.warn(`[SillyNPC] ${card.name}: ${label} expression generation failed`, error);
                if (typeof toastr !== 'undefined') toastr.warning(
                    `${card.name}: ${label} expression failed. ${error.message} Retry in NPC Edit.`, 'SillyNPC');
            });
        }
    },
});

export function resetNpcExpressions({ clear = true } = {}) {
    generationController.abort(); generationController = new AbortController();
    clearSpeechSprite();
    epoch++; engine.reset();
    if (!clear) return;
    results.clear();
    document.querySelectorAll('.sillynpc-chat-avatar[data-sillynpc-base-portrait]').forEach(avatar => {
        avatar.src = avatar.dataset.sillynpcBasePortrait;
        delete avatar.dataset.sillynpcExpression;
        delete avatar.dataset.sillynpcBasePortrait;
    });
}

/** Decoration notifications may read cached pictures, never schedule classification. */
export function renderNpcExpressions(mesEl, targetLine) {
    if (!mesEl || !getSettings().enabled) return;
    const records = targetLine ? [targetLine] : readDialogueRecords(mesEl);
    const byLine = new Map(records.map(line => [line.lineIndex, line]));
    const selector = targetLine ? `.sillynpc-chat-avatar[data-char-id][data-sillynpc-dialogue-line="${Number(targetLine.lineIndex)}"]`
        : '.sillynpc-chat-avatar[data-char-id]';
    for (const avatar of mesEl.querySelectorAll(selector)) {
        if (avatar.dataset.sillynpcBasePortrait) avatar.src = avatar.dataset.sillynpcBasePortrait;
        delete avatar.dataset.sillynpcExpression;
        const line = byLine.get(Number(avatar.dataset.sillynpcDialogueLine));
        if (line?.npcId !== avatar.dataset.charId) continue;
        const result = results.get(resultKey(line));
        const picture = (result && isCurrent(result, false) ? portraitFromResult(result) : null) || readDialoguePortrait(line);
        if (!picture) continue;
        const path = picture.path;
        const original = avatar.src;
        avatar.dataset.sillynpcBasePortrait = original;
        avatar.src = path;
        avatar.dataset.sillynpcExpression = picture.label;
        const base = () => {
            delete avatar.dataset.sillynpcExpression;
            avatar.onerror = () => avatar.remove(); avatar.src = original;
        };
        avatar.onerror = () => {
            const fallback = picture.fallbackPath;
            if (!fallback || fallback === path) return base();
            avatar.onerror = base; avatar.src = fallback;
            avatar.dataset.sillynpcExpression = picture.fallback;
        };
    }
}

/** Explicit completed-reply entry point. No history loading or DOM refresh calls this. */
export async function completeNpcExpressions(messageId, {
    loadPack = loadSpritePack, classify = classifyDialogue, saveBinding = saveExpressionBinding,
    rememberSprite = rememberNpcSprite, savePortrait = rememberDialoguePortrait, signal,
} = {}) {
    if (!getSettings().enabled || getSettings().autoGenerateNpcExpressions !== true) return;
    const message = getContext()?.chat?.[Number(messageId)];
    if (!message || message.is_user || message.is_system) return;
    const lines = readDialogueRecords(messageElement(messageId)).filter(line => line.npcId && !line.isPersona);
    const version = epoch, packs = new Map();
    for (const line of lines) {
        if (signal?.aborted || version !== epoch) return;
        const cached = results.get(resultKey(line));
        if (cached?.classified && isCurrent(cached, false)) continue;
        const card = cardFor(line.npcId);
        const settings = card ? normalizeCharacterPresentation(card).expressions : null;
        if (card && prepareExpressionReference(card)) saveBinding(card);
        if (!settings?.spriteFolder) continue;
        const job = { line, signal, sourceToken: message, epoch: version, preferences: preferences(card), config: classifierConfig(), classify, rememberSprite, savePortrait,
            fallback: settings.fallback, sprites: [] };
        job.generate = Boolean(settings.generation?.reference)
            && settings.generation.reference === card.imageUrl;
        if (job.generate) job.labels = EMOTION_LABELS;
        try {
            if (!packs.has(settings.spriteFolder)) packs.set(settings.spriteFolder, loadPack(settings.spriteFolder));
            job.sprites = await packs.get(settings.spriteFolder);
            if (!isCurrent(job)) continue;
            results.set(resultKey(line), { ...job, label: '' });
            while (results.size > 128) results.delete(results.keys().next().value);
            renderNpcExpressions(messageElement(messageId), line);
            if ((job.sprites.length || job.generate) && !classifierHint(job.config)) {
                // The engine serializes all NPC classification, including WebLLM jobs.
                await engine.enqueue(job);
            }
        } catch (error) { console.warn('[SillyNPC] Sprite pack unavailable', error); }
    }
}

/** Called only by the audio element's playing event, never by synthesis completion. */
export function showNpcSpeechExpression(unit) {
    if (unit.kind !== 'dialogue') return;
    if (getSettings().showPresentNpcSprites) { clearSpeechSprite(); return; }
    const card = cardFor(unit.npcId);
    if (!getSettings().enabled || !card) {
        clearSpeechSprite(); return;
    }
    const line = { ...unit, lineIndex: unit.dialogueLineIndex };
    const result = results.get(resultKey(line));
    if (dialogueRevision(getContext(), unit.messageId) !== unit.revision) return;
    const picture = (result && isCurrent(result, false) ? portraitFromResult(result) : null) || readDialoguePortrait(line);
    showSpeechSprite(card, picture?.path || '', picture?.fallbackPath || '', unit);
}

export function initNpcExpressions() {
    initSceneSprites(MESSAGE_RENDERED_EVENT);
    wireExpressionEvents({ events: eventSource, types: event_types, renderedEvent: MESSAGE_RENDERED_EVENT,
        render: renderNpcExpressions, reset: resetNpcExpressions,
        latestId: () => (getContext()?.chat?.length ?? 0) - 1,
        // Tracker decoration can strip its status block before this frame. Read the final
        // revision afterward; edit/swipe/chat events still cancel the completion token.
        sourceToken: id => getContext()?.chat?.[id],
        revision: id => dialogueRevision(getContext(), id), defer: requestAnimationFrame,
        complete: completeNpcExpressions });
}
