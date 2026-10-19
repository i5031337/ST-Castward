# Gemma 4 E4B place-tree evaluation

On 2026-10-18, two focused scenarios tested the location reader with the shipped
Fantasy Adventure and Dating Sim Systems. The Fantasy scene explicitly places a new
inn inside a new town. The Dating scene moves from a saved café to a new theater
with no established parent. Each scenario began with the System's saved home place
as an existing root and was run twice against the local Gemma 4 E4B endpoint.

The final [frozen prompts](gemma-e4b-location-tree-clear-evidence-prompts.json) and
[raw results](gemma-e4b-location-tree-clear-evidence-results.json) scored **24/24
checks**. In both Fantasy runs, the reader proposed the new town as a root, the inn
inside it, and the inn as current. In both Dating runs, it proposed exactly one new
root, the theater, and made it current. Checks use validated proposal rows, so an
unsupported or misquoted parent does not count as a correct link.

An initial Fantasy wording scored 3/7 on its first run and 7/7 on its second. In
the miss, Gemma proposed the right town and parent reference but paraphrased the
town's evidence quote. The evidence validator rejected that parent, leaving the
inn as a root. We revised the scene to put the arrival in its own complete sentence
and froze a new prompt pair. The initial run remains a useful example of model
variability; the final score is not an independent estimate of reliability across
arbitrary prose.

The runner uses production prompts, parsing, place proposals, and review validation
with in-memory state. It does not exercise live SillyTavern event scheduling, review
clicks, or saved-chat reloads.

## Narrative prose follow-up

The same two relationships were tested with two-paragraph narrative passages. The
[prose prompts](gemma-e4b-location-tree-prose-prompts.json) and
[prose results](gemma-e4b-location-tree-prose-results.json) scored **20/24** over
two runs per scene. Dating's independent theater root passed both runs (10/10).
Fantasy's new town and nested inn passed once (7/7) and missed once (3/7). In the
miss, Gemma created the inn and referenced Brackenport as its parent, but omitted
a place proposal for Brackenport itself. The validator therefore left the inn proposal as
a root and did not invent the missing town. In the passing Fantasy run, Gemma also
suggested an unsupported Coastal Road parent for Brackenport; the validator
discarded that link and kept Brackenport at the root.

This is a real model limitation in this small sample: a natural passage can
produce an incomplete hierarchy even when the containment is stated in the story.
The result does not establish a general failure rate. The saved review step remains
important for place relationships.

## Follow-up with mixed turns and evidence quotes

The mixed-turn cases add an injury, an item pickup, and an NPC to Fantasy; Dating
adds a gift, relationship change, energy loss, and NPC presence. The final
[mixed-turn prompts](gemma-e4b-location-tree-mixed-final-v2-prompts.json) and
[results](gemma-e4b-location-tree-mixed-final-v2-results.json) scored **38/42**
across two runs per scene. All non-place checks passed in those four runs. One
Fantasy run proposed Brackenport and nested the inn correctly; the other proposed
only the inn and lost four linked place checks. Dating passed both runs. These
results show that mixed changes can be reported together, but the parent hierarchy
remains unreliable in this prose.

We tried a focused prompt instruction to include new named parents, match refs,
and keep routes out of containment. It did not produce consistent improvement:
some runs still omitted Brackenport or created incidental roads and gates. The
experimental instruction was removed. The ordinary reader prompt now omits the
unlikely "at most 40 places" instruction; the parser retains its cap. The parser
also resolves case-only differences in a parent or current ref when the match is
unique, while ambiguous refs remain unresolved.

The [evidence A/B artifact](gemma-e4b-location-evidence-ab.json) repeats the two
mixed stories three times per variant, comparing normal location quote requests
with a prompt that omits them. Raw place choices scored **18/30** with quotes and
**22/30** without. Fantasy varied sharply under both prompts; Dating's root
passed all but one raw check. This small stochastic sample does not establish a
reliable gain from removing quotes. In the other saved trials, most failures came
from missing or wrong place choices, while a few otherwise plausible proposals
were rejected for missing or paraphrased evidence. The location reader now omits
citation fields and accepts uncited place proposals, following the decision to
request citations only with clear evidence that they help. These saved prompts and
results document the older contract; the A/B runner replays those frozen prompts.

## Reader after removing citations

One fresh mixed-turn run with the [uncited production prompts](gemma-e4b-location-tree-no-citations-prompts.json)
and [results](gemma-e4b-location-tree-no-citations-results.json) scored **14/21**.
Dating passed 10/10. Fantasy passed 4/11: Gemma placed its `locations` object
inside `global`, omitted Brackenport, and missed the HP decrease. The response
finished normally and contained no location citations. This single run verifies
the new prompt and parser path, while illustrating the accepted variability of
the minimum recommended model. It is not evidence of a rate change from the
earlier quoted runs.

To repeat either suite with the local model ready:

```bash
node tests/eval-gemma-tracker.js --freeze another-location-tree --location-tree
node tests/eval-gemma-tracker.js --run another-location-tree --repeats 2
node tests/eval-gemma-tracker.js --freeze another-location-tree-prose --location-tree-prose
node tests/eval-gemma-tracker.js --run another-location-tree-prose --repeats 2
node tests/eval-gemma-tracker.js --freeze another-location-tree-mixed --location-tree-mixed
node tests/eval-gemma-tracker.js --run another-location-tree-mixed --repeats 2
node tests/eval-gemma-location-evidence.js
```
