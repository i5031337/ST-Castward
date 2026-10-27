# Inherited feature trimming review

Reviewed 2026-10-27 against local `upstream/main`, commit `449fb5a` (SillyNPC 0.7.0), and Castward commit `a788da3`. This is a static code/history review, not usage telemetry or a live UI assessment. The review itself does not authorize feature removals; completed removals below were requested separately.

The review follows inherited behavior through moved and split modules. Similarity to upstream is evidence of origin, not a reason by itself to remove useful functionality. The aim is to reduce peripheral workflows and maintenance while preserving character profiles, tracking, progression, and the visible cast.

## Strongest removal candidates

### Phrase ban list and repetition scan

**Removed 2026-10-27.** The phrase editor, model-based repetition scan, sampler macros, avoidance instructions, settings, and scan statistics have been removed. Writing preferences belong in writing presets or backend controls. The independent Not Speakers setting remains available for dialogue recognition.

The runtime change removes 578 lines and adds 6, for a net reduction of 572 lines across JavaScript and CSS (including comments and blank lines). A 26-line migration regression test verifies that speaker exclusions and character data survive.

The removed implementation lived in `src/prompts/banlist.js` and `src/ui/shared/ui-banlist.js`. [Dialogue settings](../src/ui/settings/ui-settings-writing.js) now cover NPC creation, dialogue formatting, and speaker recognition.

### Token statistics and estimated request ceilings

**Removed 2026-10-27.** The statistics page, cumulative usage counters, automatic request/reply token accounting, estimated request ceilings, and System-generation token totals have been removed. Request limits for System generation remain.

Profiles and Tracker now show approximate base-instruction tokens for the active System. These use the same instruction templates and field-definition builders as generation, estimated locally at four characters per token. Profiles shows Player and NPC counts, with a range when NPC templates select different fields. It represents a full profile/lore request; single-field rewrites use a shorter prompt. Tracker includes configured stats, collections, progression rules, NPC template guidance, and state-independent examples.

These are instruction estimates, not request totals: they exclude story, held readings, existing profiles, retrieved lore, scene-dependent reminders, replies, and connection/provider overhead (including transported response schemas). Reopening a reader tab picks up changed System definitions; reader settings refresh the displayed estimate in place. No tokenizer/model requests or usage history are needed. The separate lore-context excerpt estimate remains. Places and the NPC creation tool have no token readouts for now.

The removed modules were `src/ui/shared/ui-stats.js` and `src/core/usage.js`. The unused prompt-editor token option was also removed. [tokens.js](../src/core/tokens.js) now provides only the local approximation used by [reader readouts](../src/ui/shared/ui-reader-tokens.js).

### Faces for Strangers portrait pool

**Recommendation: cut the pool, retaining the built-in silhouette fallback.** The pool includes stock-image upload, tags, reader classification of cardless speakers, stored face assignments, absence windows, card fallback assignments, and redraw controls. The module retains essentially all of its upstream implementation aside from import relocation. Generated character portraits provide another route to distinct faces.

The loss is visual variety for incidental speakers before they receive portraits. This is a larger behavioral removal than simply deleting the pool editor: reader prompts/schema, chat signatures, media references, and saved assignments also participate. Existing images should not be deleted as a side effect.

Sources: [default-portraits.js](../src/characters/default-portraits.js), [pool editor](../src/ui/settings/ui-settings-defaults.js), [reader schema](../src/tracker/extractor/status-extractor-schema.js).

## Other removal or simplification candidates

| Feature | Suggested scope | Benefit and tradeoff |
| --- | --- | --- |
| Dialogue instruction in SillyTavern's prompt list | Remove this optional integration; retain normal extension prompt injection and the dialogue-format switch. | Avoid creating/updating entries inside completion presets, managing their order, and restoring them after preset changes. Users lose prompt-list placement of this one reminder. |
| Category-based cast restrictions | Keep categories as organizational folders; consider removing category-based chat eligibility, individual eligibility overrides, and category rename redirects together. | Chat ownership and System roster reuse now provide other cast boundaries. Shared world-card users would lose selective access to portions of a library. Removing eligibility rules changes behavior and needs an explicit replacement policy. |
| Find existing images | Remove the shared-folder filename-prefix recovery scan. | Current portrait writes use character folders and timestamp filenames. The scanner mainly recovers older unregistered images. Users could upload those manually. Retain ordinary portrait upload, galleries, and storage. |
| Embedded lorebook management | Consider removing raw lore editing and Delete Entry from character sheets. Keep linking, generation, synchronization, and automatic lore availability. | Reduce duplicated management controls by leaving raw editing/deletion to SillyTavern's lorebook editor. The code saving is limited because the remaining lore workflow still needs most integration. Raw editing is currently exposed for the player, not NPCs. |
| Theme variants | Consider fewer shipped themes while retaining a native-looking choice and basic customization. | Reduce visual combinations to maintain. The eight inherited presets provide convenient personalization; newer theme customization is fork work and should be evaluated separately. |
| HUD variants and cosmetic controls | Keep the floating HUD, positioning, and scaling. Consider one bar layout and one compact layout, with fewer portrait/meter styling controls. | Reduce renderer/style combinations and settings. Users lose preferred visual layouts. Existing layout retirement and recent drag/accessibility fixes mean this feature is not wholly untouched. |
| Bulk profile-field rewriting | Optional, low-priority cut of Rewrite a field across selected characters. Keep bulk selection, deletion, export, search, and filtering. | Remove an infrequent multi-request workflow and its field chooser/results reporting. Users would regenerate individual fields instead. Most selection infrastructure remains useful, so savings are modest. |

