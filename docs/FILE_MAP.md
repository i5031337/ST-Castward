# File map

SillyTavern loads `index.js` and `style.css` from `manifest.json`. The JavaScript entry point imports the feature modules under `src/`.

## Source directories

| Directory | Responsibility |
| --- | --- |
| `src/entry/` | SillyTavern event and avatar handlers. |
| `src/core/` | Constants, settings, System schemas, active profile fields, memories, migrations, and shared utilities. |
| `src/api/` | Lore and image generation and file operations. |
| `src/generation/` | Staged System generation, canonical schema fragments, validation, requests, and isolated drafts. |
| `src/npc/` | Narrator Create NPC tool, System-aware creation contract, randomized name selection, validation, guarded chat-owned saves and background portraits. |
| `src/npc/npc-generation-format.js` | Reader-compatible JSON repair, numeric stat string normalization, and concise model-facing template definitions. |
| `src/npc/npc-naming.js` | Randomized naming briefs: adjustable syllable/stress weights, four distinct initials favoring unused cast initials, and uniform selection. Cultural fit overrides the hints. |
| `src/npc/npc-collection-generation.js` | Template-scoped starting collections, reader-style initialization guidance, typed entry contracts, defaults, bounds and identifier validation. |
| `tests/npc-creation.mjs`, `tests/npc-creation-name.mjs`, `tests/npc-creation-template.mjs`, `tests/npc-collection-creation.mjs`, `tests/npc-generation-format.mjs`, `tests/ui-npc-creation.py` | Creation contracts, randomized and exact names, template selection, alias reuse, starting collections, held-state preservation, JSON recovery, numeric stat normalization, compact prompt definitions, stat bounds, retries, cancellation, duplicate prevention and unsaved host tool/UI checks. |
| `src/characters/` | Character records, ownership, portraits, and transfer. |
| `src/chat/` | Chat ownership, message decoration, and reprocessing. |
| `src/expressions/` | NPC sprite packs, per-line expression cache, static dialogue portraits, and full-size speech sprites. |
| `src/lore/` | Lorebook entries and synchronization. |
| `src/locations/` | Chat-owned place identities, containment, reviewed discoveries, bounded recall, and read-only lore references. |
| `src/story/` | Story beats, mentions, and collection scans. |
| `src/prompts/` | Built-in prompt templates, formatting rules, and prompt placement. |
| `src/tracker/` | Current state, progression, memories, updates, and review; `extractor/`, `snapshots/`, and `ui/` hold focused parts. |
| `src/ui/` | Management, HUD, settings, character, collection, system, tracker, API, and story views. |

## Project files

