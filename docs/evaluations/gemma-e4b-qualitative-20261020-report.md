# E4B qualitative roleplay comparison, 2026-10-20

Twenty new scenes, ten per System, with no numerical stat outcomes in the narrative. Each contract was evaluated three times per scene: 60 replies per contract, 120 total.

**Absolute strings substantially improve raw format compliance, but the current mixed/delta prompt scores better on inferred numeric changes in this sample.** Neither run has a JSON syntax failure. The absolute variant remains evaluation-only.

| Metric | Current mixed/delta contract | Absolute-string contract |
| --- | ---: | ---: |
| All scored checks | 588/609 (96.6%) | 580/609 (95.2%) |
| Checks excluding raw JSON validity | 528/549 (96.2%) | 520/549 (94.7%) |
| Inferred numeric change bounds (diagnostic subset) | 81/96 (84.4%) | 73/96 (76.0%) |
| Replies passing every check | 45/60 | 39/60 |
| Strict JSON validity | 60/60 | 60/60 |
| Replies recovered by production parsing | 0 | 0 |
| Replies with numeric stat literals | 16/60 parsed | 1/60 parsed |
| Replies with a reading and delta for the same stat | 34/60 | 0/60 |
| Replies containing delta keys, including empty objects | 40/60 | 0/60 |
| Request errors / normalization errors / truncations | 0 / 0 / 0 | 0 / 0 / 0 |

## Interpretation

The eight-check aggregate advantage for the current contract is entirely in the 96 authored numeric-change interval checks: 81 pass with the current prompt versus 73 with absolute strings. Outside that subset the aggregate scores tie, although individual failures differ. This diagnostic subset was calculated from the existing `playerChangeBetween` and `npcChangeBetween` checks; no new expectations were introduced after inference.

Of the interval failures, the current contract leaves a required change unchanged 11 times, versus 18 for absolute. Each has four other magnitude/range failures; absolute also increases Trust once where a decrease is required. This supports a recurring observation of retained old readings, rather than a general arithmetic failure. It does not establish that the wire representation causes that behavior.

Examples:

- **Partial quiet recovery:** the current contract raises player energy in all three quiet-company replies; absolute leaves it unchanged in two. The prose describes recovery without a number.
- **Minor companion injury:** the current contract lowers Mira's HP in all three falling-plaster replies; absolute twice keeps `12/12` while writing `"Bruised shoulder"` in Condition.
- **Partial rest for both actors:** the current contract records both HP gains once out of three; absolute never does. Both formats struggle here, so this is a shared weakness with a larger absolute miss rate in these repetitions.
- **Mixed warmth and distrust:** neither contract passes the Trust decrease in any repetition of misplaced-confidence. The current contract keeps Trust at 12 in all three; absolute keeps 12 twice and raises it to 15 once. This is not a reliable success of either format.
- **Clear magical expenditure:** all repetitions of sustained-ward and pain-easing-spell pass the expected magical expenditure checks under both contracts. Absolute's one pain-easing-spell failure instead removes the known Stillwater ability after use.

Raw stat-number violations fall from 16 affected replies to one. The remaining absolute violation uses numeric Affection, Trust and Comfort in one misplaced-confidence reply. All 120 replies parse strictly, no parser repair is needed, and both runs have zero request, normalization or truncation errors. The absolute run emits no delta-object keys or duplicate stat representations. The current run emits both readings and deltas for the same field in 34 replies; normalization gives the absolute reading precedence. This compares two prompt contracts, not a pure-delta implementation against a pure-absolute implementation.

## Scoring caveats

