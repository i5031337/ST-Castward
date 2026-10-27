# Obsolete and redundant code audit

Audit date: 2026-10-26. All confirmed cleanup findings below are resolved. The item-name purge no longer deletes valid saved data, Fill context avoids duplicate profile prose and empty sections, and unused helpers and redundant passes are removed. All source modules remain reachable from `index.js`; the cleanup concerns code within modules.

## Item deletion fixed

[Settings store migration](../src/core/settings-store-migration.js) previously removed Item Library entries matching `/^new item \d+$/i` on every normalization. [Tracker storage](../src/tracker/status-state-storage.js) applied the same filter to player collections. The current [collection editor](../src/ui/collections/ui-collection.js) deliberately creates `New Item`, `New Item 2`, and subsequent numbered names.

An isolated execution of the migration changed library keys `New Item`, `New Item 2`, and `Sword` to `New Item` and `Sword`, discarding the second row's saved data. Both name-based purges are removed. Item names alone do not identify obsolete data.

## Duplicate Fill context fixed

[character-fill.js](../src/characters/character-fill.js) supplied existing profile fields through both `known` and `describeTrackedFacts`. Field generation now uses `describeTrackerState` for stats and collections, while `known` supplies profile prose with the requested fields excluded. Lore generation retains profile-inclusive `describeTrackedFacts`. Known readings now include the applicable System purpose on the same line (`Name: value, purpose`); blank readings add no stat section. The built-in lore prompt also omits empty facts, setting references, and existing-entry sections.

The regression uses production formatters and prompt assembly to verify one copy of existing profile context, exclusion of the old value being regenerated, and retained stat and item details. It also verifies that lore facts still include profile and tracker data. The test failed with two copies before the fix; all 16 focused profile, lore, and Fill tests pass afterward.

## Completed cleanup

| Finding | Resolution |
| --- | --- |
| Superseded ordering helpers | Removed `moveInList` from [utils-media.js](../src/core/utils-media.js), `moveCollectionField` from [collection-fields.js](../src/core/collection-fields.js), and `moveProfileField` from [ui-system-profile-operations.js](../src/ui/system/ui-system-profile-operations.js), along with test-only assertions. Current ordering uses [ui-reorder.js](../src/ui/shared/ui-reorder.js); identifier-pinning and deletion coverage remain. |
| Retired profile permissions | Removed `anyProfileFieldUnlocked` from [constants-profile.js](../src/core/constants-profile.js), `aiProfileFields` initialization from [settings-migration.js](../src/core/settings-migration.js), and stale lore-format fixture injection. Existing unread saved keys remain untouched. |
| Duplicate persistence cleanup | Removed `normaliseNpcPersistence` from [stat-persistence.js](../src/tracker/stat-persistence.js), its imports, calls, and fixture wiring. [normaliseStatUpdatePolicies](../src/tracker/stat-update-policy.js) still migrates carryover and removes the retired properties. |
| Obsolete expression selector and accessor | Removed test-only `lastNpcLines`, its misleading last-line-only test, and the unused `cached()` accessor from [expression-engine.js](../src/expressions/expression-engine.js). Runtime per-line classification and the internal cache remain covered. |
| Dead tracker API surface | Removed `lockedStats` and `highestCeiling` from [status-stat-values.js](../src/tracker/status-stat-values.js), their dependency registrations, and [status-logic.js](../src/tracker/status-logic.js) exports. |
| Ignored stat-initializer arguments | Simplified `getInitialStatValue` and its callers to one argument. Removed the unused maximum calculation in [status-scene-presence.js](../src/tracker/status-scene-presence.js). [NPC template tests](../tests/npc-templates.mjs) now preserve plain defaults rather than inventing pool denominators; falsy-default behavior remains unchanged. |
| Test-only convenience APIs | Removed `currentLocationPath` and `setLocationsEnabled` from [location-store.js](../src/locations/location-store.js), and `getSystemField` from [system-schema.js](../src/core/system-schema.js). Tests use current trails, catalog lookups, and explicit fixtures. Storage coverage still verifies System-owned enablement and map preservation. |
| Orphan character lore styling | Removed `.sillynpc-cv-lore` and `.sillynpc-cv-lore-text` from [11-character-sheets.css](../styles/11-character-sheets.css), preserving the shared `.sillynpc-cv-block` rules used by current profiles. |

## Optional consolidation and retained boundaries

[expression-events.js](../src/expressions/expression-events.js) and [speech-events.js](../src/tts/speech-events.js) duplicate foreground-reply authorization machinery. Their reset and stop policies differ, so both remain live. A small shared gate with explicit cancellation callbacks could reduce drift; [foreground-replies.mjs](../tests/foreground-replies.mjs) already exercises both adapters.

The image-tag registration subsystem has no callers in this checkout, but [image-tags.js](../src/characters/image-tags.js) describes an external integration hook. Confirm that integration policy before removing it. Snapshot/swipe compatibility, persisted emotion defaults, voice-binding fallbacks, and old System/settings conversion paths still serve saved data and are outside the confirmed removal list.

## Verification

The audit traced callers and used isolated production-function reproductions for the item purge and duplicated Fill context. Regression tests failed before those fixes and pass afterward. Coverage retains saved item metadata, old and current settings normalization, player inventories with custom identifiers, profile context, known stat purposes, and omission of empty prompt sections.

After the remaining cleanup, `node --test tests/*.mjs` passes all 868 tests and `git diff --check` passes. The read-only running-host check `python3 tests/ui-smoke.py` also passes, covering startup, tracker reports, profile editors, review controls, and System Builder rendering. The browser check required execution outside the sandbox so the Firefox driver could start.
