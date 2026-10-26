# Final Dating Sim tracker evaluation, 2026-10-26

Gemma 4 E4B remains Castward's minimum local-reader target. With the final Dating
configuration it passes 947/960 checks (98.6%), with every check passing in 87/100
replies (87.0%). Numeric changes inferred from prose pass 211/220 checks (95.9%).
These measures belong together: check accuracy is not complete-reply reliability.
This fresh run is retained as requested, without selecting a better development run.

## Final results

| Metric | Result |
| --- | ---: |
| Checks passed | 947/960 (98.6%) |
| Replies passing every check | 87/100 (87.0%) |
| Numeric-inference checks | 211/220 (95.9%) |
| Raw JSON validity | 100/100 |
| Independent validation against frozen schema | 100/100 |
| Scored holdings failures | 3 |
| Request or normalization errors | 0 |

| Scene | Checks passed | Complete replies | Failed checks, occurrences out of ten |
| --- | ---: | ---: | --- |
| Respecting space need not immediately earn trust | 99/100 | 9/10 | sameHoldings: 1/10 |
| A small completed user action survives an unrelated reply | 69/70 | 9/10 | npcAbsent Sam: 1/10 |
| Being appreciated does not prevent exhaustion | 86/90 | 6/10 | playerChangeBetween Social Energy -5 -1: 4/10 |
| A concrete act can earn trust at an emotional cost | 90/90 | 10/10 | None |
| A friendly laugh does not repair a breach of confidence | 90/90 | 10/10 | None |
| An ordinary pause is not evidence of rejection | 110/110 | 10/10 | None |
| A pleasant moment can remain a small moment | 100/100 | 10/10 | None |
| Relief can restore some energy before any outing happens | 110/110 | 10/10 | None |
| Resting together can restore energy without romance | 96/100 | 6/10 | sameHoldings: 2/10; playerChangeBetween Social Energy 1 5: 1/10; npcChangeBetween June Comfort 1 15: 1/10 |
| Outside anxiety need not change comfort with a friend | 97/100 | 7/10 | Comfort decrease beyond tolerance: 3/10 |

Only closing-shift energy fails more than three times in ten: three replies leave
it at `8/10` and one raises it to `9/10`. The preceding ten-of-ten success was not
reproduced, so omission of social fatigue remains a reliability limit.

Unwelcome-notification Comfort decreases beyond tolerance in three replies, from
28 to 26 twice and 25 once. This is the recurring attribution error: anxiety about
the former housemate spills into feelings toward the player. All ten Trust readings
pass. Subsequent review accepts `Upset` and `Agitated` as equivalent descriptions
of June's distress. Adding those two words to the Mood grading removes two failed
checks and rescues one complete reply. The headline results use that approved
rescoring; the original inference remains 945/960 and 86/100, preserved unchanged
in the raw result artifact. The `Upset` reply still fails Comfort; the `Agitated`
reply now passes every check. No inference rerun was required.

Other failures: an already-held phone is added once; quiet-company adds a cardigan
or book twice, misses energy recovery once and Comfort improvement once; Sam is
incorrectly listed as present in one candy-before-call reply. Five normalization
warnings in another passing candy reply skip stat readings for unknown offstage
Sam. Confirming that unknown character is offstage is not penalized.

## Final definitions and scoring

Dating player stats contain Social Energy only; Mood remains NPC-only. The preset
player HUD selects Energy and the NPC HUD retains Mood. Social activity, high-stakes
conversation and effortful self-restraint drain energy; rest and relief replenish
it as willingness to interact returns. Comfort measures ease and safety with the
player, distinguishing reassuring companionship and player-caused unease from Mood
reactions to the wider situation.

Clothing contains descriptive garment names and tracks garments being worn. It
initializes from established outfits and changes as garments are put on or taken
off. Shared reader and inline guidance matches mentioned possessions to recorded
owner entries before proposing changes. Saved custom Systems are not rewritten.

Scoring retains broad plausibility ranges: accepted-boundary Comfort gains up to
ten; misplaced-confidence Trust changes -6 through +2; quiet-company Comfort gains
1–15 and energy gains 1–5 below capacity. Unwelcome-notification Comfort may change
-1 through +5, while Trust remains unchanged; `Strained`, `Upset` and `Agitated` are accepted as Mood.
No definitions, narratives, scoring or sampling settings changed during inference.
The frozen inputs match the previously prepared final Comfort-attribution snapshot.
The two-word grading correction was approved after inference and is recorded
separately with grading-source hashes and per-reply checks.

