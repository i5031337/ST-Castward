export const DEFAULT_LORE_PROMPT = `Write a Lorebook entry for "{{name}}".

Use established facts and relevant history. Describe what is generally true of the character, filling in the fields provided. Preserve existing profile values unless the story clearly changes them. Creatively fill missing fields with details consistent with the established character and setting. Keep each field brief and avoid repeating details.
Match the setting and tone. Favor specific, coherent details that make the character feel distinct rather than generic, following the guidance for each requested field.
Do not copy details about the player, narrator, or another character into this entry.
Use third person. Tags are lorebook activation keys: use only the character's names and nicknames used in the story, never ordinary words or titles.

{{#facts}}
Established facts - treat these as true and do not contradict them:
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
Recent story:
{{context}}

Reply with only this YAML, without a Markdown code fence. Replace each angle-bracket instruction with a brief value. Indent content lines by two spaces. Add established names or nicknames to tags, separated by commas:
tags: {{name}}
content: |
{{profileTemplate}}`;
