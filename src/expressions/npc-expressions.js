import { eventSource, event_types } from '../../../../../events.js';
import { getContext } from '../../../../../st-context.js';
import { getSettings } from '../core/settings.js';
import { getActiveCharacters } from '../characters/characters.js';
import { readDialogueRecords, dialogueRevision } from '../chat/dialogue-presentation.js';
import { MESSAGE_RENDERED_EVENT } from '../story/beats.js';
import { createExpressionEngine, selectSprite } from './expression-engine.js';
import { classifierConfig, classifierHint, classifyDialogue, loadSpritePack } from './host-expressions.js';
import { clearSpeechSprite, showSpeechSprite } from './speech-sprite.js';
import { wireExpressionEvents } from './expression-events.js';

const results = new Map();
const resultKey = line => JSON.stringify([line.revision, line.npcId, line.lineIndex]);
let epoch = 0;
const cardFor = id => getActiveCharacters().find(card => card.id === id);
const preferences = card => JSON.stringify(card?.presentation?.expressions);
const messageElement = id => document.querySelector(`#chat .mes[mesid="${Number(id)}"]`);
function isCurrent(job, pending = true) {
    return (!pending || !job.signal?.aborted) && (!pending || job.epoch === epoch) && getSettings().enabled
        && dialogueRevision(getContext(), job.line.messageId) === job.line.revision
        && preferences(cardFor(job.line.npcId)) === job.preferences
        && JSON.stringify(classifierConfig()) === JSON.stringify(job.config);
}

const engine = createExpressionEngine({ classify: job => job.classify(job), isCurrent,
    apply(job, label) {
        results.set(resultKey(job.line), { ...job, label, classified: true });
        while (results.size > 128) results.delete(results.keys().next().value);
        renderNpcExpressions(messageElement(job.line.messageId));
    },
});

export function resetNpcExpressions({ clear = true } = {}) {
    clearSpeechSprite();
    epoch++; engine.reset();
    if (clear) results.clear();
    document.querySelectorAll('.sillynpc-chat-avatar[data-sillynpc-base-portrait]').forEach(avatar => {
        avatar.src = avatar.dataset.sillynpcBasePortrait;
        delete avatar.dataset.sillynpcExpression;
        delete avatar.dataset.sillynpcBasePortrait;
    });
}

/** Decoration notifications may read cached pictures, never schedule classification. */
export function renderNpcExpressions(mesEl) {
    if (!mesEl || !getSettings().enabled) return;
    const records = readDialogueRecords(mesEl);
    const byLine = new Map(records.map(line => [line.lineIndex, line]));
    for (const avatar of mesEl.querySelectorAll('.sillynpc-chat-avatar[data-char-id]')) {
        if (avatar.dataset.sillynpcBasePortrait) avatar.src = avatar.dataset.sillynpcBasePortrait;
        delete avatar.dataset.sillynpcExpression;
        const line = byLine.get(Number(avatar.dataset.sillynpcDialogueLine));
        if (line?.npcId !== avatar.dataset.charId) continue;
        const result = results.get(resultKey(line));
        if (!result || !isCurrent(result, false)) continue;
        const path = selectSprite(result.sprites, result.label, result.fallback, line.revision + line.npcId + line.lineIndex);
        if (!path) continue;
        const original = avatar.src;
        avatar.dataset.sillynpcBasePortrait = original;
        avatar.src = path;
        avatar.dataset.sillynpcExpression = result.label || result.fallback;
        const base = () => {
            delete avatar.dataset.sillynpcExpression;
            avatar.onerror = () => avatar.remove(); avatar.src = original;
        };
        avatar.onerror = () => {
            const fallback = selectSprite(result.sprites, result.fallback, '', line.revision + line.npcId + line.lineIndex);
            if (!fallback || fallback === path) return base();
            avatar.onerror = base; avatar.src = fallback;
            avatar.dataset.sillynpcExpression = result.fallback;
        };
    }
}

/** Explicit completed-reply entry point. No history loading or DOM refresh calls this. */
export async function completeNpcExpressions(messageId, { loadPack = loadSpritePack, classify = classifyDialogue, signal } = {}) {
    if (!getSettings().enabled) return;
    const message = getContext()?.chat?.[Number(messageId)];
    if (!message || message.is_user || message.is_system) return;
    const lines = readDialogueRecords(messageElement(messageId)).filter(line => line.npcId && !line.isPersona);
    const version = epoch;
    for (const line of lines) {
        if (signal?.aborted || version !== epoch) return;
        const cached = results.get(resultKey(line));
        if (cached?.classified && isCurrent(cached, false)) continue;
        const card = cardFor(line.npcId);
        const settings = card?.presentation?.expressions;
        if (!settings?.enabled || !settings.spriteFolder) continue;
        const job = { line, signal, epoch: version, preferences: preferences(card), config: classifierConfig(), classify,
            fallback: settings.fallback, sprites: [] };
        try {
            job.sprites = await loadPack(settings.spriteFolder);
            if (!isCurrent(job)) continue;
            results.set(resultKey(line), { ...job, label: '' });
            while (results.size > 128) results.delete(results.keys().next().value);
            renderNpcExpressions(messageElement(messageId));
            if (job.sprites.length && !classifierHint(job.config)) {
                // The engine serializes all NPC classification, including WebLLM jobs.
                await engine.enqueue(job);
            }
        } catch (error) { console.warn('[SillyNPC] Sprite pack unavailable', error); }
    }
}

/** Called only by the audio element's playing event, never by synthesis completion. */
export function showNpcSpeechExpression(unit) {
    if (unit.kind !== 'dialogue') return;
    const card = cardFor(unit.npcId);
    if (!getSettings().enabled || !card?.presentation?.expressions?.enabled) {
        clearSpeechSprite(); return;
    }
    const line = { ...unit, lineIndex: unit.dialogueLineIndex };
    const result = results.get(resultKey(line));
    if (dialogueRevision(getContext(), unit.messageId) !== unit.revision) return;
    const usable = result && isCurrent(result, false);
    const identity = unit.revision + unit.npcId + unit.dialogueLineIndex;
    showSpeechSprite(card, usable ? selectSprite(result.sprites, result.label, result.fallback, identity) : '',
        usable ? selectSprite(result.sprites, result.fallback, '', identity) : '', unit);
}

export function initNpcExpressions() {
    wireExpressionEvents({ events: eventSource, types: event_types, renderedEvent: MESSAGE_RENDERED_EVENT,
        render: renderNpcExpressions, reset: resetNpcExpressions,
        latestId: () => (getContext()?.chat?.length ?? 0) - 1,
        // Tracker decoration can strip its status block before this frame. Read the final
        // revision afterward; edit/swipe/chat events still cancel the completion token.
        sourceToken: id => getContext()?.chat?.[id],
        revision: id => dialogueRevision(getContext(), id), defer: requestAnimationFrame,
        complete: completeNpcExpressions });
}
