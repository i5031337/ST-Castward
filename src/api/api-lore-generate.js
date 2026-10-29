import { startGenerationTask, awaitGenerationRequest } from '../core/generation-cancellation.js';
import { promptText, fillPromptText } from '../prompts/prompt-texts.js';
import { chat, extractMessageFromData } from '../../../../../../script.js';
import { getContext } from '../../../../../st-context.js';
import { loadWorldInfo, saveWorldInfo } from '../../../../../world-info.js';
import { LOG_PREFIX, debugLog } from '../core/constants.js';
import { fillTemplate } from '../prompts/macros.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { DEFAULT_LORE_PROMPT } from '../prompts/default-prompt-texts.js';
import { PLAYER_CREATION_PROMPT, playerCreationSystemContext } from '../prompts/player-creation.js';
import { customProfilePayload } from './api-connection-profile.js';
import { syncEntryIdentity, mergeKeywords, namesFor } from '../lore/lorebook.js';
import { escapeRegExp, describeConnection } from '../core/utils.js';
import { describeTrackedFacts, retrieveWorldFacts } from './api-lore-facts.js';
import { loreProfileValues } from '../prompts/profile-prompt-fields.js';
import { profileFieldsForCard } from '../core/profile-fields.js';
import { formatLoreContent, parseLoreContent, parseGeneratedProfileFields, mergeLoreValues } from '../lore/lore-format.js';
import { loreReplyWasTruncated, parseLoreReply } from '../lore/lore-reply.js';
import { requireLorebook, lorebookWriteGuard } from '../lore/lorebook-write-target.js';
import { createLoreEntry } from '../lore/lore-entries.js';
import { inOrder } from '../lore/lore-write-queue.js';
import { getPersonaData } from '../tracker/status-logic.js';

/**
 * The slice of story the lore writer is shown.
 *
 * Bounded by characters as well as by message count. "Whole chat" meant literally the
 * whole chat: on a long story that is megabytes in a single prompt, and SillyTavern could
 * not build the request at all - it reported "Mandatory prompts exceed the context size",
 * then generated from whatever fitted, which was never the instruction.
 *
 * Whole messages only, newest first, so the excerpt never starts mid-sentence.
 *
 * @param {Array<object>} messages
 * @returns {{ text: string, used: number, available: number, trimmed: boolean }}
 */
export function buildLoreExcerpt(messages) {
    const settings = getSettings();
    // 0 means the whole chat, the same convention the history scan's depth uses. Read
    // with `|| 15` this would be silently impossible: zero is falsy, so choosing "whole
    // chat" would quietly have given fifteen messages.
    const configured = Number(settings.contextMessages);
    const count = Number.isFinite(configured) ? configured : 15;
    const wanted = count > 0 ? messages.slice(-count) : messages.slice();
    const budget = Math.max(1000, Number(settings.loreCharBudget) || 40000);

    const lines = [];
    let chars = 0;
    for (let i = wanted.length - 1; i >= 0; i--) {
        const m = wanted[i];
        const line = `${m.is_user ? 'User' : (m.name || 'Assistant')}: ${m.mes}`;
        if (chars + line.length > budget && lines.length) break;
        lines.unshift(line);
        chars += line.length + 1;
    }

    return {
        text: lines.join('\n'),
        used: lines.length,
        available: wanted.length,
        trimmed: lines.length < wanted.length,
    };
}

/**
 * Sends the lore request.
 *
 * Deliberately not generateQuietPrompt. That runs SillyTavern's story pipeline, so the
 * character card, your persona, world info and the chat all travel as *mandatory* prompts
 * with the instruction on top - and when they did not fit, SillyTavern dropped the
 * instruction, generated in character anyway, and offered that as lore.
 *
 * The same shape as requestExtraction: a chosen profile if there is one, otherwise
 * generateRawData, which sends only what it is given and works across backends.
 */
