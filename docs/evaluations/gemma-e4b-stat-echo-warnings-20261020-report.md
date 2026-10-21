# Silent unchanged stat readings

Repeated stat readings now skip silently across world, player, and NPC stats. This applies to ordinary fields, locked fields, and progression-managed fields such as Level and XP. NPC comparisons use live chat readings, with saved card values as fallback. The change does not adopt the experimental absolute reader contract.

The reader's raw output remains available in the existing report. Repeated fields are removed from the sanitized update before validation/application can warn about an attempted write. An unchanged absolute reading alongside a genuine numeric delta is quietly discarded while the delta still applies. The current production delta path also drops unchanged absolute XP echoes quietly while continuing to reject changed absolute XP readings.

Equality respects the field type. Text uses its exact spelling after trimming. Numeric stats accept equivalent scalar/pool notation, including `1` versus `"1.0"`; a bare current reading can repeat the current part of an existing pool. An explicitly different pool maximum is a change and still warns. Missing values are not treated as saved values, and actual blank-field initialization remains validated.

Changed locked/progression fields, malformed numeric readings, invalid choices, conflicting changed readings/deltas, and altered pool maxima retain their warnings. Repeating an existing value outside a subsequently narrowed definition does not trigger a correction or warning; attempting a different invalid value does.

## Saved-reply replay

All 180 replies from the three earlier qualitative runs were normalized again. **Every scored check and resulting state is identical to the original result.** No new model requests were made, and the original inference artifacts were not overwritten.

| Contract | Warnings before | Warnings after | Replies with warnings before → after |
| --- | ---: | ---: | ---: |
| Current mixed/delta | 144 | 57 | 46/60 → 33/60 |
| Unconstrained absolute | 45 | 0 | 25/60 → 0/60 |
| Schema-constrained absolute | 25 | 5 | 21/60 → 2/60 |

The five remaining constrained warnings are three malformed numeric strings in one reply and two changed XP maxima in another. They remain visible and the original protections still apply.

## Validation

127 focused tests pass, covering equality, all actor scopes, locked and managed fields, card fallback, fresh NPC initialization, changed-value refusals, numeric delta precedence, constraints, XP progression, level reviews, and the evaluation harness. Tests were split into smaller files to keep source files below 20 kB.

[Replay audit with per-reply warning differences and source hashes](gemma-e4b-stat-echo-warning-replay-20261020.json). The earlier [schema experiment](gemma-e4b-qualitative-schema-20261020-report.md) retains its original warning counts as a historical result.