- The bounds are authored judgments about qualitative prose. Staying within them is useful evidence, but a failed bound is not automatically an unreasonable roleplay interpretation. Short rests or minor bruises represented only through Condition can be defensible, depending on the intended granularity of HP. Likewise, the small Comfort increase above the allowed upper bound in one boundary reply is less clear-cut than retaining full Comfort in a hostile exchange would be.
- The same-holdings check rejects an applied dressing as a new equipment item (two current replies, one absolute reply). Treating the dressing as equipment is debatable; the suite expects it to be represented through Condition. These failures are retained rather than rescored after inspection.
- Two absolute soaking replies correctly update the existing cloak's description to damp/wet, but do not change player Condition. The Condition check fails even though the weather consequence was captured elsewhere.
- Both contracts sometimes repeat the already-owned notebook or phone in an array. Production applies that shape additively, increasing the held quantity from one to two; the unchanged-holdings check therefore fails. The text does not narrate an acquisition. This is a meaningful output/application interaction, not evidence that the model necessarily imagined buying another object.
- All failures are marked critical under this suite's existing criteria, so both runs have `acceptable: false` despite their high aggregate percentages. That flag requires zero critical failures and should not be read as a calibrated production success threshold.

These caveats limit the absolute percentages and the strength of a format recommendation. The overall gap is small and based on twenty scenes, while the raw format improvement is substantial. The results do not support claiming an accuracy gain from adopting absolute strings. The next experiment should address retaining stale readings under clear qualitative changes, while preserving the option to leave ratings alone when evidence is weak. No production contract was changed.

## By System

| System | Current mixed/delta contract | Absolute-string contract |
| --- | ---: | ---: |
| fantasy | 313/321 (97.5%) | 308/321 (96.0%) |
| dating | 275/288 (95.5%) | 272/288 (94.4%) |

## Per-scene scored checks

Each cell lists the three repetitions. Original checks and ranges remain unchanged.

| Scene | Current mixed/delta contract | Absolute-string contract |
| --- | --- | --- |
| dating-q-accepted-boundary | 9/10, 9/10, 9/10 | 8/10, 9/10, 8/10 |
| dating-q-candy-before-call | 7/7, 7/7, 7/7 | 7/7, 7/7, 7/7 |
| dating-q-closing-shift | 9/9, 9/9, 9/9 | 8/9, 9/9, 8/9 |
| dating-q-kept-confidence | 9/9, 9/9, 9/9 | 9/9, 9/9, 9/9 |
| dating-q-misplaced-confidence | 8/9, 8/9, 7/9 | 8/9, 7/9, 7/9 |
| dating-q-ordinary-pause | 11/11, 11/11, 11/11 | 11/11, 11/11, 11/11 |
| dating-q-passing-joke | 10/10, 9/10, 10/10 | 10/10, 10/10, 10/10 |
| dating-q-pressure-lifted | 11/11, 11/11, 11/11 | 11/11, 11/11, 11/11 |
| dating-q-quiet-company | 10/10, 10/10, 9/10 | 9/10, 8/10, 10/10 |
| dating-q-unwelcome-notification | 10/10, 9/10, 7/10 | 10/10, 10/10, 9/10 |
| fantasy-q-brief-soaking | 11/11, 11/11, 11/11 | 11/11, 10/11, 10/11 |
| fantasy-q-cleaned-cut | 10/11, 11/11, 10/11 | 10/11, 11/11, 11/11 |
| fantasy-q-falling-plaster | 11/11, 11/11, 11/11 | 10/11, 11/11, 10/11 |
| fantasy-q-fever-easing | 11/11, 11/11, 11/11 | 10/11, 11/11, 11/11 |
| fantasy-q-loose-scree | 10/10, 8/10, 10/10 | 10/10, 10/10, 10/10 |
| fantasy-q-pain-easing-spell | 11/11, 11/11, 11/11 | 11/11, 11/11, 10/11 |
| fantasy-q-practice-impact | 11/11, 11/11, 11/11 | 11/11, 11/11, 11/11 |
| fantasy-q-sheltered-breather | 9/11, 11/11, 9/11 | 9/11, 9/11, 9/11 |
| fantasy-q-sustained-ward | 10/10, 10/10, 10/10 | 10/10, 10/10, 10/10 |
| fantasy-q-unspent-threat | 10/10, 10/10, 10/10 | 10/10, 10/10, 10/10 |

## Failed checks

### deltas

