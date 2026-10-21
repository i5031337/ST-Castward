# Fresh player evidence: tracker change and E4B comparison

The reader now considers the fresh player turn together with the assistant reply. On identical corrected fixtures, the old prompt passed **282/298 checks (94.6%)** and the new prompt passed **286/298 (96.0%)**. Replies passing every scored check increased from **26/40 to 29/40**. This is a modest observed improvement in a small stochastic comparison; both runs still fail the benchmark’s zero-critical-failures acceptance rule.

## Implementation

- The prompt has separate sections for already-accounted history, the fresh player turn, and the latest assistant reply.
- Completed player actions left standing by the reply may count without being repeated. Intentions, hypotheticals, attempts and out-of-character instructions provide context; the assistant resolves contested outcomes and overrides claims it blocks or changes. Repeated descriptions count once.
- The fresh player turn is retained in full even when Messages Of Lead-Up is zero. Consecutive player messages belong to the same fresh turn. System notes and image-only messages are skipped. An earlier assistant prose reply closes that turn, preventing its user action from being replayed on a continuation.
- Offstage-character lookups also see names in the fresh user input. Extraction still waits for the assistant response; no state is applied directly on receipt of a user message.
- Updated the context-setting help text. Inline story-block instructions and built-in System field definitions are unchanged; this change targets the separate background reader.

## Benchmark corrections

- Occasion is checked as the present occasion. The starting rain-check occasion is the café meeting, and Sunday breakfast must not be stored as its replacement.
- Existing NPC outfits are seeded in starting state. Holding checks compare applied item identities/counts, so repeating an outfit or an unchanged ability description is not an acquisition or loss. These checks do not claim to validate every descriptive attribute.
- Ordinary bandaging may improve Mira’s Condition while leaving HP unchanged; she must remain below full capacity.
- The original raw replies were rescored without new inference. Their score rises from 279/298 to 289/298 solely from corrections. That retrospective score is not an improvement in model behavior.
- Because clothing seeds and the initial Occasion also change model input, a fresh old-prompt baseline was run before the production prompt was changed. That baseline and the new-prompt run have identical scenes, states, settings, schemas and scoring checks.

| Stage | Passed checks | Check rate | Replies passing every check |
| --- | ---: | ---: | ---: |
| Original fixtures and original run | 279/298 | 93.6% | 27/40 |
| Original replies, corrected expectations (retrospective) | 289/298 | 97.0% | 32/40 |
| Corrected fixtures, old prompt (fresh run) | 282/298 | 94.6% | 26/40 |
| Corrected fixtures, fresh-player prompt (fresh run) | 286/298 | 96.0% | 29/40 |

## Same-fixture comparison

| System | Old prompt | New prompt |
| --- | ---: | ---: |
| Fantasy Adventure | 148/158 (93.7%) | 151/158 (95.6%) |
| Dating Sim | 134/140 (95.7%) | 135/140 (96.4%) |

- **Toll payment:** the old prompt misses the three-coin expense twice; the new prompt applies it correctly twice.
- **Scarf:** both prompts still miss adding the removed scarf to carried items in one repetition, despite correctly removing it from worn clothing.
- **Bandage:** both new replies consume one bandage and record improved Condition, while both still miss the move into Quarry Shelter.
- **Wicklight:** the old prompt records the learned ability once; the new prompt misses it twice. Naming and recording demonstrated abilities remains unreliable.
- **Courier rescue:** the old prompt misses XP twice; the new prompt awards XP twice but wrongly gives the courier’s satchel to the player in both runs. This is an owner-attribution error, not an improvement for the whole scene.
- **Other remaining mistakes:** one new reply stores future Sunday breakfast as Occasion, one omits the recipient’s sunflower, and one removes the reusable Ember spell after a failed cast.
- Both new runs of the rejected victory, overnight recovery, conditional-ticket and rumour scenes pass their scored checks.

## Limits and interpretation

- Each prompt was sampled only twice per scene, at server temperature 1.0 with random seeds. There is no held-out set. Do not treat the 1.3 percentage-point difference as a statistically established reliability gain.
- Exact field checks can still be stricter than semantic correctness. In the rejected-kiss scene, the old run’s “Strained Friends” and the new run’s “Strained” both lose the exact-Friends check, even though neither accepts the player’s romantic claim. One old apology reply also loses an unchanged-Trust check by lowering Trust from 4 to 3; that is a defensible reaction. These remaining checks were held fixed across the comparison.
- The new future-Occasion error remains visible. The existing built-in purpose text still says “Current event or planned date”; it was held fixed to isolate the evidence change.
- Aggregate checks cover selected consequences, not every proposed field. Parseable JSON and production normalization can conceal raw output-contract violations. Duplicate readings/deltas and JSON numbers in reading objects are counted separately below.
- The reader receives four authored prior messages plus the final player turn in the benchmark. That is more context than the runtime default. This is an isolated reader harness, not a full live request through SillyTavern or the separate location-tree reader.

