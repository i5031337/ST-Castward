import { getContext } from '../../../../../st-context.js';
import { getActiveCharacters } from '../characters/characters.js';
import { readDialogueRecords } from '../chat/dialogue-presentation.js';
import { parseVoiceCues, standaloneVoiceCues, stripVoiceCueNodes, voiceCueKey, withoutVoiceCueLines } from './voice-cue-format.js';
import { makeId } from '../core/utils.js';
import { NPC_TTS_PROVIDER } from './tts-settings.js';

const KEY = 'sillynpc_voice_cues';

function cueStore(context = getContext()) {
    const metadata = context?.chatMetadata;
    if (!metadata || context?.getCurrentChatId?.() === undefined) return null;
    return metadata[KEY] && typeof metadata[KEY] === 'object' && !Array.isArray(metadata[KEY])
        ? metadata[KEY] : null;
}

/** Existing assignments are sticky; an edited or repeated cue cannot redesign a clone. */
export function saveVoiceCues(cues, context = getContext(), provisional = new Map()) {
    if (!cues.length || !context?.chatMetadata || context?.getCurrentChatId?.() === undefined) return 0;
    const store = cueStore(context) || (context.chatMetadata[KEY] = {});
    let added = 0;
    for (const { speaker, description } of cues) {
        const key = voiceCueKey(speaker);
        if (Object.hasOwn(store, key)) continue;
        store[key] = { id: provisional.get(key)?.id || makeId(), description, version: 1 };
        added++;
    }
    if (added) context.saveMetadataDebounced?.();
    return added;
}

export function voiceCueFor(speaker, card = null, context = getContext()) {
    const store = cueStore(context);
    if (!store) return null;
    const names = card ? [card.name, ...(card.aliases || [])
        .filter(alias => alias && !alias.isRegex).map(alias => alias.pattern), speaker] : [speaker];
    for (const name of names) {
        const key = voiceCueKey(name);
        const cue = Object.hasOwn(store, key) ? store[key] : null;
        if (cue && /^[A-Za-z0-9_-]{1,100}$/u.test(cue.id) && typeof cue.description === 'string'
            && cue.description.trim() && cue.description.length <= 200 && !/[\r\n]/u.test(cue.description)
            && Number.isSafeInteger(cue.version) && cue.version > 0) return cue;
    }
    return null;
}

/** Manual card descriptions win; the provisional identity also works before a card exists. */
export function cardWithVoiceCue(card, speaker, context = getContext()) {
    if (card?.presentation?.voiceDesign?.description) return card;
    const cue = voiceCueFor(speaker, card, context);
    if (!cue) return card;
    return { ...card, id: cue.id, presentation: {
        ...card?.presentation, voiceDesign: { description: cue.description, version: cue.version },
    } };
}

function hasCardVoicePreference(card) {
    if (!card) return false;
    const binding = card.presentation?.voices?.[NPC_TTS_PROVIDER]
        || card.presentation?.voices?.['OpenAI Compatible'];
    return Boolean(card.presentation?.voiceDesign?.description?.trim()
        || binding?.mode === 'disabled'
        || binding?.mode === 'voice' && (binding.voiceId || binding.voiceName));
}

function cardNamedBy(speaker, cards) {
    const key = voiceCueKey(speaker);
    const matches = cards.filter(card => voiceCueKey(card.name) === key || (card.aliases || []).some(alias => {
        if (!alias?.pattern) return false;
        if (!alias.isRegex) return voiceCueKey(alias.pattern) === key;
        try { return new RegExp(`^(?:${alias.pattern})$`, 'iu').test(speaker); }
        catch { return false; }
    }));
    return matches.length === 1 ? matches[0] : null;
}

/** Keep the captured voice, then remove its tag from every current-swipe text copy. */
export function retainVoiceCues(messageId, records, context = getContext(), provisional = new Map(), source) {
    const message = context?.chat?.[messageId];
    if (!message || message.is_user || message.is_system) return 0;
    const sourceText = source ?? message.mes;
    const cues = parseVoiceCues(sourceText, records);
    const standalone = standaloneVoiceCues(sourceText);
    if (!standalone.length) return 0;
    const active = getActiveCharacters();
    const cards = new Map(active.map(card => [card.id, card]));
    const cardFor = speaker => cards.get(records.find(record => !record.isPersona
        && voiceCueKey(record.speakerLabel) === voiceCueKey(speaker))?.npcId)
        || cardNamedBy(speaker, active);
    const newCues = cues.filter(cue => !hasCardVoicePreference(cardFor(cue.speaker))
        && !voiceCueFor(cue.speaker, cardFor(cue.speaker), context));
    const added = saveVoiceCues(newCues, context, provisional);
    const retained = standalone.filter(cue => hasCardVoicePreference(cardFor(cue.speaker))
        || voiceCueFor(cue.speaker, cardFor(cue.speaker), context)).map(cue => cue.speaker);
    if (!retained.length) return added;
    const original = message.mes;
    const cleaned = withoutVoiceCueLines(original, retained);
    let changed = cleaned !== original;
    if (changed) message.mes = cleaned;
    if (typeof message.extra?.display_text === 'string') {
        const visible = withoutVoiceCueLines(message.extra.display_text, retained);
        if (visible !== message.extra.display_text) { message.extra.display_text = visible; changed = true; }
    }
    const index = Number(message.swipe_id);
    if (Array.isArray(message.swipes) && Number.isInteger(index) && message.swipes[index] === original
        && cleaned !== original) message.swipes[index] = cleaned;
    const swipeExtra = message.swipe_info?.[index]?.extra;
    if (typeof swipeExtra?.display_text === 'string') {
        const visible = withoutVoiceCueLines(swipeExtra.display_text, retained);
        if (visible !== swipeExtra.display_text) { swipeExtra.display_text = visible; changed = true; }
    }
    if (changed) {
        context.saveChat?.();
        const text = document.querySelector(`#chat .mes[mesid="${Number(messageId)}"] .mes_text`);
        stripVoiceCueNodes(text);
    }
    return added;
}

/** Called for completed replies and deliberate manual replay. */
export function captureVoiceCues(messageId, context = getContext()) {
    const message = context?.chat?.[messageId];
    if (!message || message.is_user || message.is_system) return 0;
    const element = document.querySelector(`#chat .mes[mesid="${Number(messageId)}"]`);
    if (!element) return 0;
    const records = readDialogueRecords(element, { context, characters: getActiveCharacters() });
    return retainVoiceCues(messageId, records, context);
}
