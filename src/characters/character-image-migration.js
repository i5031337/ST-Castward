import { getRequestHeaders } from '../../../../../../script.js';
import { debugLog } from '../core/constants.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { getLibraryCharacters } from './character-repository.js';
import { folderNameFor, folderFor, claimFolder, sharedFolder } from './character-images.js';

const IMAGES_AND_VIDEOS = 0b011;

/* ─── Moving what is already on disk ──────────────────────────────────────── */

/**
 * Protect fallback portraits and persona images from moves, including files also referenced by a character.
 *
 * @returns {Set<string>}
 */
function pathsSpokenForElsewhere() {
    const settings = getSettings();
    const held = new Set();

    for (const entry of settings.defaultImages || []) {
        if (entry?.src) held.add(entry.src);
    }
    for (const persona of Object.values(settings.personaData || {})) {
        if (persona?.imageUrl) held.add(persona.imageUrl);
        for (const path of persona?.images || []) held.add(path);
    }
    return held;
}

/** A file already on disk, as the base64 the upload endpoint wants. */
async function readAsBase64(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const dataUri = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
        reader.readAsDataURL(blob);
    });

    const comma = dataUri.indexOf(',');
    if (comma < 0) throw new Error('not a data URI');
    return dataUri.slice(comma + 1);
}

/** Verify the copied image or video is readable before deleting its source. */
async function copyLanded(path) {
    try {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) return false;
        const blob = await response.blob();
        const type = String(blob.type || '');
        return blob.size > 0 && (type.startsWith('image/') || type.startsWith('video/'));
    } catch {
        return false;
    }
}


