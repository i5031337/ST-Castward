import { loadWorldInfo } from '../../../../../world-info.js';
import { SlashCommandParser } from '../../../../../slash-commands/SlashCommandParser.js';
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
    const args = { quiet: 'true', negative };
    if (pixels) Object.assign(args, { width: String(pixels.width), height: String(pixels.height) });
    for (const [key, value] of Object.entries({ gallery, extend, edit })) {
        if (value !== undefined) args[key] = String(value);
    }
    debugLog('Sending Image Generation request', { args, prompt: fullPrompt });
    const context = getContext();
    const chatId = context.getCurrentChatId();
    const metadata = context.chatMetadata;
    // /imagine temporarily overrides shared provider settings. Serialize our requests.
    // Call its handler with literal data so profile text cannot become slash commands.
    const task = imageQueue.then(async () => {
        signal?.throwIfAborted();
        const now = getContext();
        if (now.getCurrentChatId() !== chatId || now.chatMetadata !== metadata) {
            throw new Error('Chat changed before image generation could start.');
        }
        const command = SlashCommandParser.commands.imagine;
        if (typeof command?.callback !== 'function') {
            throw new Error('Image Generation is not available. Enable the SillyTavern Image Generation extension.');
        }
        const progress = startActivity({ kind: 'image',
            label: owner?.name ? `Drawing ${owner.name}’s portrait…` : 'Drawing an image…' }, signal);
        try { return await command.callback(args, String(fullPrompt)); }
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
