import { world_names, selected_world_info, world_info, deleteWorldInfo } from '../../../../../world-info.js';
import { getContext } from '../../../../../st-context.js';
import { getSettings } from '../core/settings.js';
import { listChatHeaders } from '../chat/chat-listing.js';
import { createLorebookCleanup } from './lorebook-cleanup.js';

export const lorebookCleanup = createLorebookCleanup({
    getNames: () => world_names || [],
    getSources: () => {
        const context = getContext();
        if (!context || !Array.isArray(context.characters) || !context.powerUserSettings) {
            throw new Error('SillyTavern is still loading. Try again once your characters are available.');
        }
        return [getSettings(), context.chatMetadata, context.characters, context.groups,
            context.powerUserSettings, selected_world_info, world_info];
    },
    listHeaders: listChatHeaders,
    deleteBook: deleteWorldInfo,
});
