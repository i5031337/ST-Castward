# Gemma 4 E4B tracker evaluation

On 2026-10-18, Castward passed **142 of 144 required checks (98.61%)** across 24 local-model trials: 12 predefined scenarios, run twice. Fantasy Adventure passed 70/72 checks (97.22%); Dating Sim passed 72/72 (100%). There were **no critical failures, truncated replies, or fabricated starting-inventory audit failures**.

The scenarios cover opening-place recognition, travel, rumours and planned travel, NPC presence, damage and healing, earned XP, counted inventory, gifts, clothing, relationship changes, social energy, and unresolved costs. The eight main scenarios passed 96/96 checks; four initially reserved scenarios passed 46/48. Both XP trials correctly converted an earned 20 XP from 90/100 into Level 2 and 10/100 XP.

The two noncritical misses were an omitted world Location stat despite correct place discovery/current-place proposals, and an omitted present NPC during a quiet scene. These results support describing this configuration as tested successfully; they do not establish perfect extraction across arbitrary roleplay.

## Configuration and acceptance criteria

- Model: `/mnt/D/backup_models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf`.
- Server: llama.cpp `b11669-620d2225c`, `http://127.0.0.1:9931/v1`, one slot, 65,536-token context.
- Reader: built-in prompts and Systems, Places enabled, structured-output schema disabled, shipped 2400-token reply budget.
- Sampling: no request overrides. Recorded server defaults were temperature 1, top-k 64, top-p approximately .95, min-p 0, and random seed (`4294967295`). Repeated trials are stochastic, not deterministic seeded reproductions.
- Criteria defined before baseline inference: all replies parse without truncation, at least 90% required checks overall, at least 85% for each System, and no critical failures. Opening-place discovery/current marking and prevention of false movement, unsupported inventory changes, and unearned XP are critical checks. Fabricated-inventory audits also block acceptance.

The fresh-install reader budget increased from 1280 to 2400 during this work. Existing explicitly saved budgets are not represented by the fresh-install result.

## Evidence and development history

The candidate scores below summarize the development runs. Their intermediate JSON artifacts remain available in Git history; this directory keeps the final prompt and result pair. All candidates used the same predefined scenarios. No failed response was replaced with a preferred response.

| Artifact label | Trials | Required checks | Outcome |
| --- | ---: | ---: | --- |
| `pilot-invalid-inventory` | 10 | Excluded | Initial Fantasy fixture incorrectly used the unconfigured `items` collection instead of `equipment`. Preserved as an invalid pilot. |
| `baseline` | 12 | 59/72, 81.94% | Original location notes; place discovery/current marking failed. One baseline repetition was used to limit redundant diagnosis. |
| `final` | 24 | 105/144, 72.92% | Opening-scene guidance and complete location envelope added; null optional parents rejected valid discoveries, and three replies exhausted the 1280-token budget. |
| `final-2400` | 24 | 130/144, 90.28% | Larger budget, safer optional-parent handling, and removal of misleading example inventory; no truncations or fabricated starting inventory, but critical place failures remained. |
| `final-reminders` | 24 | 138/144, 95.83% | Final location/quantity reminders; remaining failures exposed evidence spelling and input/output reference-key confusion. Original scoring also rejected one semantically correct plural acquisition name. |
| `final-evidence` | 24 | 142/144, 98.61% | Input reference vocabulary separated from output keys; evidence differing only in ASCII letter case is mapped back to the exact source quote. Passed all criteria. |

The `candidate-1280-post-parser` and `final-reminders-post-parser` development scores replayed earlier raw responses under later parser/scorer versions; these were not additional model trials. Acquisition checks permit a new entry's singular/plural noun variant, while removals are checked through actual collection application against the exact stored identifier.

