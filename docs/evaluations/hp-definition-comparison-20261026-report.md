# HP definition comparison, 2026-10-26

The current HP definition substantially improves this Fantasy development suite
compared with the original short production definition. HP reading checks rise from
45/80 to 75/80, and complete-reply success rises from 64/100 to 91/100. Both endpoints
show the improvement. Keep the current definition; these results do not isolate
which of the recent wording changes helped most.

## Controlled comparison

Ten Fantasy scenes, ten repetitions per definition: 200 fresh replies. Definitions
alternate order on successive repetitions. Each scene/definition has five requests
on each server, with at most four requests in flight per endpoint. Both versions
use current shared reader guidance, schema constraints, starting states and scoring,
including the accepted residual-exhaustion wording for fever. Only the HP purpose
and its copies in prompt/schema descriptions differ. This is a definition-only
comparison, not a replay of the old production configuration.

**Original**, from the retained October 20 production snapshot:

> Physical well-being. Wounds lower current HP; healing restores it. Maximum HP reflects lasting resilience.

**Current**, retained in production source:

> Physical well-being. Cuts, bruises, pain, and illness lower current HP in proportion to severity. Healing and restorative rest that ease physical pain, weakness, or stiffness raise current HP in proportion to improvement. Partial recovery remains below maximum while symptoms remain; complete recovery restores maximum. Condition describes the symptoms. Maximum HP reflects lasting resilience.

| Metric | Original definition | Current definition |
| --- | ---: | ---: |
| Checks passed | 1010/1060 (95.3%) | 1050/1060 (99.1%) |
| Replies passing every check | 64/100 (64.0%) | 91/100 (91.0%) |
| Numeric-inference checks | 74/110 (67.3%) | 104/110 (94.5%) |
| HP reading checks | 45/80 (56.3%) | 75/80 (93.8%) |
| Required injury damage | 26/40 (65.0%) | 36/40 (90.0%) |
| Required recovery | 9/30 (30.0%) | 29/30 (96.7%) |
| Optional cleaned-cut recovery, accepting unchanged HP | 10/10 | 10/10 |
| Scored inventory failures | 4 | 2 |
| Strict JSON validity | 100/100 | 100/100 |
| Independent frozen-schema validation | 100/100 | 100/100 |

The HP reading metric includes ten cleaned-cut checks allowing unchanged HP. Checks
requiring a directional HP change pass 35/70 with the original definition and 65/70
with the current one. Multiple character readings in one reply are correlated.

## Per-scene results

| Scene | Original complete replies | Current complete replies | Original HP checks | Current HP checks |
| --- | ---: | ---: | ---: | ---: |
| Uncomfortable weather need not deal damage | 10/10 | 10/10 | — | — |
| Treating a wound does not erase it | 5/10 | 7/10 | 10/10 | 10/10 |
| The companion takes the blow | 4/10 | 8/10 | 5/10 | 8/10 |
| Improving illness still leaves someone weak | 1/10 | 9/10 | 1/10 | 9/10 |
| Both travelers pay for a slip | 6/10 | 9/10 | 14/20 | 18/20 |
| Relieving pain is distinct from healing damage | 9/10 | 9/10 | — | — |
| A blocked blow can still leave a bruise | 6/10 | 10/10 | 7/10 | 10/10 |
| A short rest brings partial recovery to both travelers | 4/10 | 9/10 | 8/20 | 20/20 |
| Holding a spell takes effort without a stated cost | 9/10 | 10/10 | — | — |
| Preparing to cast is not casting | 10/10 | 10/10 | — | — |

Partial rest raises both characters' HP appropriately in all ten current-definition
replies, versus four of ten with the original. One current-definition rest reply
still awards ten player XP, so only nine pass every check. Falling-plaster damage
passes eight of ten current trials, versus five of ten with the original.

The five remaining current HP failures are omissions or unchanged readings: Mira's
falling-plaster injury twice, the player's fever recovery once, and both loose-scree
injuries in one reply. Other failures are two added dressings, one cleaned-cut
Condition description omitting the dressing, one ten-XP spell award, and the
resting XP award. All failures remain scored with the fixed rubric.

## Endpoint consistency and uncertainty

| Endpoint | Original HP checks | Current HP checks | Original complete replies | Current complete replies |
| --- | ---: | ---: | ---: | ---: |
| http://127.0.0.1:9931/v1 | 21/40 | 37/40 | 32/50 | 47/50 |
| http://127.0.0.1:8080/v1 | 24/40 | 38/40 | 32/50 | 44/50 |

The observed HP-check improvement is 37.5 percentage points. A 10,000-draw
stratified bootstrap, resampling whole replies within each scene/definition and
keeping both characters' readings together, gives a 95% interval of approximately
+23.8 to +51.3 points. This describes sampling variation on these fixed development
scenes; the scenes have been used for tuning and do not establish reliability on
unseen stories or long campaigns. The result supports the current definition over
the original short definition, not a causal claim about an individual word.

## Execution and verification

Both servers report `/mnt/D/backup_models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf`,
llama.cpp `b11860-df9beac71`, four slots, 65,536-token context per slot, temperature
1, top-k 64, top-p approximately .95, min-p 0, repetition penalty 1, and random
seeds. Endpoints: ports 9931 and 8080. No sampler overrides, retries, or thinking
changes were introduced. Concurrency is balanced across both definitions.

All 200 replies parse as strict JSON and independently validate against their frozen
schemas. No request errors, normalization errors, or normalization warnings occur.
Frozen production source hashes match. Re-normalizing all saved replies using the
current production settings without definition overrides reproduces all normalized
results, excluding only their normalization timestamps. All 925 Node tests pass.

The comparison runner is maintained as
[tests/eval-hp-definition-comparison.js](../../tests/eval-hp-definition-comparison.js).
It was moved from `.mjs` to `.js` to keep this model-inference CLI outside the
`node --test tests/*.mjs` unit-test glob. The audit preserves the exact executed
runner source and its hash; the maintained version differs only in its filename
references. For another run, copy the frozen inputs to a new label before invoking:

```sh
node tests/eval-hp-definition-comparison.js NEW-LABEL
```

The frozen input records both definition variants, endpoints, repetition count,
and scheduling. The runner refuses existing results and mismatched server settings.

- [Frozen paired prompts](gemma-e4b-hp-definition-comparison-20261026-prompts.json)
- [Raw replies, normalized states, checks and summaries](gemma-e4b-hp-definition-comparison-20261026-results.json)
- [Audit, failure counts, bootstrap method and executed runner](gemma-e4b-hp-definition-comparison-20261026-audit.json)
