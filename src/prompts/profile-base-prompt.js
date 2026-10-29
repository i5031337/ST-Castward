import { DEFAULT_LORE_PROMPT } from './default-prompt-texts.js';
import { PLAYER_CREATION_PROMPT, playerCreationSystemContext } from './player-creation.js';
import { promptText, fillPromptText } from './prompt-texts.js';
import { loreProfileValues } from './profile-prompt-fields.js';
import { profileFieldsForCard } from '../core/profile-fields.js';
import { activeNpcSystem, npcTemplates } from '../core/npc-templates.js';

/** The normal profile-writing request without a subject, established facts, or sources. */
export function buildProfileBasePrompt(fields, { isPlayer = false, settings } = {}) {
    return promptText('loreSystem') + '\n' + fillPromptText(isPlayer ? PLAYER_CREATION_PROMPT : DEFAULT_LORE_PROMPT, {
        name: '', lore: '', context: '', world: '', facts: '', aliases: '',
        system: isPlayer ? playerCreationSystemContext(settings) : '',
        ...loreProfileValues(fields),
    });
}

/** Each NPC type may select a different set of profile fields. */
export function profileBasePrompts(settings) {
    const templates = npcTemplates(activeNpcSystem(settings) ?? null);
    return {
        Player: [buildProfileBasePrompt(profileFieldsForCard({ isPlayer: true }, settings), { isPlayer: true, settings })],
        NPC: (templates.length ? templates.map(template => ({ npcTemplateId: template.id })) : [{}])
            .map(card => buildProfileBasePrompt(profileFieldsForCard(card, settings))),
    };
}