The authoritative final artifact is [gemma-e4b-final-evidence-post-parser-results.json](gemma-e4b-final-evidence-post-parser-results.json), replaying all 24 final responses consistently under the final parser. A parser-only fix lets a valid discovery survive a rejected optional parent candidate without inventing containment; genuine cycles remain rejected. No fifth model run was needed because prompts and request settings were unchanged. The original final run also scored 142/144, and the replay did not change its score.

The retained [final prompt bundle](gemma-e4b-final-evidence-post-parser-prompts.json) contains the exact requests, and the final results contain the original raw responses alongside the replayed scores. SHA-256 source fingerprints are recorded as `sourceHashes` in the frozen requests/results; `rescoreSourceHashes` and `rescoredAt` identify the final replay's code separately. The Git revision is also recorded, but the fingerprints distinguish this working tree from that revision.

## Reproduction and boundaries

From the extension directory, with the intended model already served at port 9931:

```bash
node --test tests/gemma-evaluation.mjs
node tests/eval-gemma-tracker.js --freeze my-run
node tests/eval-gemma-tracker.js --run my-run --repeats 2
```

The freeze command does not contact the model. The run command sends real requests to the local endpoint and writes `gemma-e4b-my-run-*.json` artifacts. To replay saved responses through the current production normalizer, copy their prompt/result pair to a new label and run `node tests/eval-gemma-tracker.js --score new-label`; preserve the originals when comparing versions. The ordinary `node --test tests/*.mjs` suite does not make these model requests.

The harness uses production built-in Systems, prompt/schema builders, numeric-delta normalization, stat sanitation, progression arithmetic, collection application, and location review proposals. Fixtures use controlled in-memory states and limited earlier-message context. They do not change saved settings or chats, call external services, or run extra reward-generation requests.

Host-only boundaries—persona/card lookup, activated lore, and chat UI—are stubbed. This evaluation does not exercise SillyTavern event scheduling, its provider adapter, full conversation continuity, review clicks, or complete `applyUpdate` persistence. Those require separate host/browser checks. It also does not evaluate NPC profile generation, other languages, model quantizations, or other backends.

Repeated candidates informed general fixes. The four initially reserved scenarios are therefore reported as originally held out, not as permanently unseen final validation. The result measures this finite scenario set and local configuration, not a guarantee for every roleplay.

## 2026-10-20 concise reader and name-based Places

These results cover the frozen `concise-dual` requests. The subsequent [task-focused wording draft](../tracker-prompt-draft.txt) is evaluated in the single-endpoint section below.

Readable failed cases with full prompts: [HTML report](gemma-e4b-concise-dual-failures.html) · [plain text](gemma-e4b-concise-dual-failures.txt).

The rewrite remains a draft: the dual-GPU run passed **306/320 checks (95.63%)**, but retained **nine critical check failures** across 44 trials. All 44 raw pool-maximum audits passed. None of the three suites met its full acceptance criteria.

The reader now groups evidence rules, configured fields/templates, current state, messages, and the output contract/examples. The fixed system text is 53% shorter and the reader template is 32% shorter by character count. Closing checks retain only brief reminders for cast, numeric types, consumption, XP evidence, and place output.

Established pool maxima remain fixed during reading; capacity growth belongs to the level-up code. Blank NPC pools still receive individual initial capacities. XP thresholds are described separately from resource pools. Runtime already enforced these capacity rules; this change aligns the prompts, generated-System descriptions, and typed examples with that behavior.

Places now use names throughout the reader contract. Stored IDs, temporary references, and their bookkeeping stay out of the request. Code resolves names and saved aliases, allocates IDs, validates containment, and preserves existing review payloads and saved IDs. Remembering a place and changing the current scene are independent: an established place can be added while the current scene stays unchanged. The output is:

```json
{"locations":{"places":[{"name":"Brackenport"},{"name":"Blue Heron Inn","parent":"Brackenport","description":"A small tavern."}],"current":"Blue Heron Inn"}}
```

All **680 offline tests passed** with `node --test tests/*.mjs`. They cover reader/inline examples, signed numeric changes, pool enforcement/progression, name and alias resolution, malformed or ambiguous updates, parent dependencies, and review identity/persistence safeguards.

