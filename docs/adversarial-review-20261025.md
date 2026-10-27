# Adversarial review: 2026-10-25

This review examines trust, recovery, operational complexity, and maintenance.
Product judgments below are distinguished from reproduced behavior. No live model
quality evaluation was performed for the original review; the subsequent comparison
for item #2 is linked below.

## 1. Overlapping readings lose turns — queue implemented

The reader previously returned `already running` when another extraction was active.
The newer turn was not queued or retried. The older reading could subsequently apply
after the newer reply existed. Optional NPC profile generation extended that lock.
This was reproduced with the existing extraction fixture and mocked host boundaries.

The reader now queues requests in arrival order. Each reading builds its prompt only
when it starts, using the preceding reading's applied state. Identical active or
waiting requests share a result. Waiting entries retain their message identity,
text, swipe, chat metadata, persona, and System; changed sources are discarded before
any request. Stop, chat changes, extension reset, and forgotten message indexes cancel
affected waiting work. Failed readings release the queue for the next entry.

This preserves existing review semantics: pending proposals are not treated as
accepted state. Latest-reply-only replacement, location movement, and profile
generation guards still apply. The queue does not prevent the narrator from starting
a new story reply before tracking catches up, and it does not replay historical state.

Implementation: `src/tracker/extractor/status-extractor-queue.js` and
`status-extractor-run.js`. Regression coverage: `tests/extraction-queue.mjs` and
`tests/tracker-regenerate.mjs`.

## 2. Aggregate accuracy overstates complete-turn reliability — reporting addressed; campaign validation open

The original README's 96.4% headline counted individual checks without showing that
44/60 replies passed every check and inferred numeric changes passed 76/96 checks.
The README now identifies E4B as the minimum local-reader target and presents all
three measures from the final 100-reply Dating configuration: 947/960 checks
(98.6%), 87/100 complete replies (87.0%), and 211/220 numeric checks (95.9%). These
use approved grading that accepts equivalent Mood descriptions, with original raw
replies and scores preserved. E4B is an accessibility target, not a best-results
recommendation or a proven lower capability boundary.

The reader now constrains numeric strings on compatible schema-enabled connections,
repairs unambiguous surrounding punctuation, and preserves held values for blank
numeric readings. Definitions clarify injury, illness, recovery and relationship
changes; purposeful skill/spell use can earn modest XP. Scoring permits the agreed
range of reasonable roleplay interpretations. Dating Mood is NPC-only; player
Social Energy remains a gameplay resource. Clothing initializes from established
outfits and reader guidance matches possessions to recorded owner entries. Final
Dating outputs contain no malformed numeric strings, but missed fatigue, external
distress affecting Comfort, inventory duplication and presence errors remain.

The [final report and audit](evaluations/dating-final-10x-20261026-report.md) retain
the full Dating run, link the accepted Fantasy definition comparison and distinguish
its earlier shared prompt from the current source snapshot. An exact-current-input
26B scene comparison passes Comfort 10/10 versus E4B's 5/10 focused and 7/10 final
trials, supporting a model-capability contribution without establishing a hard
minimum boundary. All 927 Node tests pass. Read-only running-host checks cover
schema routing and the NPC-only Mood/HUD configuration.

Assessment: the misleading aggregate headline is resolved, and model reliability
has improved enough to support the stated minimum-model target with corrections.
Further definition tuning is not required to address that reporting concern.

The original recommendation also asked for default-review evaluation against actual
campaign correction burden. That part remains open: review still defaults to
automatic application, and these reused independent scenes do not measure errors
accumulating across turns, correction effort, or the effects of accepting proposals.
A fresh multi-turn trial recording missed updates, corrections and review effort
would address that follow-up. The current evidence supports clear limits and a
review option; it does not establish the best default review policy.

Sources: the linked final evaluation,
`src/core/settings-tracker-defaults.js`, and the reader's normalization/request modules.

## 3. Recovery is shallow relative to probabilistic changes — accepted limitation

Latest-reply replacement and one-step undo do not provide general historical
restoration. The edit handler ignores earlier replies; some earlier-message deletions
warn the user to review state. A mistake discovered several turns later can require
manual reconstruction of stats and inventories.

Decision: retain latest-reply replacement, one-step undo, and manual correction.
Do not add historical recovery or checkpoints. The expected benefit does not justify
the added extension complexity and chat file size. Most tracking mistakes are
expected to have limited consequences and be straightforward to fix manually; this
is a product judgment, not a measured campaign result.

The original recommendation to design a bounded correction or checkpoint workflow
before expanding tracking scope is declined. Historical restoration remains limited
as described above; no runtime change is required to close this item.

