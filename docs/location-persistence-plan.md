# Persistent places

## Purpose and limits

Returning to a place should preserve its established identity and details. Castward
will remember places alongside the cast, using the same chat ownership, reader,
review, and current-turn consistency rules. This stage adds no coordinates, routes,
travel mechanics, map visualization, automatic backgrounds, or NPC residence rules.
Remembered information comes from explicit edits or reviewed story
evidence. A name mentioned in dialogue is not evidence that the scene moved there.

## Current reader flow

The tracker reports only the top-level boolean `locationChanged`. Code requests a
separate place reading when the chat has no confirmed current place, or when an
existing place is followed by `locationChanged: true`. Disabled Places and unchanged
known scenes skip this request. Initialization repeats while the current place
remains unconfirmed, including while a discovery awaits review.

The place reader uses the configured tracker connection and its own editable
prompts. It receives current/known place facts and recent story, and returns names,
descriptions, aliases, containment, and the current place. Code resolves names to
stored IDs and routes proposals through the existing automatic/review settings.
Unsolicited place records from the stat tracker are ignored.

Unsupported model fields are ignored with visible warnings; supported fields are
validated. A failed place request leaves successful stat/inventory reading intact and appears
in the tracker report. Regenerating the latest tracker reading retries from its turn
base. Replies are checked against chat, message, text, swipe, persona, and active
System before publishing changes; place review also preserves intervening edits.
The report displays both model outputs, and usage has a separate Location Reading
counter. These flows have focused tests and a read-only live Places UI fixture.

Dedicated-reader model results are retained in
[evaluation evidence](evaluations/gemma-e4b-location-reader-shape-v2-report.md).
The shape retest is a regression sample; missing or invented details remain model
limitations and do not establish broad extraction reliability.

## Ownership and identity

Places live in `sillynpc_status_state.locations`, inside existing chat metadata:

```json
{
  "enabled": true,
  "currentId": "",
  "records": {
    "place-stable-id": {
      "id": "place-stable-id",
      "name": "The Rusty Lantern",
      "aliases": ["The Lantern"],
      "description": "A riverside tavern. Its eastern doorway is boarded up.",
      "parentId": ""
    }
  }
}
```

- `definition.locations.enabled` is the canonical System setting. It defaults to true
  for built-in and older Systems, and is saved/imported/exported with the System.
  The enabled value above is a derived runtime projection, refreshed on state reads.
  Disabling it preserves records while stopping extraction and foreground recall.
  Existing chats acquire no invented locations.
- Place IDs survive renaming. Aliases are literal names, never regular expressions.
  Name collisions are rejected by manual edits; ambiguous imported matches never
  resolve arbitrarily. Records form an optional containment hierarchy. Missing
  parents, self-parenting, and cycles are invalid.
- Places belong to the chat, independently of persona and System selection. They
  travel with native chat saves/branches, not character or reusable System exports.
  The enable switch is included in System generation planning, schemas, stage
  contexts, and validation. Cards and scene state are never generated System rules.
- `currentId` means **last confirmed place**. Arbitrary Systems can already have
  Location, Region, or other world fields. These retain their existing behavior;
  Castward does not guess a semantic binding or silently rewrite them. Newer story
  prose can establish movement before a place proposal is reviewed.

## Editing and lore

A Places section in the existing management popup offers an enable switch, search,
cards, and a compact editor for name, aliases, description, and parent. Users can
create, rename, edit, delete, set current, and clear current. Deleting a record clears
its current marker and detaches children. The existing one-step undo handles these
manual changes. No editor can save into a different chat after a host chat switch.

Castward maintains one lorebook entry per saved place in the selected/default chat
lorebook, using the same target chooser and automatic-creation preference as profiles.
A missing target pauses synchronization for selection; skipping leaves local places
intact. Existing saved places synchronize when opening their chat or on the next lore
scan. Names and aliases become activation keys, and content includes the full
containment path and saved description. Entries carry chat/place ownership markers;
external entries and former user-linked references are never adopted or rewritten.
The external reference picker and copy controls have been removed.

Metadata remains authoritative so reviewed changes, undo, deletion, renaming, and
reparenting can be reconciled into lore. Reparenting updates descendant paths;
deleted places remove their owned entries from the current target. A shared per-book
queue prevents place and profile saves from overwriting each other. Async writes
check the chat, persona, System, and place snapshot before saving.

## Reader and review contract

The dedicated place reader returns names, optional descriptions and aliases, optional
parent names, and an optional current-place name. Code resolves names to stored IDs
and allocates stable IDs for discoveries. The stat reader supplies only the movement
boolean. Applying changes supports automatic acceptance, review, and mixed batches.
A proposed current marker waits for its new destination card if that card requires review.
Review rows show the proposed place details. Descriptions can be
corrected before acceptance; identity, destination, source, and dependencies come
from the stored proposal, never from a returned UI object. Manual record editing is
available for other corrections.

