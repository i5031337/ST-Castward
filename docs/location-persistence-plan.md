# Persistent places, stage one

## Purpose and limits

Returning to a place should preserve its established identity and details. Castward
will remember places alongside the cast, using the same chat ownership, reader,
review, and current-turn consistency rules. This stage adds no coordinates, routes,
travel mechanics, map visualization, automatic backgrounds, or NPC residence rules.
Remembered information comes from explicit edits, selected lore, or reviewed story
evidence. A name mentioned in dialogue is not evidence that the scene moved there.

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
      "parentId": "",
      "lorebook": "",
      "loreEntryId": null
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

Users may link an existing lorebook entry and explicitly copy its prose into the
local description before saving. The link is reference metadata, not a second
authoritative store. Foreground recall uses the saved local description. This stage
never writes or deletes shared lorebook entries: chat swipe reversal cannot safely
reverse changes to a shared external book. Async book loading checks chat freshness.

## Reader and review contract

The existing background tracker request optionally receives a location directory
and an additional structured `locations` output. There is no second model pass.
Known places use their stable IDs; new places use request-local references, resolved
to code-allocated stable IDs before review. The output can propose place discoveries,
updates, containment, and movement. It cannot delete records or change lore links.
Automatic mode reads an opening greeting through the same tracker entry point as
later replies. An explicitly established named initial scene can propose both its
card and current marker without a travel event. Location output is nested under the
top-level `locations` key, alongside the usual `global`, `player`, and `characters`.

Every place proposal needs a nonempty evidence excerpt from the latest reply.
ASCII case-only drift is matched back to and displayed as the exact source excerpt;
paraphrases and unsupported references are rejected.
Prompt instructions require established facts only: no invented geography, inferred
routes/distances/directions, hearsay treated as fact, or permanent NPC residency.
Descriptions are concise current facts; updates preserve useful existing facts and
replace superseded facts rather than append a visit log. Omitted update fields retain
their values. Aliases refer to the same place; containment requires explicit support.
Evidence matching validates provenance, not the truth of a model's interpretation;
the review is the user's decision about that interpretation.

Place changes follow Ask Before Applying: new or edited place details count as risky, while movement to a known place is ordinary. Movement to a newly proposed place waits with its card. Apply everything accepts both automatically.
Review rows show the proposed place details and story evidence. Descriptions can be
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

Foreground recall contains only the last confirmed place, its ancestor chain, and
a bounded number of known places explicitly named in recent chat messages. Matching
is literal, case-insensitive, and boundary-aware; ambiguous matches are skipped.
Names, aliases, hierarchy, and descriptions are factual reference data. A reminder
explains that the marker may lag newer prose. No full place directory is added to
every foreground prompt.

The reader receives a bounded identity directory with relevant descriptions. The
prompt states when a directory is partial so omitted records are not assumed absent.
Record counts, aliases, and description lengths are bounded. Disabled chats add no
location schema, instructions, or recall. Both extraction/manual and inline story
modes receive location recall; automatic discovery uses the existing reader modes.
The Tracker must be enabled for its reader and story-context injection to run.

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
2. Proposal tests: evidence, omissions, invalid references, new-place dependencies,
  rejection, source/record freshness, source-case canonicalization, forged
  acceptance payloads, and replay.
3. Context/schema tests: opt-in behavior, bounded directory and recall, mentions,
   ancestors, ambiguous aliases, no geography inference, and inline/manual modes.
4. Runtime tests: mixed stat/memory/place review, partial review and discard,
   chat/persona isolation, latest-reply movement, and pending-state persistence.
5. Turn tests: swipe/regeneration/deletion reversal, manual correction survival,
   and legacy-base alignment, exercising the real snapshot machinery.
6. Run the Node suite and a temporary unsaved browser fixture against the running
   SillyTavern instance. Check startup, Places controls, review, lore references,
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
  ordinary stat acceptance, disabled behavior, invalid evidence, async source
  changes, and a pre-request place baseline that protects concurrent manual edits.
- Turn regressions exercise the real session/snapshot code for swipes, regeneration,
  deletion, manual adoption of discoveries, legacy bases, and rule selection before
  the first player message. Runtime tests exercise mixed stat/memory/place reviews.

Requests in these checks were mocked; no model requests were made. A separate
Gemma 4 E4B evaluation uses the shipped reader prompts and real local model
endpoint; its trial data and results are recorded under `docs/evaluations/`.
