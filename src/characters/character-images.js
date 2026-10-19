/** Character image folders and disk-backed galleries. SillyTavern sanitizes folder names as a single path component, so nested folders are unsupported. */

import { getRequestHeaders } from '../../../../../../script.js';
import { debugLog } from '../core/constants.js';
import { getSettings, saveSettings } from '../core/settings.js';

/** SillyTavern's media type flags for /api/images/list: pictures and videos. */
const IMAGES_AND_VIDEOS = 0b011;

/** Match the server's sanitize-filename rules exactly so listing and upload resolve the same folder. */
const ILLEGAL = /[/?<>\\:*|"]/g;
const CONTROL = /[\x00-\x1f\x80-\x9f]/g;
/** "." and ".." mean something to a filesystem, so a name of nothing but dots is dropped. */
const DOTS_ONLY = /^\.+$/;
/** CON, PRN, NUL and friends cannot be filenames on Windows, with or without a suffix. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
/** Windows silently drops a trailing dot or space, so a folder ending in one is unfindable. */
const WINDOWS_TRAILING = /[\. ]+$/;

/** Bytes, not characters: the cap is a filesystem limit and accents cost two apiece. */
function truncateUtf8(text, max) {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length <= max) return text;
    // Cut on a character boundary, never mid-sequence.
    return new TextDecoder('utf-8', { fatal: false })
        .decode(bytes.slice(0, max)).replace(/\uFFFD+$/, '');
}

/**
 * A character's name as a folder, or '' when nothing usable is left of it.
 *
 * @param {string} name
 * @returns {string}
 */
export function folderNameFor(name) {
    if (typeof name !== 'string') return '';
    const clean = name
        .replace(ILLEGAL, '')
        .replace(CONTROL, '')
        .replace(DOTS_ONLY, '')
        .replace(WINDOWS_RESERVED, '')
        .replace(WINDOWS_TRAILING, '');
    return truncateUtf8(clean, 255);
}

/**
 * Use the stored folder when present, falling back to the name for unclaimed cards. A stored folder survives renames; same-name cards can share a folder.
 *
 * @param {object} char
 * @returns {string} '' when the character has no usable name at all.
 */
export function folderFor(char) {
    if (!char) return '';
    const stored = folderNameFor(char.imageFolder);
    if (stored) return stored;
    return folderNameFor(char.name);
}

/**
 * Persist the folder before the first write. Reading folderFor must not change settings.
 *
 * @param {object} char
 * @returns {string} The folder, now stored.
 */
export function claimFolder(char) {
    if (!char) return '';
    const stored = folderNameFor(char.imageFolder);
    if (stored) return stored;

    const folder = folderNameFor(char.name);
    if (!folder) return '';

    char.imageFolder = folder;
    saveSettings();
    return folder;
}

/**
 * List disk contents by name; external additions and deletions appear on refresh. The host creates missing folders. Include videos only when requested.
 *
 * @param {object} char
 * @param {{ videos?: boolean }} [options]
 * @returns {Promise<string[]>} Paths, ready to use as an `img` (or `video`) src.
 */
export async function listCharacterImages(char, { videos = false } = {}) {
    const folder = folderFor(char);
    if (!folder) return [];

    try {
        const response = await fetch('/api/images/list', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ folder, type: videos ? IMAGES_AND_VIDEOS : 0b001, sortField: 'name', sortOrder: 'asc' }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const files = await response.json();
        if (!Array.isArray(files)) return [];
        return files.map(file => `/user/images/${folder}/${file}`);
    } catch (err) {
        debugLog(`Could not read user/images/${folder}`, err);
        return [];
    }
}

/**
 * Refresh the synchronous gallery cache. Repair imageUrl only if its selected file is missing.
 *
 * @param {object} char
 * @param {{ videos?: boolean }} [options] See listCharacterImages.
 * @returns {Promise<{ changed: boolean, images: string[] }>}
 */
export async function refreshCharacterImages(char, options = {}) {
    if (!char) return { changed: false, images: [] };

    const found = await listCharacterImages(char, options);
    const before = Array.isArray(char.images) ? char.images : [];

    const same = before.length === found.length && before.every((p, i) => p === found[i]);
    if (same) return { changed: false, images: found };

    char.images = found;
    if (char.imageUrl && !found.includes(char.imageUrl)) {
        char.imageUrl = found[0] || '';
    }
    saveSettings();
    return { changed: true, images: found };
}

/**
 * Configured folder for the fallback portrait pool.
 *
 * @returns {string}
 */
export function sharedFolder() {
    return String(getSettings().imageSaveRoute || 'sillynpc');
}

export { moveFolder, migrateImagesToFolders } from './character-image-migration.js';