| File | Responsibility |
| --- | --- |
| `manifest.json` | SillyTavern extension metadata, entry points, and generation interceptor. |
| `index.html` | Settings panel markup. |
| `manage.html` | Management popup markup. |
| `README.md` | Installation, features, and usage documentation. |
| `LICENSE` | Project license. |
| `docs/chat-owned-npcs-plan.md` | Chat ownership and portable character contract. |
| `docs/npc-expressions-tts-plan.md` | Dialogue, expressions, independent speech stages, and verification. |
| `docs/FILE_MAP.md` | This source map. |
| `docs/ARCHITECTURE.md` | Current storage ownership, reader behavior, review, and verification boundaries. |
| `docs/REWRITE_HOST_SMOKE.md` | Dated user-reported host results and remaining manual checks. |
| `docs/level-up-rewards-plan.md` | Implemented progression/reward contract and verification criteria. |
| `docs/system-generation-plan.md` | Implemented staged System generator design, verification criteria, and schema simplification candidates. |
| `img/branding/castward-logo.svg`, `img/branding/castward-icon.svg` | README logo and extension-header character emblem; outlined lettering and transparent backgrounds. |
| `img/screenshots/` | README captures for dialogue expressions, the expression editor, present scene sprites, progression, System generation, and speech settings. These feature examples use staged data. |
| `img/screenshots/fantasy-demo/` | Live Fantasy Adventure captures with full user messages, reader-applied state, Joram before and after Fill, his generated sheet, and the player HUD. Evidence is in `docs/evaluations/fantasy-adventure-live-demo.json`. |
| `img/screenshots/example-portraits.webp` | Original generated example artwork used in the captures: Mira neutral/joy and Rowan neutral/fear, arranged in a two-by-two sheet. |
| `tests/chat-character-ownership.mjs` | Character visibility, chat NPC routing, persona identity, and chat-local player state boundaries. |
| `src/characters/system-npc-roster.js`, `system-npc-roster-runtime.js` | Opt-in local System rosters, portable snapshots, and one-time independent chat seeding. |
| `src/characters/system-roster-state.js` | Optional map and NPC memory snapshots, provenance-free memory copies, and deferred tracker-state seeds. |
| `src/ui/system/ui-system-reuse.js` | Local per-System NPC reuse, Places carryover controls, and saved-roster clearing. Memory carryover is a canonical Builder profile setting. |
| `tests/system-npc-roster.mjs`, `tests/ui-system-npc-roster.py` | Roster defaults, carryover, independent copies, stale-copy protection, System boundaries, and unsaved host UI check. |
| `tests/system-roster-state.mjs` | Independent map and memory copies, opt-outs, stale-copy protection, source invalidation, and tracker save integration. |
| `tests/character-memory-transfer.mjs` | Source/destination memory carryover policy, active/archive transfer, provenance removal, and same-name chat isolation. |
| `src/lore/cast-lore.js`, `cast-lore-runtime.js` | Supply linked active-cast entries to the host lore scan, preserving existing selections, entry policy, and chat boundaries. |
| `tests/cast-lore.mjs`, `tests/lorebook-fill-workflow.mjs`, `tests/ui-cast-lore.py` | Automatic profile lore availability, first-Fill book creation, duplicate prevention, and real host name/alias scanning with unsaved fixtures. |
| `tests/fill-new-character.mjs` | Automatic fill stages, new chat cards, shared locks, and retry behavior. |
| `tests/lore-entry-store.mjs` | Concurrent lore creation, ownership, and entry reuse tests. |
| `tests/ui-audit-followup.py` | Unsaved live checks for editable Time and scan overflow before requests. |
| `tests/status-extractor-request.mjs` | Mocked reader/scan routing and visible fallback warnings. |
| `tests/profile-lore-storage.mjs` | Player lore persistence and tracker-only scene context tests. |
| `tests/progression.mjs` | XP advancement tests. |
| `tests/level-grants.mjs`, `tests/level-grant-review.mjs` | Actor-specific grant generation, bounds, dependencies, and atomic review acceptance. |
| `tests/level-reading-retry.mjs`, `tests/inline-level-review.mjs` | Grant caching, missing-choice retries, freshness, and inline reading replacement. |
| `tests/collection-quantity.mjs` | Quantity arithmetic, consumption, transfers, migration, and reader contracts. |
| `tests/collection-quantity-generation.mjs` | Generate and validate built-in quantity configuration. |
| `tests/ui-collection-quantity.py` | Unsaved Firefox fixtures for quantity controls and stack arithmetic. |
| `tests/collection-preview-purity.mjs` | Verify that previews never create library entries or mutate tombstones. |
| `tests/ui-pool-readings.py` | Individual NPC pool/Level initialization, updates over plain saved values, live capacity, and tracker rendering. |
| `tests/ui-progression-smoke.py` | Unsaved live Firefox fixtures for rewards, review dependencies, and Player/NPC progression controls. |
| `tests/collection-rewards.mjs` | Reward field validation, schedules, intervals, targets, duplicate prevention, and rename stability. |
| `tests/stat-settings-simplification.mjs` | Independent reader locking, carryover, growth, and premise schema contract. |
| `tests/stat-persistence.mjs` | NPC persistence rule tests. |
| `tests/ui-npc-templates.py` | Temporary, unsaved Firefox fixtures for template controls, profile fields, reader guidance, and tracker rendering. |
| `tests/ui_webdriver.py` | Shared Firefox session and guaranteed driver cleanup. |
| `tests/history-scan.mjs` | Preserve NPC template assignments through scan filtering and multi-pass merging. |
| `tests/ui-enable-switch.py` | Unsaved live checks for both master controls, synchronization, disabled reader, and UI cleanup. |
| `tests/ui-smoke.py` | Read-only headless Firefox checks of startup, manual reader controls, and the System Builder. |
| `tests/dialogue-presentation.mjs` | Quoted speech extraction, highlight alias rules, and message revision isolation. |
| `tests/npc-presentation.mjs` | Presentation defaults, normalization, ownership, cloning, and portable transfer. |
| `tests/ui-dialogue-presentation.py` | Unsaved live dialogue records, highlight identity parity, and display independence. |
| `tests/ui-settings-navigation.py` | Settings sections, search, accessibility labels, and narrow navigation. |
| `tests/ui-collection-smoke.py` | Collection rendering and reward editor controls, validation, and narrow layouts. |
| `tests/status-apply-update.mjs` | Tracker update, dry-run, and no-chat behavior tests. |
| `tests/settings-migration.mjs` | Settings import repair and version-gated HUD migration tests. |
| `tests/field-assignments.mjs` | Shared field assignment overlap and conflict rules. |
| `tests/shared-stat-renames.mjs` | Assignment-scoped stat renames and inactive persona readings. |
| `tests/ui-cast-shared.py` | Isolated player/NPC Cast layouts, complete stat commits, and chat/persona guards. |
| `tests/system-schema.mjs` | System definition normalization, legacy imports, and retired HUD layouts. |
| `tests/builtin-systems.mjs` | Shipped starter validation, actor assignments, and Creature HP progression shape. |
| `tests/ui-system-starters.mjs` | Starter picker activation and chat-lock behavior with a local DOM fixture. |
| `tests/profile-fields-ui.mjs` | Profile rendering and System profile field edit operations. |
| `tests/stat-model-bounds.mjs` | Numeric bounds, model sanitization, and rejection warnings. |
| `tests/profile-memories.mjs` | Profile memory list normalization and capacity behavior. |
| `tests/profile-memories-ui.mjs`, `tests/npc-memories.mjs` | Player/NPC memory display and persistence behavior. |
| `tests/turn-delta.mjs` | Current turn change reversal and rebase behavior. |
| `tests/status-dependencies.mjs` | Shared status dependency provider contract test. |
| `tests/ui-chat-boundaries.mjs` | Chat-switch confirmation guards and bulk deletion selection snapshots. |
| `tests/world-character-export.mjs` | Inactive System export rules and reusable/chat NPC inclusion. |
| `tests/ui-maintenance.mjs` | Lore generation and character editor routing tests. |

## Runtime and data

