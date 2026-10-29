import { getContext } from '../../../../../st-context.js';
import { user_avatar } from '../../../../../../script.js';
import { world_names, loadWorldInfo, createNewWorldInfo, METADATA_KEY } from '../../../../../world-info.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { ensureChatLorebookForFill } from './lorebook.js';
import { newChatLorebookName } from './lorebook-target.js';
import { chooseChatLorebook } from '../ui/story/ui-chat-lorebook.js';

const pendingSelections = new WeakMap();

export function lorebookWriteGuard(suppliedCurrent = () => true) {
    const origin = getContext();
    const metadataAtStart = origin?.chatMetadata;
    const chatId = origin?.getCurrentChatId?.();
    const system = getSettings().activeSystem;
    const persona = user_avatar;
    return () => suppliedCurrent() && getContext()?.chatMetadata === metadataAtStart
        && getContext()?.getCurrentChatId?.() === chatId && getSettings().activeSystem === system && user_avatar === persona;
}

export async function requireLorebook(card, {
    isCurrent: suppliedCurrent, signal, world: preferredWorld,
    purpose = 'Save lore', skipLabel = 'Skip this write',
} = {}) {
    const isCurrent = lorebookWriteGuard(suppliedCurrent);
    const chatId = getContext()?.getCurrentChatId?.();
    if (!isCurrent() || signal?.aborted) throw new DOMException('Lorebook write cancelled.', 'AbortError');
    let world = preferredWorld || card?.lorebook?.world || await ensureChatLorebookForFill({ isCurrent });
    if (!isCurrent() || signal?.aborted) throw new DOMException('Lorebook write cancelled.', 'AbortError');
    if (!world || !world_names?.includes(world)) {
        const context = getContext();
        const metadata = context.chatMetadata || getSettings();
        if (!pendingSelections.has(metadata)) {
            const selection = chooseChatLorebook({
                names: [...(world_names || [])], proposedName: newChatLorebookName(context.getCurrentChatId?.() ?? 'Library', world_names),
                isCurrent, signal, purpose, skipLabel, attachment: chatId === undefined ? 'the default target' : 'this chat',
                onChoose: async (name, canContinue = isCurrent) => {
                    if (!canContinue() || signal?.aborted) return '';
                    if (!name && chatId !== undefined) return ensureChatLorebookForFill({ allowCreate: true, isCurrent: canContinue });
                    const created = !name;
                    if (!name) {
                        name = newChatLorebookName('Library', world_names);
                        if (!await createNewWorldInfo(name)) throw new Error('Could not create a lorebook. Please try again.');
                    }
                    if (!world_names?.includes(name) || !(await loadWorldInfo(name))?.entries) {
                        throw new Error('This lorebook is no longer available. Choose another book.');
                    }
                    if (!canContinue() || signal?.aborted) return '';
                    if (chatId !== undefined) {
                        metadata[METADATA_KEY] = name;
                        context.saveMetadataDebounced?.();
                        document.querySelector('.chat_lorebook_button')?.classList.add('world_set');
                    } else {
                        getSettings().defaultLorebook = name;
                        saveSettings();
                        if (created && typeof toastr !== 'undefined') toastr.info(`Created lorebook “${name}”.`, 'Castward', { escapeHtml: true });
                    }
                    return name;
                },
            });
            pendingSelections.set(metadata, selection);
            void selection.finally(() => pendingSelections.delete(metadata)).catch(() => {});
        }
        world = await pendingSelections.get(metadata);
        if (!world || !isCurrent() || signal?.aborted) {
            throw new DOMException('Lorebook selection cancelled. The pending write was skipped.', 'AbortError');
        }
        if (card?.lorebook && card.lorebook.world !== world) card.lorebook = null;
    }
    if (!isCurrent()) throw new DOMException('Lorebook write cancelled.', 'AbortError');
    if (!(await loadWorldInfo(world))?.entries) throw new Error(`Could not read lorebook “${world}”.`);
    if (!isCurrent() || signal?.aborted) throw new DOMException('Lorebook write cancelled.', 'AbortError');
    return world;
}