/**
 * Which connection served the last lore request, for the settings panel to display.
 *
 * A user reported that generating lore had changed the API their chat was using. It had
 * not - sendRequest passes a profile into one request and never writes selectedProfile -
 * but there was no way to establish that after the fact, only to reason about it. So
 * record what actually ran, including the fall back to the main API, which is the case
 * most likely to look like something went wrong.
 *
 * @type {{ label: string, when: number } | null}
 */
let lastLoreConnection = null;

/** @returns {{ label: string, when: number } | null} */
export function getLastLoreConnection() {
    return lastLoreConnection;
}

export async function requestLore(prompt, { signal, activity = { kind: 'profile', label: 'Writing lore…' } } = {}) {
    const task = startGenerationTask({ signal, activity });
    try { return await performLoreRequest(prompt, task.signal); }
    finally { task.finish(); }
}

async function performLoreRequest(prompt, signal) {
    const context = getContext();
    const settings = getSettings();
    const profileId = settings.loreProfileId;
    const maxTokens = Number(settings.loreMaxTokens) || 1200;

    debugLog(`Lore -> ${describeConnection(profileId)}, reply budget ${maxTokens}`);

    if (profileId) {
        // Connection Manager can be disabled and a profile can be deleted; either throws,
        // so fall through to the main API rather than failing the generation.
        try {
            const result = await awaitGenerationRequest(context.ConnectionManagerRequestService.sendRequest(
                profileId,
                [
                    { role: 'system', content: promptText('loreSystem') },
                    { role: 'user', content: prompt },
                ],
                maxTokens,
                { extractData: false, includePreset: false, signal },
                customProfilePayload(context, profileId),
            ), signal);
            signal.throwIfAborted();
            const profile = context.extensionSettings?.connectionManager?.profiles
                ?.find(p => p.id === profileId);
            lastLoreConnection = {
                label: profile
                    ? `${profile.name || profileId}${profile.model ? ` (${profile.model})` : ''}`
                    : profileId,
                when: Date.now(),
            };
            const api = context.ConnectionManagerRequestService.validateProfile(profile).selected;
            const text = extractMessageFromData(result, api) || '';
            return { text, truncated: loreReplyWasTruncated(result) };
        } catch (err) {
            if (signal.aborted || err?.name === 'AbortError') throw signal.reason || err;
            console.warn(LOG_PREFIX, 'Lore connection unavailable, using the main API:', err);
        }
    }

    lastLoreConnection = {
        label: profileId
            ? 'Main API (the chosen connection was unavailable)'
            : 'Main API (same as chat)',
        when: Date.now(),
    };
    const raw = await awaitGenerationRequest(context.generateRawData({
        prompt,
        systemPrompt: promptText('loreSystem'),
        responseLength: maxTokens,
    }), signal);
    signal.throwIfAborted();
    // generateRawData returns the provider's response object. Its text can live in
    // choices, results, or a content block array, depending on the main API.
    const text = extractMessageFromData(raw) || '';
    return { text, truncated: loreReplyWasTruncated(raw) };
}

/**
 * Generates lore tags and content using an LLM.
 *
 * @param {object} char Character object
 * @param {string} world Lorebook name
 * @param {number} uid Entry UID
 * @param {object} [options]
 * @param {string} [options.template] A prompt to use instead of the character one - a
 *   location's lore is not a person's. Same placeholders, plus {{aliases}}.
 * @param {string|(() => string)} [options.facts] What is established, instead of the
 *   tracked stats a character has.
 * @returns {Promise<{ tags: string, content: string, followedFormat: boolean, truncated: boolean, excerpt: object }>}
 */
export async function generateLoreContent(char, world, uid, options = {}) {
    const task = startGenerationTask({ signal: options.signal, activity: {
        kind: 'profile', label: `Filling ${char.name}’s profile…`,
    }, ...(char.isPlayer ? { getPersonaKey: () => getPersonaData().avatar } : {}) });
    try {
        return await awaitGenerationRequest(buildLoreContent(char, world, uid, { ...options, signal: task.signal }), task.signal);
    } finally { task.finish(); }
}