| File | Responsibility |
| --- | --- |
| `index.js` | Initialize the extension, register SillyTavern events, and mount settings. |
| `src/entry/entry-message-events.js` | Message, swipe, regeneration, latest-reply edit, and deletion event handlers. |
| `src/entry/entry-avatar-actions.js` | Character and player avatar click actions. |
| `src/entry/entry-chat-scope.js` | Prompt to scope a chat to its characters. |
| `src/entry/entry-history-notes.js` | Manage copied historical notes on messages. |
| `src/core/generation-cancellation.js` | Shared Stop-button visibility, stop/chat-change cancellation, linked dialog signals, and late-response guards for all LLM request adapters. |
| `src/core/generation-activity.js`, `src/ui/tracker/ui-generation-activity.js` | Transient request activity and composer indicators. |
| `src/core/constants.js` | Extension constants, themes, profile schema, and built-in writing/image prompts. |
| `src/core/constants-base.js` | Base extension, theme, layout, and image constants. |
| `src/core/constants-profile.js` | Built-in character profile fields and default assignments. |
| `src/core/npc-templates.js` | Resolve NPC templates and their selected stats and profile fields; compact reader assignment guidance. |
| `src/core/profile-fields.js` | Resolve the active System's player and NPC fields, with built-in defaults. |
| `src/core/profile-memories.js` | Normalize and edit bounded character memory lists. |
| `src/core/constants-prompts.js` | Built-in status and image prompt constants. |
| `src/core/settings.js` | Default settings, normalization, persistence, and settings transfer. |
| `src/core/npc-presentation.js` | Normalize portable NPC expression and provider voice preferences and unresolved imported bindings. |
| `src/core/settings-defaults.js` | Default settings catalog. |
| `src/prompts/default-prompt-texts.js` | Built-in lore prompt defaults. |
| `src/core/settings-tracker-defaults.js` | Default tracker settings. |
| `src/core/settings-migration.js` | Normalize settings across versions. |
| `src/core/settings-base-migration.js` | Normalize common settings and their defaults. |
| `src/core/settings-store-migration.js` | Normalize stored collections and presets. |
| `src/generation/contracts.js` | Canonical generation schema fragments and response/count limits. |
| `src/generation/validate-shape.js` | Strict provider-compatible shape checks and complete JSON extraction. |
| `src/generation/validate-definition.js` | Pure semantic validation before and after canonical normalization. |
| `src/generation/planning-prompt.js` | Dedicated planning instructions and a valid example with scoped field-name references. |
| `src/generation/plan.js` | Manifest validation, deterministic ID allocation, and empty canonical draft. |
| `src/generation/stages.js` | Catalog/rule, collection, and reward requests, fixed-ID coverage checks, and local display defaults. |
| `src/generation/catalog-rules.js` | Joint stat/progression response contracts, validation, and atomic application for each catalog. |
| `src/generation/stage-request.js` | Section-specific context and instructions, with schemas restricted to allocated IDs and object counts. |
| `src/generation/generate-system.js` | Sequential generation, bounded repair, retry, cancellation, progress, and assembly. |
| `src/generation/request.js` | Captured reader connection adapter and usage reporting without connection fallback. |
| `src/generation/draft-context.js` | Isolated Builder projection, draft capture, and local rename callbacks. |
| `src/core/system-fields.js` | Resolve shared stat and profile catalogs for player, NPC, and template assignments. |
| `src/core/system-schema.js` | Versioned shared System catalogs, target assignments, and bounded legacy preset normalization. |
| `src/core/builtin-systems.js` | Fresh editable Fantasy Adventure, Dating Sim, and Creature Trainer System definitions. |
| `src/core/settings-initial.js` | Seed a new install with the Fantasy Adventure System and matching tracker fields. |
| `src/core/progression-config.js` | Canonical player and per-template progression configuration and configured stat resolution. |
| `src/core/collection-rewards.js` | Pure collection reward normalization, typed entries, schedules, guided intervals, targeting, and duplicate checks. |
| `src/core/utils.js` | Image preparation, JSON repair, stat display, downloads, and DOM helpers. |
| `src/core/utils-media.js` | Image resizing, upload preparation, and media helpers. |
| `src/core/utils-format.js` | JSON, stat display, text, and DOM formatting helpers. |
| `src/core/hash.js` | Stable hashes and palette indexes. |
| `src/api/api.js` | Lore generation and image upload, generation, adoption, and cleanup. |
| `src/api/api-connection-profile.js` | Request-local Additional Parameters from the Custom connection profile's completion preset; included YAML takes precedence over standard parameters. |
| `src/api/api-lore-facts.js` | Assemble lore and tracked fact context. |
| `src/api/api-lore-generate.js` | Generate and save lore content. |
| `src/api/api-image-items.js` | Select collection items for portrait prompts. |
| `src/api/api-image-files.js` | Image storage, listing, adoption, and cleanup. |
| `src/api/api-image-generate.js` | Portrait prompt assembly and SillyTavern Image Generation `/imagine` call. |
| `src/core/usage.js` | Model usage accounting. |
| `src/core/tokens.js` | Token budget readout. |
| `src/tracker/progression.js` | XP transitions and bounded stat growth, including multiple crossed levels. |
| `src/tracker/level-stat-points.js` | Numeric point capacity, allocation with replacement, and manual spending validation. |
| `src/ui/tracker/ui-point-allocation.js` | Random allocation summaries and manual controls for pending point budgets. |
| `src/tracker/progression-fields.js` | Resolve actor progression and reserve configured XP and Level fields in tracker updates. |
| `src/tracker/extractor/status-level-grants.js` | Code-owned numeric point budgets and guided collection selection alongside scheduled rewards. |
| `src/tracker/level-grant-review.js` | Structured grant provenance, XP dependencies, freshness, and acceptance-time grant arithmetic. |
| `src/tracker/manual-level-up-logic.js`, `src/tracker/manual-level-ups.js` | Explicit NPC level advances and chat-owned reward reviews, with runtime bindings. |
| `src/ui/characters/ui-manual-level-up.js` | Card Edit button and pending manual level-up reward controls. |
| `tests/manual-level-ups.mjs`, `tests/ui-manual-level-ups.py` | Explicit level-up lifecycle, generic pool growth, persistence, context guards, and live card review checks. |
| `src/tracker/numeric-stat-bounds.js` | Enforce numeric minimums and pool ceilings. |
| `src/tracker/collection-prompt-definitions.js` | Shared readable collection definitions for the Tracker and NPC generator, with initialization defaults when needed. |
| `src/tracker/stat-prompt-definitions.js` | Format stat purposes and rules for reader and inline prompts. |
| `src/tracker/stat-persistence.js` | Rules for NPC stat persistence. |
| `src/tracker/stat-update-policy.js` | Reader locking and migration of retired stat policies. |
| `src/tracker/status-history.js` | Raw status block preservation and chat overhead measurement. |
| `src/tracker/status-logic.js` | Player and NPC state, model updates, cast, items, and Systems. |
| `src/tracker/status-stat-values.js` | Stat value merging and model update sanitization. |
| `src/tracker/status-stat-schema.js` | Stat definition lookup and schema helpers. |
| `src/tracker/status-persona-state.js` | Reusable persona identity/profile and chat-local player stats, collections, and memories. |
| `src/tracker/status-chat-session.js` | Chat persona/system session lifecycle. |
| `src/tracker/status-state-storage.js` | Load and save status metadata, including one-step undo. |
| `src/tracker/status-status-summary.js` | Format status summaries. |
| `src/tracker/status-scene-prompt.js` | Build scene context and status instructions. |
| `src/tracker/status-update-parser.js` | Parse model status update text. |
| `src/tracker/status-update-constraints.js` | Validate update values against configured fields. |
| `src/tracker/status-apply-update.js` | Apply accepted model updates to state. |
| `src/tracker/status-cast-decisions.js` | Record player, excluded, and character cast decisions. |
| `src/tracker/status-scene-presence.js` | Reconcile scene presence and active characters. |
| `src/tracker/status-collection-updates.js` | Add, remove, and update tracked items. |
| `src/tracker/status-collection-schema.js` | Rename collection fields and stat schema references. |
| `src/tracker/status-system-presets.js` | Active System, reusable definitions, chat locking, import, detail edits, and independent duplication of rules and local carryover rosters. Renames update display metadata and definition names while retaining library keys used by chats and rosters. |
| `src/tracker/npc-memories.js` | Store NPC memories in chat-owned or reusable character records. |
| `src/memory/memory-batch.js`, `memory-prompt.js` | Bound transcript batches, validate sourced NPC additions, and build the separate memory request. |
| `src/memory/memory-service.js`, `memory-reader.js` | Persist reading progress, guard asynchronous requests, schedule occasional reads, and invalidate changed sources. |
| `src/memory/memory-review.js` | Match memory review decisions and apply accepted additions to chat-local storage. |
| `src/ui/tracker/ui-memory-button.js` | Separate on-demand memory reader control on the send bar. |
| `src/tracker/status-diff.js` | Public entry point for state difference and review helpers. |
| `src/tracker/status-diff-compare.js` | Compare stats and collections across states. |
| `src/tracker/status-diff-review.js` | Attach reasons, partition decisions, and rebuild accepted updates. |
| `src/tracker/status-review.js` | Pending changes and item decision rules. |
| `src/tracker/snapshots/status-snapshots.js` | Public entry point for turn records and swipe state. |
| `src/tracker/snapshots/status-turn-delta.js` | Revert one assistant turn's applied tracker changes. |
| `src/tracker/snapshots/status-row-replay.js` | Read legacy applied rows when rebasing older replies. |
| `src/tracker/snapshots/status-rebase-lore.js` | Reconcile lore after latest-turn rebase. |
| `src/tracker/snapshots/status-snapshot-records.js` | Store current turn changes and read older applied rows. |
| `src/tracker/snapshots/status-snapshot-swipe.js` | Align and restore the latest assistant reply across swipes and regeneration. |
| `src/tracker/tracker-view.js` | Tracker visibility mode. |
| `src/chat/reprocess.js` | Callback bridge for reprocessing chat messages. |