Sources: `src/entry/entry-message-events.js` and `docs/ARCHITECTURE.md`.

## 4. Background automation has substantial service and latency costs — fallback policy addressed; activity indicators implemented

A tracker reading can lead to a separate location request, reward selection, and
optional NPC profile generation. Memories, expressions, images, and speech introduce
additional work and services. These can compete with narration on local hardware.
A failed dedicated reader connection previously fell back to the main chat API after
a warning, potentially changing the model and provider the user selected.

The tracker now offers **Fall Back To Main API** beside the extraction connection
selector. It is off by default, including for existing settings without an explicit
choice. When disabled, selected-connection failures propagate to the caller without
a request to the main API. Enabling it retains the warning and main-API retry.
The policy also covers history scans and other requests using the reader connection;
direct selection of the main API still works, and cancellation never triggers fallback.

Verification: all 949 Node tests pass, including disabled fallback, enabled retry,
missing Connection Manager, and cancellation checks. A running-host browser fixture
confirmed the toggle is visible, reflects both values, and propagates a mocked
selected-connection failure with fallback disabled. It restored in-memory settings
and the mocked service afterward; no settings saves or model requests were made.

Live activity above the composer now distinguishes reading stats, updating places,
filling named profiles, and drawing portraits or other images. Overlapping requests
have separate indicators. Live progress appears only at the composer; reports beneath
replies retain completed results, failures, and cancellations. Memory and History keep
their existing indicators. Activity is transient and adds no saved chat data. All 957
Node tests pass. A running-host fixture verified composer labels, suppression of
duplicate reply progress, completed reports, cleanup, and wrapping at 390px without model
requests or fixture saves. Visuals are ready for user review; this is not a usability
study or a measurement of real-service latency.

The explicit fallback policy is addressed and activity visibility is implemented.
Additional service and latency costs remain a consequence of enabling those features.
Sources:
`src/tracker/extractor/status-extractor-run.js`, `status-extractor-request.js`,
`src/ui/tracker/ui-tracker-display-reading.js`, `src/ui/tracker/ui-generation-activity.js`,
and `src/core/usage.js`.

## 5. The interface imposes a large conceptual burden — product judgment, open

Ten management sections encompass rules, profiles, places, lorebooks, speech, images,
and presentation. Users must distinguish Fill, tracker reading, memory reading, lore
synchronization, and carryover. These boundaries have implementation reasons but can
make basic setup and correction difficult to learn. Retry tracker button should be on the tracker display, not the raw output display.

Recommendation: prioritize a clear first-session workflow and visible automation
status over more customization. Source inspection: `manage.html` and
`src/ui/manage/ui-manage.js`; this is not a completed usability study.

## 6. File size limits do not remove architectural coupling — tracker update path addressed; broader coupling remains

At review time, `src/` contained 322 JavaScript modules and approximately 39,730 lines.
The tracker then bound 15 providers into a shared runtime dependency registry. Understanding
a state change still requires following mutable state across providers, host events,
snapshots, and UI refreshes.

Recommendation: refactor toward explicit state transitions and narrower dependencies;
further file splitting alone will not address the coupling. Source:
`src/tracker/status-logic.js`.

The cleanup removed dead tracker APIs and redundant persistence work. The first
architectural stage now removes the parser's provider binding and makes stat arithmetic,
field choices and name matching explicit imports. This breaks the stat-values/constraints
cycle and removes stat synonyms from session state. Fourteen bound providers remain.
Collection and full tracker updates now calculate from explicit captured data and return
state/card/library plans with local diagnostics. Actor initialization/stat calculation
also takes an explicit System, breaking the apply/presence registry cycle. Offstage
comparison actors are separate from calculated scene state; the public preview adapter
preserves the current review format. Existing wrappers still apply writes and forward
diagnostics to queues. Actor admission, model-input sanitization and review policy remain
separate host orchestration.

Full tracker updates now pass through an explicit ownership-checked commit boundary.
It checks chat/metadata, persona, active/bound System, source state and rules, plus
explicit source reply identity/text/swipe for reader, inline and review updates. Storage
revalidates immediately before installing related effects, preserving roster capture,
one-step undo and swipe alignment. Rejection changes no card/library/history/state and
publishes no status event; readers no longer record a refused commit as applied.
Guarded cache reuse validates metadata/state provenance without adding a normalization
or save to cached previews.

