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

Each numbered candidate retained its frozen prompts, settings, schema, source state, raw responses, and scores. All candidates used the same predefined scenarios. No failed response was replaced with a preferred response.

| Artifact label | Trials | Required checks | Outcome |
| --- | ---: | ---: | --- |
| `pilot-invalid-inventory` | 10 | Excluded | Initial Fantasy fixture incorrectly used the unconfigured `items` collection instead of `equipment`. Preserved as an invalid pilot. |
| `baseline` | 12 | 59/72, 81.94% | Original location notes; place discovery/current marking failed. One baseline repetition was used to limit redundant diagnosis. |
| `final` | 24 | 105/144, 72.92% | Opening-scene guidance and complete location envelope added; null optional parents rejected valid discoveries, and three replies exhausted the 1280-token budget. |
| `final-2400` | 24 | 130/144, 90.28% | Larger budget, safer optional-parent handling, and removal of misleading example inventory; no truncations or fabricated starting inventory, but critical place failures remained. |
| `final-reminders` | 24 | 138/144, 95.83% | Final location/quantity reminders; remaining failures exposed evidence spelling and input/output reference-key confusion. Original scoring also rejected one semantically correct plural acquisition name. |
| `final-evidence` | 24 | 142/144, 98.61% | Input reference vocabulary separated from output keys; evidence differing only in ASCII letter case is mapped back to the exact source quote. Passed all criteria. |

Separate `candidate-1280-post-parser` and `final-reminders-post-parser` artifacts replay earlier raw responses under later parser/scorer versions; these are not additional model trials. Acquisition checks permit a new entry's singular/plural noun variant, while removals are checked through actual collection application against the exact stored identifier.

The authoritative final artifact is [gemma-e4b-final-evidence-post-parser-results.json](gemma-e4b-final-evidence-post-parser-results.json), replaying all 24 final responses consistently under the final parser. A parser-only fix lets a valid discovery survive a rejected optional parent candidate without inventing containment; genuine cycles remain rejected. No fifth model run was needed because prompts and request settings were unchanged. The original final run also scored 142/144, and the replay did not change its score.

Original responses remain in [gemma-e4b-final-evidence-results.json](gemma-e4b-final-evidence-results.json). Exact requests are in [gemma-e4b-final-evidence-prompts.json](gemma-e4b-final-evidence-prompts.json). SHA-256 source fingerprints are recorded as `sourceHashes` in the frozen requests/results; `rescoreSourceHashes` and `rescoredAt` identify the final replay's code separately. The Git revision is also recorded, but the fingerprints distinguish this working tree from that revision.

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
