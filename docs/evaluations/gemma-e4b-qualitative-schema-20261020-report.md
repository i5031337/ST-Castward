# E4B absolute strings with schema enforcement, 2026-10-20

The frozen absolute prompt was run with its JSON schema sent to llama.cpp using `response_format.type: "json_schema"`. Three repetitions of the same twenty qualitative scenes produced sixty new replies. The two unconstrained columns below are the saved earlier runs, not fresh resamples.

**Absolute strings with schema enforcement are a strong candidate for production: overall accuracy is within one check of the current mixed contract, with no stat-number type violations and substantially fewer warnings.** This small stochastic comparison supports that product choice; it does not establish an accuracy advantage. Production remains unchanged.

These are the original inference-time warning counts. A later [unchanged-stat warning fix and saved-reply replay](gemma-e4b-stat-echo-warnings-20261020-report.md) reduces the constrained run from 25 warnings to five, with all resulting states and scores unchanged. The absolute prompt remains experimental; the warning fix applies to production stat handling.

| Metric | Current mixed/delta, unconstrained | Absolute strings, unconstrained | Absolute strings, schema |
| --- | ---: | ---: | ---: |
| All scored checks | 588/609 (96.6%) | 580/609 (95.2%) | 587/609 (96.4%) |
| Inferred numeric-change intervals | 81/96 (84.4%) | 73/96 (76.0%) | 76/96 (79.2%) |
| Replies passing every check | 45/60 | 39/60 | 44/60 |
| Strict JSON validity | 60/60 | 60/60 | 60/60 |
| Replies with numeric stat literals | 16/60 | 1/60 | 0/60 |
| Replies with competing reading/delta values | 34/60 | 0/60 | 0/60 |
| Replies containing normalization warnings | 46/60 | 25/60 | 21/60 |
| Total normalization warnings | 144 | 45 | 25 |

Independent JSON Schema validation: **60/60** constrained replies match their frozen per-scene schema.

## Findings

- Constrained absolute improves from 580 to 587 passed checks relative to the saved unconstrained absolute run. It also raises fully passing replies from 39 to 44. The current mixed/delta reference is 588 checks and 45 fully passing replies. All three runs have sixty strictly valid JSON objects.
- All sixty constrained replies pass independent validation against their exact frozen schemas. None emits native numeric stat readings or delta-object keys. Collection shapes match the declared add/remove/update structure. All sixty constrained replies pass the unchanged-holdings checks, compared with 56 under either earlier contract.
- Numeric interpretation remains weaker than the current mixed reference: 76/96 constrained absolute interval checks pass, compared with 73/96 unconstrained absolute and 81/96 current mixed. In particular, all three constrained quiet-company replies leave player energy unchanged, and the sheltered-breather scene still misses most partial HP recovery. These are semantic misses that a type/shape constraint does not prevent.
- Warnings decline from 144 across 46 replies under the current contract, to 45 across 25 unconstrained absolute replies, to 25 across 21 constrained replies. This is measured from actual normalization warnings rather than inferred from raw type violations.

## What still causes warnings

Twenty of the 25 constrained warnings repeat unchanged NPC Level `"1"`. The current schema permits those NPC fields because the NPC schema is a union that also supports initialization; stat-level omission remains optional. The schema excludes player Level, so the analogous player warnings disappear.

One reply emits `", 23"`, `", 12"`, and `", 20"` as Affection, Trust, and Comfort. They satisfy `type: "string"` but are invalid numeric readings. The sanitizer rejects them and retains the held values, producing three warnings. Schema validation alone therefore must not be presented as validation of numeric contents.

One reply reports player and NPC XP as `"0/100000"` instead of keeping `"0/100"`. Those strings also satisfy the current schema. Existing code preserves the held maxima, producing two warnings and one raw pool-maximum check failure. No incorrect maximum is applied.

The next practical refinements are to ignore harmless unchanged managed-Level echoes without warning, while retaining warnings for attempted level changes, and to constrain numeric-string contents and existing pool maxima in schemas where the backend supports those restrictions. Suppressing only unchanged Level echoes would leave two affected replies and five warnings in this saved run; that is an audit calculation, not a rerun or an implemented change. Neither refinement was applied during this experiment.

## Per-scene scored checks

| Scene | Absolute unconstrained, three repetitions | Absolute with schema, three repetitions |
| --- | --- | --- |
| dating-q-accepted-boundary | 8/10, 9/10, 8/10 | 8/10, 9/10, 10/10 |
| dating-q-candy-before-call | 7/7, 7/7, 7/7 | 7/7, 7/7, 7/7 |
| dating-q-closing-shift | 8/9, 9/9, 8/9 | 9/9, 9/9, 9/9 |
| dating-q-kept-confidence | 9/9, 9/9, 9/9 | 9/9, 9/9, 9/9 |
| dating-q-misplaced-confidence | 8/9, 7/9, 7/9 | 8/9, 8/9, 7/9 |
| dating-q-ordinary-pause | 11/11, 11/11, 11/11 | 11/11, 11/11, 11/11 |
| dating-q-passing-joke | 10/10, 10/10, 10/10 | 10/10, 10/10, 10/10 |
| dating-q-pressure-lifted | 11/11, 11/11, 11/11 | 11/11, 11/11, 11/11 |
| dating-q-quiet-company | 9/10, 8/10, 10/10 | 9/10, 9/10, 8/10 |
| dating-q-unwelcome-notification | 10/10, 10/10, 9/10 | 10/10, 10/10, 10/10 |
| fantasy-q-brief-soaking | 11/11, 10/11, 10/11 | 10/11, 11/11, 11/11 |
| fantasy-q-cleaned-cut | 10/11, 11/11, 11/11 | 11/11, 11/11, 11/11 |
| fantasy-q-falling-plaster | 10/11, 11/11, 10/11 | 11/11, 11/11, 10/11 |
| fantasy-q-fever-easing | 10/11, 11/11, 11/11 | 11/11, 11/11, 10/11 |
| fantasy-q-loose-scree | 10/10, 10/10, 10/10 | 10/10, 8/10, 10/10 |
| fantasy-q-pain-easing-spell | 11/11, 11/11, 10/11 | 11/11, 11/11, 11/11 |
| fantasy-q-practice-impact | 11/11, 11/11, 11/11 | 11/11, 10/11, 11/11 |
| fantasy-q-sheltered-breather | 9/11, 9/11, 9/11 | 9/11, 9/11, 10/11 |
| fantasy-q-sustained-ward | 10/10, 10/10, 10/10 | 10/10, 10/10, 10/10 |
| fantasy-q-unspent-threat | 10/10, 10/10, 10/10 | 10/10, 10/10, 10/10 |

