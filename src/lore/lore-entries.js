import { loadWorldInfo, saveWorldInfo, createWorldInfoEntry } from '../../../../../world-info.js';
import { getContext } from '../../../../../st-context.js';
import { saveSettings } from '../core/settings.js';
import { isChatCharacter } from '../characters/character-repository.js';
import { syncEntryIdentity } from './lorebook.js';
import { requireLorebook, lorebookWriteGuard } from './lorebook-write-target.js';
import { createLoreEntryStore } from './lore-entry-store.js';

const create = createLoreEntryStore({
    load: loadWorldInfo, save: (world, data) => saveWorldInfo(world, data, true), allocate: createWorldInfoEntry,
    identify: syncEntryIdentity, persist: saveSettings,
});

/** Reuse a link or an entry previously created for this identity, including after Unlink. */
export async function createLoreEntry(card, world, name = card.name, options = {}) {
    const current = lorebookWriteGuard(options.isCurrent);
    options = { ...options, isCurrent: () => !options.signal?.aborted && current() };
    world = await requireLorebook(card, { ...options, world, purpose: 'Create lore entry' });
    const owner = card.isPlayer
        ? JSON.stringify(['player', card.personaKey || card.name])
        : card.id ? JSON.stringify(['npc', isChatCharacter(card.id)
            ? getContext()?.getCurrentChatId?.() : null, card.id]) : null;
    return create(card, world, name, owner, options);
}