/** The file names in a folder, pictures and videos both. */
async function listFolder(folder) {
    const response = await fetch('/api/images/list', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ folder, type: IMAGES_AND_VIDEOS, sortField: 'name', sortOrder: 'asc' }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} listing ${folder}`);
    const files = await response.json();
    return Array.isArray(files) ? files : [];
}

/**
 * Resolve existing folder casing for Windows. The host cannot rename or remove empty folders.
 *
 * @returns {Promise<string>} '' when there is no such folder, or the listing fails.
 */
async function folderOnDisk(name) {
    try {
        const response = await fetch('/api/images/folders', { method: 'POST', headers: getRequestHeaders() });
        if (!response.ok) return '';
        const folders = await response.json();
        const wanted = String(name).toLowerCase();
        return (Array.isArray(folders) ? folders : []).find(f => String(f).toLowerCase() === wanted) ?? '';
    } catch {
        return '';
    }
}

/**
 * Move a card or location folder by copying, verifying, updating references, then deleting originals. Refuse shared source folders, shared destinations, or nonempty destinations. The host leaves empty folders behind.
 *
 * @param {object} owner
 * @param {string} name The name the folder should now follow.
 * @param {object} [options]
 * @param {string} [options.from] The folder before the rename, when the card's name has
 *   already changed and it never stored one - otherwise it would be read from the new name.
 * @param {string} [options.prefix] Put before the name, as locations do.
 * @param {object[]} [options.others] Every other card with a folder. Characters by default.
 * @param {() => void} [options.save] Saves whatever the owner lives in.
 * @returns {Promise<{ folder: string, moved: number, left: string[], refused: string, note: string }>}
 *   `note` says when the folder could not take the new name's capitals.
 */
export async function moveFolder(owner, name, options = {}) {
    const save = options.save ?? saveSettings;
    const wanted = folderNameFor(`${options.prefix ?? ''}${name ?? ''}`);
    const from = folderNameFor(options.from) || folderFor(owner);
    const result = { folder: from, moved: 0, left: [], refused: '', note: '' };
    if (!owner || !wanted) return { ...result, refused: 'no usable name' };

    const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
    const capitalsNote = (kept) => `the folder is still called "${kept}": a folder of that name in different capitals `
        + 'already exists, and SillyTavern cannot rename folders. Rename or delete it by hand to change the capitals.';

    /** Case-only rename: preserve actual disk casing so stored image paths and tags still match. */
    if (!from || same(from, wanted)) {
        const kept = from || (await folderOnDisk(wanted)) || wanted;
        owner.imageFolder = kept;
        save();
        return { ...result, folder: kept, note: kept === wanted ? '' : capitalsNote(kept) };
    }

    // An existing folder under other capitals is the one Windows will open; use its real name.
    const target = (await folderOnDisk(wanted)) || wanted;
    if (target !== wanted) result.note = capitalsNote(target);

    const others = (options.others ?? getLibraryCharacters()).filter(o => o && o !== owner);
    if (others.some(o => same(folderFor(o), from))) {
        return { ...result, refused: `"${from}" is also used by someone else, so it stays where it is` };
    }
    if (others.some(o => same(folderFor(o), target))) {
        return { ...result, refused: `"${target}" already belongs to someone else` };
    }
    if ((await listFolder(target)).length > 0) {
        return { ...result, refused: `"${target}" already has files in it` };
    }

    const files = await listFolder(from);
    for (const file of files) {
        try {
            if (await moveOne(owner, `/user/images/${from}/${file}`, target)) result.moved++;
        } catch (err) {
            debugLog(`Could not move ${file} to ${target}`, err);
            result.left.push(file);
        }
    }

    /** Use the new folder for future images; report any files left behind. */
    owner.imageFolder = target;
    save();
    return { ...result, folder: target };
}

/**
 * Copy, verify, update references, then delete the original. An interrupted move can leave an extra file without losing the image.
 *
 * @returns {Promise<string>} The new path, or '' when nothing moved.
 */
async function moveOne(char, oldPath, folder) {
    const file = oldPath.split('/').pop();
    if (!file) return '';

    const dot = file.lastIndexOf('.');
    const stem = dot > 0 ? file.slice(0, dot) : file;
    const format = dot > 0 ? file.slice(dot + 1).toLowerCase() : 'png';

    const base64 = await readAsBase64(oldPath);

    /** Use the endpoint directly: saveBase64AsFile rewrites dots in filenames, but moves must preserve them. */
    const upload = await fetch('/api/images/upload', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ image: base64, format, ch_name: folder, filename: stem }),
    });
    if (!upload.ok) throw new Error(`HTTP ${upload.status} writing ${file}`);
    const newPath = (await upload.json())?.path;

    if (!newPath || !(await copyLanded(newPath))) {
        throw new Error(`the copy of ${file} could not be read back`);
    }

    // Every record that named the old path, including the tag map keyed by it.
    char.images = (char.images || []).map(p => (p === oldPath ? newPath : p));
    if (char.imageUrl === oldPath) char.imageUrl = newPath;
    if (char.imageTags?.[oldPath]) {
        char.imageTags[newPath] = char.imageTags[oldPath];
        delete char.imageTags[oldPath];
    }

    try {
        await fetch('/api/images/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ path: oldPath.replace(/^\//, '') }),
        });
    } catch (err) {
        // The move succeeded; the tidying did not. Nothing points at the old file now.
        debugLog(`Could not remove ${oldPath} after copying it`, err);
    }

    return newPath;
}

/**
 * Resume image-folder migration on load, preserving filenames. Copy and verify before deleting, save after each character, and stop on failure so the next load can resume.
 *
 * @returns {Promise<{ moved: number, characters: number, failed: string }>}
 */
export async function migrateImagesToFolders() {
    const settings = getSettings();
    if (settings.imagesFoldered) return { moved: 0, characters: 0, failed: '' };

    const from = `/user/images/${sharedFolder()}/`;
    const held = pathsSpokenForElsewhere();
    let moved = 0;
    let characters = 0;
    let failed = '';

    for (const char of getLibraryCharacters()) {
        const mine = (char.images || []).filter(p => p.startsWith(from) && !held.has(p));
        if (mine.length === 0) continue;

        const folder = claimFolder(char);
        if (!folder) continue;

        let any = false;
        try {
            for (const oldPath of mine) {
                if (await moveOne(char, oldPath, folder)) { moved++; any = true; }
            }
        } catch (err) {
            failed = `${char.name}: ${err?.message ?? err}`;
            debugLog('Stopped moving pictures into folders', err);
        }

        if (any) { characters++; saveSettings(); }
        // Stop the whole pass, so a server that has started refusing is not hammered
        // nineteen more times. The next load resumes from where this one stopped.
        if (failed) return { moved, characters, failed };
    }

    /** Mark complete only after the entire pass succeeds, so partial migrations resume. */
    settings.imagesFoldered = true;
    saveSettings();
    return { moved, characters, failed };
}
