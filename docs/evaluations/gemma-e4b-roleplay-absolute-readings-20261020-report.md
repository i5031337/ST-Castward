# E4B experiment: absolute stat readings as strings

**The simpler contract substantially reduced raw type errors and eliminated competing stat representations, but did not demonstrate higher overall accuracy in this sample.** It remains an evaluation-only candidate; the production reader and saved-data formats were not changed by this experiment.

| Metric | Current mixed contract | Absolute strings |
| --- | ---: | ---: |
| Passed checks, all attempts | 286/298 (96.0%) | 280/298 (94.0%) |
| Replies passing every scored check | 29/40 | 28/40 |
| Parseable JSON replies | 40/40 | 39/40 |
| Replies with JSON numbers in stat reading objects | 17/40 parseable | 5/39 parseable |
| Replies supplying both a reading and a delta for the same stat | 20/40 | 0/40 |
| Raw replies containing delta-object keys, including empty objects | 27/40 | 0/40 |

The unparseable experimental reply is included in all-attempt accuracy and fully passing reply counts. Its types cannot be validated, so it is excluded from the parseable-only type denominator. Collection quantities and other declared numeric collection fields are not counted as stat string errors.

These are the original strict-parser results. The subsequent [parser investigation and replay](gemma-e4b-roleplay-parser-repair-20261020-report.md) corrects an evaluation mismatch: production already attempted recovery. Using production parsing, the comparison is 286/298 versus 285/298, with equal scores when raw JSON validity is excluded. Original inference artifacts remain unchanged.

## Contract and implementation

- Every stat reading is an absolute resulting value in the existing stat objects: `global`, `player.stats`, and `characters[].stats`. All readings are JSON strings, including numeric ratings, pool readings such as `"9/12"`, and textual values.
- There are no separate stat delta objects. Collections retain their existing add/remove/update operations and declared numeric/boolean field types.
- The experiment changes the reader output instructions, configured worked examples, injury/recovery wording, XP convention and optional schema consistently. It keeps the fresh-player evidence rules and the system message unchanged.
- For XP, the reader adds the award to the held reading and returns the total before progression, retaining the threshold even above capacity. The application handles levels and remainders.
- The harness bypasses only the reader delta-expansion stage in absolute mode. Existing absolute sanitation, maximum preservation, update application and progression remain in use. Stray delta objects are ignored with warnings, so a mixed reply cannot be rescued by applying an unintended delta.
- Scalar JSON numbers remain tolerated by the shared downstream normalization. Raw type compliance is measured separately from the resulting state; the experiment does not convert type mistakes into extra state-score deductions.
- The variant lives in `tests/fixtures/gemma-absolute-contract.mjs` and is selected during freezing with `--absolute`. Neither production prompts nor production reader normalization were changed.

## What the results show

- The number/string problem fell from 17 affected replies to 5, and no experimental reply emitted a delta-object key. This supports simplifying the contract as a way to reduce representation errors.
- The remaining numeric literals cluster in plain numeric ratings: four Dating Sim replies use native numbers for Affection/Trust/Comfort, and one Fantasy reply does so for ratings such as Armor and Strength. Pool readings mostly stay strings because slash notation naturally requires them. The configured definitions still describe these fields as numeric; that may explain some remaining wire-type confusion, but this run does not establish the cause.
- One experimental mutual-agreement reply finishes normally but has transposed object/array closing delimiters in its clothing collection. It loses six of seven checks. The original evaluator used strict parsing without repair, retry or replacement. That single malformed reply accounts for six failed checks, the same size as the aggregate difference between contracts; the two runs also differ on other individual checks.
- As a supplementary conditional metric, the parseable experimental replies pass 279/291 checks (95.9%), close to the control’s 96.0%. The original strict-only experimental result is 94.0% over all attempts. A later production-parser replay recovers this reply; see the addendum linked above.
- Exact toll-payment and failed-spell mana arithmetic pass both experimental repetitions. The gift transfer passes both; learning Wicklight is recorded once rather than never in the saved control. The experimental run also misses fatigue once and Mira’s overnight HP recovery once. These differences are observations from small stochastic samples, not demonstrated causal effects of the format.
- Some existing checks remain strict: both experimental apology replies increase Trust from 4 to 5 despite the unresolved hurt, which is a genuine failure of the no-instant-repair expectation. Some first-aid wording may still be defensible without matching the exact Condition pattern. The checks were held fixed; no fixtures or scores were adjusted after inspecting this experiment.

## XP threshold checks

The primary twenty-scene suite is unchanged. Supplemental probes reuse the complete courier-rescue exchange with starting XP set to `"99/100"` and are scored separately. Each was run twice per contract.

| Probe | Current mixed contract | Absolute strings |
| --- | --- | --- |
| Narrative accomplishment, unstated award | level 2 in 1/2; 13/16 checks | level 2 in 2/2; 16/16 checks |
| Explicit 20-XP award | level 2 in 2/2; 18/18 checks | level 2 in 2/2; 17/18 checks |

- With an unstated award, both absolute replies report `"100/100"`; production progression yields level 2 and `"0/100"`. The control succeeds once and omits XP entirely once. That omission is not a demonstrated arithmetic error.
- Appending “You earn 20 XP for the rescue.” tests a total above the threshold. Both absolute replies report `"119/100"`; production progression yields level 2 and `"19/100"`. Both control replies also yield the correct level and remainder. One absolute reply has an unrelated inventory error.
- Deterministic unit tests also verify `"110/100"` → level 2, `"10/100"`; `"270/100"` → level 3, `"70/100"`; and NPC XP progression. Model-selected level edits remain blocked.
- The supplemental runner’s historical acceptance flag includes an absent Dating Sim partition and is false even on a perfect Fantasy-only probe. The individual checks and resulting levels above are the relevant supplemental results.