## Extraction and prompts

| File | Responsibility |
| --- | --- |
| `src/tracker/extractor/status-extractor.js` | Public entry point for model extraction. |
| `src/tracker/extractor/status-extractor-schema.js` | Structured extraction schema and unknown speaker classification. |
| `src/tracker/extractor/status-extractor-schema-provider.js` | Keep numeric patterns on llama.cpp/GGUF routes and adapt portable schemas per request destination. |
| `src/tracker/extractor/status-extractor-readings.js` | Absolute model readings, numeric punctuation repair, earned-only XP protection, and rejected stat-delta output. |
| `src/tracker/stat-reading-equality.js` | Compare unchanged stat readings while respecting explicit pool maximum edits. |
| `src/tracker/extractor/status-extractor-prompt.js` | Extraction prompt assembly and recent message context. |
| `src/tracker/extractor/status-extractor-prompt-state.js` | Describe current state, collections, and limits for prompts. |
| `src/tracker/extractor/status-extractor-prompt-offstage.js` | Describe locked and offstage characters for prompts. |
| `src/tracker/extractor/status-extractor-request.js` | Send and normalize model extraction responses. |
| `src/tracker/extractor/status-extractor-run.js` | Per-message extraction lifecycle and cache invalidation. |
| `src/tracker/extractor/status-level-reading.js` | Swipe-specific choice cache, decision retention, and missing-reward retries. |
| `src/tracker/extractor/status-inline-grants.js` | Inline absolute-reading validation, review, and replacement-reading orchestration. |
| `src/tracker/extractor/status-npc-profiles.js` | Optional profile generation for newly discovered reader NPCs, with chat and reply guards. |
| `src/prompts/prompt-texts.js` | Built-in prompt text and template substitution. |
| `src/prompts/prompt-texts-reader.js` | Reader and status extraction prompt templates. |
| `src/prompts/prompt-texts-other.js` | Other built-in prompt templates. |
| `src/prompts/fill-preset.js` | Automatic character fill stage selection. |
| `src/prompts/prompt-slot.js` | Place writing prompts in SillyTavern's prompt manager. |
| `tests/prompt-slot-rebrand.mjs` | Rename the former default dialogue prompt without changing custom names, placement, order, or toggles. |
| `src/prompts/macros.js` | Expand extension template macros. |
| `src/prompts/dialogue-format.js` | Dialogue formatting instructions. |
| `src/prompts/banlist.js` | Banned phrase rules and scan prompts. |

## Characters and story

| File | Responsibility |
| --- | --- |
| `src/characters/characters.js` | Character records, categories, aliases, and chat cast membership. |
| `src/characters/character-repository.js` | Route character reads and writes among chat, world, and library records. |
| `src/characters/character-scope.js` | Visible character selection and pattern signatures. |
| `src/characters/character-transfer.js` | Character transfer file import and export. |
| `src/characters/character-transfer-media.js` | Embed and restore portraits, picture tags, and expression packs in character files. |
| `tests/character-transfer-complete.mjs`, `tests/ui-character-transfer.cjs` | Character export/import boundaries and a read-only running-host export check. |
| `src/characters/character-images.js` | Character image folders, listing, and migration. |
| `src/characters/character-image-migration.js` | Copy and migrate images between character folders. |
| `src/characters/character-fill.js` | Audit missing character data and fill profile, stats, and items. |
| `src/characters/character-fill-lore.js` | Fill or generate character lore. |
| `src/characters/default-portraits.js` | Stranger portrait pool and assignments. |
| `src/characters/image-tags.js` | Portrait tag fields and tag lookup. |
| `src/lore/lorebook.js` | Lorebook linking, identity, and synchronization. |
| `src/lore/lore-entries.js` | Create or reuse lore entries for player and NPC identities. |
| `src/lore/lore-entry-store.js` | Serialize entry allocation and reuse ownership markers. |
| `src/lore/lorebook-target.js` | Choose and name a chat lorebook for Fill without overwriting an existing book. |
| `src/lore/lore-format.js` | Parse and format active System fields while retaining unknown saved lore lines. |
| `src/lore/lore-sync.js` | Save player and NPC profile fields to lore, creating a link when needed. |
| `src/entry/entry-enabled.js` | Apply the master switch, synchronize both controls, clear prompts and refresh runtime UI. |
| `src/entry/entry-profile-lore.js` | Sync existing active profiles on startup, chat changes, and persona changes. |
| `src/lore/activated-lore.js` | Capture activated lore entries and their characters. |
| `src/story/beats.js` | Segment visible message content into story beats. |
| `src/story/mentions.js` | Detect named character mentions. |
| `src/story/speaker-labels.js` | Normalize and filter speaker names. |
| `src/chat/chat.js` | Decorate messages with portraits, speaker colors, and tracker controls. |
| `src/chat/chat-signature.js` | Compute chat rendering signatures. |
| `src/chat/chat-portraits.js` | Select and inject character portraits. |
| `src/chat/dialogue-line.js` | Recognize plain speaker dialogue lines. |
| `src/chat/dialogue-discovery.js` | Shared DOM dialogue discovery, quote extraction, and card/alias matching for highlighting and presentation. |
| `src/chat/dialogue-presentation.js` | Read ordered dialogue records with NPC/persona identity and chat/message revision keys. |
| `src/chat/dialogue-stream-state.js` | Stable committed dialogue identities and current-generation validation while source text grows. |
| `src/chat/chat-speech.js` | Attach portraits to recognized dialogue lines. |
| `src/chat/chat-reprocess.js` | Reprocess message decorations and tracker controls. |
| `src/chat/chat-listing.js` | List chat headers. |
| `src/chat/chat-npc-sources.js` | Identify chat-owned NPC sources and their images. |
| `src/story/history-scan.js` | Scan existing chat for collection state. |
| `src/story/history-notes.js` | Read and remove historical world notes. |
| `src/characters/world-character-export.js` | Export world character records. |

