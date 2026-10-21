# Gemma E4B: current tracker prompts on contextual roleplay scenes

Historical result: the Occasion, wardrobe and first-aid expectations were subsequently corrected. See the [rescoring and same-fixture prompt comparison](gemma-e4b-roleplay-user-turn-20261020-report.md) for the current interpretation.

The frozen current prompts passed **279/298 checks (93.6%)**. **27/40 replies (67.5%)** passed every scored check. There were **19 critical check failures across 13 replies**, so this run fails the benchmark’s zero-critical-failures acceptance rule. Prompts, fixtures, and expectations were not changed during the run.

| System | Passed checks | Check pass rate | Replies passing every check |
| --- | ---: | ---: | ---: |
| Fantasy Adventure | 149/158 | 94.3% | 13/20 |
| Dating Sim | 130/140 | 92.9% | 14/20 |

## Method

- Model: `/mnt/D/backup_models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf`; llama.cpp build `b11669-620d2225c` at `http://127.0.0.1:9931/v1`.
- Twenty saved scenes, ten per System, two repetitions each. Every request and reply retained; no retries, discarded replies, or prompt tuning.
- Four concurrent requests, using all four server slots. Maximum 2400 reply tokens. No schema constraint or per-request sampling overrides.
- Server defaults: temperature 1, top-k 64, top-p 0.95, min-p 0; random server seed.
- The production prompt builders and normalizers are used with built-in System definitions and host-boundary stubs. This is an isolated reader benchmark, not an end-to-end SillyTavern session.
- Each request supplies the four authored prior messages plus the latest user turn as earlier context, then the latest assistant reply as the message to read. The production prompt still labels all that earlier text as already reflected in state. This benchmark context is longer than the runtime default of two preceding messages.
- All 40 replies parsed after optional Markdown fence stripping and finished normally. No request or normalization errors; no changed pool maxima. Every recorded source hash matches both the frozen prompt snapshot and the final worktree.
- Total reported usage: 125,690 prompt tokens and 40,275 completion tokens. Median request elapsed time with four-way concurrency: 17.0 seconds.

## Main findings

- **Toll payment missed twice:** the user pays three coins, but the narrator moves on to the ledger and rope inspection. Both replies leave player Currency at 20 rather than 17.
- **New ability missed twice:** both replies charge mana and award XP for the demonstrated light technique, but neither adds Wicklight to Abilities. Its name and training context are in the preceding exchange.
- **Agreed plan missed twice:** neither reply updates Occasion from tonight’s outdoor cinema to Sunday breakfast, despite the narrator explicitly confirming the new plan.
- **Scarf transfer inconsistent:** one reply removes the worn scarf and adds it to carried items; the other ignores both changes. The action is stated in the user turn.
- **Shelter movement missed twice:** both replies leave locationChanged false when the exchange moves from Quarry Path into Quarry Shelter. Both consume the bandage and update Mira’s Condition, but leave her HP unchanged.
- **Mutual relationship agreement inconsistent:** one reply records Partner; the other retains Dating despite the explicit mutual agreement.
- Both repetitions passed the scored checks for rejected victory claims, rejected romantic claims, conditional ticket plans, ordinary rest, rumours, the rope transfer, the healing potion, and the courier rescue. Mana cost on the failed spell was correct in both runs.

These results support explicitly distinguishing the fresh user turn from already-accounted history. They also show omissions in assistant-confirmed events, so the failures cannot all be attributed to excluding user evidence. Two repetitions are a small baseline, not a reliability estimate for every possible scene.

## Scoring caveats and raw-output audit

- Three inventory failures are cardigan additions in the boundary and mutual-agreement scenes. The prose describes the cardigan, but the starting NPC clothing collection is empty. These are wardrobe backfills rather than invented garments, so the blanket noInventoryChanges expectation may be too strict. The frozen scores above are unchanged.
- One inventory failure is a redundant Ember ability update whose effect text is identical to the held definition. It is an unnecessary proposal, not a changed possession.
- The bandage scene expects an HP increase, but the narrator explicitly establishes stopped bleeding and reduced pain while the injury remains. A Condition-only update is a defensible interpretation of ordinary first aid; those two HP failures warrant reviewing the fixture policy. The two missed location flags are separate failures.
- 15/40 replies report the same field in both stats and deltas, contrary to the one-representation rule. 16/40 put JSON numbers into reading objects where the prompt asks for strings. These raw contract violations are **not included in the 298 scored checks**; production normalization can mask them.
- Other unsupported or unnecessary changes can pass because the suite scores selected consequences, not every output field. For example, the quiet ticket-plan scene gains small relationship scores in one run, and both rejected-kiss runs spend player Social Energy without an explicit fatigue effect. Passing every scored check does not certify the entire reply.
- The separate location-tree reader, NPC profiles, live review UI, and level-up reward generation are not evaluated here. This suite has no holdout split.

## Per-scene results

| Scene | Repeat 1 | Repeat 2 | Failed checks |
| --- | ---: | ---: | --- |
| dating-boundary-respected | 7/7 | 6/7 | noInventoryChanges |
| dating-coat-off | 8/8 | 6/8 | itemRemove clothing blue wool scarf; collectionHas player items blue wool scarf |
| dating-crowded-fundraiser | 7/7 | 7/7 | — |
| dating-honest-apology | 7/7 | 7/7 | — |
| dating-morning-alone | 6/6 | 6/6 | — |
| dating-mutual-agreement | 6/7 | 5/7 | noInventoryChanges; npcStatContains June Relationship partner |
| dating-quiet-promise | 7/7 | 7/7 | — |
| dating-rain-check | 5/7 | 5/7 | worldContains Occasion breakfast; worldContains Occasion Sunday |
| dating-remembered-flower | 7/7 | 7/7 | — |
| dating-unwanted-kiss | 7/7 | 7/7 | — |
| fantasy-blocked-strike | 8/8 | 8/8 | — |
| fantasy-bridge-toll | 6/7 | 6/7 | appliedPlayerValue Currency 17 |
| fantasy-companion-bandage | 8/10 | 8/10 | npcAppliedIncreased Mira HP; locationFlag yes |
| fantasy-courier-rescue | 7/7 | 7/7 | — |
| fantasy-failed-fire | 8/8 | 7/8 | noInventoryChanges |
| fantasy-first-cantrip | 6/7 | 6/7 | collectionHas player abilities Wicklight |
| fantasy-hand-over-rope | 7/7 | 7/7 | — |
| fantasy-healing-draught | 8/8 | 8/8 | — |
| fantasy-overnight-rest | 9/9 | 9/9 | — |
| fantasy-rumour-and-plan | 8/8 | 8/8 | — |

## Reproduction and artifacts

```sh
node tests/eval-gemma-tracker.js --freeze roleplay-current-20261020
node tests/eval-gemma-tracker.js --run roleplay-current-20261020 --repeats 2 --endpoints http://127.0.0.1:9931/v1 --concurrency 4
```

The commands overwrite the corresponding files; use a new label for subsequent comparisons. The saved replies are the authoritative record of this stochastic run.

[Frozen prompts, states, settings and source hashes](gemma-e4b-roleplay-current-20261020-prompts.json) · [All raw replies, normalized results and scores](gemma-e4b-roleplay-current-20261020-results.json) · [Raw contract audit](gemma-e4b-roleplay-current-20261020-audit.json)
