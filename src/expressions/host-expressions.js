import { startGenerationTask, awaitGenerationRequest } from '../core/generation-cancellation.js';
import { doExtrasFetch, getApiUrl, modules, extension_settings } from '../../../../../extensions.js';
import { getRequestHeaders, substituteParams } from '../../../../../../script.js';
import { trimToEndSentence, trimToStartSentence } from '../../../../../utils.js';
import { normalizeSpriteFolder } from '../core/npc-presentation.js';

export function classifierConfig() {
    const settings = extension_settings.expressions || {};
    return { api: settings.api, promptType: settings.promptType, translate: settings.translate,
        custom: [...(settings.custom || [])], fallback: settings.fallback_expression };
}

export function classifierHint(config = classifierConfig()) {
    if (config.api === 2) return config.promptType === 'full'
        ? 'Choose Local, Extras, or WebLLM in Expressions. Full LLM mode includes conversation context.'
        : 'Choose Local, Extras, or WebLLM in Expressions. Main LLM classification needs a shared host request lock.';
    if (![0, 1, 3].includes(config.api)) return 'Choose Local, Extras, or WebLLM in the host Expressions settings to classify NPC dialogue.';
    return '';
}

export async function loadSpritePack(folder) {
    const valid = normalizeSpriteFolder(folder);
    if (!valid) return [];
    const response = await fetch(`/api/sprites/get?name=${encodeURIComponent(valid)}`);
    if (!response.ok) throw new Error('Sprite pack could not be loaded.');
    const sprites = await response.json();
    return Array.isArray(sprites) ? sprites.filter(sprite => typeof sprite.label === 'string'
        && typeof sprite.path === 'string' && sprite.path.startsWith('/characters/')) : [];
}

let webLlmRequest = null;

export async function classifyDialogue(input) {
    if (classifierHint(input.config)) return '';
    const task = startGenerationTask({ signal: input.signal });
    try {
        return await awaitGenerationRequest(classifyLine({ ...input, signal: task.signal }), task.signal);
    } finally { task.finish(); }
}

async function classifyLine({ line, sprites, config, labels: vocabulary, signal }) {
    if (classifierHint(config)) return '';
    signal?.throwIfAborted();
    if (config.api !== 3) {
        if (config.api === 1 && !modules.includes('classify')) return config.fallback || '';
        let text = line.text;
        if (config.translate && typeof globalThis.translate === 'function') text = await globalThis.translate(text, 'en');
        signal?.throwIfAborted();
        text = substituteParams(text).replace(/[*"]/g, '');
        text = (text.length < 500 ? trimToEndSentence(text)
            : trimToEndSentence(text.slice(0, 250)) + ' ' + trimToStartSentence(text.slice(-250))).trim();
        const url = config.api === 0 ? '/api/extra/classify' : new URL('/api/classify', getApiUrl());
        const response = await (config.api === 0 ? fetch : doExtrasFetch)(url, {
            method: 'POST', signal,
            headers: config.api === 0 ? getRequestHeaders() : { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'bypass' },
            body: JSON.stringify({ text }),
        });
        if (!response.ok) throw new Error('Expression classifier request failed.');
        return (await response.json()).classification?.[0]?.label || config.fallback || '';
    }
    // Native WebLLM has no abort API. A cancelled caller releases our queue, but
    // its native request retains this lock until it settles; later jobs use fallback.
    if (webLlmRequest) return config.fallback || '';
    const host = await import('../../../../../extensions/expressions/index.js');
    signal?.throwIfAborted();
    if (webLlmRequest) return config.fallback || '';
    const labels = vocabulary || [...new Set(sprites.map(sprite => sprite.label))];
    if (!labels.length) return '';
    // Filtering in the host helper uses the native character's pack, so constrain our prompt explicitly.
    const customPrompt = `Classify the emotion of the supplied dialogue only. Return exactly one label from: ${labels.join(', ')}. No explanation.`;
    const request = host.getExpressionLabel(line.text, config.api, { filterAvailable: false, customPrompt });
    webLlmRequest = request;
    try { return await request; }
    finally { if (webLlmRequest === request) webLlmRequest = null; }
}
