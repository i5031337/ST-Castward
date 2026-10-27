# Obsolete and redundant code audit

Audit date: 2026-10-26. The item-name cleanup that could delete valid saved data is fixed. Duplicate profile context in field generation is also fixed. The remaining findings identify unused APIs, duplicated work, and tests that preserve superseded implementations. All source modules are reachable from `index.js`; these findings concern code within modules.

## Item deletion fixed

[Settings store migration](../src/core/settings-store-migration.js) previously removed Item Library entries matching `/^new item \d+$/i` on every normalization. [Tracker storage](../src/tracker/status-state-storage.js) applied the same filter to player collections. The current [collection editor](../src/ui/collections/ui-collection.js) deliberately creates `New Item`, `New Item 2`, and subsequent numbered names.

An isolated execution of the migration changed library keys `New Item`, `New Item 2`, and `Sword` to `New Item` and `Sword`, discarding the second row's saved data. Both name-based purges are removed. Item names alone do not identify obsolete data.

## Duplicate Fill context fixed

[character-fill.js](../src/characters/character-fill.js) supplied existing profile fields through both `known` and `describeTrackedFacts`. Field generation now uses `describeTrackerState` for stats and collections, while `known` supplies profile prose with the requested fields excluded. Lore generation retains profile-inclusive `describeTrackedFacts`. Known readings now include the applicable System purpose on the same line (`Name: value, purpose`); blank readings add no stat section. The built-in lore prompt also omits empty facts, setting references, and existing-entry sections.

The regression uses production formatters and prompt assembly to verify one copy of existing profile context, exclusion of the old value being regenerated, and retained stat and item details. It also verifies that lore facts still include profile and tracker data. The test failed with two copies before the fix; all 16 focused profile, lore, and Fill tests pass afterward.

## Open cleanup work

| Finding | Evidence and action |
| --- | --- |
| Superseded ordering helpers | `moveInList` in [utils-media.js](../src/core/utils-media.js) has no callers. `moveCollectionField` in [collection-fields.js](../src/core/collection-fields.js) and `moveProfileField` in [ui-system-profile-operations.js](../src/ui/system/ui-system-profile-operations.js) have only test callers. Editors now use [ui-reorder.js](../src/ui/shared/ui-reorder.js). Remove the old helpers and their test-only assertions; retain identifier-pinning and current reorder coverage. |
| Retired profile permissions | `anyProfileFieldUnlocked` in [constants-profile.js](../src/core/constants-profile.js) has no production callers. [settings-migration.js](../src/core/settings-migration.js) still initializes `aiProfileFields`, which has no other active consumer. Remove the helper, initialization, and stale lore-format fixture injection together. Existing unread saved keys need no destructive migration. |
| Duplicate persistence cleanup | `normaliseNpcPersistence` in [stat-persistence.js](../src/tracker/stat-persistence.js) deletes `persistence` and `persistenceReview`, already deleted by [normaliseStatUpdatePolicies](../src/tracker/stat-update-policy.js) immediately before every production call. Remove the duplicate pass and imports while retaining canonical migration of carryover and retired properties. |
| Obsolete expression selector and accessor | `lastNpcLines` in [expression-engine.js](../src/expressions/expression-engine.js) is called only by a test claiming that only the last dialogue line is classified. [npc-expressions.js](../src/expressions/npc-expressions.js) processes every NPC dialogue line. Remove that helper and stale test. The engine's `cached()` accessor also has no callers; retain its internal cache. The file-map description is corrected with this audit. |
| Dead tracker API surface | `lockedStats` and `highestCeiling` in [status-stat-values.js](../src/tracker/status-stat-values.js) have no callers beyond their own registrations and [status-logic.js](../src/tracker/status-logic.js) facade exports. Remove the helpers, registrations, and exports together. |
| Ignored stat-initializer arguments | `getInitialStatValue` in [status-stat-values.js](../src/tracker/status-stat-values.js) only returns `defaultValue \|\| ''`, ignoring its maximum and definition arguments. Callers still pass both, and [status-scene-presence.js](../src/tracker/status-scene-presence.js) computes a maximum solely for an ignored argument. Simplify the signature and callers; align [npc-templates tests](../tests/npc-templates.mjs), whose mocks still construct pool values. Preserve current falsy-default semantics unless changing them deliberately. |
| Test-only convenience APIs | `currentLocationPath` and `setLocationsEnabled` in [location-store.js](../src/locations/location-store.js) have only test callers. Runtime uses `currentLocationTrail` and System-owned enablement. `getSystemField` in [system-schema.js](../src/core/system-schema.js) is also test-only. Remove these APIs and test production boundaries instead. |
| Orphan character lore styling | `.sillynpc-cv-lore` and `.sillynpc-cv-lore-text` in [11-character-sheets.css](../styles/11-character-sheets.css) have no DOM producers. Current profiles use `.sillynpc-cv-block` and `.sillynpc-cv-value`. Remove the old selectors while retaining shared live rules. |

## Optional consolidation and retained boundaries

[expression-events.js](../src/expressions/expression-events.js) and [speech-events.js](../src/tts/speech-events.js) duplicate foreground-reply authorization machinery. Their reset and stop policies differ, so both remain live. A small shared gate with explicit cancellation callbacks could reduce drift; [foreground-replies.mjs](../tests/foreground-replies.mjs) already exercises both adapters.

The image-tag registration subsystem has no callers in this checkout, but [image-tags.js](../src/characters/image-tags.js) describes an external integration hook. Confirm that integration policy before removing it. Snapshot/swipe compatibility, persisted emotion defaults, voice-binding fallbacks, and old System/settings conversion paths still serve saved data and are outside the confirmed removal list.

## Verification baseline

The audit traced callers and tests and used isolated production-function reproductions for the item purge and duplicated Fill context. The focused baseline passed 36 tests across settings migration, collection fields, profile fields, NPC expressions, and stat persistence. Some passing tests exercise obsolete helpers, so their success does not establish current runtime coverage for those helpers.

The fix adds regressions in [settings-migration.mjs](../tests/settings-migration.mjs) and [chat-character-ownership.mjs](../tests/chat-character-ownership.mjs). Both failed before the change by losing `New Item 2` or `new item 12`; all 15 tests in those files pass after the fix. Coverage includes repeated normalization of old and current settings, library metadata, player holdings with default and custom identifiers, cached reads, and serialized save/reload.
