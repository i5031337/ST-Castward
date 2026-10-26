# Tracker evaluation: final local-model configuration, 2026-10-25

Gemma 4 E4B is Castward's minimum target for an accessible local reader. In the final
configuration it passes 584/606 checks (96.4%), with every check passing on 45/60
replies (75.0%). Inferred numeric changes pass 84/99 checks (84.8%). These measures
belong together: individual-check accuracy is not complete-reply reliability.

## Retained results

| Metric | Final E4B, fresh inference | 26B-A4B reference, rescored |
| --- | ---: | ---: |
| Checks passed | 584/606 (96.4%) | 598/606 (98.7%) |
| Replies passing every check | 45/60 (75.0%) | 54/60 (90.0%) |
| Numeric-inference checks | 84/99 (84.8%) | 93/99 (93.9%) |
| Strict JSON validity | 60/60 | 60/60 |
| Independent validation against the original inference schema | 60/60 | 60/60 |
| Scored inventory failures | 2 | 1 |
| Median request elapsed time, four slots | 17.2 s | 27.4 s |

**The reference is not a controlled comparison of the final prompts.** Its saved
26B replies use the same narrative scenes but older definitions, recovery guidance,
and an unconstrained numeric-string schema. Those raw replies were normalized by
current production code and rescored with the final rubric. Its original frozen
inputs, raw replies, and original scores are retained separately. No 26B rerun with
the final configuration was performed. Timings are observational, not hardware
benchmarks or minimum-memory requirements.

The final E4B run was retained without selecting a better run from development.
Intermediate inference artifacts and incremental reports from this review were
removed; the final E4B pair, one 26B reference pair, and their audit remain. Earlier
published evaluations from October 20 and before remain historical evidence.

## Final behavior and scoring

- Dating Sim Clothing uses one descriptive name. Trust describes confidence in the
  player's reliability and willingness to confide; actions can raise or lower it.
- Social Energy names fatigue and replenishment through restorative quiet, rest and
  relief. HP explicitly covers new injuries and illness, partial recovery while
  symptoms remain, and established complete recovery. The shared recovery prompt
  explicitly raises the current reading for partial recovery below maximum.
- Reader and inline guidance permits modest XP for successful, purposeful skill or
  spell use. The spell fixture accepts 0–5 caster XP, with unchanged NPC XP.
- Relationship magnitudes are broad plausibility intervals. Accepted-boundary Comfort
  permits `10 → 20` but no higher; small Trust easing is accepted. Misplaced-confidence
  may confirm existing low Trust, and its Affection gain may be up to ten. Other
  positive relationship changes have broader accepted bounds.
- Quiet-company energy accepts a gain of one through five, including `3/10 → 8/10`.
  Fever recovery accepts one through four HP, including `4/12 → 8/12`. Partial recovery
  stays below capacity. Brief rain does not require a wet player Condition. Confirming
  unknown offstage stats is not scored as an adjustment; presence remains checked.

These are authored judgments, not exact numerical truths specified by prose. The
current 20 scenes were used during development and are not a fresh holdout despite
their historical `holdout` metadata. Direction, plausible magnitude, conservation of
holdings, and actual resulting state are checked separately. Future generalization
claims need new scenes or multi-turn campaigns.

## Numeric output and production integration

All 466 emitted E4B numeric readings are syntactically valid. Every reply parses,
finishes normally, and passes its frozen JSON schema, including numeric patterns.
No normalization warnings, request errors, or normalization exceptions occur. This
prevents malformed stat strings; it does not establish semantic correctness.

The evaluation calls the production schema builder. With structured reader output
enabled, native llama.cpp and Custom connections whose configured model ends in
`.gguf` receive numeric-string patterns. Other routes receive portable schemas with
patterns removed, re-evaluated per destination on fallback. This uses configuration
as a compatibility cue, not server capability negotiation; alias-named custom models
keep the portable schema. Inline tracking uses the shared prompts and validation,
rather than this reader schema.

