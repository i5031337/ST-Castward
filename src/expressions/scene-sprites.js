import { eventSource, event_types } from '../../../../../events.js';
import { getContext } from '../../../../../st-context.js';
import { getSettings } from '../core/settings.js';
import { getActiveCharacters } from '../characters/characters.js';
import { dialogueRevision } from '../chat/dialogue-presentation.js';
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
    packs.clear();
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
    entries.filter(entry => entry.path).forEach(({ card, path }, index) => {
        const figure = existing.get(card.id) || document.createElement('div'); figure.className = 'sillynpc-scene-sprite';
        figure.dataset.npcId = card.id; figure.title = card.name;
        const image = figure.querySelector('img') || document.createElement('img'); image.alt = card.name;
        if (image.getAttribute('src') !== path) image.src = path;
        image.onerror = () => {
            if (card.imageUrl && image.getAttribute('src') !== card.imageUrl) image.src = card.imageUrl;
            else figure.remove();
        };
        figure.append(image); sides[index % 2].append(figure);
    });
    root.replaceChildren(...sides);
}

export function initSceneSprites(renderedEvent) {
    for (const event of ['sillynpc-status-updated', renderedEvent, event_types.MESSAGE_SWIPED,
        event_types.MESSAGE_EDITED, event_types.MESSAGE_DELETED]) eventSource.on(event, () => void refreshSceneSprites());
    eventSource.on(event_types.CHAT_CHANGED, () => { clearSceneSprites(); void refreshSceneSprites(); });
    void refreshSceneSprites();
}
