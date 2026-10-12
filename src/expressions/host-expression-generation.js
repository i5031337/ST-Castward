import { getRequestHeaders } from '../../../../../../script.js';
import { getContext } from '../../../../../st-context.js';
import { extension_settings } from '../../../../../extensions.js';
import { loadSpritePack } from './host-expressions.js';
import { createExpressionGenerator } from './expression-generation.js';
import { getSettings } from '../core/settings.js';
import { expressionWorkflow } from './expression-prompts.js';
import { buildCharacterImagePrompt } from '../api/api-image-generate.js';

export const expressionOwner = () => {
    const context = getContext();
    return JSON.stringify([context.getCurrentChatId?.(), context.characterId, context.groupId]);
};

export const expressionGenerator = createExpressionGenerator({
    loadPack: loadSpritePack,
    async edit(input) {
        if (!input.workflow) throw new Error('Choose an Expression Editing Workflow in SillyNPC Images settings.');
        if (extension_settings.disabledExtensions?.includes('third-party/st-image-edit')) {
            throw new Error('Enable Image Edit and reload SillyTavern before generating expressions.');
        }
        let editor;
        try { editor = await import('../../../st-image-edit/index.js'); }
        catch { throw new Error('Install and enable Image Edit in the st-image-edit folder, then reload SillyTavern.'); }
        return editor.edit(input);
    },
    async upload({ url, folder, label, signal, check }) {
        const image = await fetch(url, { signal });
        if (!image.ok) throw new Error('Generated image could not be loaded.');
        const blob = await image.blob();
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type];
        if (!extension) throw new Error('Generated expression must be PNG, JPEG or WebP.');
        check();
        const body = new FormData();
        body.append('name', folder); body.append('label', label);
        body.append('avatar', blob, `${label}.${extension}`);
        const response = await fetch('/api/sprites/upload', {
            method: 'POST', headers: getRequestHeaders({ omitContentType: true }), body, signal,
        });
        if (!response.ok) throw new Error(`Expression upload failed (${response.status}).`);
    },
});

export async function expressionJob(card, label, isCurrent, signal) {
    const config = card.presentation.expressions;
    const generation = config.generation;
    const settings = getSettings();
    const job = { owner: expressionOwner(), npcId: card.id, folder: config.spriteFolder, label,
        reference: generation.reference, prompt: '', promptVariants: generation.prompts[label]?.slice(),
        negativePrompt: generation.negativePrompt, workflow: expressionWorkflow(card, settings), isCurrent, signal };
    if (settings.npcExpressionIpAdapterMode === true) job.prompt = await buildCharacterImagePrompt(card);
    return job;
}