Model numeric validation preserves held values for empty readings. A conservative
repair accepts one complete scalar or pool reading surrounded by serialization
punctuation, with diagnostics, before XP, lock, maximum and bounds checks. Comparators,
explicit plus signs, multiple readings, units and digitless strings remain invalid.
Text, identifiers, collection fields, manual clearing and saved review rows retain
their existing semantics. Existing saved Systems and chats are not rewritten.

## Remaining E4B failures

The final audit retains every failed check. The main groups are:

- Some fatigue, injury damage and partial-rest readings remain unchanged despite the
  narrated event. Falling plaster misses Mira's damage three times; practice impact
  misses player damage twice; loose scree misses both damage readings once.
- Affection remains unchanged once in misplaced-confidence. Unwelcome-notification
  lowers Comfort `28 → 26`, outside the retained near-unchanged interval. These are
  interpretation or scoring judgments, not malformed JSON.
- Fever recovery succeeds numerically in all three replies, but one reply invents
  an acquisition of the already-held travel coat and awards XP for recovery. Loose
  scree awards XP once, despite the instruction leaving accidents unchanged.
- One successful soothing-spell reply removes the reusable Stillwater ability and
  awards ten XP, above the agreed small-award range.

The evaluator's strict acceptance flag remains false because scored critical checks
fail. Review still defaults to automatic application; correction burden across a
campaign has not been measured. E4B is the intended minimum target, not an established
best-results recommendation or a demonstrated lower capability boundary.

## Method and verification

Twenty independent roleplay scenes, ten Fantasy and ten Dating, three repetitions
per scene, four requests in flight at `http://127.0.0.1:9931/v1`. Exact prompts,
starting states, schemas, raw outputs, effective states, warnings and source hashes
are retained. Narratives were not regenerated for this final run. The final scoring
and wording were fixed before inference and were not retuned afterward.

The server reports `/mnt/D/backup_models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf`, llama.cpp
`b11860-df9beac71`, four slots and a 65,536-token context per slot. Sampling uses
server defaults: temperature 1, top-k 64, top-p approximately 0.95, min-p 0,
repetition penalty 1, no fixed seed. No retries or thinking override. The retained
26B reference uses the same sampler defaults and build with 32,768 tokens per slot.

Python `jsonschema` 4.19.2 independently validates both retained runs against their
own original inference schemas. All 925 Node tests pass. Coverage includes numeric
repair and rejection, blank preservation, valid zero, manual clearing, XP rollover
and decrease protection, locks, pool maxima, new-NPC initialization, provider pattern
adaptation, fallback routes and the final scoring boundaries. Syntax and whitespace
checks pass.

A headless Chromium fixture loaded the production extension in running SillyTavern.
Using the configured GGUF profile and a mocked Connection Manager response, it
confirmed pattern-bearing request handoff, cancellation signal propagation, and
portable Google adaptation without mutating the original schema. The method and DOM
fixture were restored; no model requests or fixture saves were made by this check.
The audit retains its boolean results. Node model tests use host-boundary stubs;
these checks do not constitute a full campaign trial.

## Artifacts and reproduction

- Final E4B: [frozen inputs](gemma-e4b-tracker-final-20261025-prompts.json) and
  [raw replies, states and scores](gemma-e4b-tracker-final-20261025-results.json).
- Historical 26B reference: [original inputs](gemma-26b-tracker-reference-20261025-prompts.json)
  and [original raw results](gemma-26b-tracker-reference-20261025-results.json).
- [Final audit, current-rubric reference scores, per-scene counts and validation](tracker-model-evaluation-20261025-audit.json).

The 26B files retain their original inference labels inside the metadata; renaming
identifies their retained reference role without rewriting the evidence. Source
hashes identify the tested working tree; the frozen Git revision is its base commit.

Use a new label to repeat without overwriting final evidence:

```sh
node --test tests/*.mjs
node tests/eval-gemma-tracker.js --freeze tracker-repeat --qualitative --schema
node tests/eval-gemma-tracker.js --run tracker-repeat --repeats 3 \
  --endpoints http://127.0.0.1:9931/v1 --concurrency 4
```