The final model evaluation used both local Gemma 4 E4B instances at ports 8080 and 9931, with up to four concurrent requests per instance, the shipped 2400-token reply budget, schema disabled, server sampling defaults, and two repetitions of every scenario. Requests and responses below are retained in full; no failed final response was replaced.

| Suite | Trials | Checks passed | Rate | Critical failures | Accepted |
| --- | ---: | ---: | ---: | ---: | --- |
| Tracker | 24 | 151/160 | 94.38% | 4 | No |
| Natural prose | 16 | 111/114 | 97.37% | 3 | No |
| Mixed places | 4 | 44/46 | 95.65% | 2 | No |

Each scenario ran once on each endpoint. Inference requests ran in bounded parallel batches; normalization ran serially to isolate the harness’s shared settings. Per-endpoint results are retained on every trial and in each summary.

| Endpoint | Trials | Checks passed | Critical failures |
| --- | ---: | ---: | ---: |
| `8080` | 22 | 152/160 | 4 |
| `9931` | 22 | 154/160 | 5 |

Scoring changes were fixed before these final requests: four obsolete world `Location` expectations were removed because current built-in Systems use Places instead; a current room also satisfies its recorded containing venue; and every reply receives a critical raw-output audit for changed established pool maxima, before sanitation can correct them. The original 90% overall / 85% per-System / zero-critical-failure criteria remain for tracker and natural prose; the mixed-place suite requires every check. These revised totals are not directly comparable with the historical tables above.

Before the numeric-pool injury reminder fix, the name-based standard run passed 158/160 checks, while the natural-prose run retained a critical missed HP reduction. The reminder had selected only the older bar type. The next draft corrected HP but incorrectly gave Mira a scene prop (an empty crate); the final wording explicitly requires possession or acquisition for physical entries. A subsequent reply copied the concrete location example into an unrelated scene, so the final location example uses placeholders and requests established facts. Earlier development runs used several longer or intermediate prompts. Some were stopped when the contract changed. The last single-endpoint run was paused at the user’s request before enabling both GPUs. The final frozen dual-endpoint batch below is reported separately, including every miss. These reused scenarios measure regression performance, not an independent holdout.

Missed final checks:

- Tracker, `fantasy-battle` #1: playerValue XP 110/100.
- Tracker, `fantasy-travel` #1: placeCreated Old Mill; currentPlace Old Mill.
- Tracker, `dating-opening` #2: currentPlace Moonbeam Café.
- Tracker, `fantasy-holdout-cost` #2: npcPresent Mira.
- Tracker, `dating-holdout-drink` #1: validJsonAndNotTruncated; itemRemove items mint candy 2; playerValue Social Energy 7/10; npcPresent June.
- Natural prose, `dating-restful-night` #2: noInventoryChanges .
- Natural prose, `fantasy-partial-healing` #2: playerIncreased HP; npcAppliedIncreased Mira HP.
- Mixed places, `fantasy-parent-mixed` #1: placeParent Blue Heron Inn Brackenport.
- Mixed places, `dating-root-mixed` #2: itemRemove items sunflower 1.

Raw pool-maximum audit failures: **0**.

Final artifacts:

- Tracker: [requests](gemma-e4b-concise-dual-tracker-prompts.json), [responses and checks](gemma-e4b-concise-dual-tracker-results.json).
- Natural prose: [requests](gemma-e4b-concise-dual-natural-prompts.json), [responses and checks](gemma-e4b-concise-dual-natural-results.json).
- Mixed places: [requests](gemma-e4b-concise-dual-places-prompts.json), [responses and checks](gemma-e4b-concise-dual-places-results.json).

The harness exercises production prompt construction, normalization, numeric sanitation, progression arithmetic, collection application, and place proposals. Host scheduling, provider adapters, and full SillyTavern UI/persistence remain outside this model evaluation. Stochastic finite scenarios cannot establish reliability for arbitrary roleplay.

