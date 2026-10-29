import { getContext } from '../../../../../st-context.js';
import { loadWorldInfo } from '../../../../../world-info.js';
import { getSettings } from '../core/settings.js';
import { getActiveCharacters } from '../characters/characters.js';
import { debugLog } from '../core/constants.js';
import { npcLoreHandoff } from '../npc/npc-lore-runtime.js';
import { createCastLoreActivator } from './cast-lore.js';

const activate = createCastLoreActivator({
    getContext, getSettings, getCharacters: () => [...getActiveCharacters(), ...npcLoreHandoff.cards()], loadWorldInfo,
    onError: (world, error) => debugLog(`Could not load linked cast lore from "${world}"`, error),
});

export async function activateCastLore(lore) {
    await activate(lore);
    npcLoreHandoff.apply(lore);
}
