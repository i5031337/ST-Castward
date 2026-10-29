import { world_names, loadWorldInfo, saveWorldInfo, deleteWorldInfoEntry, createNewWorldInfo, METADATA_KEY } from '../../../../../world-info.js';
import { getContext } from '../../../../../st-context.js';
import { LOG_PREFIX, debugLog } from '../core/constants.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { getActiveCharacters, getChatCast, isCharacterInChat } from '../characters/characters.js';
import { getAllCharacters } from '../characters/character-repository.js';
import { canAutoLinkLorebook } from '../characters/character-scope.js';
import { existingFillLorebookName, newChatLorebookName } from './lorebook-target.js';

/** world_names is undefined until SillyTavern initialization finishes. */
function knownWorlds() {
    return Array.isArray(world_names) ? world_names : [];
}

/**
 * Updates an existing lorebook entry.
 */
export async function updateLorebookEntry(world, uid, { comment, content }) {
    const data = await loadWorldInfo(world);
    const entry = data?.entries?.[uid];
    if (!entry) throw new Error(`Entry UID ${uid} not found in world "${world}"`);

    if (comment !== undefined) entry.comment = comment;
    if (content !== undefined) entry.content = content;

    await saveWorldInfo(world, data);
    return entry;
}

/**
 * Delete the entry itself; unlinking only removes the card's reference.
 *
 * @param {string} world
 * @param {number} uid
 * @returns {Promise<boolean>} False when there was nothing there to delete.
 */
export async function deleteLorebookEntry(world, uid) {
    const data = await loadWorldInfo(world);
    if (!data?.entries) throw new Error(`Could not load lorebook "${world}"`);

    const removed = await deleteWorldInfoEntry(data, uid, { silent: true });
    if (removed === false) return false;

    await saveWorldInfo(world, data);
    debugLog(`Deleted entry ${uid} from "${world}"`);
    return true;
}

/**
 * Read the chat-bound lorebook from metadata and verify that it still exists.
 *
 * @returns {string} The world name, or '' when the chat has none.
 */
export function getChatLorebookName() {
    const name = getContext()?.chatMetadata?.[METADATA_KEY];
    return (typeof name === 'string' && knownWorlds().includes(name)) ? name : '';
}

const pendingChatBooks = new WeakMap();

/** Reuse a target; create only with the automatic preference or a one-time explicit choice. */
export async function ensureChatLorebookForFill({ allowCreate = false, isCurrent = () => true } = {}) {
    if (!isCurrent()) return '';
    const selected = existingFillLorebookName(getChatLorebookName(),
        getSettings().defaultLorebook, knownWorlds());
    if (selected) return selected;
    if (!allowCreate && getSettings().autoCreateLorebook !== true) return '';
    const context = getContext();
    const chatId = context?.getCurrentChatId?.();
    if (!chatId || !context?.chatMetadata) return '';
    const metadata = context.chatMetadata;
    if (pendingChatBooks.has(metadata)) return pendingChatBooks.get(metadata);
    const work = (async () => {
        const name = newChatLorebookName(chatId, knownWorlds());
        if (!await createNewWorldInfo(name)) return '';
        if (!isCurrent() || getContext()?.chatMetadata !== metadata) return '';
        metadata[METADATA_KEY] = name;
        context.saveMetadataDebounced?.();
        document.querySelector('.chat_lorebook_button')?.classList.add('world_set');
        toastr.info(`Created lorebook “${name}” for this chat.`
            + (allowCreate ? '' : ' You can turn off automatic creation in Profiles → Lorebooks.'), 'Castward', { escapeHtml: true });
        return name;
    })();
    pendingChatBooks.set(metadata, work);
    try { return await work; }
    finally { pendingChatBooks.delete(metadata); }
}

/** Collect the card name and literal aliases. Locations use strings; character aliases use pattern objects. */
export function namesFor(char) {
    const names = [String(char.name ?? '').trim()].filter(Boolean);
    for (const alias of char.aliases || []) {
        if (typeof alias === 'string') {
            if (alias.trim()) names.push(alias.trim());
            continue;
        }
        // A regex alias is a matching rule, not a name an entry could be titled with.
        if (!alias?.pattern || alias.isRegex) continue;
        names.push(String(alias.pattern).trim());
    }
    return names;
}