async function buildLoreContent(char, world, uid, options) {
    options.signal.throwIfAborted();
    let existingLore = '';
    if (world) try {
        const worldData = await loadWorldInfo(world);
        const entries = worldData.entries;
        const entry = Array.isArray(entries) ? entries.find(e => Number(e.uid) === Number(uid)) : entries[uid];
        if (entry) existingLore = entry.content || '';
    } catch (e) {
        console.warn(LOG_PREFIX, 'Failed to load existing lore for generation', e);
    }

    const excerpt = buildLoreExcerpt(chat || []);
    const recentMessages = excerpt.text;
    const worldFacts = await retrieveWorldFacts(char.name);
    options.signal.throwIfAborted();

    const template = options.template || (char.isPlayer ? PLAYER_CREATION_PROMPT : DEFAULT_LORE_PROMPT);
    const givenFacts = typeof options.facts === 'function' ? options.facts() : options.facts;
    const established = char.isPlayer ? (char.profile || {})
        : (mergeLoreValues(existingLore, char.profile) || char.profile || {});
    const fields = profileFieldsForCard(char);
    /* Both spellings and SillyTavern's own macros, in one pass. The old [TAG] form is
       rewritten to {{tag}} first rather than replaced separately, so a [NAME] that happens
       to be inside the chat excerpt or the existing entry is left alone - it is somebody's
       text, not a placeholder. */
    const values = {
        name: char.name,
        lore: existingLore,
        context: recentMessages,
        world: worldFacts,
        facts: givenFacts !== undefined ? String(givenFacts ?? '').trim() : describeTrackedFacts(char),
        aliases: namesFor(char).slice(1).join(', ') || '(none)',
        system: char.isPlayer && !options.template ? playerCreationSystemContext(getSettings()) : '',
        ...loreProfileValues(fields, established),
    };
    // Built-in sections depend on available sources; custom templates retain host macros.
    let prompt = options.template ? fillTemplate(template, values) : fillPromptText(template, values);

    // A template written before [WORLD] existed - which is most of them, including any you
    // have customised - would otherwise leave the setting doing nothing at all. Appended
    // only when there is something to append, so an unindexed character gains no empty
    // heading.
    if (worldFacts && !/\[WORLD\]|{{\s*world\s*}}/i.test(template)) {
        prompt += `\n\nFrom the setting's reference material:\n${worldFacts}`;
    }

    if (char.isPlayer) {
        const persona = getPersonaData();
        const description = (!char.personaKey || char.personaKey === persona.avatar)
            ? String(persona.description || '').trim() : '';
        if (description) prompt += `\n\nSillyTavern persona description for ${char.name}:\n${description}`;
    }

    const { text, truncated } = await requestLore(prompt, { signal: options.signal, activity: null });

    let { tags, content, followedSections } = parseLoreReply(text,
        !options.template ? profileFieldsForCard(char) : []);

    const namePattern = new RegExp(`^#*\\s*${escapeRegExp(char.name)}\\s*[:\\-]?\\s*\\n?`, 'i');
    content = content.replace(namePattern, '').trim();

    if (!options.template) {
        const generated = char.isPlayer ? parseGeneratedProfileFields(content, 'player')
            : parseLoreContent(content, { allowPartial: true });
        if (generated) {
            content = profileFieldsForCard(char)
                .filter(field => Object.hasOwn(generated, field.id))
                .map(field => `${field.label}: ${String(options.preserveLore
                    ? (established[field.id] || generated[field.id] || '')
                    : (generated[field.id] || established[field.id] || '')).trim()}`)
                .join('\n');
        }
    }

    // The prompt asks for tags and content in a small YAML envelope. A reply without it did not follow the
    // instruction, and the usual reason is that the instruction never arrived - the reply
    // is then the story model answering in character. Reported rather than hidden, so a
    // usable answer can still be salvaged.
    const followedFormat = Boolean(followedSections
        && (options.template || parseGeneratedProfileFields(content, char.isPlayer ? 'player' : 'npc')));

    return { tags, content, followedFormat, truncated, excerpt };
}