## Interface

| File | Responsibility |
| --- | --- |
| `src/tracker/ui/status-ui.js` | Inject and render tracker boxes, plus inline editing. |
| `src/tracker/ui/status-ui-process.js` | Process tracker data on rendered messages. |
| `src/tracker/ui/status-ui-guards.js` | Detect tracker editing and visible message content. |
| `src/tracker/ui/status-ui-hidden.js` | Hide raw status data in message content. |
| `src/tracker/ui/status-ui-box.js` | Build and place tracker boxes. |
| `src/tracker/ui/status-ui-place.js` | Render the current chat's parent-to-place trail beside world stats. |
| `src/tracker/ui/status-ui-placement.js` | Select the latest visible prose message when image-only messages are present. |
| `src/tracker/ui/status-ui-menu.js` | Tracker menu and add-character controls. |
| `src/tracker/ui/status-ui-template.js` | Assemble tracker HTML. |
| `src/tracker/ui/status-ui-template-core.js` | Render core tracker fields. |
| `src/tracker/ui/status-ui-template-characters.js` | Render character sections in the tracker. |
| `src/tracker/ui/status-ui-edit.js` | Wire inline tracker editing. |
| `src/ui/manage/ui-manage.js` | Management popup and tab routing, including the Player view. |
| `src/ui/api/ui-api-lore.js` | Lore generation dialog workflow. |
| `src/ui/api/ui-api-image.js` | Portrait generation dialog workflow. |
| `src/ui/shared/ui-banlist.js` | Banlist editor. |
| `src/ui/shared/ui-bulk-select.js` | Shared bulk selection controls. |
| `src/ui/characters/ui-cast-panel.js` | Cast membership panel. |
| `src/ui/tracker/ui-change-review.js` | Review proposed model changes. |
| `src/ui/collections/ui-collection.js` | Collection editor and event handlers. |
| `src/ui/settings/ui-connection-profiles.js` | Generation connection picker. |
| `src/ui/characters/ui-fill.js` | Character fill controls. |
| `src/ui/characters/ui-grid-filter.js` | Character grid filtering. |
| `src/ui/hud/ui-hud.js` | Floating HUD, portrait, meters, and drag handling. |
| `src/ui/hud/ui-hud-render.js` | Build and refresh floating HUD content. |
| `src/ui/hud/ui-hud-portrait.js` | HUD portrait loading and sizing. |
| `src/ui/hud/ui-hud-meters.js` | HUD bars, pips, and rings. |
| `src/ui/hud/ui-hud-settings.js` | HUD configuration view. |
| `src/ui/collections/ui-item-library.js` | Master item library. |
| `src/ui/collections/ui-item-library-sections.js` | Item rows, rules, and tombstone sections. |
| `src/ui/story/ui-lorebook-section.js` | Lorebook settings and controls. |
| `src/ui/characters/ui-character-memory-section.js` | Shared memory controls with actor-specific storage. |
| `src/ui/characters/ui-player-sheet.js` | Route the active persona into the shared Cast view and expose the HUD/avatar open action. |
| `src/ui/characters/ui-memories.js` | Editable active and archived memory lists on character sheets. |
| `src/ui/characters/ui-portrait.js` | Portrait gallery and lightbox. |
| `src/ui/characters/ui-profile.js` | Active System profile fields and saved legacy field display/editing. |
| `src/ui/tracker/ui-scan-button.js` | History scan trigger. |
| `src/ui/settings/ui-setting-controls.js` | Shared settings form controls. |
| `src/ui/settings/ui-setting-help.js` | Hover, focus, and tap help hints for settings controls. |
| `src/ui/settings/ui-settings-details.js` | Group less-used settings in disclosures. |
| `src/ui/settings/ui-settings-search.js` | Search settings and jump to results. |
| `src/ui/settings/ui-settings-appearance.js` | Appearance settings. |
| `src/ui/settings/ui-settings-writing.js` | Writing rule settings. |
| `src/ui/settings/ui-settings-advanced.js` | Advanced settings. |
| `src/ui/settings/ui-settings-defaults.js` | Default behavior settings. |
| `src/ui/settings/ui-settings-generation.js` | Separate Lorebook and Images settings views. |
| `src/ui/settings/ui-settings-generation-helpers.js` | Shared helpers for generation settings. |
| `src/ui/settings/ui-settings-generation-image.js` | Portrait generation controls and the shared automatic NPC expression switch. |
| `src/ui/settings/ui-expression-workflow.js` | Shared expression-edit workflow selector, independent of the ST portrait workflow. |
| `src/ui/settings/ui-settings-generation-storage.js` | Portrait folder, image discovery, and orphan cleanup controls. |
| `src/ui/shared/ui-shared.js` | Shared UI facade and choice helpers. |
| `src/ui/shared/ui-choice.js` | Shared choice field controls. |
| `src/ui/shared/ui-stats.js` | Stats view. |
| `src/ui/system/ui-npc-templates.js` | Edit reusable NPC templates and shared field selections. |
| `src/ui/characters/ui-npc-template.js` | Choose or correct a character’s NPC template. |
| `tests/image-prompt.mjs` | Portrait prompt preview/editing, selected profile fields, and image collection inputs. |
| `tests/ui-image-generation.py` | Unsaved live portrait prompt and profile image checkbox checks, without image requests. |
| `tests/npc-templates.mjs` | Template normalization, assignment, validation, review, and scene return tests. |
| `src/ui/system/ui-system-builder.js` | Public entry point for system schema editor. |
| `src/ui/system/ui-system-profiles.js` | Player and NPC profile field controls in System Builder. |
| `src/ui/system/ui-system-profile-operations.js` | Pure add, rename, order, retire, and restore operations for profile fields. |
| `src/ui/system/ui-system-collections.js` | Collection schema editor, including NPC template targets. |
| `src/ui/system/ui-collection-rewards.js` | Collapsed Level-up rewards controls with field-driven schedules and guided selection settings. |
| `src/ui/system/ui-system-progression.js` | Player and NPC template XP/Level selection, points per level, random/manual assignment, and eligible stats. |
| `src/ui/system/ui-collection-targets.js` | Collection target checkboxes for player and NPC template combinations. |
| `src/core/collection-targets.js` | Shared collection targeting rules for sheets, prompts, and updates. |
| `tests/collection-targets.mjs` | Template target normalization and update boundary tests. |
| `src/ui/system/ui-collection-fields.js` | Collection field controls with a pinned first identifier. |
| `src/ui/system/ui-system-range.js` | Inline validation of optional minimum and maximum values in Systems. |
| `src/core/collection-fields.js` | Require one collection identifier and preserve it during field edits. |
| `src/ui/system/ui-system-stats.js` | Stat schema editor. |
| `src/ui/system/ui-system-stat-policy.js` | Stat update policy and level-up eligibility controls. |
| `src/ui/system/ui-system-generation.js` | Premise form, staged progress/retry, draft summary/editing, and validated save-as-new. |
| `src/ui/system/ui-system-context.js` | Explicit live Builder data/save/rename callbacks; draft contexts use the same interface. |
| `src/ui/system/ui-draft-details.js` | Draft description and display choices outside the Builder tabs. |
| `tests/system-generation-planning.mjs` | Regression for Gemma counter defaults, missing counters, and cross-scope template selections. |
| `tests/stat-guidance.mjs` | Validate generated stat purposes and player/NPC injury prompt coverage. |
| `tests/tracker-reading-integrity.mjs` | Model blank-reading protection, acquisition prompt guidance, and legitimate stack gains. |
| `tests/model-numeric-reading-repair.mjs` | Production numeric repair across scopes, conservative exclusions, and retained XP/lock/cap safeguards. |
| `tests/reader-numeric-schema.mjs` | Numeric pattern acceptance/rejection, provider compatibility, and purposeful XP prompt coverage. |
| `tests/system-generation.mjs`, `tests/system-generation-request.mjs` | Staged contracts, semantic corruption, limits, retries, cancellation, requests, and fixture progression. |
| `tests/ui-system-generation.py` | Mocked, unsaved Firefox generator workflow and live-state isolation checks. |
| `tests/fixtures/system-generation.mjs` | Shared staged-generation plan and mock responses; excluded from the test entry glob. |
| `tests/fixtures/generated-expedition-system.json` | Canonical generated example with targeted progression and scheduled technique rewards. |
| `src/ui/system/ui-system-manager.js` | Reusable System manager, starter selection, import, export, and activation. |
| `src/ui/system/ui-system-details.js` | Inline System name/subtitle editing and duplicate action. |
| `tests/ui-system-manager.py` | Unsaved live Manager layout, inline editing, keyboard controls, and roster action placement checks. |
| `tests/system-library-actions.mjs` | Rename persistence, stable chat ownership, name conflicts, current-rule capture, and independent duplication of NPC, Place, and memory carryover. |
| `src/ui/shared/ui-template-tidy.js` | Prompt template cleanup UI. |
| `src/ui/shared/ui-theme.js` | Apply themes and portrait/speech display options. |
| `src/ui/tracker/ui-tracker-settings.js` | Tracker settings entry point. |
| `src/ui/tracker/ui-tracker-display-reading.js` | Display and extraction reader controls. |
| `src/ui/tracker/ui-tracker-scan-review.js` | History scan and change review controls. |
| `src/ui/tracker/ui-tracker-tools.js` | Context, cleanup, and dashboard controls. |
| `src/ui/tracker/ui-tracker-context.js` | Tracker context report. |
| `src/ui/tracker/ui-tracker-history.js` | History-note fields, current tracker placement, and chat cleanup. |
| `src/ui/tracker/ui-tracker-popups.js` | Advanced tracker and dashboard popups. |
| `src/ui/shared/ui-transfer.js` | Import/export dialogs. |
| `src/ui/manage/ui-manage-state.js` | Management popup state and navigation. |
| `src/ui/manage/ui-manage-grid.js` | Character grid assembly and filtering. |
| `src/ui/manage/ui-manage-cards.js` | Character card controls in the management grid. |
| `src/ui/manage/ui-manage-editor.js` | Character editor tabs and form assembly. |
| `src/ui/manage/ui-manage-pictures.js` | Character picture and tag editor. |
| `src/ui/manage/ui-manage-collections.js` | Character collection editor. |
| `src/ui/manage/ui-manage-overrides.js` | Character override and alias editor. |
| `src/ui/manage/ui-manage-transfer.js` | Management popup import/export actions. |
| `src/ui/shared/css-origin.js` | Diagnose CSS visibility and rule origins. |
| `src/ui/shared/template-labels.js` | Find and repair template labels. |
| `style.css` | Manifest CSS entry point; imports the ordered stylesheets below. |
| `styles/01-base.css` | Base layout, controls, and shared visual tokens. |
| `styles/02-themes-a.css` | First group of extension themes. |
| `styles/03-themes-b-chat.css` | Remaining themes and chat decoration. |
| `styles/04-cards-editor.css` | Character cards and editor styling. |
| `styles/05-tracker-review.css` | Tracker and change review styling. |
| `styles/06-meters-hud-player.css` | Stat meters, HUD base, and player sheet. |
| `styles/07-collections-responsive.css` | Collection cards and responsive layouts. |
| `styles/08-collections-readonly.css` | Read-only collection views and portraits. |
| `styles/09-hud-meters-layouts.css` | HUD meters and layout variants. |
| `styles/10-hud-layouts-fill.css` | HUD placement and automatic fill views. |
| `styles/11-character-sheets.css` | Character sheets and related settings views. |
| `styles/12-picture-tags.css` | Picture tag editor and gallery. |
| `styles/13-system-profiles.css` | System profile field Builder controls. |
| `styles/14-memories.css` | Character memory editor and archive presentation. |
| `styles/15-setting-help.css` | Settings help icons and popover styling. |