/**
 * Merge keywords case-insensitively, preserving existing triggers when generation omits tags.
 *
 * @param {string[]|string|undefined} existing
 * @param {string} generated Comma-separated.
 * @returns {string[]}
 */
export function mergeKeywords(existing, generated) {
    const start = Array.isArray(existing) ? existing : (existing ? [existing] : []);
    const merged = start.map(k => String(k).trim()).filter(Boolean);
    const seen = new Set(merged.map(k => k.toLowerCase()));

    for (const raw of String(generated ?? '').split(',')) {
        const keyword = raw.trim();
        if (!keyword) continue;
        const key = keyword.toLowerCase();
        if (seen.has(key)) continue;      // "Knight" and "knight" are one keyword
        seen.add(key);
        merged.push(keyword);
    }

    return merged;
}

/** Name the subject and aliases in a heading: SillyTavern injects entry content without its title, and adjacent entries need a boundary. */
export function identityHeader(char) {
    const [name, ...aliases] = namesFor(char);
    if (!name) return '';
    return aliases.length ? `### ${name} (also: ${aliases.join(', ')})` : `### ${name}`;
}

/** Matches a heading on the FIRST line only, so a "###" inside the body survives. */
const HEADER_LINE = /^###[^\n]*\n?/;

/** The entry body with any heading this has written before removed. */
export function stripIdentityHeader(content) {
    return String(content ?? '').replace(HEADER_LINE, '');
}

/**
 * Synchronize title, keywords, and heading without saving. Retain old names as triggers for earlier chat references.
 *
 * @returns {boolean} Whether anything changed - false lets a bulk pass skip the write
 *   entirely rather than rewriting a lorebook file on every chat switch.
 */
export function syncEntryIdentity(char, entry) {
    const names = namesFor(char);
    if (!entry || !names.length) return false;

    const before = { comment: entry.comment, key: entry.key, content: entry.content };

    entry.comment = names[0];
    entry.key = mergeKeywords(entry.key, names.join(','));

    // An empty entry is left empty: a heading with nothing under it is worse than nothing,
    // and createLoreEntry makes the entry before there is anything to put in it.
    const body = stripIdentityHeader(entry.content);
    entry.content = body.trim() ? `${identityHeader(char)}\n${body}` : body;

    return before.comment !== entry.comment
        || before.content !== entry.content
        || String(before.key) !== String(entry.key);
}

/** Does this entry belong to this character? Title first, then its own keywords. */
function entryMatches(entry, names) {
    const wanted = new Set(names.map(n => n.toLowerCase()));

    const title = String(entry.comment ?? '').trim().toLowerCase();
    if (title && wanted.has(title)) return 'title';

    for (const key of entry.key || []) {
        if (wanted.has(String(key).trim().toLowerCase())) return 'keyword';
    }
    return null;
}

/**
 * Link using the character's name and aliases against entry titles and keywords.
 *
 * @param {object} char
 * @param {{ silent?: boolean, worlds?: string[] }} [options] silent suppresses the toast, for
 *   bulk syncing. worlds are the lorebooks to search instead of the character scan list -
 *   locations keep a list of their own.
 * @returns {Promise<boolean>} Whether a link was made.
 */
export async function tryAutoSyncLorebook(char, { silent = false, worlds: only = null, force = false } = {}) {
    if (!canAutoLinkLorebook(char, force)) return false;

    // Worlds to scan: user selection -> current chat world -> first world name in list.
    let worlds = (Array.isArray(only) && only.length ? only : null) ?? getSettings().scanLorebooks ?? [];
    if (worlds.length === 0) {
        const chatWorld = getChatLorebookName();
        if (chatWorld) worlds = [chatWorld];
        else if (knownWorlds().length > 0) worlds = [knownWorlds()[0]];
    }

    if (worlds.length === 0) return false;

    const names = namesFor(char);
    if (!names.length) return false;

    for (const worldName of worlds) {
        try {
            const data = await loadWorldInfo(worldName);
            const entries = Object.values(data?.entries ?? {});

            // Title beats keyword: an entry named for the character is a better match
            // than one that merely mentions them.
            const byTitle = entries.find(e => entryMatches(e, names) === 'title');
            const match = byTitle || entries.find(e => entryMatches(e, names) === 'keyword');

            if (match) {
                char.lorebook = { world: worldName, uid: match.uid };
                saveSettings();
                if (!silent) {
                    toastr.info(`Auto-linked Lorebook entry: "${match.comment || match.uid}" from "${worldName}"`, 'Castward');
                }
                return true;
            }
        } catch (err) {
            console.error(LOG_PREFIX, `Auto-sync lorebook failed for ${worldName}`, err);
        }
    }
    return false;
}

