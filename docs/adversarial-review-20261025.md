# Adversarial review: 2026-10-25

This review examines trust, recovery, operational complexity, and maintenance.
Product judgments below are distinguished from reproduced behavior. No live model
quality evaluation was performed for this review.

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

## 2. Aggregate accuracy overstates complete-turn reliability — open

The README's 96.4% headline counts individual checks. The cited schema-constrained
evaluation passed every check on 44 of 60 replies; inferred numeric changes passed
76 of 96 checks (79.2%). The report explains these limits, but the headline is much
more reassuring. Review defaults to off, so valid-looking semantic mistakes can
become state automatically.

Recommendation: present complete-reply and numeric-inference results alongside the
aggregate, and evaluate default review policy against correction burden in actual
campaigns. Source: `evaluations/gemma-e4b-qualitative-schema-20261020-report.md` and
`src/core/settings-tracker-defaults.js`.

## 3. Recovery is shallow relative to probabilistic changes — open

Latest-reply replacement and one-step undo do not provide general historical
restoration. The edit handler ignores earlier replies; some earlier-message deletions
warn the user to review state. A mistake discovered several turns later can require
manual reconstruction of stats and inventories.

Recommendation: design a bounded correction or checkpoint workflow before expanding
tracking scope. Sources: `src/entry/entry-message-events.js` and `ARCHITECTURE.md`.

## 4. Background automation has substantial service and latency costs — open

A tracker reading can lead to a separate location request, reward selection, and
optional NPC profile generation. Memories, expressions, images, and speech introduce
additional work and services. These can compete with narration on local hardware.
A failed dedicated reader connection falls back to the main chat API after a warning,
potentially changing the model and provider the user selected.

Recommendation: make outstanding work understandable and offer an explicit fallback
policy. Sources: `src/tracker/extractor/status-extractor-run.js`,
`status-extractor-request.js`, and `src/core/usage.js`.

## 5. The interface imposes a large conceptual burden — product judgment, open

Ten management sections encompass rules, profiles, places, lorebooks, speech, images,
and presentation. Users must distinguish Fill, tracker reading, memory reading, lore
synchronization, and carryover. These boundaries have implementation reasons but can
make basic setup and correction difficult to learn.

Recommendation: prioritize a clear first-session workflow and visible automation
status over more customization. Source inspection: `manage.html` and
`src/ui/manage/ui-manage.js`; this is not a completed usability study.

## 6. File size limits do not remove architectural coupling — open

At review time, `src/` contained 322 JavaScript modules and approximately 39,730 lines.
The tracker binds 15 providers into a shared runtime dependency registry. Understanding
a state change still requires following mutable state across providers, host events,
snapshots, and UI refreshes.

Recommendation: refactor toward explicit state transitions and narrower dependencies;
further file splitting alone will not address the coupling. Source:
`src/tracker/status-logic.js`.

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
