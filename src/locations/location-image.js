import { getContext } from '../../../../../st-context.js';
import { eventSource } from '../../../../../events.js';
import { getSettings } from '../core/settings.js';
import { generateImage } from '../api/api-image-generate.js';
import { saveStateToMetadata } from '../tracker/status-logic.js';
import { backgroundImageUrl, editLocation, readLocationStore } from './location-store.js';

const running = new WeakMap();
const negativePrompt = 'people, characters, portraits, faces, text, letters, logo, watermark, frame, collage';
const landscape = { pixels: { width: 1280, height: 720 } };

/** Ground a landscape prompt only in the Place being drawn. */
export function buildPlaceBackgroundPrompt(store, id) {
    const place = store.records[id];
    if (!place) return '';
    return [
        `Wide landscape environment illustration of ${place.name}.`,
        place.description.slice(0, 1800),
        'Atmospheric establishing shot, coherent architecture and geography, no people or writing.',
    ].filter(Boolean).join('\n');
}

/** A generated file is attached only if this chat and Place still match the request. */
export function generatePlaceBackground(id, { automatic = false,
    currentContext = getContext, settingsProvider = getSettings,
    generate = generateImage, save = saveStateToMetadata,
    emit = (...args) => eventSource.emit(...args) } = {}) {
    const context = currentContext();
    const metadata = context?.chatMetadata;
    const chatId = context?.getCurrentChatId?.();
    const settings = settingsProvider();
    const store = readLocationStore(metadata?.sillynpc_status_state);
    const original = store.records[id];
    if (!chatId || !metadata || !settings.enabled || !original
        || (automatic && (!store.enabled || settings.autoPlaceBackgrounds !== true || original.backgroundImage))) {
        return Promise.resolve(false);
    }
    let inChat = running.get(metadata);
    if (!inChat) { inChat = new Map(); running.set(metadata, inChat); }
    if (inChat.has(id)) return inChat.get(id);
    const prompt = buildPlaceBackgroundPrompt(store, id);
    const previousImage = original.backgroundImage;
    const current = () => {
        const now = currentContext();
        const latestSettings = settingsProvider();
        const latestStore = readLocationStore(metadata.sillynpc_status_state);
        const record = latestStore.records[id];
        return now?.chatMetadata === metadata && now?.getCurrentChatId?.() === chatId
            && latestSettings.enabled && (!automatic || latestSettings.autoPlaceBackgrounds === true)
            && record && record.backgroundImage === previousImage
            && buildPlaceBackgroundPrompt(latestStore, id) === prompt;
    };
    const task = (async () => {
        try {
            const imageUrl = await generate(prompt, {
                owner: original.name, shape: landscape, negativePrompt,
                gallery: false, extend: false, edit: false,
            });
            if (!current()) return false;
            if (typeof imageUrl !== 'string' || imageUrl.startsWith('data:')) {
                throw new Error('Image Generation did not save a background file.');
            }
            const path = imageUrl.trim().replace(/^\/+/, '');
            const encoded = encodeURI(path).replace(/%25(?=[0-9a-f]{2})/gi, '%').replaceAll('"', '%22');
            const image = `url("${encoded}")`;
            if (!backgroundImageUrl(image)) throw new Error('Image Generation returned an invalid background path.');
            const next = editLocation(metadata.sillynpc_status_state, { id, backgroundImage: image });
            if (!current()) return false;
            save(next, { label: 'Place background', recordHistory: false });
            const gallery = Array.isArray(metadata.chat_backgrounds) ? metadata.chat_backgrounds : [];
            if (!gallery.includes(path)) metadata.chat_backgrounds = [...gallery, path];
            context.saveMetadataDebounced?.();
            emit('sillynpc-status-updated', next, { source: 'place-image' });
            return true;
        } finally { inChat.delete(id); }
    })();
    inChat.set(id, task);
    return task;
}