Acceptance checks the source chat, exact message text and swipe, and the record as
it stood when proposed. Duplicate submissions do not apply twice. Manual edits made
while review was pending win over stale proposals. A selected child or current marker
cannot refer to a rejected/missing new place. Valid creates apply before dependents;
unresolved selected dependencies remain pending with an explanation. Current-place
changes require the latest story reply, so reviewing an earlier discovery cannot
move today's scene backward. Unselected ordinary location rows follow the existing
review's discard behavior; Discard all rejects all remaining location proposals.

## Context and prompt cost

The host scans place names and aliases using ordinary lorebook activation. All managed
place entries are removed from incoming host scan arrays, then only the active chat's
fresh entries are supplied, avoiding duplicates and cross-chat activation. The current
place and all its ancestors receive scan-only constant and ignore-budget flags, with
probability, groups, and timing restrictions cleared. Saved activation controls are
unchanged; explicitly disabled entries remain disabled. Other places activate normally.
New managed entries disable recursive activation to avoid a place's path or description
pulling in unrelated places. Descriptions use their full saved text, without the former
1,000-character recall truncation or recent-message recall limits.

The tracker scene prompt contains only a last-confirmed path marker. It does not
duplicate place descriptions. The reader still receives a bounded directory of saved
place facts, independently of lorebook activation. Disabling the extension, tracker,
or Places suppresses all managed place entries from the scan while preserving records.

## Turn consistency and integration

Keeping keyed records inside tracker state lets existing full-state turn deltas
restore accepted place changes when replacing, editing, or deleting the latest
reply. Reviewed place writes use `partOfMessage`, refresh the turn base before
applying, and record effects after committing. Later manual corrections remain
outside the reply's effects. Legacy bases without full turn effects carry manual
place state forward because old replies could not have produced location changes.
Delayed reviews of older discoveries are user corrections rather than writes owned
by the latest turn. Source freshness still applies.

Integration points are the extractor schema/prompt/run, shared review resolver and
renderer, foreground scene prompt, management popup, and legacy swipe alignment.
Pure domain modules own normalization, CRUD, proposal validation, and application;
small runtime helpers own host context, saving, and provenance. Files remain below
20 kB and no build step or additional dependency is introduced.

## Verification

1. Pure storage tests: disabled defaults, stable IDs through rename/save roundtrip,
   immutable CRUD, bounds, literal aliases, duplicate/ambiguous identities, safe
   record keys, parent cycles, deletion cleanup, and preservation of other state.
2. Proposal tests: uncited output, omissions, invalid references, new-place dependencies,
  rejection, source/record freshness, forged
  acceptance payloads, and replay.
3. Context/schema tests: opt-in behavior, bounded reader directory, current path marker, no geography inference, and inline/manual modes.
4. Runtime tests: mixed stat/memory/place review, partial review and discard,
   chat/persona isolation, latest-reply movement, and pending-state persistence.
5. Turn tests: swipe/regeneration/deletion reversal, manual correction survival,
   and legacy-base alignment, exercising the real snapshot machinery.
6. Run the Node suite and a temporary unsaved browser fixture against the running
   SillyTavern instance. Check startup, Places controls, review, managed lore activation,
   chat guards, and narrow layout without model requests or saving fixture data.

Success means a user can discover or enter a place, review it, leave and return,
reload the chat, and retain its identity and established details while replacement
replies and manual corrections behave like the rest of Castward.

## Implemented verification, 2026-10-18

- `node --test tests/*.mjs`: 619 tests passed with no failures, including the
  current place's ancestor path.
- `python3 tests/ui-locations.py`: all checks passed against the running local
  SillyTavern instance with headless Firefox. The real modules loaded successfully;
  isolated real-DOM fixtures exercised editing, search, lore copying, current/clear,
  deletion/undo, review editing, navigation markup, the in-chat tracker trail,
  and a 420 px layout. Host chat and
  metadata were unchanged. Browser execution needed sandbox escalation.
- Extractor regressions verify a single request, location review modes alongside
  ordinary stat acceptance, disabled behavior, uncited output, async source
  changes, and a pre-request place baseline that protects concurrent manual edits.
- Turn regressions exercise the real session/snapshot code for swipes, regeneration,
  deletion, manual adoption of discoveries, legacy bases, and rule selection before
  the first player message. Runtime tests exercise mixed stat/memory/place reviews.

Requests in these checks were mocked; no model requests were made. A separate
Gemma 4 E4B evaluation uses the shipped reader prompts and real local model
endpoint; its trial data and results are recorded under `docs/evaluations/`.
