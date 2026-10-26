import { loadWorldInfo } from '../../../../../world-info.js';
import { executeSlashCommandsWithOptions } from '../../../../../slash-commands.js';
import { getContext } from '../../../../../st-context.js';
import { debugLog, PORTRAIT_SHAPES, DEFAULT_PORTRAIT_SHAPE } from '../core/constants.js';
import { applyMacros } from '../prompts/macros.js';
import { getSettings, resolveImagePrompt } from '../core/settings.js';
import { DEFAULT_IMAGE_NEGATIVE_PROMPT } from '../core/settings-defaults.js';
import { recordUsage } from '../core/usage.js';
import { fillImagePrompt, describeCarriedItems } from './api-lore-facts.js';
import { characterImageDescription } from './api-image-description.js';
import { persistGeneratedImage } from './api-image-files.js';
import { startActivity } from '../core/generation-activity.js';

let imageQueue = Promise.resolve();

/** The configured shape, or the current default for an unknown stored value. */
export function resolvePortraitShape() {
    return PORTRAIT_SHAPES[getSettings().portraitShape] || PORTRAIT_SHAPES[DEFAULT_PORTRAIT_SHAPE];
}

/** Assemble the character prompt for preview or generation. */
export async function buildCharacterImagePrompt(char) {
    let loreContext = '';
    if (char.lorebook) {
        const worldData = await loadWorldInfo(char.lorebook.world);
        const entries = worldData.entries;
        const entry = Array.isArray(entries) ? entries.find(e => Number(e.uid) === Number(char.lorebook.uid)) : entries[char.lorebook.uid];
        if (entry) loreContext = entry.content || '';
    }

    const prefix = String(getSettings().imgGenPromptPrefix ?? '').trim();
    const template = [prefix, resolveImagePrompt()].filter(Boolean).join('\n');
    const fullPrompt = fillImagePrompt(template, {
        name: char.name,
        lore: characterImageDescription(char, loreContext),
        items: describeCarriedItems(char),
    });
    debugLog('Image prompt', fullPrompt);
    return fullPrompt;
}

/** Generate from the current character description or an explicitly edited prompt. */
export async function generateCharacterImageLogic(char, { prompt, signal } = {}) {
    const fullPrompt = prompt ?? await buildCharacterImagePrompt(char);
    if (!String(fullPrompt).trim()) throw new Error('Enter an image prompt first.');
    return generateImage(fullPrompt, { owner: char, ...(signal ? { signal } : {}) });
}

function escapeCommandValue(value) {
    return String(value || '').trim().replace(/\r?\n/g, ' ').replace(/"/g, '\\"');
}

function imageUrlFromResult(result) {
    const candidate = typeof result === 'string' ? result
        : result && typeof result === 'object' ? result.pipe || result.output || result.image || result.url || result.result : '';
    const url = String(candidate || '').trim();
    return /^(?:https?:|data:|\/|cache\/)/i.test(url) || /\.(?:png|jpe?g|webp)(?:\?.*)?$/i.test(url) ? url : '';
}

/** Return the generated image for caller review; the caller decides whether to use it. */
export async function generateImage(fullPrompt, { owner = null, shape = resolvePortraitShape(),
    negativePrompt = DEFAULT_IMAGE_NEGATIVE_PROMPT, gallery, extend, edit, signal } = {}) {
    const negative = applyMacros(negativePrompt);
    const pixels = shape?.pixels;
    const size = pixels ? `width=${pixels.width} height=${pixels.height} ` : '';
    const controls = [gallery, extend, edit].map((value, index) => value === undefined ? ''
        : `${['gallery', 'extend', 'edit'][index]}=${value} `).join('');
    // The host command handles provider selection, credentials, gallery saving and errors.
    const command = `/imagine quiet=true ${controls}${size}negative="${escapeCommandValue(negative)}" ${escapeCommandValue(fullPrompt)}`;
    debugLog('Sending Image Generation command', command);
    const context = getContext();
    const chatId = context.getCurrentChatId();
    const metadata = context.chatMetadata;
    // /imagine temporarily overrides shared provider settings. Serialize our requests,
    // and use the runner that does not silently reject a busy chat input.
    const task = imageQueue.then(async () => {
        signal?.throwIfAborted();
        const now = getContext();
        if (now.getCurrentChatId() !== chatId || now.chatMetadata !== metadata) {
            throw new Error('Chat changed before image generation could start.');
        }
        const progress = startActivity({ kind: 'image',
            label: owner?.name ? `Drawing ${owner.name}’s portrait…` : 'Drawing an image…' }, signal);
        try { return await executeSlashCommandsWithOptions(command, { source: 'Castward image generation' }); }
        finally { progress.finish(); }
    });
    imageQueue = task.catch(() => {});
    const result = await task;
    if (result?.isError) throw new Error(result.errorMessage || 'Image Generation command failed.');
    let imageUrl = imageUrlFromResult(result);
    if (!imageUrl) {
        throw new Error('Image Generation did not return an image. Check its settings and the error shown by SillyTavern.');
    }
    if (imageUrl.startsWith('data:')) imageUrl = await persistGeneratedImage(imageUrl, owner);
    recordUsage('image', { prompt: `${fullPrompt} ${negative}` });
    return imageUrl;
}
