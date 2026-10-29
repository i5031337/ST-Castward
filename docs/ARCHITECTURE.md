# Runtime and storage boundaries

Castward recognizes dialogue, manages NPC identities and portraits, and tracks
chat-owned story state. SillyTavern loads `index.js` and `style.css` directly; there
is no build step. [FILE_MAP.md](FILE_MAP.md) locates the implementation.

## Ownership

| Data | Owner |
| --- | --- |
| Reusable System rules | `extension_settings.sillynpc.statusTracker.presets` |
| Reusable character cards and item library | Extension settings |
| Optional per-System NPC rosters and reuse preferences | `extension_settings.sillynpc.systemNpcRosters` (local, separate from System rules) |
| NPC instances, cast selection, active System, tracker state | Chat metadata |
| Place cards, containment, last confirmed place | Chat-wide tracker state (`locations`) |
| Remember Places switch | System definition (`locations.enabled`), projected into active tracker/chat state |
| Player identity, profile, portrait, lore link | Persona record in extension settings |
| Player stats, collections, memories | Chat and selected persona |
| Reader proposals, accepted rows, reply-specific reward choices | Message extras and swipe records |

A chat selects its System before its first player message. Started chats keep that
System. Changing persona does not change the chat's NPC ownership. Player values
remain separate for each persona in the chat.

NPC reuse is disabled by default. An enabled roster snapshots portable card fields
and only carryover stats on settings saves. Fresh chats seed independent metadata
cards once, before play, with new IDs and destination stat defaults. Their collections
and memories start empty unless memory carryover is selected. Per-card saved signatures prevent unchanged older copies
from overwriting later roster edits. Started chats are never backfilled; chat deletions
do not delete roster entries. Portrait files, sprite/voice bindings, and explicitly
linked lorebook entries retain their local references. Roster images participate in
cleanup reference checks. System deletion removes its roster; rules imports/exports
exclude rosters. Full settings backups and World Character exports include them.

Linked active-cast profiles are supplied at the host's awaited
`WORLDINFO_ENTRIES_LOADED` hook, before normal keyword scanning and budget handling.
The same helper handles reused cards and newly generated profiles, including profiles
written into a default book that is not attached to the chat. It appends only missing
linked entries to the per-scan chat lore array; it does not change chat, global, character
or persona lorebook selections, copy whole books, or override disabled-entry settings.
Entries already present from any host source are deduplicated by world and UID. Loads
are grouped by book and discarded if the chat, System, active cast or link changes.
Fill's existing creation path remains responsible for creating and attaching a new
chat book when there is no selected chat/default book.

System exports contain a normalized `schemaVersion: 2` rules definition, including
shared profile and character stat catalogs, assignment targets, NPC templates, collections, progression,
memories, the Places switch, and HUD selections. Runtime consumers use player and NPC projections of the shared catalogs. Imports of older Systems keep rules and discard embedded
world characters, persona records, and item libraries. Whole-settings backups and
character-transfer files are separate formats with different import behavior.

Local carryover options can also include Places independently of NPC reuse. Memory
carryover is the canonical System rule `memories.carryOver`, controlled beside automatic
reading in Profiles → NPC memories. It defaults off, independently of `memories.enabled`,
and governs active and archived memories during roster reuse. Explicit character
exports include memories regardless of this setting; only stats use carryover as
an export filter.
It travels in System rules exports and generation, like a stat's `carryOver`. The earlier
local `reuseMemories` preference migrates once into this rule without replacing an
explicit canonical choice. Memory snapshots themselves remain local roster data.
Tracker saves publish changes to these
snapshots as well as card saves. Map snapshots contain normalized records and parent
relationships, with chat-scoped IDs retained; the current location resets. Memory
copies use the destination NPC IDs and contain unsourced knowledge without old reply
or swipe provenance, so the new chat's source invalidation does not delete them. Player
memories do not carry over. Older unchanged copies cannot overwrite newer snapshots.
Fresh tracker seeds are staged in `sillynpc_roster_state_seed` until the state loader
has initialized the destination player, preventing accidental legacy-player migration.
Existing maps take precedence, started chats are never backfilled, and choosing another
System before play removes only automatically seeded Places and NPC memories.

## Profiles and memories

System profile fields have stable IDs and editable labels and guidance.
Retirement hides a field without discarding its stored prose. Fill and lore generation
seed empty fields; manual edits and explicit regeneration can revise them. The turn
reader updates tracked stats and collections, while a separate opt-in memory reader
periodically proposes NPC memories. Memory additions are risky changes: the Tracker's
Ask Before Applying setting saves them automatically in Nothing mode and holds them
for review in Risky changes only or Every change mode. The turn reader does not update profile
fields. Optional new-NPC profile generation is a separate request, disabled by
default, which preserves existing cards and edits.

Memory lists are manually editable and bounded by the System's configured active
limit, default 50, with older entries archived.

