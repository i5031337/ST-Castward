# Absolute tracker production readiness

Four independent subagents checked runtime contract consistency, XP review behavior, SillyTavern schema transport, and saved-state/review compatibility. The production output contract is still delta-based; the absolute variant remains an evaluation candidate. The fresh-player evidence instructions are already in the worktree and were used throughout the recent comparisons.

This records the pre-conversion audit. The subsequent [production absolute conversion](absolute-runtime-adoption-20261020.md) completes the runtime work and earned-only XP guard identified below, with Node and live-host verification.

## Runtime contract

Adoption requires a coordinated conversion of reader and inline-story instructions, recovery/injury hints, state-derived examples, extraction schema, and both processing entry points. The current `expandNumericDeltas` boundary deletes changed absolute XP readings. Merely replacing the prompt would therefore discard earned XP. Collection add/remove/update operations and numeric quantities should retain their current contract.

## XP review

An isolated fixture used real sanitation, application, diffing, transition grouping, update reconstruction, and review resolution, with host context and persistence mocked:

- Starting XP `99/100`, incoming `119/100`: preview yields Level 2 and XP `19/100`, without persisting.
- Accepting the pending transition writes it once; accepting it again does nothing.
- Rejection retains Level 1 and XP `99/100`.
- A replacement reading from the restored original baseline produces the same result without accumulating another award.
- A blank NPC Level accepts starting Level 3; later direct Level 4 is refused.

One required safeguard remains: incoming absolute XP `80/100` from `99/100` currently survives the absolute candidate's sanitation and review. Production's existing positive-delta boundary prevents this. Preserve earned-XP-only behavior explicitly at the model-input boundary during conversion, while leaving manual edits, saved absolute review rows, and valid NPC initialization intact. This preserves the current policy and needs no new user decision.

## Schema transport: fixed and verified

The live host revealed a wrapper mismatch. Castward passed raw JSON Schema; SillyTavern expects `{ name, value, strict }` and forwards `value` as the provider schema.

`status-extractor-request.js` now uses the wrapper in both dedicated-profile and main-API paths. A live Firefox fixture exercised actual Castward requests through the real SillyTavern frontend and backend into an isolated local mock upstream. Both paths now forward the complete schema when enabled and omit enforcement when disabled. The configured reader uses custom Chat Completion on port 9931, with no conflicting response-format preset overrides.

No model inference, settings saves, or chat changes were needed. The browser, fetch override, and mock upstream were cleaned up.

## Saved chats and reviews

No persisted-data migration or pending-review clearing is required. State, card overrides, before/after review rows, and snapshot effects already contain absolute readings. Review application uses `progressionResolved: true`; raw reader output remains diagnostic rather than a fresh delta source.

The check caught a regression from the earlier silent-repeat change: whole-value review removal of a pool maximum (`6/20` to `6`) could be treated as an unchanged current reading. Equality now distinguishes whole-value edits from bare reader readings, restoring explicit maximum removal. The review test harness also now supplies the new equality helper.

## Validation and remaining work

The complete Node suite passes **769 tests**, with zero failures or skips. Replaying all 180 saved benchmark replies still produces identical scores and resulting states after the fixes. `git diff --check` passes.

Required before adopting the absolute contract: complete the coordinated runtime conversion and enforce positive-earned-only XP at its model-input boundary, then rerun the focused integration checks against that converted path. No additional product-policy decision is outstanding.