Sources: [prompt-list integration](../src/prompts/prompt-slot.js), [category/cast rules](../src/characters/characters.js), [library controls and bulk rewriting](../src/ui/manage/ui-manage-grid.js), [image recovery](../src/api/api-image-files.js), [image storage controls](../src/ui/settings/ui-settings-generation-storage.js), [lore controls](../src/ui/story/ui-lorebook-section.js), [appearance settings](../src/ui/settings/ui-settings-appearance.js), [HUD settings](../src/ui/hud/ui-hud-settings.js).

## Historical world-state notes: retain after closer inspection

This was initially suggested as a cut for users who do not use it. After measuring the implementation, **keeping it is the better default recommendation**. The user does not use it personally but values its potential usefulness for dates over long histories. Non-use alone does not justify removal of this small optional feature.

Its dedicated footprint at the reviewed commit is:

| Component | Physical lines, including comments and blanks | Nonblank, noncomment lines |
| --- | ---: | ---: |
| [history-notes.js](../src/story/history-notes.js): format notes, annotate copied history, recognize/remove echoes, synchronize the active swipe | 139 | 52 |
| [entry-history-notes.js](../src/entry/entry-history-notes.js): interceptor and reply cleanup wrapper | 43 | 33 |
| [buildHistoryNoteFields](../src/ui/tracker/ui-tracker-history.js): field-selection function only | 49 | 43 |
| Total above | 231 | 128 |

The rest is a small number of integration points: the manifest interceptor declaration, import and two message-event handlers, an enable switch, two settings, two prompt definitions, and a conditional explanation in the scene prompt. The remainder of `ui-tracker-history.js` handles tracker placement and is unrelated. Line counts are a footprint estimate, not a full deletion estimate or complexity score.

The feature reuses global snapshots already saved for tracker behavior. Removing it would not justify removing snapshots. It makes no additional model requests and adds no separate date parser, calendar, or history database. When disabled (the default), both the interceptor and echo-cleanup wrapper return before processing history or replies.

When enabled, it prefixes selected world fields onto messages in the history copy supplied for generation. This can help the narrator distinguish when and where earlier events occurred, provided those messages have snapshots and remain in the context sent to the model. It does not recover dates for unsnapshotted messages or remember events outside that context. It also depends on the tracked date/time readings being correct.

The main operational cost is repeated prompt tokens, growing with the annotated history actually sent and the selected field lengths. There is also a bounded maintenance concern: recognizing echoed notes and removing them from replies, including the active swipe. The existing [reply-preservation test](../tests/reply-preservation.mjs) covers retaining a note when it is the entire reply. No live token-cost measurement was made for this review.

If revisiting this feature later, first consider clearer guidance to select only Date/Time and Location as needed. Removing it saves relatively little code compared with the stronger candidates above.

## Inherited features worth retaining

- Speaker detection, aliases, character colors, portraits, and dialogue blocks: central to the visible cast. Cosmetic options can be simplified separately.
- Portrait upload, gallery navigation, and full-size viewing: useful everyday controls.
- Character search/filtering, bulk selection, and portable export: useful as casts grow.
- Lore linking/synchronization: supports narrator recall and now connects to fork-specific automatic lore activation.
- Collection history scan: a distinct recovery workflow for inventories from older prose, with meaningful fork fixes.
- Change review, snapshots, undo, and swipe handling: safeguards around model-written state.
- Settings search, advanced-control disclosures, backups, and debug logging: useful support infrastructure.
- Message segmentation, mention matching, and template helpers: inherited implementations now serve rendering, speech, expressions, and Fill.

Progression, System generation, chat-owned NPCs, System carryover, memories, Places, speech, and expressions have received substantial fork development and are outside the mostly-unchanged feature set. Threads, goals, timing rules, the Pictures tagging interface, and Session Dashboard have already been removed.
