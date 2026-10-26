export const readerPromptTexts = [
    {
        id: 'reader', group: 'Tracker reader', label: 'Reader request',
        where: 'The request the tracker\'s reader gets for each new message, after the built-in extraction system prompt.',
        when: 'Every message, when the tracker reads replies separately.',
        placeholders: {
            playerName: 'The active player persona’s name.',
            state: 'The scene as it stands, as JSON.',
            offstage: 'Tracked characters the message names who are not on stage, with what is on file for them.',
            limits: 'Editable stats, their meanings and text formats.',
            npcFields: 'All configured NPC fields, including their purpose and initialization rules.',
            xpProgression: 'Switch: on when a player or NPC has enabled progression.',
            notes: 'Notes other extensions add, each with its own heading.',
            strangers: 'Speakers without a card, when you have tagged fallback portraits.',
            strangerKinds: 'Your portrait tags.',
            strangerExample: 'One stranger paired with one tag.',
            collections: 'Each collection and the fields its items have.',
            collectionExample: 'A worked change in your own collection and field names.',
            minimalReply: 'A no-change reply listing the cast present.',
            changedReply: 'A configured example with player and NPC stats and collections.',
            newNpcReply: 'A new NPC reply example with configured stat guidance, even with an empty scene.',
            locationReminder: 'Final check for the scene-location change flag.',
            poolRecovery: 'Recovery rule and final readings for configured pools.',
            injuryConsequence: 'Conditional harm and recovery reminder for configured player and present NPC health pools.',
            earlier: 'Older messages already reflected in state.',
            userTurn: 'The fresh player turn preceding the assistant reply, when present.',
            message: 'The message being read.',
            reasons: 'Switch: on when "Ask for reasons" is on.',
        },
        text: `Report changes from the latest exchange and list the present NPCs.
{{#playerName}}
{{playerName}} is the player-controlled character. Put their changes under "player".
{{/playerName}}

### EVIDENCE RULES
Use configured field purposes and rules to interpret resolved events.
Read the fresh player turn together with the assistant reply.
Include completed player actions that the reply leaves standing, even when it does not repeat them.
Treat intentions, attempts, hypotheticals, and out-of-character instructions as context until resolved.
Use the assistant's resolution when it blocks, changes, or resolves an attempted outcome.
A player's declaration of a contested outcome does not establish success.
Count an event once when both turns describe it.
Apply costs when incurred.
Use stated amounts.
Estimate a conservative amount when an effect is clear but its amount is unstated.
Use the field's current scale for estimates.
Apply configured persistence and reset rules.
Update the listed editable fields.
{{#collections}}
Match mentioned possessions to the owner’s recorded entries before proposing changes.
Add newly acquired items and additional copies, reporting the quantity gained.
Match each item’s placement to the collection’s purpose.
Use established possessions for a new NPC's starting items.
Treat scene props as part of the setting.
Add missing abilities or knowledge when demonstrated, including during a failed action.
Reusable entries stay held after use.
{{/collections}}
{{#xpProgression}}

### EXPERIENCE
Award XP once per concrete accomplishment by its recipient.
Meaningful active progress toward a goal qualifies.
Award modest XP for successful, purposeful use of a skill or spell.
Rest, accidents, rumours, and routine conversation leave XP unchanged.
For earned XP, add the award to the current reading and report the resulting total as a string.
Keep the existing XP threshold, even when the total exceeds it.
The application handles level-ups and the XP remainder; report the total before that calculation.
Omit existing configured level and level-bonus fields. A blank NPC level field may be initialized.
{{/xpProgression}}
{{#poolRecovery}}

### RECOVERY
{{poolRecovery}}
{{/poolRecovery}}
{{#injuryConsequence}}
{{injuryConsequence}}
{{/injuryConsequence}}

### CONFIGURED FIELDS
{{#limits}}
Editable stats:
{{limits}}
{{/limits}}
{{#npcFields}}

### NPC INITIALIZATION
Fill blank fields from this list when an NPC enters the scene.
Use plausible individual values when the story provides no detail.
Write initial pool readings as "current/maximum" with an individual capacity.
NPC initialization fields:
{{npcFields}}
{{/npcFields}}
{{#collections}}

### COLLECTION DEFINITIONS
{{collections}}
Use the quoted collection ID as the key.
Use exact field names and declared types.
The configured primary field identifies each entry.
{{/collections}}
{{notes}}

### CURRENT STATE
{{state}}
Profiles and filled fields outside the editable list provide context.
{{#offstage}}

### KNOWN OFFSTAGE CHARACTERS
{{offstage}}
Include an arriving NPC in the present cast.
For a known NPC who remains absent, report established changes with "offstage": true.
A name mentioned in conversation leaves presence unchanged.
{{/offstage}}
{{#strangers}}

### STRANGERS
Cardless speakers: {{strangers}}.
Assign each a portrait kind from {{strangerKinds}}, or "", under "strangers".
{{/strangers}}
{{#earlier}}

### EARLIER MESSAGES (already reflected in state)
{{earlier}}
{{/earlier}}

{{#userTurn}}
### FRESH PLAYER TURN (not yet reflected in state)
{{userTurn}}
{{/userTurn}}

### LATEST ASSISTANT REPLY
{{message}}

### OUTPUT FORMAT
Return raw JSON with "global", "player", and "characters".
Include changed fields and blank NPC initializations.
Use exact configured names.

Put all stat readings in these objects as JSON strings:
- World: "global".
- Player: "player.stats".
- NPC: "characters[].stats".
Report the resulting absolute value, not the amount gained or lost.
Quoted readings include "17", "9/12", and text values such as "Calm".
For an existing pool, keep its maximum and report the new "current/maximum" reading.
Use these same stat objects for initial values and changes.
Report each field once.
Omit unchanged numeric fields; never use an empty string in place of a numeric reading.

"characters" is an array of objects.
Each object has the NPC's exact "name".
List every present NPC, including those with no changes.
Known absent NPC updates also go in this array with "offstage": true.
Player changes go under "player".
Use "characters": [] when the present cast and offstage updates are both empty.
{{#collections}}

Put collection changes under "player.collections" or "characters[].collections".
Key each collection by its configured ID.
Use "add" for acquisitions.
Use "remove" for consumption or loss.
Use "update" for changes to other item fields.
Include the primary field in each add, update, and counted remove object.
For uncounted removals, supply identifiers.
For counted gains or losses, use the configured quantity field for the amount gained or spent.
The default amount is 1.
Use "all": true to remove a whole stack.
For transfers, remove from the giver and add to the recipient.
Include supported item details using their declared types.
Keep one entry per identifier.
{{/collections}}
{{#reasons}}

Put "why" first.
Key reasons by exact field: "<world stat>", "Player.<stat>", or "<NPC name>.<stat>".
For a collection change, use the owner and collection ID.
Cite the latest event or a quote.
Label estimated amounts and NPC initial estimates.
{{/reasons}}
{{#strangers}}
Stranger example: { {{strangerExample}} }.
{{/strangers}}
{{#minimalReply}}

No-change example:
{{minimalReply}}
{{/minimalReply}}
{{#changedReply}}

Changed-reply example (illustrative changes):
{{changedReply}}
{{/changedReply}}
{{#newNpcReply}}

New NPC example (replace placeholders with initial readings using the field definitions):
{{newNpcReply}}
{{/newNpcReply}}
{{#collectionExample}}

Independent collection examples (replace illustrative values with supported typed details):
{{collectionExample}}
{{/collectionExample}}

Check the JSON structure, present cast, field names, and evidence for each change.
{{#locationReminder}}
{{locationReminder}}
{{/locationReminder}}`,
    },

    {
        id: 'storyBlock', group: 'Story model', label: 'Tracker block',
        where: 'Put into the story prompt, in the chat, telling the story model to write the status update itself.',
        when: 'Every message, only when the tracker updates inline (not with a separate reader).',
        placeholders: {
            status: 'The scene block (see Scene block).',
            rules: 'Your System Rules & Logic.',
            statDefinitions: 'Configured stat purposes, types and bounds.',
            schemas: 'Each collection in play and its fields.',
            npcFields: 'All configured NPC fields, including allowed values and locked fields.',
            xpProgression: 'Switch: on when a player or NPC has enabled progression.',
        },
        text: `Track resolved story events using the configured fields and rules.
List every NPC present after the message.

### CONFIGURED FIELDS
{{rules}}
{{statDefinitions}}
{{#npcFields}}

### NPC INITIALIZATION
Fill blank fields from this list when an NPC enters the scene.
Choose plausible individual values when the story provides no detail.
Write initial pool readings as "current/maximum" with an individual capacity.
{{npcFields}}
{{/npcFields}}
{{#schemas}}
Collection schemas:
{{schemas}}
{{/schemas}}

### CURRENT STATUS
{{status}}

### EVIDENCE RULES
Use field purposes and rules to interpret resolved events.
Read the latest player turn together with the story you resolve in this reply.
Include completed player actions left standing, even when the story does not repeat them.
Treat intentions, attempts, hypotheticals, and out-of-character instructions as context until resolved.
A player's declaration of a contested outcome does not establish success.
Use the story's resolution when it blocks, changes, or resolves an attempted outcome.
Count each event once across the player turn and this reply.
Apply costs when incurred.
Use stated amounts.
Estimate conservatively when an effect is clear but its amount is unstated.
Apply configured persistence and reset rules.
Earlier events are already reflected in current status.
Update the listed editable fields.
{{#xpProgression}}
Award positive XP for concrete accomplishments or meaningful active progress by the recipient.
Award modest XP for successful, purposeful use of a skill or spell.
Rest, accidents, rumours, and routine conversation leave XP unchanged.
Add earned XP to the current reading in the recipient's configured XP field and report the total as a string.
Keep the existing XP threshold, even when the total exceeds it.
The application handles level-ups and the XP remainder; report the total before that calculation.
Omit existing configured level and level-bonus fields. A blank NPC level field may be initialized.
{{/xpProgression}}
{{#schemas}}
Match mentioned possessions to the owner’s recorded entries before proposing changes.
Add newly acquired items and additional copies, reporting the quantity gained.
Match each item’s placement to the collection’s purpose.
Use established possessions for a new NPC's starting items.
Treat scene props as part of the setting.
Add missing abilities or knowledge when demonstrated, including during a failed action.
Reusable entries stay held after use.
{{/schemas}}

### OUTPUT FORMAT
End the story with a JSON object inside <status_update> tags.
Include "global", "player", and "characters".
Report changed fields and blank NPC initializations.

Put all stat readings in these objects as JSON strings:
- World: "global".
- Player: "player.stats".
- NPC: "characters[].stats".
Report the resulting absolute value, not the amount gained or lost.
Quoted readings include "17", "9/12", and text values such as "Calm".
For an existing pool, keep its maximum and report the new "current/maximum" reading.
Use these same stat objects for initial values and changes.
Report each field once.
Omit unchanged numeric fields; never use an empty string in place of a numeric reading.

"characters" is an array of objects with exact NPC "name" values.
List every present NPC, including those with no changes.
Player changes go under "player".
{{#schemas}}

Put collection changes under "player.collections" or "characters[].collections".
Key each collection by its configured ID.
Use "add" for acquisitions, "remove" for consumption or loss, and "update" for other item fields.
Include the configured primary field and supported details of the declared types.
For uncounted removals, supply identifiers.
For counted gains or losses, use the configured quantity field for the amount gained or spent.
The default amount is 1.
Use "all": true to remove a whole stack.
For transfers, remove from the giver and add to the recipient.
Keep one entry per identifier.
{{/schemas}}`,
    },
];
