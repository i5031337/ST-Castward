# Production absolute tracker contract

Reader and inline tracking now use absolute JSON-string stat readings in `global`, `player.stats`, and `characters[].stats`. Their instructions, worked examples, recovery/injury guidance, schema, and model-input processing use the same contract. The retired numeric-delta module and experimental prompt-rewrite wrapper were removed. Collection operations retain add/remove/update and their declared numeric quantity types.

Fresh user and assistant turns remain joint evidence. Earlier history is accounted for, contested outcomes follow the assistant's resolution, and completed user actions left standing count once. The latest user turn remains included with zero older lead-up messages.

## XP and protections

Earned XP is added to the held reading before reporting. For example, `99/100` plus an award of 20 is returned as `119/100`; code produces Level 2 and `19/100`. Existing managed Level fields should be omitted; blank NPC initialization remains permitted.

`normalizeModelReadings` replaces delta expansion in both the reader and inline processing paths. For enabled progression it rejects lower XP readings, malformed XP, and updates without a valid existing baseline, while allowing valid blank-NPC initialization. It resolves configured field names, template eligibility, chat/card baselines, and aliases. Repeated readings remain quiet. Explicit changed maxima still reach the existing sanitizer and produce a warning. Unsupported nonempty stat-delta objects are discarded with a warning.

The earned-only guard is confined to model input. Manual edits and persisted review rows remain absolute, and existing saved chats/reviews require no migration. Numeric contents, allowed values, maximum preservation, and Level protection remain enforced downstream of the schema.

Schema enforcement retains the existing toggle. SillyTavern receives the named wrapper and forwards the actual schema through both dedicated-profile and main-API paths. Individual stat readings remain optional. System-generation instructions use the same XP convention while retaining remainder/capacity defaults and locked Level/unlocked XP definitions.

## Verification

- **772 Node tests pass**, including actual review acceptance/rejection and repeated-resolution protection, regeneration, custom XP fields, card fallback and aliases, malformed baselines, fresh NPC values without backfilled rewards, explicit maximum removal, and unchanged-stat warnings.
- **12 live absolute-runtime checks pass** in `tests/ui-absolute-contract.py`. Actual SillyTavern frontend/backend transport to a local mock upstream verified dedicated-profile/main paths with schema enabled/disabled. Live module checks verified fresh-turn evidence, prompt/schema contracts, XP rollover and replay behavior, lower-XP refusal, NPC initialization, and explicit maximum removal.
- The updated existing `tests/ui-smoke.py` passes. Browser fixtures restore state, settings, chat and fetch without saving or making model requests.
- All sixty saved replies from the earlier constrained absolute benchmark replay through production with identical scores and resulting states: **587/609 checks**, five meaningful warnings across two replies. This is a saved-reply replay, not fresh inference from the final prompt.
- `git diff --check` passes; edited source files remain below 20 kB.

The evaluator now freezes production absolute prompts directly, with optional `--schema`; `--absolute` remains an alias. Historical mixed/delta snapshots remain read-only. A new twenty-scene production snapshot was frozen as `absolute-runtime-final-20261020` without inference. Earlier benchmark reports retain their original results and limitations.

No unresolved policy or compatibility decision needs user review. Known interpretation limits, especially partial recovery, remain as documented in the earlier benchmark.