## Constrained failures

- npcChangeBetween Sam Trust -6 -1: 3 replies
- playerChangeBetween Social Energy 1 4: 3 replies
- playerChangeBetween HP 1 3: 3 replies
- npcChangeBetween Mira HP 1 3: 3 replies
- playerChangeBetween Social Energy -4 -1: 2 replies
- npcChangeBetween Mira HP -4 -1: 2 replies
- npcChangeBetween Sam Comfort 0 4: 1 replies
- npcChangeBetween Sam Affection 1 5: 1 replies
- npcChangeBetween June Comfort 1 8: 1 replies
- playerStatMatches Condition wet|damp|chill|cold: 1 replies
- playerChangeBetween HP -4 -1: 1 replies
- preservedPoolMaxima: 1 replies

## Remaining constrained warnings

- Mira · Level: "1" skipped: Level is managed by XP progression.: 18 times
- Rowan · Level: "1" skipped: Level is managed by XP progression.: 2 times
- Sam · Affection: ", 23" adjusted or refused: outside the numeric bounds or not a valid numeric reading; using "20".: 1 times
- Sam · Trust: ", 12" adjusted or refused: outside the numeric bounds or not a valid numeric reading; using "12".: 1 times
- Sam · Comfort: ", 20" adjusted or refused: outside the numeric bounds or not a valid numeric reading; using "20".: 1 times
- Player · XP: maximum "100000" skipped: the reader keeps the existing maximum (using "0/100").: 1 times
- Rowan · XP: maximum "100000" skipped: the reader keeps the existing maximum (using "0/100").: 1 times

## Method and limits

- Frozen bundles are exactly equal to the earlier absolute run: same twenty scenes, four historical messages, fresh player/Narrator exchange, starting states, settings, schema, and rendered messages. The intentional inference change is transmitting that schema.
- The evaluator now supports `--schema` at freeze time and records `useSchema` in frozen inputs and results. Runtime requests send the saved schema under `response_format.json_schema.schema`. The request helper has tests confirming both the constrained payload and unchanged unconstrained payload. A missing schema is rejected instead of silently disabling the constraint.
- The configured schema was used as saved, including optional stat readings. No additional field requirements, property restrictions, prompt changes, fixture edits, scoring changes, or retries were introduced for this run. Production reader behavior remains unchanged.
- Model: Gemma E4B Q4_K_XL at port 9931. Sixty requests, four in flight at a time, same frozen maximum completion tokens. Sampling uses the server defaults without a fixed seed. Server configuration, actual model path, raw replies, normalization warnings, and scores are retained. Three repetitions per scene remain a small stochastic sample; earlier runs were sequential rather than randomized or interleaved.
- Model, sampling defaults, and frozen input equality are checked against the earlier absolute run. The earlier inference hashes are retained as historical records; the new run hashes include the request helper and evaluator schema option, and match the report-time worktree.
- State checks use production parsing and normalization; strict JSON validity, raw numeric stat literals, and warnings are audited separately. Python `jsonschema` independently validates every constrained parsed object against its saved schema. Collection quantities remain numeric and are excluded from stat-string violation counts.
- The existing qualitative scoring caveats remain: inferred amounts have authored bounds; some Condition-only recovery, applied dressings, and wet-cloak updates are defensible despite failing specific checks. All checks stay fixed. Neither aggregate accuracy nor raw schema compliance alone measures complete production correctness.
- Thirty-seven focused Node tests passed before inference. This is an isolated reader harness with host-boundary stubs; the production UI was not changed.

## Artifacts and reproduction

- absolute: [frozen inputs](gemma-e4b-qualitative-absolute-20261020-prompts.json), [raw replies and scores](gemma-e4b-qualitative-absolute-20261020-results.json).
- schema: [frozen inputs](gemma-e4b-qualitative-absolute-schema-20261020-prompts.json), [raw replies and scores](gemma-e4b-qualitative-absolute-schema-20261020-results.json).
- [Three-way output audit, warnings, and independent schema validation](gemma-e4b-qualitative-schema-comparison-20261020.json).
- [Earlier qualitative comparison and scoring caveats](gemma-e4b-qualitative-20261020-report.md).

```sh
node tests/eval-gemma-tracker.js --freeze qualitative-absolute-schema-20261020 --qualitative --absolute --schema
node tests/eval-gemma-tracker.js --run qualitative-absolute-schema-20261020 --repeats 3 --endpoints http://127.0.0.1:9931/v1 --concurrency 4
```

Use a new label to preserve these inference artifacts.