| Raw-output diagnostic (not in the 298 checks) | Old prompt | New prompt |
| --- | ---: | ---: |
| Replies using both a reading and delta for the same field | 20/40 | 20/40 |
| Replies putting JSON numbers into string reading objects | 15/40 | 17/40 |

## Validation and run settings

- All 42 focused Node tests pass, including fresh-user separation, full current-turn text at zero context, continuations, consecutive user messages, system/image boundaries, opening replies, and revised scoring expectations.
- The running SillyTavern page passed `python3 tests/ui-reader-evidence.py` in headless Firefox: zero-context inclusion, resolution/deduplication instructions and continuation boundaries. The fixture restored chat in memory and made no model requests or saves.
- Both fresh runs: E4B on port 9931, 20 scenes × 2 repeats, four concurrent requests, server defaults, no schema constraint, maximum 2400 reply tokens. All 80 replies parsed and finished normally; no request/normalization errors or changed pool maxima.
- Source hashes match each run’s frozen prompt snapshot. The new snapshot also matches the final source worktree. Old source hashes were verified before applying the production change. Raw replies are retained without retries or discarded samples.

## Per-scene scored checks

| Scene | Old prompt (two runs) | New prompt (two runs) |
| --- | ---: | ---: |
| dating-boundary-respected | 6/7, 7/7 | 7/7, 7/7 |
| dating-coat-off | 7/8, 8/8 | 8/8, 7/8 |
| dating-crowded-fundraiser | 7/7, 7/7 | 7/7, 7/7 |
| dating-honest-apology | 6/7, 7/7 | 7/7, 7/7 |
| dating-morning-alone | 6/6, 6/6 | 6/6, 6/6 |
| dating-mutual-agreement | 7/7, 7/7 | 7/7, 7/7 |
| dating-quiet-promise | 7/7, 7/7 | 7/7, 7/7 |
| dating-rain-check | 7/7, 7/7 | 5/7, 7/7 |
| dating-remembered-flower | 5/7, 7/7 | 6/7, 7/7 |
| dating-unwanted-kiss | 6/7, 7/7 | 6/7, 7/7 |
| fantasy-blocked-strike | 7/8, 8/8 | 8/8, 8/8 |
| fantasy-bridge-toll | 6/7, 6/7 | 7/7, 7/7 |
| fantasy-companion-bandage | 8/10, 9/10 | 9/10, 9/10 |
| fantasy-courier-rescue | 6/7, 6/7 | 6/7, 6/7 |
| fantasy-failed-fire | 8/8, 8/8 | 8/8, 7/8 |
| fantasy-first-cantrip | 6/7, 7/7 | 6/7, 6/7 |
| fantasy-hand-over-rope | 7/7, 7/7 | 7/7, 7/7 |
| fantasy-healing-draught | 8/8, 8/8 | 8/8, 8/8 |
| fantasy-overnight-rest | 9/9, 8/9 | 9/9, 9/9 |
| fantasy-rumour-and-plan | 8/8, 8/8 | 8/8, 8/8 |

## Saved artifacts

- Original run: [prompts and state](gemma-e4b-roleplay-current-20261020-prompts.json), [replies and scores](gemma-e4b-roleplay-current-20261020-results.json).
- Retrospective rescore: [prompts and state](gemma-e4b-roleplay-current-rescored-20261020-prompts.json), [replies and scores](gemma-e4b-roleplay-current-rescored-20261020-results.json).
- Corrected-input old-prompt baseline: [prompts and state](gemma-e4b-roleplay-corrected-baseline-20261020-prompts.json), [replies and scores](gemma-e4b-roleplay-corrected-baseline-20261020-results.json).
- Fresh-player prompt: [prompts and state](gemma-e4b-roleplay-user-turn-20261020-prompts.json), [replies and scores](gemma-e4b-roleplay-user-turn-20261020-results.json).

[Comparison data and raw contract audit](gemma-e4b-roleplay-user-turn-20261020-comparison.json)