## Persistent places

| File | Responsibility |
| --- | --- |
| `docs/location-persistence-plan.md` | Stage-one ownership, review, context, editing, and verification contract. |
| `src/locations/location-store.js` | Pure place normalization, stable IDs, aliases, containment validation, CRUD, current marker, and display path. |
| `src/locations/location-proposals.js` | Story-derived proposals, immutable review payloads, freshness, and dependent acceptance. |
| `src/locations/location-reader.js` | Dedicated place prompt context, strict output parsing, and configured model requests. |
| `src/locations/location-reading.js` | Code-owned first-location initialization, boolean movement gating, freshness, and isolated request failures. |
| `src/prompts/prompt-texts-locations.js` | Editable system and user prompts for the separate place reader. |
| `src/locations/location-runtime.js` | Reader provenance, source validation, chat saves, and reviewed turn effects. |
| `src/locations/location-context.js` | Literal mention detection, bounded narrator recall, current-place context and movement-flag instructions, and place-detail schema. |
| `src/locations/location-lore.js` | Read-only lorebook listings and entry reads. |
| `src/locations/location-background.js` | Apply a current Place's linked image through the chat background metadata and visible host background. |
| `src/locations/location-image.js` | Build landscape prompts, draw a Place image through SillyTavern Image Generation, and attach fresh results to chat-owned cards. |
| `src/ui/locations/ui-locations.js` | Chat-scoped Places management, search, manual editing, current marker, and deletion undo. |
| `src/ui/locations/ui-location-lore.js` | Reference linking and explicit copying into an unsaved place description. |
| `src/ui/locations/ui-location-review.js` | Visible place identities, containment, editable descriptions, and legacy citation display. |
| `styles/18-locations.css` | Places editor, responsive list, and review row layout. |
| `styles/19-generation-activity.css` | Activity indicators above the composer. |
| `tests/locations-store.mjs`, `tests/location-proposals.mjs` | Pure identities, validation, uncited proposals, dependency, and acceptance checks. |
| `tests/location-image.mjs`, `tests/image-command.mjs`, `tests/ui-place-background.cjs`, `tests/ui-background-generation.py` | Automatic drawing, queued image commands, stale-result guards, and live Place image editor/background recovery checks. |
| `tests/location-context.mjs`, `tests/locations-ui.mjs` | Prompt/schema integration, bounded matching, editor controls, and stale-chat guards. |
| `tests/location-runtime.mjs`, `tests/location-turns.mjs` | Mixed review orchestration, provenance, current-turn replacement, manual corrections, and System independence. |
| `tests/ui-locations.py` | Temporary unsaved browser check of Places, review, and the in-chat tracker trail. |
| `tests/fixtures/gemma-tracker-scenarios.mjs`, `tests/fixtures/gemma-tracker-harness.mjs` | Pre-registered Fantasy/Dating tracker cases and production prompt, sanitizer, collection, progression, and place-review harness. |
| `tests/fixtures/gemma-tracker-natural-scenarios.mjs` | Two-paragraph prose cases for explicit local-model evaluation. |
| `tests/fixtures/gemma-location-tree-scenarios.mjs` | Focused Fantasy/Dating cases for a new parent and an independent new root, in explicit, narrative, and mixed-turn prose. |
| `tests/eval-gemma-tracker.js`, `tests/gemma-evaluation.mjs` | Explicit local-model evaluation runner and offline checks of its scoring path. |
| `tests/fixtures/gemma-request-batches.mjs` | Bound parallel evaluation requests per endpoint; keep normalization serial. |
| `tests/fixtures/gemma-location-check.mjs` | Score current places through their recorded containment chain. |
| `tests/fixtures/tracker-pool-audit.mjs` | Audit raw reader proposals for changes to established pool maxima before sanitation. |
| `tests/eval-gemma-location-evidence.js` | Historical A/B probe replaying frozen quote and no-quote prompts against raw model place choices. |
| `tests/fixtures/gemma-profile-scenarios.mjs`, `tests/fixtures/gemma-profile-harness.mjs` | NPC profile Fill and opt-in automatic lore cases using production prompt and parser code. |
| `tests/eval-gemma-profiles.js`, `tests/gemma-profile-evaluation.mjs` | Explicit local-model profile runner and offline harness checks. |
| `docs/evaluations/` | Final frozen prompt/result pairs and scoped Gemma evaluation reports. Intermediate runs are excluded from the current tree. |