/**
 * Enable linked entries for the chat cast and disable those outside it. Leave unlinked entries untouched; load each world once and save only changes.
 *
 * @returns {Promise<number>} How many entries were flipped.
 */
export async function syncLorebookScope() {
    const characters = getAllCharacters().filter(c => c.lorebook?.world);
    if (!characters.length) return 0;

    const byWorld = new Map();
    for (const char of characters) {
        if (!byWorld.has(char.lorebook.world)) byWorld.set(char.lorebook.world, []);
        byWorld.get(char.lorebook.world).push(char);
    }

    const cast = getChatCast();
    let flipped = 0;

    for (const [worldName, members] of byWorld) {
        let data;
        try { data = await loadWorldInfo(worldName); } catch { continue; }
        if (!data?.entries) continue;

        let changed = false;
        for (const char of members) {
            const entry = data.entries[char.lorebook.uid];
            if (!entry) continue;                      // deleted in SillyTavern's editor
            const shouldBeOff = !isCharacterInChat(char, cast);
            if (!!entry.disable === shouldBeOff) continue;
            entry.disable = shouldBeOff;
            changed = true;
            flipped++;
        }
        if (changed) await saveWorldInfo(worldName, data);
    }

    if (flipped) debugLog(`Lore entries switched for this chat: ${flipped}`);
    return flipped;
}

/**
 * Attempt to link characters that have no lorebook entry.
 *
 * @returns {Promise<{ linked: number, checked: number }>}
 */
export async function syncAllLorebooks() {
    // Only the characters this chat is for: linking lore for somebody who belongs to
    // another story is work nobody asked for, and injects them into a scene they are
    // not in.
    const characters = getActiveCharacters();
    const candidates = characters.filter(c => c.name && !c.lorebook);

    let linked = 0;
    for (const char of candidates) {
        if (await tryAutoSyncLorebook(char, { silent: true, force: true })) linked++;
    }

    if (linked) saveSettings();
    return { linked, checked: candidates.length };
}

/**
 * Update linked entry identity after a character rename.
 *
 * @returns {Promise<boolean>} Whether anything was written.
 */
export async function renameLorebookEntry(char) {
    const world = char?.lorebook?.world;
    if (!world || !char.name) return false;

    const data = await loadWorldInfo(world);
    const entry = data?.entries?.[char.lorebook.uid];
    if (!entry) return false;

    if (!syncEntryIdentity(char, entry)) return false;
    await saveWorldInfo(world, data);
    debugLog(`Lorebook entry now filed under "${char.name}"`);
    return true;
}

/**
 * Refresh linked entry identities, saving changed entries once per world.
 *
 * @returns {Promise<{ updated: number, checked: number }>}
 */
export async function repairEntryIdentities() {
    const linked = getActiveCharacters().filter(c => c.name && c.lorebook?.world);

    const byWorld = new Map();
    for (const char of linked) {
        if (!byWorld.has(char.lorebook.world)) byWorld.set(char.lorebook.world, []);
        byWorld.get(char.lorebook.world).push(char);
    }

    let updated = 0;
    for (const [world, chars] of byWorld) {
        let worldData;
        try {
            worldData = await loadWorldInfo(world);
        } catch (err) {
            debugLog(`Could not open "${world}" to check its entries`, err);
            continue;
        }
        if (!worldData?.entries) continue;

        let dirty = false;
        for (const char of chars) {
            const entry = worldData.entries[char.lorebook.uid];
            // A missing entry is left to tryAutoSyncLorebook rather than repaired into
            // existence: the user may have deleted it on purpose.
            if (entry && syncEntryIdentity(char, entry)) {
                dirty = true;
                updated += 1;
            }
        }

        if (dirty) await saveWorldInfo(world, worldData);
    }

    if (updated) debugLog(`Named ${updated} lorebook entr(ies) after their characters`);
    return { updated, checked: linked.length };
}
