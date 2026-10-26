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
reading in Builder → Profile fields. It defaults off, independently of `memories.enabled`,
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
The same request handles stats and places, including the opening greeting in automatic
mode. An explicitly established initial scene does not require an arrival event.

## Current-turn consistency and review

Separate reader requests run in arrival order. Overlapping turns wait rather than
being skipped, and each prompt uses the state available when its reading starts.
Duplicate requests for the same reply and options share a result. Waiting work is
discarded if its chat, persona, System, message identity, text, or swipe changes.
Stop and chat changes cancel waiting work as well as the active reading; message
invalidation cancels waiting entries from the affected index onward. Pending review
rows remain proposals and are not included as accepted state in the next reading.

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

The player and NPC Cast pages share one Profile/Edit layout. The HUD opens the
player’s Cast page and shows the same current state. Portrait generation uses SillyTavern Image Generation's `/imagine` provider.
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
and phrase scans. Cancellation never triggers fallback. Selecting Main API directly
still works with fallback disabled. Time is an ordinary editable world field; there
is no automatic elapsed-time regeneration.

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

The [2026-10-26 per-case audit](test-audit.csv) records individual decisions and
reasons for all 881 cases present at the start of that review, including parameterized
cases. This is a historical snapshot; source line numbers refer to that baseline.

[REWRITE_HOST_SMOKE.md](REWRITE_HOST_SMOKE.md) preserves the dated user-reported host
results and remaining manual checks. Mocked generator checks establish workflow and
isolation, not local-model quality; evaluate the selected model separately.