/**
 * Saves tags and content to a lorebook entry.
 * @param {object} char Character object
 * @param {string} world Lorebook name
 * @param {number} uid Entry UID
 * @param {string} tags Tags string
 * @param {string} content Lore content
 * @param {{ preserveEmpty?: boolean }} [options]
 * @returns {Promise<{ profileFieldsSaved: number }>}
 */
export async function saveLoreContent(char, world, uid, tags, content, { preserveEmpty = false, isCurrent: suppliedCurrent, signal } = {}) {
    const current = lorebookWriteGuard(suppliedCurrent);
    const isCurrent = () => !signal?.aborted && current();
    const target = await requireLorebook(char, { world, isCurrent, signal, purpose: 'Save character lore' });
    if (target !== world || uid == null) {
        const link = await createLoreEntry(char, target, char.name, { isCurrent, signal });
        if (!link) throw new DOMException('Lorebook write cancelled.', 'AbortError');
        uid = link.uid;
    }
    world = target;
    return inOrder(world, async () => {
        if (!isCurrent()) throw new DOMException('Lorebook write cancelled.', 'AbortError');
        const loaded = await loadWorldInfo(world);
        if (!isCurrent()) throw new DOMException('Lorebook write cancelled.', 'AbortError');
        if (!loaded?.entries) throw new Error('Lorebook not found or entries missing');

        const worldData = structuredClone(loaded);
        const entries = worldData.entries;
        let entry;
        if (Array.isArray(entries)) {
            entry = entries.find(e => Number(e.uid) === Number(uid));
        } else {
            entry = entries[uid];
        }

        if (!entry) throw new Error(`Entry UID ${uid} not found in Lorebook`);

        const submitted = String(content ?? '').trim();
        let profile = char.profile;
        let profileFieldsSaved = 0;
        if (char.isPlayer) {
            const parsed = parseGeneratedProfileFields(submitted, 'player');
            if (parsed) {
                const values = preserveEmpty ? Object.fromEntries(Object.entries(parsed).filter(([, value]) => value)) : parsed;
                profile = { ...profile, ...values };
                profileFieldsSaved = Object.values(values).filter(Boolean).length;
                const existing = preserveEmpty ? mergeLoreValues(entry.content, char.profile, 'player') || char.profile || {} : {};
                entry.content = formatLoreContent({ ...existing, ...values },
                    preserveEmpty ? entry.content : '', undefined, 'player');
            } else {
                entry.content = submitted;
            }
        } else if (!profileFieldsForCard(char).length) {
            entry.content = submitted;
        } else {
            const parsed = parseGeneratedProfileFields(submitted, 'npc');
            if (!parsed) throw new Error('NPC lore must use named fields in the required order.');
            const selectedIds = new Set(profileFieldsForCard(char).map(field => field.id));
            const accepted = Object.fromEntries(Object.entries(parsed).filter(([id, value]) => selectedIds.has(id) && (!preserveEmpty || value)));
            const complete = Object.keys(accepted).length === profileFieldsForCard(char).length;
            const values = complete ? accepted : { ...(mergeLoreValues(entry.content, profile) || profile || {}), ...accepted };
            entry.content = formatLoreContent(values, entry.content, undefined, 'npc', profileFieldsForCard(char));
            profile = { ...profile, ...accepted };
            profileFieldsSaved = Object.values(accepted).filter(Boolean).length;
        }
        // The writer returns Abilities/History/Ties and never a name, so the heading is put
        // on here rather than asked for. Before the tags merge, which must not be lost.
        syncEntryIdentity(char, entry);
        entry.key = mergeKeywords(entry.key, tags);

        if (!isCurrent()) throw new DOMException('Lorebook write cancelled.', 'AbortError');
        await saveWorldInfo(world, worldData, true);
        if (!isCurrent()) throw new DOMException('Lorebook write cancelled.', 'AbortError');
        char.profile = profile;
        char.lorebook = { world, uid: Number(uid) };
        saveSettings();
        return { profileFieldsSaved };
    });
}
