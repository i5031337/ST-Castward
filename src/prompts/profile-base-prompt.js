import { DEFAULT_LORE_PROMPT } from './default-prompt-texts.js';
import { promptText, fillPromptText } from './prompt-texts.js';
import { loreProfileValues } from './profile-prompt-fields.js';
import { profileFieldsForCard } from '../core/profile-fields.js';
import { activeNpcSystem, npcTemplates } from '../core/npc-templates.js';

/** The normal profile-writing request without a subject, established facts, or sources. */
export function buildProfileBasePrompt(fields) {
    return promptText('loreSystem') + '\n' + fillPromptText(DEFAULT_LORE_PROMPT, {
        name: '', lore: '', context: '', world: '', facts: '', aliases: '',
        ...loreProfileValues(fields),
    });
}

/** Each NPC type may select a different set of profile fields. */
export function profileBasePrompts(settings) {
    const templates = npcTemplates(activeNpcSystem(settings) ?? null);
    return {
        Player: [buildProfileBasePrompt(profileFieldsForCard({ isPlayer: true }, settings))],
        NPC: (templates.length ? templates.map(template => ({ npcTemplateId: template.id })) : [{}])
            .map(card => buildProfileBasePrompt(profileFieldsForCard(card, settings))),
    };
}
