# Contextual roleplay benchmark

Twenty independent scenes: ten Fantasy Adventure and ten Dating Sim. These are the default scenes for `tests/eval-gemma-tracker.js`. The old synthetic suite remains available with `--minimal`; focused natural-prose and location suites keep their existing flags.

A separate [qualitative comparison set](qualitative/README.md) adds twenty more scenes without numerical stat outcomes. Select it with `--qualitative`; the default remains the original twenty. The new set covers inferred changes, mixed outcomes, and reasonable non-changes, with bounded rather than exact scoring for inferred magnitudes.

Each JSON contains two preceding user/assistant exchanges, the latest user turn (`user`), its resolved Narrator reply (`text`), a starting state, and scoring checks. **The starting state is immediately before the latest user turn.** History is already accounted for; the final user turn is fresh evidence to interpret alongside the reply. These are independent examples, not consecutive chapters in one campaign.

The replies were generated through Gemma 31B on port 9931 using `examples/narrator.json`, with authored scene directions, then reviewed for continuity and clear evidence. Generation metadata records the actual model, sampling parameters and Narrator hash. Edited replies retain their original model output under `review.originalText`. Authoring directions, checks and metadata are excluded from the tracker request.

Checks use exact amounts for explicit costs and transfers, and directional/partial-recovery checks for effects with no stated amount. Holding checks compare item identities and counts after application, so a repeated outfit or an unchanged ability description is not an acquisition. Already-worn NPC clothing is seeded in the starting state. Ordinary first aid may improve Condition without increasing HP. Occasion describes the present event, not an agreement to meet in the future. They cover costs paid on failure, rejected player claims, user-only actions, repeated evidence, worn versus carried clothes, mutual relationship agreement, and absent characters mentioned in context. Location checks use the current reader's boolean `locationChanged` contract. This suite does not evaluate the separate location-tree reader.

The production reader now separates the fresh player turn from accounted history and reads it with the assistant reply. The reply resolves contested outcomes; completed player actions left standing can count without being repeated. Events described in both turns count once. The original baseline snapshot retains the old wording that labeled the final user turn as accounted history.

Runtime collection always includes the fresh player turn, even with Messages Of Lead-Up set to zero. Older user turns remain context after an assistant response has resolved them. The benchmark supplies all four authored prior messages, which is more context than the runtime default of two preceding messages.

## Running

```sh
# Validate fixture loading, normalization and scoring without an LLM request.
node --test tests/reader-user-evidence.mjs tests/gemma-roleplay-evaluation.mjs tests/gemma-evaluation.mjs tests/gemma-absolute-contract.mjs

# Freeze the current production tracker prompts and all twenty scenes.
node tests/eval-gemma-tracker.js --freeze roleplay-baseline

# Select the actual tracker model endpoint explicitly. This URL is an example.
node tests/eval-gemma-tracker.js --run roleplay-baseline --repeats 2 --endpoints http://127.0.0.1:8080/v1
```

The existing evaluator retains its historical `gemma-e4b-` output filenames; the results record the actual evaluated model. Port 9931 served the 31B model during authoring and E4B during the baseline run; filenames alone do not identify the model.

[Original E4B baseline, 2026-10-20](../../../docs/evaluations/gemma-e4b-roleplay-current-20261020-report.md): 279/298 checks passed (93.6%), with 27/40 replies passing every scored check. See the report for raw-output violations and fixture caveats.

[Corrected baseline and fresh-player comparison](../../../docs/evaluations/gemma-e4b-roleplay-user-turn-20261020-report.md): the corrected old-prompt run passed 282/298 checks (94.6%); the fresh-player prompt passed 286/298 (96.0%). The report separates retrospective rescoring from new inference and lists remaining errors.

`node tests/generate-roleplay-scenes.js` authors missing replies using the local model. `--overwrite` replaces reviewed replies and clears their review record; regenerate intentionally, then review prose and expectations again. Normal tests and evaluation runs always use the saved replies.

## Fantasy Adventure

