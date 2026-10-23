import { getRequestHeaders } from '../../../../../../script.js';
import { loadSpritePack } from '../expressions/host-expressions.js';
import { normalizeSpriteFolder } from '../core/npc-presentation.js';
import { adoptImageForCharacter } from '../api/api.js';
import { tagsFromFilename, valuesByField } from './image-tags.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);

async function imageData(path) {
    if (typeof path !== 'string' || !path) throw new Error('A character image has no path.');
    if (/^data:image\/[a-z0-9+.-]+;base64,/i.test(path)) return path;
    if (!path.startsWith('/user/images/') && !path.startsWith('/characters/')) {
        throw new Error(`Cannot export an image outside SillyTavern storage: ${path}`);
    }
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load character image: ${path}`);
    const blob = await response.blob();
    if (!IMAGE_TYPES.has(blob.type)) throw new Error(`Unsupported character image type: ${path}`);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Could not read character image: ${path}`));
        reader.readAsDataURL(blob);
    });
}

/** Embed the Cast page's gallery, selected portrait, picture tags and expression pack. */
export async function captureCharacterMedia(char, record) {
    const reference = record.presentation?.expressions?.generation?.reference;
    const paths = [...new Set([...(Array.isArray(char.images) ? char.images : []), char.imageUrl, reference]
        .filter(Boolean))];
    record.images = [];
    record.imageNames = [];
    record.portrait = Math.max(0, paths.indexOf(char.imageUrl));
    record.expressionReference = paths.indexOf(reference);
    record.imageTags = {};
    for (const [index, path] of paths.entries()) {
        record.images.push(await imageData(path));
        const name = path.startsWith('/user/images/') ? decodeURIComponent(path.split('?')[0].split('/').pop()) : '';
        record.imageNames.push(name);
        const tags = { ...tagsFromFilename(name, valuesByField()), ...(char.imageTags?.[path] || {}) };
        if (Object.keys(tags).length) record.imageTags[index] = structuredClone(tags);
    }
    const folder = normalizeSpriteFolder(record.presentation?.expressions?.spriteFolder);
    record.sprites = [];
    if (!folder) return record;
    for (const sprite of await loadSpritePack(folder)) {
        const name = decodeURIComponent(sprite.path.split('?')[0].split('/').pop() || '');
        if (!name || !/^[^/\\]+\.(png|jpe?g|webp|gif|avif)$/i.test(name)) continue;
        record.sprites.push({ name, label: sprite.label, image: await imageData(sprite.path) });
    }
    return record;
}

/** Import gallery images into the character's own folder and reconnect their tags. */
export async function restoreCharacterImages(char, record) {
    char.images = [];
    char.imageUrl = '';
    char.imageTags = {};
    const stored = [];
    const images = Array.isArray(record.images) ? record.images : [];
    for (const dataUri of images) {
        if (typeof dataUri !== 'string' || !/^data:image\/[a-z0-9+.-]+;base64,/i.test(dataUri)) continue;
        const path = await adoptImageForCharacter(char, dataUri);
        stored.push(path);
        const index = stored.length - 1;
        const tags = { ...tagsFromFilename(record.imageNames?.[index], valuesByField()),
            ...(record.imageTags?.[index] || {}) };
        if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
            char.imageTags[path] = Object.fromEntries(Object.entries(tags)
                .filter(([key, value]) => key && typeof value === 'string'));
        }
    }
    const selected = Number(record.portrait);
    char.imageUrl = stored[selected >= 0 && selected < stored.length ? selected : 0] || '';
    if (!Object.keys(char.imageTags).length) delete char.imageTags;
    return stored;
}

/** Use a fresh pack so importing a character never overwrites local sprites. */
export async function restoreCharacterSprites(char, record) {
    const sprites = Array.isArray(record.sprites) ? record.sprites : [];
    if (!sprites.length) return false;
    const folder = `Castward/${crypto.randomUUID()}`;
    for (const sprite of sprites) {
        const name = String(sprite?.name || '');
        const match = /^([^/\\]+)\.(png|jpe?g|webp|gif|avif)$/i.exec(name);
        const dataMatch = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(sprite?.image || '');
        if (!match || !dataMatch) throw new Error('An imported sprite has invalid image data.');
        const bytes = Uint8Array.from(atob(dataMatch[2]), letter => letter.charCodeAt(0));
        const body = new FormData();
        body.append('name', folder);
        body.append('label', String(sprite.label || match[1]));
        body.append('spriteName', match[1]);
        body.append('avatar', new Blob([bytes], { type: dataMatch[1] }), name);
        const response = await fetch('/api/sprites/upload', {
            method: 'POST', headers: getRequestHeaders({ omitContentType: true }), body,
        });
        if (!response.ok) throw new Error(`Could not import sprite ${name} (${response.status}).`);
    }
    char.presentation.expressions.spriteFolder = folder;
    char.presentation.expressions.bindingStatus = 'unverified';
    return true;
}
