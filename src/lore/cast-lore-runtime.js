import { getContext } from '../../../../../st-context.js';
import { loadWorldInfo } from '../../../../../world-info.js';
import { getSettings } from '../core/settings.js';
import { getActiveCharacters } from '../characters/characters.js';
import { debugLog } from '../core/constants.js';
import { createCastLoreActivator } from './cast-lore.js';

export const activateCastLore = createCastLoreActivator({
    getContext, getSettings, getCharacters: getActiveCharacters, loadWorldInfo,
    onError: (world, error) => debugLog(`Could not load linked cast lore from "${world}"`, error),
});