| Scene | Main evidence being tested |
| --- | --- |
| [A declared victory that does not happen](fantasy-blocked-strike.json) | Adjudicate Alex's claim as an unsuccessful attempt: Rowan turns the strike aside, retains his badge, and stops the lesson to explain the mistake |
| [A coin paid without a second accounting](fantasy-bridge-toll.json) | Rowan acknowledges the payment indirectly by marking his ledger and begins checking the rope |
| [The companion is the injured recipient](fantasy-companion-bandage.json) | The bandaging stops Mira's bleeding and eases her pain, but she remains injured and only partly recovered |
| [Success costs something](fantasy-courier-rescue.json) | Resolve a successful rescue with a painful shallow shoulder scrape |
| [Magic spent on a lock that holds](fantasy-failed-fire.json) | Ember is cast, consuming the established three mana, but the ward disperses its heat and the lock stays shut |
| [A demonstrated technique survives a failed goal](fantasy-first-cantrip.json) | Alex successfully learns and demonstrates a steady Wicklight, but the inscription is too eroded to decipher |
| [One coil changes hands once](fantasy-hand-over-rope.json) | Mira accepts the coil and keeps it in her hands, checking the fibers and deciding how to secure it |
| [An empty bottle and an incomplete recovery](fantasy-healing-draught.json) | Resolve drinking the draught successfully |
| [A safe night is recovery, not an accomplishment](fantasy-overnight-rest.json) | Advance through an uninterrupted full night to morning |
| [Tomorrow is not a journey already made](fantasy-rumour-and-plan.json) | Continue a low-key conversation about the unreliable rumour while both remain at the table |

## Dating Sim

| Scene | Main evidence being tested |
| --- | --- |
| [A declined photograph and a respected boundary](dating-boundary-respected.json) | June notices Alex respecting her request, relaxes visibly, and thanks Alex |
| [Worn clothing and carried clothing are different](dating-coat-off.json) | June clears a chair and explains the game while Alex stays just inside |
| [A good evening can still be exhausting](dating-crowded-fundraiser.json) | Finish the shift at the same table; Alex is visibly socially drained after the sustained crowd, but not unconscious |
| [Trust is not repaired by declaring it repaired](dating-honest-apology.json) | Sam acknowledges the apology but explicitly remains hurt and not ready to trust Alex again |
| [Recovery does not bring an absent friend onstage](dating-morning-alone.json) | Advance through uninterrupted restful sleep to Sunday morning, with Alex fully refreshed |
| [A relationship label supported by both people](dating-mutual-agreement.json) | June warmly acknowledges their explicit mutual agreement to be romantic partners and stays beside Alex on the bench |
| [An intention is not a present](dating-quiet-promise.json) | Keep a warm but neutral planning conversation unresolved |
| [A real invitation can end with a different plan](dating-rain-check.json) | June explicitly agrees to Sunday breakfast at Moonbeam Café, replacing tonight's outdoor cinema plan |
| [A small gift without a relationship promotion](dating-remembered-flower.json) | June accepts and keeps one sunflower, clearly touched by Alex remembering her preference |
| [Player narration cannot declare mutual consent](dating-unwanted-kiss.json) | Treat the claimed kiss and mutual love as an attempted action |

## Absolute readings

Absolute string readings are now the production contract for both the reader and inline tracker. The following labels and reports record the earlier experiment. New freezes use the current production contract by default; `--absolute` remains an optional alias. Earlier mixed/delta snapshots are read-only historical artifacts.

```sh
node tests/eval-gemma-tracker.js --freeze roleplay-absolute-readings-20261020 --absolute
node tests/eval-gemma-tracker.js --run roleplay-absolute-readings-20261020 --repeats 2 --endpoints http://127.0.0.1:9931/v1 --concurrency 4
```

`--xp-threshold` selects a separate full-rescue scene with starting XP at 99/100. The saved explicit-award probe appends a 20-XP reward to verify totals above the threshold. These probes are not mixed into the twenty-scene scores.

[Absolute-readings results and raw-output audit](../../../docs/evaluations/gemma-e4b-roleplay-absolute-readings-20261020-report.md): number/string violations fell from 17/40 to 5/39 parseable replies; competing readings/deltas disappeared. All-attempt checks were 94.0% versus 96.0% for the saved control, with one malformed JSON reply. Both explicit XP probes returned 119/100 and progressed correctly.
