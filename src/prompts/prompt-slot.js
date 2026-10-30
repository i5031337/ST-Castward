import {
    setExtensionPrompt,
    extension_prompt_types,
    extension_prompt_roles,
    saveSettingsDebounced,
} from '../../../../../../script.js';
import { promptManager } from '../../../../../openai.js';

/** Remove prompt-list entries created by the retired list setting. */
function removeListEntry(key) {
    const settings = promptManager?.serviceSettings;
    if (!Array.isArray(settings?.prompts)) return;

    const identifier = String(key).replace(/\W/g, '_');
    const before = settings.prompts.length;
    settings.prompts.splice(0, before,
        ...settings.prompts.filter(prompt => prompt?.identifier !== identifier));
    let removed = settings.prompts.length !== before;

    for (const group of Array.isArray(settings.prompt_order) ? settings.prompt_order : []) {
        if (!Array.isArray(group.order)) continue;
        const oldLength = group.order.length;
        group.order.splice(0, oldLength,
            ...group.order.filter(item => item?.identifier !== identifier));
        removed ||= group.order.length !== oldLength;
    }

    if (removed) {
        saveSettingsDebounced();
        promptManager.render?.(false);
    }
}

/** Send a writing prompt through Castward's extension injection slot. */
export function placeWritingPrompt(key, text, { depth = 0 } = {}) {
    removeListEntry(key);
    const at = Number(depth);
    const body = String(text ?? '');
    setExtensionPrompt(key, body.trim() ? body : '', extension_prompt_types.IN_CHAT,
        Number.isFinite(at) ? at : 0, false, extension_prompt_roles.SYSTEM);
}