The focused update-path stage passed 896 Node tests and running-host preview/ownership
fixtures. The follow-up below extends those boundaries. Stored data formats, host save
separation and tombstone policy remain unchanged. See
[ARCHITECTURE.md](ARCHITECTURE.md#tracker-dependency-refactor) for the current design.

### Remaining architectural cleanup (completed 2026-10-27)

The optional follow-up is implemented:

1. **Direct item edits use calculated plans.** The editor captures its displayed
   chat, persona, System, card and item before debounce or confirmation delays.
   Accepted plans install scene/card/library effects through the storage boundary;
   rejected work leaves those stores untouched. Offstage cards remain editable
   without an open chat. Manual corrections, undo/swipe handling and item suppression
   retain their existing behavior.

2. **Schema/library edits are explicit operations.** Pure calculations return
   property writes and state changes from supplied rules, state, cards, persona
   records and Item Library data. UI definition renames belong to the same accepted
   operation as the value migration, including all scopes of a shared stat. Global
   operations do not require an open chat. Guards check chat/System ownership and
   cache provenance without repairing source data; library rows retain coherent
   references across repeated edits. Stable IDs and export formats are preserved.

3. **Lifecycle coordination has an explicit sequence.** A coordinator restores rules,
   seeds the roster, restores the persona, loads state and refreshes prompts/views.
   Host persona restores are serialized, restoration-owned events do not perform
   intermediate player saves, and obsolete continuations cannot load a newer chat.
   System locking, player isolation and fresh-chat roster seeding are preserved.

4. **Diagnostics belong to each operation.** Reader previews receive warnings and
   refusals directly through a local result object. Constraint helpers use explicit
   callbacks. Shared diagnostic record/drain queues are removed.

5. **The dependency registry is retired.** Tracker modules use ordinary named imports
   and exports. Session context/cache, character matching and stat filtering are
   independent dependencies, removing cycles between the former providers.
   `status-logic.js` remains the public export surface; startup supplies named prompt
   and generation callbacks. The registry-shape test is removed and behavioral
   coverage retained. Broader UI/extractor cycles remain outside this cleanup.

Verification: all 928 Node tests and JavaScript syntax/source-size checks pass, as
does `git diff --check`. Coverage includes ownership/refusal regressions, one-step
undo, and swipe/regeneration. Unsaved running-host tracker, item, schema and lifecycle
fixtures pass in headless Chromium. Browser fixtures use isolated stores and mocked
saves without model requests. This cleanup does not change suppression policy, review decisions or
historical recovery limits.

## 7. Manual item removal silently blocks later additions — open

Manual item removal creates a temporary `recently_deleted` marker (a tombstone).
Automatic additions and replacement lists skip matching items while it remains.
The counter starts at three and ages with committed tracker updates, rather than
elapsed time or necessarily three chat messages. Explicitly adding the item back
clears the marker. Matching uses the collection ID and case-insensitive item identifier,
without an owner: removing a player's Sword can also block an automatic addition of
a Sword to an NPC in the same collection.

This behavior is inherited from upstream's initial commit `490349e` and is also
present in version 0.6.0 (`5698f91`). Its apparent purpose is to prevent the reader
from restoring manually deleted items from recent story context, but it can also
suppress legitimate reacquisition or transfers. The user was unaware of the behavior
and questioned whether it should remain. This is a source-inspection finding and
an open product decision, not a reproduced campaign failure.

Revisit whether to remove the suppression or make it explicit and owner-specific,
and whether any expiry should follow story turns rather than tracker operations.
Keep this decision separate from the dependency refactor; no behavior change is
authorized by recording this concern.

Sources: `src/tracker/status-collection-updates.js` and the tombstone-aging logic in
`src/tracker/status-apply-update.js`.

## Evidence and limits

The original review ran all 877 Node tests successfully. Its concurrency reproduction
used mocked host boundaries. The local SillyTavern server responded, but the browser
smoke check could not start because the Snap geckodriver wrapper failed to create its
transient scope. Interface criticisms therefore came from source inspection.

The queue change passes all 892 Node tests, including new unit and extraction
integration checks for ordering, use of the preceding applied state, duplicate
requests, cancellation, source changes, index invalidation, and failure recovery.
`git diff --check` and syntax checks of both changed runtime modules also pass.

A subsequent headless Chromium session loaded the extension in the running
SillyTavern instance. An injected page module exercised the production queue with
the real generation-task cancellation service and host Stop event, using an isolated
in-memory context and mocked extraction callback. It confirmed serialized execution,
Stop-button visibility, cancellation of active and waiting work, no request for the
cancelled waiting entry, and successful submission afterward. No model requests or
fixture saves were made. This checks host cancellation integration, not real-model
quality or a complete multi-turn gameplay session.
