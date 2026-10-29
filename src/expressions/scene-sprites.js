import { eventSource, event_types } from '../../../../../events.js';
import { getContext } from '../../../../../st-context.js';
import { getSettings } from '../core/settings.js';
import { getActiveCharacters } from '../characters/characters.js';
import { dialogueRevision, readDialogueRecords } from '../chat/dialogue-presentation.js';
import { fnv1a } from '../core/hash.js';
import { loadSpritePack } from './host-expressions.js';
import { selectSprite } from './expression-engine.js';
import { clearSpeechSprite } from './speech-sprite.js';
import { presentSpriteCards, validLatestSprite, mayRememberSprite, latestPackSprite } from './scene-sprite-state.js';

const METADATA_KEY = 'sillynpc_expression_sprites';
const packs = new Map();
let version = 0;
const owner = () => {
    const context = getContext();
    return JSON.stringify([context.getCurrentChatId?.(), context.characterId, context.groupId]);
};
const sourceFor = id => {
    const context = getContext();
    return context.chat?.[id] ? fnv1a(dialogueRevision(context, id)) : null;
};

/** Layer the speaker above overlapping scene partners without changing their slots. */
export function focusSceneSprite(npcId) {
    const root = document.getElementById('sillynpc-scene-sprites');
    if (!root) return;
    root.dataset.activeNpcId = npcId || '';
    for (const figure of root.querySelectorAll('.sillynpc-scene-sprite')) {
        figure.dataset.active = String(figure.dataset.npcId === npcId);
    }
}

function latestSceneSpeaker(ids) {
    for (const message of [...document.querySelectorAll('#chat .mes')].reverse()) {
        const line = readDialogueRecords(message).filter(line => !line.isPersona && ids.has(line.npcId)).at(-1);
        if (line) return line.npcId;
    }
    return '';
}

export function clearSceneSprites() {
    version++; packs.clear();
    document.getElementById('sillynpc-scene-sprites')?.remove();
}

/** Remember only an available emotion sprite; neutral placeholders do not replace it. */
export function rememberNpcSprite(card, sprites, label, line, { save = () => getContext().saveMetadataDebounced?.() } = {}) {
    const context = getContext();
    if (context.getCurrentChatId?.() === undefined || !context.chatMetadata) return;
    const config = card.presentation?.expressions;
    const path = selectSprite(sprites, label, '', line ? line.revision + card.id + line.lineIndex : card.id);
    if (!path) return;
    const messageId = line?.messageId ?? context.chat.length - 1;
    const record = { path, label, reference: card.imageUrl, folder: config.spriteFolder, messageId,
        lineIndex: line?.lineIndex ?? Number.MAX_SAFE_INTEGER, source: line ? sourceFor(messageId) : null };
    const records = context.chatMetadata[METADATA_KEY] ||= {};
    if (!mayRememberSprite(records[card.id], record, sourceFor)) return;
    if (JSON.stringify(records[card.id]) !== JSON.stringify(record)) { records[card.id] = record; save(); }
    packs.set(JSON.stringify([owner(), config.spriteFolder]), Promise.resolve(sprites));
    void refreshSceneSprites();
}

/** Read saved sprites only; enabling or refreshing this display never generates anything. */
export async function refreshSceneSprites({ loadPack = loadSpritePack } = {}) {
    const settings = getSettings(), context = getContext();
    const identity = owner(), captured = ++version;
    const current = () => captured === version && identity === owner()
        && getSettings().enabled && getSettings().showPresentNpcSprites;
    if (!settings.enabled || !settings.showPresentNpcSprites || context.getCurrentChatId?.() === undefined) {
        document.getElementById('sillynpc-scene-sprites')?.remove(); return;
    }
    clearSpeechSprite();
    const cards = presentSpriteCards(getActiveCharacters(), context.chatMetadata?.sillynpc_status_state);
    const records = context.chatMetadata?.[METADATA_KEY] || {};
    const entries = await Promise.all(cards.map(async card => {
        const config = card.presentation?.expressions;
        const saved = records[card.id];
        if (validLatestSprite(card, saved, sourceFor)) return { card, path: saved.path };
        if (config?.generation?.reference && config.generation.reference !== card.imageUrl) return { card, path: card.imageUrl };
        let sprites = [];
        if (config?.spriteFolder) {
            const key = JSON.stringify([identity, config.spriteFolder]);
            if (!packs.has(key)) packs.set(key, loadPack(config.spriteFolder).catch(() => []));
            sprites = await packs.get(key);
        }
        return { card, path: latestPackSprite(sprites, config?.fallback) || card.imageUrl };
    }));
    if (!current()) return;
    let root = document.getElementById('sillynpc-scene-sprites');
    if (!entries.some(entry => entry.path)) { root?.remove(); return; }
    if (!root) {
        root = document.createElement('div'); root.id = 'sillynpc-scene-sprites';
        root.setAttribute('aria-label', 'Present NPC expressions'); document.body.append(root);
    }
    const sides = ['left', 'right'].map(side => {
        const element = document.createElement('div'); element.className = 'sillynpc-scene-sprite-side';
        element.dataset.side = side; return element;
    });
    const existing = new Map([...root.querySelectorAll('.sillynpc-scene-sprite')].map(figure => [figure.dataset.npcId, figure]));
    const visible = entries.filter(entry => entry.path);
    visible.forEach(({ card, path }, index) => {
        const figure = existing.get(card.id) || document.createElement('div'); figure.className = 'sillynpc-scene-sprite';
        figure.dataset.npcId = card.id; figure.title = card.name;
        const slot = Math.floor(index / 2), count = Math.ceil((visible.length - index % 2) / 2);
        figure.style.setProperty('--sprite-offset', `${count > 1 ? slot / (count - 1) * 30 : 0}%`);
        figure.style.setProperty('--sprite-layer', String(slot));
        const image = figure.querySelector('img') || document.createElement('img'); image.alt = card.name;
        image.dataset.portrait = String(path === card.imageUrl);
        if (image.getAttribute('src') !== path) image.src = path;
        image.onerror = () => {
            if (card.imageUrl && image.getAttribute('src') !== card.imageUrl) {
                image.dataset.portrait = 'true'; image.src = card.imageUrl;
            }
            else figure.remove();
        };
        figure.append(image); sides[index % 2].append(figure);
    });
    root.replaceChildren(...sides);
    const ids = new Set(visible.map(({ card }) => card.id));
    focusSceneSprite(ids.has(root.dataset.activeNpcId) ? root.dataset.activeNpcId : latestSceneSpeaker(ids) || visible[0].card.id);
}

export function initSceneSprites(renderedEvent) {
    eventSource.on('sillynpc-status-updated', () => void refreshSceneSprites());
    for (const event of [renderedEvent, event_types.MESSAGE_SWIPED,
        event_types.MESSAGE_EDITED, event_types.MESSAGE_DELETED]) eventSource.on(event, () => {
        focusSceneSprite(null);
        void refreshSceneSprites();
    });
    eventSource.on(event_types.CHAT_CHANGED, () => { clearSceneSprites(); void refreshSceneSprites(); });
    void refreshSceneSprites();
}
