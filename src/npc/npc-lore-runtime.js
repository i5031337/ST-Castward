import { getContext } from '../../../../../st-context.js';
import { loadWorldInfo } from '../../../../../world-info.js';
import { getSettings } from '../core/settings.js';
import { getAllCharacters } from '../characters/character-repository.js';
import { requireLorebook } from '../lore/lorebook-write-target.js';
import { syncProfileToLore } from '../lore/lore-sync.js';
import { createNpcLoreHandoff } from './npc-lore-handoff.js';

export const npcLoreHandoff = createNpcLoreHandoff({ getContext, getSettings, getCards: getAllCharacters });

export async function prepareNpcLore(card, isCurrent) {
    await requireLorebook(card, { isCurrent, purpose: 'NPC creation', skipLabel: 'Continue without NPC' });
    if (!isCurrent()) return;
    await syncProfileToLore(card, undefined, { isCurrent });
    if (!isCurrent()) return;
    const data = card.lorebook && await loadWorldInfo(card.lorebook.world);
    if (!isCurrent()) return;
    const entry = data?.entries?.[card.lorebook?.uid];
    if (!entry?.content?.trim() || entry.disable) {
        throw new Error(`Enable and fill ${card.name}’s linked lore entry before continuing NPC creation.`);
    }
    npcLoreHandoff.remember(card);
}