- sameHoldings : 4 replies
- npcChangeBetween Sam Trust -6 -1: 3 replies
- npcChangeBetween June Comfort -1 1: 2 replies
- playerChangeBetween HP 1 3: 2 replies
- npcChangeBetween Mira HP 1 3: 2 replies
- playerChangeBetween Social Energy -4 -1: 1 replies
- npcChangeBetween Sam Trust -1 0: 1 replies
- playerChangeBetween Social Energy -1 0: 1 replies
- npcChangeBetween June Comfort 1 8: 1 replies
- npcUnchanged June Trust: 1 replies
- npcStatMatches June Mood anx|tense|unsett|worri|uneas|alarm|stress: 1 replies
- playerChangeBetween HP -4 -1: 1 replies
- npcChangeBetween Mira HP -4 -1: 1 replies

### absolute

- sameHoldings : 4 replies
- playerChangeBetween HP 1 3: 4 replies
- npcChangeBetween Sam Trust -6 -1: 3 replies
- npcChangeBetween Mira HP 1 3: 3 replies
- npcChangeBetween Sam Comfort 0 4: 2 replies
- playerChangeBetween Social Energy -4 -1: 2 replies
- playerChangeBetween Social Energy 1 4: 2 replies
- playerStatMatches Condition wet|damp|chill|cold: 2 replies
- npcChangeBetween Mira HP -4 -1: 2 replies
- npcChangeBetween Sam Trust -1 0: 1 replies
- npcChangeBetween Sam Affection 1 7: 1 replies
- playerChangeBetween Social Energy -5 -1: 1 replies
- npcChangeBetween June Comfort 1 8: 1 replies
- npcChangeBetween June Comfort -1 1: 1 replies

## Method and limits

- Same reviewed scenes, starting states, scoring, production system message, and local E4B model for both contracts. The reader-specific contract, examples, and normalization mode are the intentional differences. All frozen source hashes match the run and report-time worktree.
- The delta run precedes the absolute run. Each uses four concurrent requests at port 9931, no schema constraint, and the frozen token limit. Sampling uses server defaults without a fixed seed; three repetitions of each scene are a small stochastic sample. Server sampling defaults and actual model paths are saved with the results.
- Production parsing and normalization determine state checks. Raw JSON validity remains a separate scored check. Scalar JSON numbers tolerated by normalization are still counted separately as raw type violations; collection quantities are excluded from that audit.
- Inferred magnitudes use authored bounds, including zero for some ambiguous events. These bounds are evaluation judgments, not unique ground truth. Strict non-numeric checks, duplicated inventory after application, and conflicting scene interpretations may contribute failures. No post-inference changes were made to fixtures, checks, prompts, or recovery code.
- The suite covers both Systems but deliberately focuses on qualitative evidence within a location; it is not an estimate over all production roleplay. No production prompt or reader contract was changed by this benchmark.
- This is a reader harness with host-boundary stubs, not full UI/request integration. The historical split name `originalHoldout` contains this new set because all scenes were marked holdout before inference; the label does not refer to the original twenty scenes.

## Artifacts and reproduction

- deltas: [frozen inputs](gemma-e4b-qualitative-deltas-20261020-prompts.json), [raw replies and scores](gemma-e4b-qualitative-deltas-20261020-results.json).
- absolute: [frozen inputs](gemma-e4b-qualitative-absolute-20261020-prompts.json), [raw replies and scores](gemma-e4b-qualitative-absolute-20261020-results.json).
- [Raw-output audit and comparison](gemma-e4b-qualitative-comparison-20261020.json).
- [Scene coverage and scoring notes](../../tests/fixtures/roleplay/qualitative/README.md).

```sh
node tests/eval-gemma-tracker.js --run qualitative-deltas-20261020 --repeats 3 --endpoints http://127.0.0.1:9931/v1 --concurrency 4
node tests/eval-gemma-tracker.js --run qualitative-absolute-20261020 --repeats 3 --endpoints http://127.0.0.1:9931/v1 --concurrency 4
```

Use fresh labels and freeze inputs again before rerunning to preserve these artifacts.