## Model comparison and accepted Fantasy evidence

The [exact-scene 26B repeat](gemma-26b-comfort-attribution-20261026-report.md) passes
Comfort in 10/10 replies and every check in 9/10 with the same current scene,
prompts, schema and scoring. E4B passes Comfort in 5/10 in its focused run and 7/10
in this final full run. This supports a model-capability contribution to the
attribution error. It does not establish a hard minimum capability boundary or
compare the models across the full Dating suite. E4B is the accessibility target,
not an established best-results recommendation.

The accepted [Fantasy definition comparison](hp-definition-comparison-20261026-report.md)
retains 100 current-HP replies: 1050/1060 checks (99.1%), 91/100 complete replies and
104/110 numeric checks (94.5%). It demonstrated improvement over the original short
HP definition. That Fantasy run preceded the final shared inventory-matching prompt
sentence; it is an accepted historical reference, not a Fantasy rerun of this exact
final source snapshot. The results are not pooled into one current-configuration
score. The current HP definition remains unchanged.

## Method, endpoint counts and verification

Ten fixed Dating scenes, ten repetitions per scene: 100 fresh replies. Each scene
has five trials per endpoint, at most four concurrent requests per server. Both
ports 9931 and 8080 report `/mnt/D/backup_models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf`,
llama.cpp `b11860-df9beac71`, four slots and a 65,536-token context per slot. Sampler
defaults: temperature 1, top-k 64, top-p approximately .95, min-p 0, repetition
penalty 1, random seeds. No retries or thinking override. The two configurations
match. This final run was not cherry-picked from alternatives.

| Endpoint | Checks passed | Complete replies | Numeric checks |
| --- | ---: | ---: | ---: |
| http://127.0.0.1:8080/v1 | 474/480 | 44/50 | 105/110 |
| http://127.0.0.1:9931/v1 | 473/480 | 43/50 | 106/110 |

Python jsonschema independently validates all 100 replies against their frozen
schemas; their raw bodies also parse as JSON. Source hashes matched at inference;
the only subsequent fingerprint difference is the grading fixture. All 927 Node
tests pass, including numeric repair, blank preservation, provider/schema routing,
target/HUD selection and final scoring boundaries. Earlier read-only running-host
checks verified the reader schema handoff and NPC-only Mood/HUD configuration;
no chat or settings fixtures were saved.

These scenes have been reused during tuning. They are development evidence, not
a fresh holdout or a measure of correction burden over a multi-turn campaign.
The evaluator's strict acceptance flag remains false because critical checks fail.
Review still defaults to automatic application; users can select Every change under
Ask Before Applying to review proposed updates. This study does not settle the
appropriate default review policy.

## Retained evidence and reproduction

- [Final frozen inputs](gemma-e4b-dating-final-10x-20261026-prompts.json)
- [Raw replies, normalized states, original checks and server metadata](gemma-e4b-dating-final-10x-20261026-results.json)
- [Approved rescoring, grading-source hashes and per-reply checks](gemma-e4b-dating-final-10x-20261026-grading.json)
- [Audit, corrected failure counts and original inference summary](gemma-e4b-dating-final-10x-20261026-audit.json)
- [Earlier reader work and development reports](tracker-model-evaluation-20261025-report.md)

Cleanup retains this final run, its approved grading correction, the controlled
Fantasy comparison, and the exact-scene E4B/26B comparison. Superseded tuning runs
and intermediate reports were removed. Previously published evaluation artifacts
remain historical evidence. The original raw replies and frozen inputs are unchanged.

Use a fresh label to repeat without overwriting this evidence:

```sh
node --test tests/*.mjs
node tests/eval-gemma-tracker.js --freeze NEW-LABEL --qualitative --schema --system dating
node tests/eval-gemma-tracker.js --run NEW-LABEL --repeats 10 \
  --endpoints http://127.0.0.1:9931/v1,http://127.0.0.1:8080/v1 --concurrency 4
```

Source fingerprints identify the tested working tree. The frozen Git revision is
its base commit; the definition and prompt changes remain uncommitted at evaluation.
