import { promptText } from './prompt-texts.js';
import { setExtensionPrompt, extension_prompt_types, extension_prompt_roles, main_api } from '../../../../../../script.js';
import { textgenerationwebui_settings } from '../../../../../textgen-settings.js';
import { getContext } from '../../../../../st-context.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { requestExtraction, coerceToUpdate } from '../tracker/extractor/status-extractor.js';
import { normaliseSpeakerLabel } from '../story/speaker-labels.js';
import { debugLog } from '../core/constants.js';

/**
 * Send approved phrases through SillyTavern's {{banned "phrase"}} macro when supported.
 * Expanding the macro adds a request-scoped sampler ban and produces no visible text.
 * IN_PROMPT ensures substitution runs before the backend reads and clears those bans.
 */

/** The key SillyTavern files the carrier under. */
export const BANLIST_KEY = 'sillynpc-banlist';

/** Phrases that have been approved. Anything proposed and not ticked is not here. */
export function bannedPhrases() {
    const list = getSettings().banList;
    return Array.isArray(list) ? list.map(p => String(p ?? '').trim()).filter(Boolean) : [];
}

/**
 * Whether a real ban can be sent, and if not, why.
 *
 * @returns {{ mode: 'sampler'|'prompt', reason: string }}
 */
export function banMode() {
    if (main_api !== 'textgenerationwebui') {
        return {
            mode: 'prompt',
            reason: 'This API takes no banned strings, so the phrases are asked for in the '
                + 'prompt instead. That is a request, not a ban, and models do ignore it.',
        };
    }
    if (!textgenerationwebui_settings?.send_banned_tokens) {
        return {
            mode: 'prompt',
            reason: 'Ban Tokens is switched off in SillyTavern\'s sampler settings, so a real '
                + 'ban would be dropped. Turn it on there and this becomes a ban; until then '
                + 'the phrases are asked for in the prompt.',
        };
    }
    return { mode: 'sampler', reason: 'Sent to the sampler. The model cannot emit these.' };
}

/**
 * The carrier: one macro per phrase, which expands to nothing.
 *
 * Drop phrases with double quotes to avoid closing the macro argument early.
 */
export function buildBanMacros(phrases) {
    return phrases
        .filter(phrase => !phrase.includes('"'))
        .map(phrase => `{{banned "${phrase}"}}`)
        .join('');
}

/** What is asked for when the sampler cannot be told. */
export function buildBanInstruction(phrases) {
    if (!phrases.length) return '';
    return promptText('banInstruction', { phrases: phrases.map(phrase => `- ${phrase}`).join('\n') });
}

/** Puts the ban in front of the model, whichever kind it can be, or takes it away. */
export function applyBanList() {
    const settings = getSettings();
    const phrases = bannedPhrases();
    const off = !settings.enabled || !settings.banListEnabled || phrases.length === 0;

    const clear = () => {
        setExtensionPrompt(BANLIST_KEY, '', extension_prompt_types.IN_PROMPT, 0, false);
    };

    if (off) {
        clear();
        return;
    }

    const { mode } = banMode();
    const text = mode === 'sampler'
        ? buildBanMacros(phrases)
        : buildBanInstruction(phrases);

    setExtensionPrompt(
        BANLIST_KEY,
        text,
        extension_prompt_types.IN_PROMPT,
        0,
        false,
        extension_prompt_roles.SYSTEM,
    );
    debugLog(`Ban list sent as ${mode}: ${phrases.length} phrase(s)`);
}

/* ─── Finding what to ban ─────────────────────────────────────────────────── */

/**
 * Reads the recent chat and proposes what to ban.
 *
 * Returns candidates for approval without changing the ban list.
 *
 * @returns {Promise<{ phrases: string[], notPeople: string[], read: number }>}
 */
export async function scanForBanCandidates() {
    const settings = getSettings();
    const chat = getContext()?.chat || [];

    const depth = Number(settings.banScanDepth) || 50;
    // Scan assistant turns only.
    const written = chat.filter(m => !m?.is_user && String(m?.mes ?? '').trim());
    const recent = depth > 0 ? written.slice(-depth) : written;

    if (recent.length === 0) {
        return { phrases: [], notPeople: [], read: 0 };
    }

    const prompt = buildBanScanPrompt(recent.map(m => String(m.mes)).join('\n\n'));

    const raw = await requestExtraction(
        prompt, null, settings.statusTracker, promptText('banScanSystem'), { usageKind: 'banscan' });
    const parsed = coerceToUpdate(raw);

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('The reader replied with something that could not be read.');
    }

    return {
        phrases: cleanList(parsed.phrases),
        notPeople: cleanList(parsed.notPeople),
        read: recent.length,
    };
}

/** Trim and deduplicate candidates; reject quotes that would break the ban macro. */
function cleanList(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of list) {
        const text = String(raw ?? '').trim();
        if (!text || text.includes('"')) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(text);
    }
    return out;
}

/** Adds approved phrases to the list, skipping any already on it. */
export function addBannedPhrases(phrases) {
    const settings = getSettings();
    if (!Array.isArray(settings.banList)) settings.banList = [];

    const have = new Set(settings.banList.map(p => String(p).toLowerCase()));
    let added = 0;
    for (const phrase of cleanList(phrases)) {
        if (have.has(phrase.toLowerCase())) continue;
        settings.banList.push(phrase);
        have.add(phrase.toLowerCase());
        added += 1;
    }
    if (added) saveSettings();
    return added;
}

/** Append approved labels while preserving the newline-or-comma separated setting. */
export function addNotPeople(labels) {
    const settings = getSettings();
    const current = String(settings.speakerIgnoreList ?? '');
    const have = new Set(
        current.split(/[\n,]/).map(w => normaliseSpeakerLabel(w)).filter(Boolean),
    );

    const wanted = [];
    for (const label of cleanList(labels)) {
        const key = normaliseSpeakerLabel(label);
        if (!key || have.has(key)) continue;
        have.add(key);
        wanted.push(label);
    }
    if (!wanted.length) return 0;

    settings.speakerIgnoreList = current.trim()
        ? `${current.trim()}\n${wanted.join('\n')}`
        : wanted.join('\n');
    saveSettings();
    return wanted.length;
}

/** What the scan is asked, given the chat log it reads. */
export function buildBanScanPrompt(log) {
    return promptText('banScanRequest', { log });
}
