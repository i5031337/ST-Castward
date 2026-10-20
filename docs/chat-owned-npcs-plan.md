# Chat-owned NPCs and portable characters

NPC ownership is implemented through `src/characters/character-repository.js`.
Cards created with an open chat live in `chatMetadata.sillynpc_npcs`; reusable world
cards live in extension settings. Lookups and writes go through the repository so
Fill, portraits, profile editing, cast controls, and tracker synchronization agree.

Chat NPCs belong to the chat independently of its persona. Bringing a reusable card
into a chat creates an instance. Deleting a chat removes its metadata-owned cards;
portrait files and lorebook entries are separately stored assets and require their
own reference-aware cleanup.

**System → Manager → Reuse NPCs in new chats** optionally maintains a reusable
starting roster in `settings.systemNpcRosters[systemName]`. Chat ownership remains the
default and every seeded copy remains chat-owned. Enabling adopts the current chat's
cards; subsequent changed portable fields update the roster for future chats. Opening
an older started chat can contribute its cards but never replaces its existing cast.
Unchanged older copies do not overwrite newer snapshots. New, unplayed chats seed once,
with fresh IDs, profiles, portraits, template identity, aliases, presentation, category,
and carryover stats. Other stats reset to defaults; collections reset. Memories reset
unless **Builder → Profile fields → NPC memories → Carry over NPC memories** is enabled.
An existing local name takes precedence over a roster name. Local portrait/sprite/voice
and linked lorebook references are retained; linked lore entries remain shared assets.
The active cast's linked entries automatically enter SillyTavern's lore scan, so carried
profiles can trigger by name or alias without manually selecting their source books.
Generated profiles use this same scan hook; first Fill keeps its existing chat-book
creation/binding workflow. Native lorebook selections and entry settings remain in
force, and already loaded entries are not duplicated.
Deleting a chat NPC does not remove the reusable source. Clear saved roster removes
all saved sources; later creations and edits can populate it again while enabled.
Disabling preserves the saved roster. System deletion removes it. Reuse preferences
and rosters stay outside System rules and generation; whole-settings backups retain
them, and World Character exports include saved roster cards.

The System's `memories.carryOver` rule saves active and archived memory text separately from
portable card fields. Seeded memories use the new NPC ID, retain their archive split,
and become unsourced knowledge without references to the originating chat's messages
or swipes. Player memories never travel. **Carry over Places** works independently of
NPC reuse and saves a normalized map with aliases, descriptions, containment and lore
references. Place IDs remain chat-scoped; records are deep copies and current location
starts unset. An existing destination map takes precedence. Both switches default off.
Tracker saves capture changes, including memory-only and Place-only edits, and saved
signatures protect newer snapshots against unchanged older chats. Clear saved roster
also clears saved Places and memories. Whole-settings backups retain these snapshots;
character-file and System rules exports keep their existing format identifiers. Unlike
the local roster preferences, memory carryover is part of System rules and generation,
independent of automatic reading. Earlier local `reuseMemories` choices migrate to it.

## Transfer contract

Character files use `{format: "sillynpc-characters", version: 2, characters: [...]}`.
They carry identity, aliases, profile prose, template identity, portable lore text,
and Advancement/locked stat values. The serialized stat map retains the field name
`innateStats`. Optional `memories` carries active and archived unsourced knowledge when
the source System's `memories.carryOver` is true. The destination's same rule decides
whether to import it; older character files without memories start empty. World exports
read each NPC's own chat state or saved roster snapshot, never another active chat's
same-name memories. Turn-managed values and adventure holdings reset to destination defaults.
Policy comes from destination definitions, rather than hardcoded stat names.

Local portrait paths and lorebook pointers do not travel in new exports. Older files
containing portraits can still import. Linked lore travels as text and can be recreated
in the destination lorebook. Unknown profile prose is retained when fields are retired.

**Export selected** previews transferable fields. **Export World Characters** scans
chats assigned to the requested System, preserving source chat and NPC IDs so same-name
NPCs are not merged solely by name. Unsaved edits from the currently open chat are
included. System exports contain reusable rules, separately from character files.

## Character UI

The NPC page groups profile description and linked lore under **Description & Lore**;
they remain stored in their respective card and lorebook fields. Clicking an unknown
speaker portrait creates its chat-owned card and starts the selected automatic Fill
preset. The preset can omit portraits, which use a separate generation request.
Fill preserves completed stages when retrying a failed stage. Alias correction remains
available for a speaker who should resolve to an existing NPC.

## Verification boundaries

Ownership and transfer tests cover chat separation, persona switches, repository
routing, policy-based stat transfer, and source identity. Host checks must also verify
speaker creation, Fill retry, lore synchronization, and portrait behavior. Shared
portrait/lorebook asset cleanup is separate from card ownership.
