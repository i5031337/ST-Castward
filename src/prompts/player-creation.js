import { activeNpcSystem } from '../core/npc-templates.js';
import { systemStatFields } from '../core/system-fields.js';
import { collectionAppliesTo } from '../core/collection-targets.js';

/** Give the creator the active setting and player mechanics, without NPC-only fields. */
export function playerCreationSystemContext(settings) {
    const system = activeNpcSystem(settings);
    if (!system) return '';
    return JSON.stringify({
        name: system.name,
        description: system.metadata?.description,
        stats: systemStatFields(system, 'player').map(stat => ({
            name: stat.name, purpose: stat.purpose, guidance: stat.guidance,
        })),
        collections: (system.collections || []).filter(col => collectionAppliesTo(col, 'player', undefined, system))
            .map(col => ({ name: col.name, guidance: col.guidance })),
    });
}

export const PLAYER_CREATION_PROMPT = `Complete the player character "{{name}}" for this roleplaying setting.

Use the SillyTavern persona as the character concept and the active System as the setting and rules. Preserve established persona details, existing profile values, lore, and story facts. Creatively fill gaps with specific, coherent details that fit this character and setting, even when the persona is brief or blank.
Write lasting character traits in third person. Give each requested field a concise, useful value, following its guidance. Keep brief labels short and descriptive fields to a few sentences. Avoid repeating the same details across fields.
Create only the requested profile fields. Do not rename the character, write dialogue, advance the story, or award stats, levels, items, or abilities in tracker collections. Tags are activation keys: use only established character names and nicknames.

{{#system}}
Active System (setting and mechanics, not additional facts about this character):
{{system}}

{{/system}}
{{#facts}}
Established character facts:
{{facts}}

{{/facts}}
{{#world}}
Setting reference:
{{world}}

{{/world}}
{{#lore}}
Existing entry:
{{lore}}

{{/lore}}
{{#context}}
Recent story:
{{context}}

{{/context}}
Reply with only this YAML, without a Markdown code fence. Replace each angle-bracket instruction with a value. Keep the field order and indent content lines by two spaces:
tags: {{name}}
content: |
{{profileTemplate}}`;