To run a fresh natural-prose evaluation on both instances:

```bash
node tests/eval-gemma-tracker.js --freeze another-dual-run --natural
node tests/eval-gemma-tracker.js --run another-dual-run --repeats 2 --endpoints http://127.0.0.1:8080/v1,http://127.0.0.1:9931/v1 --concurrency 4
```


## 2026-10-20 task-focused prompt, port 9931

The approved wording passed **297/320 checks (92.81%)** across 44 trials, with **18 critical check failures**. None of the three suites met its acceptance criteria. The preceding run scored 306/320 (95.63%). These stochastic runs reused scenarios and used different endpoint arrangements, so this comparison does not isolate prompt effects.

| Suite | Trials | Checks passed | Rate | Critical failures |
| --- | ---: | ---: | ---: | ---: |
| Tracker | 24 | 147/160 | 91.88% | 10 |
| Natural | 16 | 108/114 | 94.74% | 4 |
| Places | 4 | 42/46 | 91.30% | 4 |

Only `http://127.0.0.1:9931/v1` was used, with four concurrent requests and two repetitions per scenario. Model: `/mnt/D/backup_models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf`; llama.cpp `b11669-620d2225c`; four slots; 65,536-token context. Server sampling defaults: temperature 1, top-k 64, top-p approximately .95, random seed. Reply budget: 2400 tokens; output schema disabled. All frozen source fingerprints matched at completion. Production prompts and scoring stayed unchanged during inference.

All 44 replies passed JSON/completion and raw pool-maximum checks. Tracker location failures nested `locations` inside `global`; counted consumption sometimes used `update` instead of `remove`. Natural prose retained inventory errors and missed partial healing.

- tracker, `fantasy-travel` #1: itemRemove equipment red healing potion 1.
- tracker, `dating-opening` #1: placeCreated Moonbeam Café; currentPlace Moonbeam Café.
- tracker, `dating-travel` #2: placeCreated Glasshouse; currentPlace Glasshouse.
- tracker, `fantasy-holdout-opening` #2: placeCreated Emberwatch Keep; currentPlace Emberwatch Keep.
- tracker, `dating-holdout-opening` #1: placeCreated Paper Crane; currentPlace Paper Crane.
- tracker, `dating-holdout-opening` #2: placeCreated Paper Crane; currentPlace Paper Crane.
- tracker, `dating-holdout-drink` #1: itemRemove items mint candy 2.
- tracker, `dating-holdout-drink` #2: itemRemove items mint candy 2.
- natural, `dating-restful-night` #1: noInventoryChanges.
- natural, `dating-draining-evening` #1: npcPresent June.
- natural, `dating-quiet-control` #2: playerUnchanged Social Energy.
- natural, `fantasy-wound-treated` #1: noPlayerInventoryChanges.
- natural, `fantasy-partial-healing` #2: playerIncreased HP; npcAppliedIncreased Mira HP.
- places, `dating-root-mixed` #2: placeCreated Marigold Theater; placeRoot Marigold Theater; currentPlace Marigold Theater; createdPlaceCount 1.

The local suite initially passed 678/680 tests. Two tests still asserted old prompt wording (three assertions). After updating those assertions, all 17 tests in the affected files passed; all 680 tests are accounted for as passing. Production code was unchanged.

Full failed cases, including exact system/user messages, initial state, original replies, and normalized results: [plain text](gemma-e4b-task-focused-9931-failures.txt).

Frozen artifacts:
- Tracker: [prompts](gemma-e4b-task-focused-9931-tracker-prompts.json), [results](gemma-e4b-task-focused-9931-tracker-results.json).
- Natural: [prompts](gemma-e4b-task-focused-9931-natural-prompts.json), [results](gemma-e4b-task-focused-9931-natural-results.json).
- Places: [prompts](gemma-e4b-task-focused-9931-places-prompts.json), [results](gemma-e4b-task-focused-9931-places-results.json).