Place records are chat-owned independently of persona; their reader/recall switch is
a System setting, enabled by default. The existing
tracker reader proposes story-derived place cards, changes, containment, and
movement; Ask Before Applying partitions them with other tracker changes. A bounded scene context recalls the last
confirmed place, its ancestors, and explicitly mentioned places while the tracker is
enabled. Read-only lorebook links can seed local descriptions through an explicit
copy action. Shared lorebooks are never rewritten by place updates. See
[location-persistence-plan.md](location-persistence-plan.md) for the contract.
After the stat reading, a separate location request runs when no current place is
recorded or the tracker reports a location change. This includes the opening greeting
in automatic mode. An explicitly established initial scene does not require an
arrival event.

## Current-turn consistency and review

Separate reader requests run in arrival order. Overlapping turns wait rather than
being skipped, and each prompt uses the state available when its reading starts.
Duplicate requests for the same reply and options share a result. Waiting work is
discarded if its chat, persona, System, message identity, text, or swipe changes.
Stop, chat changes and actual persona switches abort waiting work as well as the active
reading. Persona-bound stat, place, level-reward and history-scan requests pass the abort
signal to the backend; identical-persona events do not cancel them. Unrelated profile and
System generation tasks retain their existing cancellation policies. Backends that ignore
cancellation may continue generating, but their replies are discarded. Message
invalidation cancels waiting entries from the affected index onward. Pending review
rows remain proposals and are not included as accepted state in the next reading.

Each reading captures the System rules used to build its prompt. Changes to stat
definitions, collections, progression, NPC templates or Places rules during inference
or reward selection discard the result before applying changes. Display-only edits
do not invalidate readings. Manual tracker edits pause while a reading runs.

Latest-reply changes use a pre-turn base. Swipe, regeneration, latest-reply editing,
and deletion replace that reply's accepted changes rather than accumulating them.
Manual corrections and one-step undo have separate handling. Arbitrary historical
tracker restoration, multi-entry undo, and System checkpoints are removed.

Reviewed places on the latest reply join its full-state turn effects. Discoveries
reviewed later become manual corrections; historical movement cannot change today's
current marker. Editing a newly discovered place manually adopts its record across
reply replacement, with missing parents detached. Choosing a System for an unplayed
chat resets rule-owned defaults while preserving its place records.

Structured reader schemas include numeric-string patterns for native llama.cpp and
GGUF-named Custom connections. Other providers receive portable schemas, selected
per destination even on profile fallback. Patterns constrain syntax; runtime checks
still enforce numeric bounds, pool maxima, locks and XP progression.

Reader and inline model updates use absolute stat readings. Numeric strings may be
repaired when removing surrounding serialization punctuation leaves one complete
numeric or pool reading. Repairs are diagnosed before XP, lock, maximum and bounds
validation. Comparators, explicit plus signs, internal separators and units remain
invalid. Blank numeric readings are skipped with diagnostics, preserving held values;
manual edits and text clearing keep their existing behavior. Collection additions describe
new acquisitions, not a restatement of holdings. Additional copies of an existing
item still increase its stack; prompts distinguish those gains from mentions and use.

New installations apply valid reader changes automatically; saved review preferences
remain effective. Level-derived stat growth and collection rewards remain review
proposals and depend on their originating XP transition. See
[level-up-rewards-plan.md](level-up-rewards-plan.md) for the progression contract.

Automatic application and limited historical recovery are deliberate product choices.
The retained [reader evaluation](evaluations/dating-final-10x-20261026-report.md)
measures independent scenes, not accumulating campaign errors or correction effort.
It does not establish the best default review policy. Broader UI/extractor coupling
remains outside the completed tracker dependency refactor.

The player and NPC Cast pages share one Profile/Edit layout. The HUD opens the
player’s Cast page and shows the same current state. Portrait generation uses SillyTavern Image Generation's `/imagine` provider.
Player Fill creatively completes missing profile fields from the active persona and
System; NPC Fill continues to use supported facts. Existing profile values are retained.
Before the first player message, Fill also offers starting stats and collections while
the chat-owned player still has System defaults and empty collections. This separate
Profile Connection request uses the completed profile, persona, opening scene, and
configured player stat/collection guidance. Typed entries, numeric bounds, pool capacities,
and initial XP/Level are validated with the same rules as NPC creation. A preview must
be accepted before one undoable state save; initialization grants no level-up rewards.
The chat player's `adventureInitialized` marker prevents repeated creation. Changed
chat, persona, System, story, profile, or held player state invalidates a pending draft.
Existing adventures retain their progress; persona profiles remain reusable across chats.
Maintained prompts use the active System's schema; the general raw-prompt editor is
removed, while extraction diagnostics remain available.

Live activity above the composer distinguishes stats, places, profile filling, and
images. Overlapping requests keep separate entries; Memory and History retain their
existing button indicators. Live progress appears only at the composer; reports
beneath replies show completed results, failures, and cancellations. Activity lives in memory,
is cleared on chat changes, and is removed when its request finishes or its linked
signal aborts. Queued image commands appear when execution starts and remain visible
until the host command returns. Hiding raw tracker output does not hide live activity.

