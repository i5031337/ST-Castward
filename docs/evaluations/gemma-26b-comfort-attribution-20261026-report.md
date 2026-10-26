# Gemma 26B: Comfort attribution repeat, 2026-10-26

Gemma 4 26B-A4B correctly separates June's distress about her housemate from her
Comfort with the player in all ten replies. The identical frozen scene and current
purpose passed Comfort in only five of ten E4B replies. This supports a model
capability contribution to the recurring attribution error, rather than further
expansion of the already explicit definition. It is evidence on one development
scene, not proof of an intrinsic capability boundary or a full Dating evaluation.

| Metric | E4B, previous exact-input repeat | Gemma 26B, fresh repeat |
| --- | ---: | ---: |
| Comfort checks passed | 5/10 | 10/10 |
| Trust checks passed | 8/10 | 9/10 |
| Mood checks passed | 9/10 | 10/10 |
| Replies passing every check | 4/10 | 9/10 |
| Total checks passed | 92/100 | 99/100 |
| Independent frozen-schema validity | 10/10 | 10/10 |

Nine 26B replies retain Comfort 28. One increases it to 30, within the accepted
-1 through +5 interval. All ten report an anxious, tense or stressed Mood. The one
failed reply raises Trust from 18 to 21, while its Comfort reading passes. No
scoring changes were made after inference.

## Controls and limits

The 26B run copies the exact E4B focused bundle: same messages, state, schema,
field purposes and rubric. The Comfort definition refers to ease and safety with
the player, and the accepted Mood regex includes `Strained`. Source fingerprints
match the current working tree.

The server at port 9931 reports
`/mnt/D/backup_models/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf`, llama.cpp
`b11860-df9beac71`, four slots, temperature 1, top-k 64, top-p approximately .95,
min-p 0, repetition penalty 1 and random seeds. The build and sampler defaults
match E4B. No retries or thinking overrides were added.

26B has 32,768 context tokens per slot; E4B had 65,536. The largest 26B request uses
3,580 total tokens, so the scene fits both limits. E4B's ten replies were split
between two servers; this requested 26B repeat uses port 9931 alone, with at most
four concurrent requests. Runs are sequential and unseeded, not bitwise-controlled
executions. No global deterministic behavior is claimed.

All ten 26B reply bodies parse as JSON and independently validate against the
original frozen schema. No request errors, normalization exceptions, or warnings
occur. This comparison required no production or scoring edits; the preceding
full Node verification passed all 927 tests. The evaluator's strict acceptance
flag remains false solely because of the single Trust failure.

The artifact prefix `gemma-e4b` is the evaluator's existing filename convention;
the saved model/server metadata identifies the actual 26B model.

- [Exact frozen input](gemma-e4b-26b-comfort-attribution-20261026-prompts.json)
- [Raw 26B replies, normalized states and scores](gemma-e4b-26b-comfort-attribution-20261026-results.json)
- [Audit, controls and both models' readings](gemma-e4b-26b-comfort-attribution-20261026-audit.json)
- Prior E4B repeat: [frozen input](gemma-e4b-dating-comfort-attribution-focus-20261026-prompts.json)
  and [raw replies, states and scores](gemma-e4b-dating-comfort-attribution-focus-20261026-results.json).

Intermediate preparation snapshots and tuning reports were removed during cleanup.
The E4B snapshot's original `subsetOf` names its removed preparation snapshot;
the retained final Dating input contains the identical scene bundle. The frozen
inputs and original inference results were preserved without rewriting them.