## Validation and scope

- 33 focused Node tests pass, including eight tests for the experimental contract. Tests inspect all twenty fully rendered requests, confirm no competing stat paths remain, and check schema types, absolute arithmetic, XP progression, stray-delta rejection and maximum preservation.
- Replaying all forty saved control replies through the updated default harness produces exactly the same scored checks. The production delta path was not altered.
- Main comparison: same twenty scenes, starting states, settings, scoring expectations, system message, E4B model and server sampling defaults. Two repetitions per scene, four requests at a time, no schema constraint, maximum 2400 reply tokens. The reader-specific output contract, examples and its normalization mode are the intentional changes.
- Model: `/mnt/D/backup_models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf` at port 9931. The control is the saved fresh-player run from earlier in the session; it was not resampled for the main comparison. Sampling is stochastic, there are only two repetitions per scene, and there is no held-out set.
- Frozen experimental source hashes record the worktree used for inference; later parser changes are recorded separately in replay artifacts. All raw replies are retained, including the malformed reply. Main and supplemental scores are kept separate.
- This is an isolated reader experiment with host-boundary stubs. Full SillyTavern request integration, NPC admission, profile generation and level-up reward proposals are outside this experiment. No live UI behavior changed.

## Recommendation

Absolute strings are a promising simplification: they remove an ambiguous choice and materially reduce type violations, while XP totals work through the existing downstream progression. The current evidence does not establish an overall accuracy improvement. Keep it as an evaluation candidate until a larger comparison supports replacing the production contract.

## Per-scene scored checks

| Scene | Current mixed contract (two runs) | Absolute strings (two runs) |
| --- | ---: | ---: |
| dating-boundary-respected | 7/7, 7/7 | 7/7, 7/7 |
| dating-coat-off | 8/8, 7/8 | 7/8, 8/8 |
| dating-crowded-fundraiser | 7/7, 7/7 | 7/7, 6/7 |
| dating-honest-apology | 7/7, 7/7 | 6/7, 6/7 |
| dating-morning-alone | 6/6, 6/6 | 6/6, 6/6 |
| dating-mutual-agreement | 7/7, 7/7 | 7/7, 1/7 |
| dating-quiet-promise | 7/7, 7/7 | 7/7, 7/7 |
| dating-rain-check | 5/7, 7/7 | 7/7, 5/7 |
| dating-remembered-flower | 6/7, 7/7 | 7/7, 7/7 |
| dating-unwanted-kiss | 6/7, 7/7 | 6/7, 7/7 |
| fantasy-blocked-strike | 8/8, 8/8 | 8/8, 8/8 |
| fantasy-bridge-toll | 7/7, 7/7 | 7/7, 7/7 |
| fantasy-companion-bandage | 9/10, 9/10 | 9/10, 9/10 |
| fantasy-courier-rescue | 6/7, 6/7 | 6/7, 7/7 |
| fantasy-failed-fire | 8/8, 7/8 | 8/8, 8/8 |
| fantasy-first-cantrip | 6/7, 6/7 | 6/7, 7/7 |
| fantasy-hand-over-rope | 7/7, 7/7 | 7/7, 7/7 |
| fantasy-healing-draught | 8/8, 8/8 | 8/8, 8/8 |
| fantasy-overnight-rest | 9/9, 9/9 | 8/9, 9/9 |
| fantasy-rumour-and-plan | 8/8, 8/8 | 8/8, 8/8 |

## Reproduction and artifacts

```sh
node --test tests/gemma-absolute-contract.mjs tests/gemma-evaluation.mjs tests/gemma-roleplay-evaluation.mjs tests/gemma-tracker-apply.mjs tests/reader-user-evidence.mjs
node tests/eval-gemma-tracker.js --freeze roleplay-absolute-readings-20261020 --absolute
node tests/eval-gemma-tracker.js --run roleplay-absolute-readings-20261020 --repeats 2 --endpoints http://127.0.0.1:9931/v1 --concurrency 4
```

Use a new label to preserve the original artifacts. `--xp-threshold` freezes the narrative-award probe. The explicit-award snapshots additionally contain the appended 20-XP sentence and its expected remainder.

- `roleplay-user-turn-20261020`: [frozen input](gemma-e4b-roleplay-user-turn-20261020-prompts.json), [all replies and scores](gemma-e4b-roleplay-user-turn-20261020-results.json).
- `roleplay-absolute-readings-20261020`: [frozen input](gemma-e4b-roleplay-absolute-readings-20261020-prompts.json), [all replies and scores](gemma-e4b-roleplay-absolute-readings-20261020-results.json).
- `roleplay-xp-threshold-control-20261020`: [frozen input](gemma-e4b-roleplay-xp-threshold-control-20261020-prompts.json), [all replies and scores](gemma-e4b-roleplay-xp-threshold-control-20261020-results.json).
- `roleplay-xp-threshold-absolute-20261020`: [frozen input](gemma-e4b-roleplay-xp-threshold-absolute-20261020-prompts.json), [all replies and scores](gemma-e4b-roleplay-xp-threshold-absolute-20261020-results.json).
- `roleplay-xp-explicit-control-20261020`: [frozen input](gemma-e4b-roleplay-xp-explicit-control-20261020-prompts.json), [all replies and scores](gemma-e4b-roleplay-xp-explicit-control-20261020-results.json).
- `roleplay-xp-explicit-absolute-20261020`: [frozen input](gemma-e4b-roleplay-xp-explicit-absolute-20261020-prompts.json), [all replies and scores](gemma-e4b-roleplay-xp-explicit-absolute-20261020-results.json).

[Comparison data and per-reply type diagnostics](gemma-e4b-roleplay-absolute-readings-20261020-comparison.json)
