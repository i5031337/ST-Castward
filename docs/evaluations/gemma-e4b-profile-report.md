# Gemma 4 E4B character profile evaluation

On 2026-10-18, the local llama.cpp server at `127.0.0.1:9931` reported `/mnt/D/backup_models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf` and build `b11669-620d2225c`. Requests used the extension's built-in Fantasy Adventure and Dating Sim profile fields and default prompt wording. No schema or temperature override was sent. Manual **Fill** used the tracker connection's shipped 2,400-token reply budget; automatic new-NPC profiling used the lore writer's shipped 2,048-token budget. Automatic profiling is optional and disabled by default.

The six frozen cases cover two story-based and two lore-based manual Fills, plus one newly discovered NPC per System through the automatic lore prompt. They test supported profile details, preservation of an existing field, omission of an unsupported field, and separation of the player's facts from an NPC's. Each case was run twice. The harness uses the production prompt builders and response parsers, including the YAML-to-profile path for automatic cards and the JSON Fill path. It supplies isolated story, lore, and tracker facts; it does not save SillyTavern cards or lorebooks, exercise the host UI, or generate portraits.

| Prompt version | Fill | Automatic lore | All checks | Critical failure |
| --- | ---: | ---: | ---: | --- |
| Baseline | 51/52 | 26/26 | 77/78 | A player's hiking interest entered an NPC's profile. |
| Attribution clarification | 51/52 | 26/26 | 77/78 | An "appearance not described" statement was saved as an appearance. |
| Final attribution and omission instructions | 52/52 | 26/26 | **78/78** | None. |

All 12 final responses ended normally, parsed, and satisfied the preset criteria: at least 85% of all checks, at least 80% for each System and profile path, and no critical failures. The final pass scored 100% for both Systems and both paths. The prompt changes ask the model to attribute facts to the named subject and omit fields whose values are unknown or undescribed.

The original one-pass pilot also scored 39/39, but its raw results were overwritten when the two-repeat baseline run started. Baseline and intermediate candidate artifacts remain available in Git history. Reproduce the current prompt set with `node tests/eval-gemma-profiles.js --freeze` followed by `node tests/eval-gemma-profiles.js --run --repeats 2`. The retained [final prompts](gemma-e4b-profiles-final-prompts.json) and [final results](gemma-e4b-profiles-final-results.json) contain frozen requests, exact server metadata, all 12 raw responses, applied values, and check results.

This evidence supports a claim that the tested Gemma E4B configuration handles these built-in profile scenarios. It is a compact local sample, not a guarantee for every story, custom System, endpoint configuration, or image model.