## Maintenance notes

`src/tracker/extractor/status-extractor-queue.js` serializes overlapping readings,
coalesces duplicates, and validates queued reply ownership before execution.
`tests/extraction-queue.mjs` and `tests/tracker-regenerate.mjs` cover ordering,
cancellation, source invalidation, and use of the preceding applied state.
`docs/adversarial-review-20261025.md` records the current critique and follow-up status.

`src/tracker/status-logic.js` binds the state providers by name, then freezes the shared
registry. `tests/status-dependencies.mjs` checks that each dependency has one
provider. The registry still resolves cross-module calls at runtime, so changes to
initialization and shared state need care. `normalizeSettings` sequences focused
migration passes, `generateLoreEntry` separates dialog construction from its async
actions, and `renderEditor` routes among smaller view builders. Their key behavior
paths have regression tests under `tests/`.


## NPC expressions and voices

| File | Responsibility |
| --- | --- |
| `src/expressions/expression-engine.js` | Last NPC dialogue selection, deterministic sprite variants, serialized classification, and bounded result cache. |
| `src/expressions/expression-events.js` | Completed foreground reply authorization, expected regeneration deletion, and cancellation on source changes. |
| `src/expressions/host-expressions.js` | Host sprite listings, supported classifier modes, and dialogue-only classification. |
| `src/expressions/expression-prompts.js` | Saved defaults for all 28 emotions, generation preference normalization, and portrait-specific pack naming. |
| `src/expressions/expression-generation.js` | Serialized missing-sprite edits, duplicate prevention, freshness checks, and explicit failure retry. |
| `src/expressions/host-expression-generation.js` | Direct Image Edit integration and generated image upload to host sprite packs. |
| `src/expressions/expression-image-cleanup.js` | Delete only unique Image Edit sources returned to expression generation after transfer or cancellation. |
| `src/expressions/scene-sprite-state.js` | Present-NPC matching and saved sprite freshness/order rules. |
| `src/expressions/scene-sprites.js` | Chat-owned latest sprite records and persistent multi-NPC display independent of speech. |
| `src/expressions/dialogue-portrait-state.js` | Compact per-line sprite selections, reply freshness, and native swipe-extra synchronization. |
| `src/expressions/dialogue-portraits.js` | Save and restore exact dialogue portraits using the existing chat-save queue. |
| `src/expressions/npc-expressions.js` | Runtime freshness guards, cached dialogue portraits, and event registration. |
| `src/ui/characters/ui-expressions.js` | NPC sprite previews and folded sprite-pack controls in NPC Edit. |
| `src/ui/characters/ui-expression-generation.js` | Compact manual emotion generation, saved prompts and workflow, and generate/retry/regenerate controls. |
| `src/tts/tts-settings.js` | Independent speech settings normalization and per-NPC voice resolution. |
| `src/tts/speech-units.js` | Ordered narration and quoted dialogue from rendered story paragraphs. |
| `src/tts/speech-events.js` | Completed-reply authorization and stale-source cancellation. |
| `src/tts/speech-queue.js` | Appendable, cancellable ordered playback with bounded synthesis prefetch. |
| `src/tts/line-stream.js` | Completed raw line commitment, continuation boundaries, and committed-prefix rewrite detection. |
| `src/tts/stream-format-source.js` | Withhold unresolved quotes, fences, and hidden markup before speech discovery. |
| `src/tts/npc-streaming.js` | Generation-scoped completed-line producer and duplicate/final-flush guards. |
| `src/tts/npc-stream-host.js` | Host streaming events, active-message decoration, provisional voice cues, and final expression adoption. |
| `src/tts/openai-speech.js` | OpenAI-compatible synthesis through the host server proxy and HTML audio playback. |
| `src/tts/npc-tts.js` | Castward Play/Stop controls, automatic gating, previews, and runtime voice routing. |
| `src/tts/voice-cue-format.js` | Narrator cue validation and removal from rendered dialogue and narration. |
| `src/tts/voice-cues.js` | Chat-scoped provisional voice identities and first-reply cue capture. |
| `src/ui/tts/ui-tts-settings.js` | Menu Speech section with searchable model, narrator, and automatic playback controls and shared built-in endpoint display. |
| `src/ui/characters/ui-voices.js` | Per-NPC voice selection, missing-binding status, and deliberate preview. |
| `styles/16-npc-expressions.css` | NPC expression and voice editor layout. |
| `tests/npc-expressions.mjs` | Classification order, caching, failure recovery, variants, cancellation, and event gating. |
| `tests/foreground-replies.mjs` | Expression and speech authorization through regeneration's expected deletion, plus unrelated deletion and source-change guards. |
| `tests/fixtures/ui-expression-regeneration.js`, `tests/fixtures/ui-expression-speech.js` | Page-context regeneration and speech helpers for the unsaved expression UI check. |
| `tests/expression-generation.mjs` | Prompt persistence, pack isolation, missing-sprite reuse, duplicate jobs, cancellation, and explicit retry. |
| `tests/scene-sprites.mjs` | Scene membership, saved sprite freshness, and ordering of delayed versus manual expressions. |
| `tests/dialogue-portraits.mjs` | Portrait serialization, per-line identity, edit invalidation, generated updates, and swipe-extra preservation. |
| `tests/ui-npc-expressions.py` | Unsaved live portrait and editor checks with mocked classification and sprite packs. |
| `tests/fixtures/ui-expression-streaming.js`, `ui-expression-editor.js`, `ui-expression-scene.js` | Shared live streaming-adoption, editor, and scene-display fixture sections. |
| `tests/npc-tts.mjs` | Speech segmentation, queue ordering/cancellation, voice fallback, and completion gating. |
| `tests/tts-line-stream.mjs`, `tests/stream-format-source.mjs`, `tests/npc-streaming.mjs`, `tests/npc-tts-stream-queue.mjs` | Streaming boundaries, markup exclusions, cancellation, final flushing, and appendable queue ordering. |
| `tests/ui-npc-streaming.py` | Unsaved live streaming checks using the host formatter and controlled generation events. |
| `tests/host-expressions.mjs` | Cancellable Local/Extras requests and the retained native WebLLM lock. |
| `tests/ui-tts-routing.py`, `tests/fixtures/ui-tts-routing.js` | Unsaved Firefox checks for generic models, independent voice lists, previews, ordered playback and explicit voice-design routing using mocked audio. |
| `tests/voice-cues.mjs` | Complete narrator cue syntax, speaker matching, and rejection of fenced or malformed cues. |
| `tests/ui-npc-voices.cjs` | Windows headless Edge check of settings, manual/automatic routing, duplicate guard, and optional real preview. |

## Theme customization

| File | Responsibility |
| --- | --- |
| `src/core/theme-customization.js` | Validated per-preset overrides and shared application to theme roots. |
| `src/ui/settings/ui-theme-customization.js` | Collapsed Appearance editor, live changes, and field/preset reset. |
| `styles/17-theme-customization.css` | Custom effects and responsive editor layout. |
| `tests/theme-customization.mjs` | Import validation, preset isolation, and stale-style cleanup. |
| `tests/ui-theme-customization.py` | Unsaved live checks of all presets, themed surfaces, resets, and narrow layout. |

| `tests/fixtures/gemma-location-change-scenarios.mjs` | Boolean scene-location detection and mixed stat/inventory cases for explicit local-model evaluation. |

| `tests/location-reader.mjs`, `tests/location-reading.mjs` | Dedicated reader contract, request routing, initialization, movement gates, stale replies, and failure isolation. |
| `tests/eval-gemma-location-reader.js` | Explicit frozen local-model evaluation of dedicated place reading and production review proposals. |
