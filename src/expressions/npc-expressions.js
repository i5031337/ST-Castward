import { eventSource, event_types } from '../../../../../events.js';
import { getContext } from '../../../../../st-context.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { getActiveCharacters } from '../characters/characters.js';
import { isChatCharacter } from '../characters/character-repository.js';
import { normalizeCharacterPresentation } from '../core/npc-presentation.js';
import { readDialogueRecords, dialogueRevision } from '../chat/dialogue-presentation.js';
import { dialogueLineCurrent } from '../chat/dialogue-stream-state.js';
import { MESSAGE_RENDERED_EVENT } from '../story/beats.js';
import { createExpressionEngine } from './expression-engine.js';
import { classifierConfig, classifierHint, classifyDialogue, loadSpritePack } from './host-expressions.js';
import { clearSpeechSprite, showSpeechSprite } from './speech-sprite.js';
import { wireExpressionEvents } from './expression-events.js';
import { EMOTION_LABELS, prepareExpressionReference, expressionWorkflow } from './expression-prompts.js';
import { expressionGenerator, expressionJob } from './host-expression-generation.js';
import { rememberNpcSprite, initSceneSprites, focusSceneSprite } from './scene-sprites.js';
import { portraitFromResult, readDialoguePortrait, rememberDialoguePortrait } from './dialogue-portraits.js';
import { expressionMessageGroups } from './expression-message-groups.js';
import { expressionImageSource } from './expression-image-source.js';
import { needsExpressionRefresh, hasPendingImageCollection } from './expression-source-policy.js';
import { trackerReadGate, shouldWaitForTrackerRead } from '../tracker/tracker-read-gate.js';
import { getPendingChanges, REVIEW_EVENT } from '../tracker/status-review.js';

const results = new Map();
const warned = new Set();
const resultKey = line => JSON.stringify([line.revision, line.npcId, line.lineIndex]);
let epoch = 0;
let generationController = new AbortController();
const cardFor = id => getActiveCharacters().find(card => card.id === id);
const preferences = card => {
    const settings = getSettings();
    const expressions = card?.presentation?.expressions;
    const generation = expressions?.generation;
    const stableExpressions = expressions && { ...expressions,
        generation: generation && { ...generation, imageSources: undefined } };
    return JSON.stringify([stableExpressions, expressionWorkflow(card, settings), settings.npcExpressionIpAdapterMode]);
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
        && dialogueLineCurrent(job.line)
        && preferences(cardFor(job.line.npcId)) === job.preferences
        && JSON.stringify(classifierConfig()) === JSON.stringify(job.config);
}

function waitForImageReview(job, card, signal) {
    const pending = () => hasPendingImageCollection(getPendingChanges(job.line.messageId), card,
        getSettings().statusTracker.collections || []);
    if (!pending()) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            eventSource.removeListener(REVIEW_EVENT, changed);
            signal.removeEventListener('abort', abort);
        };
        const changed = ({ messageId }) => {
            if (Number(messageId) !== job.line.messageId || pending()) return;
            cleanup(); resolve();
        };
        const abort = () => { cleanup(); reject(signal.reason || new DOMException('Cancelled', 'AbortError')); };
        eventSource.on(REVIEW_EVENT, changed);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        else changed({ messageId: job.line.messageId });
    });
}

async function generateClassifiedExpression(job, label) {
    if (!job.generate || !EMOTION_LABELS.includes(label)) return;
    const card = cardFor(job.line.npcId);
    if (!card) return;
    const image = card.imageUrl;
    // Speech may end while the tracker reads; accepted expression work owns its own lifetime.
    const current = () => job.epoch === epoch && isCurrent(job, false)
        && cardFor(job.line.npcId) === card && card.imageUrl === image;
    try {
        if (shouldWaitForTrackerRead(getSettings(), getContext()?.getCurrentChatId?.() !== undefined)) {
            await trackerReadGate.wait(job.sourceToken, generationController.signal);
            await waitForImageReview(job, card, generationController.signal);
        }
        if (!current()) return;
        const source = expressionImageSource(card);
        const exists = job.sprites.some(sprite => sprite.label === label);
        const replace = getSettings().npcExpressionsRefreshOnImagePrompt
            && needsExpressionRefresh(card.presentation.expressions.generation, label, source, exists);
        if (exists && !replace) return;
        const unchanged = () => current() && (!getSettings().npcExpressionsRefreshOnImagePrompt
            || expressionImageSource(card) === source);
        const input = await expressionJob(card, label, unchanged, generationController.signal);
        const sprites = await expressionGenerator.generate(input, { replace });
        if (!unchanged()) return;
        if (!job.line.streamId) job.rememberSprite(card, sprites, label, job.line);
        for (const result of results.values()) {
            if (result.line.npcId === card.id && result.preferences === job.preferences && isCurrent(result, false)) {
                result.sprites = sprites;
                result.savePortrait(result, result.label);
                renderNpcExpressions(messageElement(result.line.messageId), result.line);
            }
        }
        // Speech portraits advance only on the next audio playing event.
    } catch (error) {
        if (error.name === 'AbortError') return;
        const key = JSON.stringify([card.id, label, job.preferences, error.message]);
        if (warned.has(key)) return;
        warned.add(key);
        if (warned.size > 128) warned.delete(warned.values().next().value);
        console.warn(`[Castward] ${card.name}: ${label} expression generation failed`, error);
        if (typeof toastr !== 'undefined') toastr.warning(
            `${card.name}: ${label} expression failed. ${error.message} Retry in NPC Edit.`, 'Castward');
    }
}

