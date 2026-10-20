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
            locationReminder: 'Final check for established place changes.',
            poolRecovery: 'Recovery rule and missing amounts for configured pools.',
            injuryConsequence: 'Conditional harm and healing reminder for a configured player health pool.',
            numericDeltas: 'Existing numeric stats eligible for delta updates, by owner.',
            earlier: 'The messages before this one, when you send any.',
            message: 'The message being read.',
            reasons: 'Switch: on when "Ask for reasons" is on.',
        },
        text: `Report changes from the latest message and list the present NPCs.
{{#playerName}}
{{playerName}} is the player-controlled character. Put their changes under "player".
{{/playerName}}

### EVIDENCE RULES
Use configured field purposes and rules to interpret resolved events.
Apply costs when incurred.
Use stated amounts.
Estimate a conservative amount when an effect is clear but its amount is unstated.
Use the field's current scale for estimates.
Apply configured persistence and reset rules.
Update the listed editable fields.
{{#collections}}
Add physical items when the recipient acquires them.
Use established possessions for a new NPC's starting items.
Treat scene props as part of the setting.
Add missing abilities or knowledge when demonstrated, including during a failed action.
Reusable entries stay held after use.
{{/collections}}
{{#xpProgression}}

### EXPERIENCE
Award XP once per concrete accomplishment by its recipient.
Meaningful active progress toward a goal qualifies.
Rest, care, accidents, rumours, and routine conversation leave XP unchanged.
Report earned XP as a positive delta in the recipient's configured XP field.
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
{{#numericDeltas}}

### ELIGIBLE NUMERIC DELTAS
{{numericDeltas}}
{{/numericDeltas}}
{{#strangers}}

### STRANGERS
Cardless speakers: {{strangers}}.
Assign each a portrait kind from {{strangerKinds}}, or "", under "strangers".
{{/strangers}}
{{#earlier}}

### EARLIER MESSAGES (already reflected in state)
{{earlier}}
{{/earlier}}

### LATEST MESSAGE
{{message}}

### OUTPUT FORMAT
Return raw JSON with "global", "player", and "characters".
Include changed fields and blank NPC initializations.
Use exact configured names.

Put text values and initial numeric readings in these objects as JSON strings:
- World: "global".
- Player: "player.stats".
- NPC: "characters[].stats".
String readings include "8", "8/10", and configured text values.

Put changes to existing numeric values in these objects as JSON numbers:
- World: "globalDeltas".
- Player: "player.deltas".
- NPC: "characters[].deltas".
Use positive numbers for gains and negative numbers for losses.
For a pool, report the change to its current amount.
Use one representation per field.

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
Apply costs when incurred.
Use stated amounts.
Estimate conservatively when an effect is clear but its amount is unstated.
Apply configured persistence and reset rules.
Earlier events are already reflected in current status.
Update the listed editable fields.
{{#xpProgression}}
Award positive XP for concrete accomplishments or meaningful active progress by the recipient.
Rest, care, accidents, rumours, and routine conversation leave XP unchanged.
Use the recipient's configured XP field.
{{/xpProgression}}
{{#schemas}}
Add physical items when the recipient acquires them.
Use established possessions for a new NPC's starting items.
Treat scene props as part of the setting.
Add missing abilities or knowledge when demonstrated, including during a failed action.
Reusable entries stay held after use.
{{/schemas}}

### OUTPUT FORMAT
End the story with a JSON object inside <status_update> tags.
Include "global", "player", and "characters".
Report changed fields and blank NPC initializations.

Put text values and initial numeric readings in these objects as JSON strings:
- World: "global".
- Player: "player.stats".
- NPC: "characters[].stats".
String readings include "8", "8/10", and configured text values.

Put existing numeric changes in these objects as JSON numbers:
- World: "globalDeltas".
- Player: "player.deltas".
- NPC: "characters[].deltas".
Use positive numbers for gains and negative numbers for losses.
For a pool, report the change to its current amount.
Use one representation per field.

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
