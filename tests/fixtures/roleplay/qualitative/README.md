# Qualitative roleplay comparison set

Twenty additional independent scenes: ten Fantasy Adventure and ten Dating Sim. They extend the original twenty without replacing or changing them. Select this set with `--qualitative` in `tests/eval-gemma-tracker.js` or `tests/generate-roleplay-scenes.js`.

These scenes were authored with Gemma 31B through the actual `examples/narrator.json` prompt, then reviewed and edited for continuity and natural prose. Each JSON retains the raw generated reply under `review.originalText`, the model and sampling metadata, two preceding exchanges, the latest player action, and its resolved reply. Starting readings describe the state immediately before that latest player action. Authoring directions and scoring checks are never supplied to the tracker.

There are no numerical damage, healing, energy costs, or relationship readings in the new narrative exchanges. Numbers in starting state remain necessary inputs. Eating a candy is an explicit object consumption; it does not prescribe a numerical energy effect.

## Scoring

Clear changes use direction plus broad bounds on the difference from the starting reading. For example, a mild injury can cost between one and four HP, rather than one uniquely correct amount. Minor or ambiguous effects have intervals including zero. Partial recovery must remain below capacity. Conditions and numeric readings are checked together where evidence supports both. Already-owned belongings mentioned in context are seeded in the starting state.

The intervals are authored evaluation judgments, not a claim that prose specifies an exact magnitude. They are fixed before tracker inference, applied equally to both contracts, and should be reconsidered if a reasonable interpretation lies outside them. Some ordinary first aid can improve Condition without HP recovery. General anxiety need not reduce Comfort around a trusted friend. Liking someone and trusting them can move independently.

All twenty are marked `holdout: true`. At authoring time they have not been used for tracker inference or prompt tuning. Keep them separate from development scenes when comparing contracts. No production reader prompt or contract was changed to fit them.

The [first frozen E4B comparison](../../../../docs/evaluations/gemma-e4b-qualitative-20261020-report.md) ran three repetitions per scene per contract: current mixed/delta 588/609 checks (96.6%), absolute strings 580/609 (95.2%). Raw numeric-stat violations fell from 16/60 replies to 1/60. Both runs had valid JSON throughout. These scenes have now been evaluated; future prompt tuning against them makes them development evidence rather than a fresh holdout.

The [schema-constrained absolute run](../../../../docs/evaluations/gemma-e4b-qualitative-schema-20261020-report.md) passed 587/609 checks (96.4%), with all sixty replies matching their schemas and no native numeric stat values. Remaining warnings mostly repeat unchanged managed NPC levels. `--schema` is chosen when freezing a new label and is automatically honored when running that snapshot.

| Fantasy scene | Evidence |
| --- | --- |
| [Practice impact](fantasy-q-practice-impact.json) | Player bruised during an interrupted lesson; companion unhurt |
| [Sustained ward](fantasy-q-sustained-ward.json) | Magical effort without a numeric cost or successful objective |
| [Sheltered breather](fantasy-q-sheltered-breather.json) | Partial physical recovery for both actors |
| [Cleaned cut](fantasy-q-cleaned-cut.json) | Condition improves; HP may stay unchanged or improve slightly |
| [Fever easing](fantasy-q-fever-easing.json) | Improving illness still leaves weakness and incomplete recovery |
| [Brief soaking](fantasy-q-brief-soaking.json) | Cold, wet discomfort without injury |
| [Unspent threat](fantasy-q-unspent-threat.json) | Conditional casting intention; no actual expenditure |
| [Falling plaster](fantasy-q-falling-plaster.json) | Companion takes the injury while protecting the player |
| [Pain-easing spell](fantasy-q-pain-easing-spell.json) | Player spends magic; companion's pain eases without healing the injury |
| [Loose scree](fantasy-q-loose-scree.json) | Both actors suffer distinct minor injuries; journey unresolved |

| Dating Sim scene | Evidence |
| --- | --- |
| [Closing shift](dating-q-closing-shift.json) | Social fatigue despite appreciation and increased fondness |
| [Quiet company](dating-q-quiet-company.json) | Partial energy recovery and increased ease around a friend |
| [Passing joke](dating-q-passing-joke.json) | Small pleasant moment may leave ratings unchanged |
| [Misplaced confidence](dating-q-misplaced-confidence.json) | Warmth increases while willingness to confide decreases |
| [Kept confidence](dating-q-kept-confidence.json) | A concrete act earns trust; difficult conversation costs energy |
| [Ordinary pause](dating-q-ordinary-pause.json) | An uneventful exchange permits unchanged ratings |
| [Unwelcome notification](dating-q-unwelcome-notification.json) | Anxiety about an absent person without distrust of the present friend |
| [Pressure lifted](dating-q-pressure-lifted.json) | Some energy returns after a cancelled future outing |
| [Candy before a call](dating-q-candy-before-call.json) | Completed player-only consumption; contemplated caller stays absent |
| [Accepted boundary](dating-q-accepted-boundary.json) | Less tension without an immediate trust reward; player is drained |

## Running

```sh
# No model requests: validate prose, prompt isolation, and production absolute scoring.
node --test tests/gemma-qualitative-evaluation.mjs tests/gemma-roleplay-evaluation.mjs

# Freeze the current production absolute contract, optionally with schema enforcement.
node tests/eval-gemma-tracker.js --freeze qualitative-current --qualitative
node tests/eval-gemma-tracker.js --freeze qualitative-current-schema --qualitative --schema

# Select the actual tracker endpoint after loading the tracker model.
node tests/eval-gemma-tracker.js --run qualitative-current --repeats 3 --endpoints http://127.0.0.1:8080/v1
node tests/eval-gemma-tracker.js --run qualitative-current-schema --repeats 3 --endpoints http://127.0.0.1:8080/v1
```

Port 9931 served the roleplay authoring model, not a tracker benchmark, during creation of this set. Regeneration with `node tests/generate-roleplay-scenes.js --qualitative --overwrite` intentionally replaces reviewed text and clears its review record; review again before evaluating.

New snapshots always use the production absolute contract; `--absolute` is an optional alias. Earlier mixed/delta snapshots are retained as read-only historical artifacts.