const engine = createExpressionEngine({ classify: job => job.classify(job), isCurrent,
    apply(job, label) {
        Object.assign(job, { label, classified: true });
        for (const line of job.targetLines || [job.line]) {
            const result = line === job.line ? job : { ...job, line };
            results.set(resultKey(line), result);
            result.savePortrait(result, label);
            if (!line.streamId) result.rememberSprite(cardFor(line.npcId), result.sprites, label, line);
            renderNpcExpressions(messageElement(line.messageId), line);
        }
        while (results.size > 128) results.delete(results.keys().next().value);
        // Existing sprites are visible now; image edits follow the configured tracker gate.
        void generateClassifiedExpression(job, label);
    },
});

export function resetNpcExpressions({ clear = true } = {}) {
    generationController.abort(); generationController = new AbortController();
    if (!clear) trackerReadGate.forget(getContext()?.chat?.at(-1));
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

/** Authorized completed lines or replies; history and decoration never schedule work. */
export async function completeNpcExpressions(messageId, {
    loadPack = loadSpritePack, classify = classifyDialogue, saveBinding = saveExpressionBinding,
    rememberSprite = rememberNpcSprite, savePortrait = rememberDialoguePortrait, signal, records,
} = {}) {
    if (!getSettings().enabled || getSettings().autoGenerateNpcExpressions !== true) return;
    const message = getContext()?.chat?.[Number(messageId)];
    if (!message || message.is_user || message.is_system) return;
    const lines = (records ?? readDialogueRecords(messageElement(messageId))).filter(line => line.npcId && !line.isPersona);
    const perMessage = getSettings().npcExpressionsPerMessage === true;
    if (perMessage && lines.some(line => line.streamId)) return;
    const version = epoch, packs = new Map();
    for (const targetLines of expressionMessageGroups(lines, perMessage)) {
        const line = perMessage ? { ...targetLines[0], text: targetLines.map(part => part.text).join('\n') } : targetLines[0];
        if (signal?.aborted || version !== epoch) return;
        if (targetLines.every(part => {
            const cached = results.get(resultKey(part));
            return (cached?.classified || cached?.pending) && isCurrent(cached, false);
        })) continue;
        const card = cardFor(line.npcId);
        const settings = card ? normalizeCharacterPresentation(card).expressions : null;
        if (card && prepareExpressionReference(card)) saveBinding(card);
        if (!settings?.spriteFolder) continue;
        const job = { line, targetLines, signal, sourceToken: message, epoch: version, preferences: preferences(card), config: classifierConfig(), classify, rememberSprite, savePortrait,
            fallback: settings.fallback, sprites: [], pending: true, label: '' };
        job.generate = Boolean(settings.generation?.reference)
            && settings.generation.reference === card.imageUrl;
        if (job.generate) job.labels = EMOTION_LABELS;
        for (const part of targetLines) results.set(resultKey(part), job);
        while (results.size > 128) results.delete(results.keys().next().value);
        try {
            if (!packs.has(settings.spriteFolder)) packs.set(settings.spriteFolder, loadPack(settings.spriteFolder));
            job.sprites = await packs.get(settings.spriteFolder);
            if (!isCurrent(job)) continue;
            renderNpcExpressions(messageElement(messageId), job.line);
            if ((job.sprites.length || job.generate) && !classifierHint(job.config)) {
                // The engine serializes all NPC classification, including WebLLM jobs.
                await engine.enqueue(job);
            }
        } catch (error) { console.warn('[Castward] Sprite pack unavailable', error); }
        finally { job.pending = false; }
    }
}

/** Transfer committed results and in-flight jobs to the finalized message identity. */
export function adoptStreamExpressions(messageId, records) {
    for (const [key, job] of [...results]) {
        if (job.line.messageId !== Number(messageId) || !job.line.streamId) continue;
        const line = records.find(candidate => candidate.lineIndex === job.line.lineIndex
            && candidate.npcId === job.line.npcId && candidate.text === job.line.text);
        results.delete(key);
        if (!line) continue;
        // The engine retains this job object, so a pending classification also adopts it.
        job.line = line;
        job.targetLines = [line];
        results.set(resultKey(line), job);
        if (job.classified && isCurrent(job, false)) {
            job.savePortrait(job, job.label);
            job.rememberSprite(cardFor(line.npcId), job.sprites, job.label, line);
        }
    }
}

/** Called only by the audio element's playing event, never by synthesis completion. */
export function showNpcSpeechExpression(unit) {
    if (unit.kind !== 'dialogue') return;
    const card = cardFor(unit.npcId);
    if (!getSettings().enabled || !card) {
        clearSpeechSprite(); return;
    }
    const line = { ...unit, lineIndex: unit.dialogueLineIndex };
    const result = results.get(resultKey(line)) || (unit.streamId ? [...results.values()].find(candidate =>
        candidate.line.messageId === line.messageId && candidate.line.lineIndex === line.lineIndex
        && candidate.line.npcId === line.npcId && candidate.line.text === (line.dialogueText ?? line.text)) : null);
    if (!dialogueLineCurrent(line)) return;
    if (getSettings().showPresentNpcSprites) {
        clearSpeechSprite(); focusSceneSprite(card.id); return;
    }
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