## Targeted rerun: direct place task and absolute quantity updates

Collection `update` accepts the quantity as an absolute remaining amount; zero removes the entry. Incremental add/remove operations and quantity prompt wording are unchanged. The extraction schema offers quantity in updates. The Places section starts with the scene-location task, followed by explicit `locations.current` and `locations.places` instructions.

All 47 focused collection/schema tests and 30 focused location/reader prompt tests passed. Tests replay the former potion, candy, and sunflower quantity failures through production normalization/application.

Frozen bundles select every scenario with a failed check in the preceding task-focused run. Both repetitions of each selected scenario are run fresh at port 9931 with up to four concurrent requests. This is a targeted regression rerun, not a full-suite score. Scorers and prompts stay frozen during inference.

Tracker completed 12 trials: **66/78 checks passed (84.62%)**, with 12 critical check failures across six replies. All quantity checks passed. All six failed place replies nested `locations` in `global`; one also used an unresolved `parent: "global"`. All replies were valid JSON and preserved pool maxima. The same selected scenarios previously scored 65/78; stochastic variation limits inference from this comparison.

Port 9931 refused connections before natural-prose inference started. After the user restored the instance, all remaining trials completed with matching model, build, sampling defaults, context, and slot configuration. No inference response was replaced or discarded. All frozen source fingerprints still matched at completion.

Artifacts: [tracker prompts](gemma-e4b-place-action-quantity-tracker-prompts.json), [tracker results](gemma-e4b-place-action-quantity-tracker-results.json), [full failed cases](gemma-e4b-place-action-quantity-failures.txt). Completed resumed suites: [natural prompts](gemma-e4b-place-action-quantity-natural-prompts.json), [natural results](gemma-e4b-place-action-quantity-natural-results.json), [places prompts](gemma-e4b-place-action-quantity-places-prompts.json), [places results](gemma-e4b-place-action-quantity-places-results.json).


Completed targeted total: **155/170 checks (91.18%)** across 24 trials; **15 critical check failures** across 9 failed trials. None of the suites met its full acceptance criteria.

| Suite | Trials | Checks passed | Critical failures |
| --- | ---: | ---: | ---: |
| Tracker | 12 | 66/78 | 12 |
| Natural | 10 | 68/70 | 2 |
| Places | 2 | 21/22 | 1 |

Both partial-healing repetitions passed. Remaining natural-prose failures were a magazine added from a scene prop and 5 XP awarded during wound treatment. Both mixed-place trials passed all place and player sunflower-quantity checks. One mixed-place response repeated the `characters` JSON key: the later value replaced the earlier entry containing June’s gift, so the recipient acquisition failed. Ordinary JSON parsing accepted the duplicate key. All 24 replies passed the current JSON/completion and pool-maximum audits.

Complete failed checks:

- tracker, `fantasy-travel` #1: placeCreated Old Mill; currentPlace Old Mill.
- tracker, `dating-opening` #1: placeCreated Moonbeam Café; currentPlace Moonbeam Café.
- tracker, `dating-opening` #2: placeCreated Moonbeam Café; currentPlace Moonbeam Café.
- tracker, `dating-travel` #1: placeCreated Glasshouse; currentPlace Glasshouse.
- tracker, `dating-travel` #2: placeCreated Glasshouse; currentPlace Glasshouse.
- tracker, `dating-holdout-opening` #2: placeCreated Paper Crane; currentPlace Paper Crane.
- natural, `dating-quiet-control` #1: noInventoryChanges.
- natural, `fantasy-wound-treated` #2: noXp.
- places, `dating-root-mixed` #1: npcItemAdd June items sunflower 1.


The subsequent boolean scene-location signal experiment is documented in [the location flag report](gemma-e4b-location-flag-report.md). Its scores use a different output contract and are not directly comparable with the place-detail results above.