Collection history scans pass rolling inventory through chronological chunks. Returned
collection arrays replace prior arrays; omissions retain prior inventory. A failed
pass stops the scan without publishing partial proposals. Oversized transcript
messages stop the scan before any model request; the character budget covers the
transcript, with prompt and inventory overhead added separately. Scans always use review.

Selected reader and scan connection failures propagate without retrying through another
API by default. Tracker → How Stats Are Read → Fall Back To Main API opts into a
warning followed by a retry through the main chat API. This policy applies to all
requests using the reader request helper, including location readings, profile Fill,
and collection history scans. Cancellation never triggers fallback. Selecting Main API
directly still works with fallback disabled. Time is an ordinary editable world field;
there is no automatic elapsed-time regeneration.

## Tracker dependency refactor

`status-logic.js` is a public export surface. Tracker modules import the functions
and state they use directly; there is no provider registry or late-bound dependency
lookup. Arithmetic, validation, actor seeding, collection calculations and schema
plans can run without SillyTavern. Character matching and stat filtering are separate
from mutation adapters so storage does not depend on the operations that call it.

`tracker-update-calculation.js` calculates world, player and NPC changes from supplied
state, rules, System, cards, Item Library, actor admission decisions, player identity,
policies and timestamp. It returns next state, card/library plans and local diagnostics.
Offstage comparison actors remain separate from calculated scene state; the preview
adapter adds detached comparison sheets for existing diff/review consumers.

`tracker-update-commit.js` validates chat ID, metadata identity, persona, active/bound
System, source state and rules before accepting related effects. Reader, inline and
review callers also supply the source reply identity, text and swipe. Storage repeats
validation immediately before installing card/library effects, history and state.
Rejected updates publish no status event or applied reader rows. Settings and metadata
remain separate host saves, without a cross-store durable atomicity guarantee.

Manual item editors use `collection-editor.js` and `collection-editor-calculation.js`.
An editor retains the chat, persona, System and card it displayed, plus the rendered
item contents, so delayed input and confirmation cannot silently target a different
owner or row. Accepted plans install scene, card and library changes through the
storage boundary; offstage cards can be edited without an open chat. Manual changes
remain authoritative and preserve one-step undo and latest-reply swipe alignment.

Schema and Item Library operations calculate explicit writes in
`schema-operation-calculation.js`. The host adapter captures rules, state, persona
records, cards and library data and checks them again before installation. The schema
name itself belongs to the same plan as its stored-value migration. Shared stat fields
move all applicable scopes together. Tracker undo retains renamed keys rather than
reversing a schema rename, matching the existing behavior. Global edits do not require
a chat or normalize retained chat metadata merely to calculate a rename. Stable field IDs and exports are
unchanged.

`tracker-lifecycle.js` coordinates chat activation in order: restore the System, seed
its roster, restore the persona, load state, and refresh prompts/views. Persona events
owned by restoration are coordinated with that activation; obsolete asynchronous
continuations cannot load or refresh a newer chat. Started chats retain their System
lock, and player records remain isolated by persona. The entry point supplies named
prompt/generation callbacks; storage has no lifecycle callback dependency.

Transient cache and provenance live in `status-session-context.js`. Cached reads
validate chat/metadata/state provenance before reuse. The explicit swipe-alignment
hook connects storage to snapshot maintenance without a dependency cycle.

Calculation diagnostics belong to their caller. Reader previews supply a local
`diagnostics` object; constraints return diagnostics or invoke explicit callbacks.
There are no shared record/drain queues. Manual collection removal changes only the
actor’s holdings; later readings can add the item again or give it to another actor.
The former temporary item suppression and expiry counter have been removed, and
obsolete `recently_deleted` markers are discarded when loading saved chats. Explicit
item review decisions remain available. Preview/library policies, model-input
sanitization and historical recovery limits are unchanged.

## Verification

Run `node --test tests/*.mjs` for state, schema,
request, progression, and review checks. Browser checks require a running local
SillyTavern instance; `python3 tests/ui-smoke.py` is read-only. Additional UI fixtures
restore temporary state and avoid saved test data or model requests.

Keep permanent tests focused on behavior that matters: saved data, chat and persona
boundaries, calculations, validation, review actions, request routing, and cancellation.
Add coverage when a change exposes an untested consequential failure. Wording,
cosmetic layout, historical benchmark details, and incidental implementation choices
do not each need a regression test. Prompt checks should protect configured inputs
and usable output contracts while allowing instructions to be rewritten. Evaluation
scorers have their own correctness checks; these do not measure live model quality.

[REWRITE_HOST_SMOKE.md](REWRITE_HOST_SMOKE.md) preserves the dated user-reported host
results and remaining manual checks. Mocked generator checks establish workflow and
isolation, not local-model quality; evaluate the selected model separately.
