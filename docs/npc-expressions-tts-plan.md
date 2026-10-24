# NPC expressions and TTS

Updated 2026-10-12. Stages 1, 2, 4, and 5 and Stage 6 completed-line streaming
are implemented. Stage 3 was superseded by Castward-owned playback. Broader
providers and delivery controls remain optional future work.
This document describes the current behavior and remaining work; obsolete
implementation proposals have been removed.

## Implemented features

| Feature | Current behavior |
| --- | --- |
| Shared dialogue discovery | Highlighting, expression classification, and speech use the same recognized speakers, aliases, and quoted dialogue. |
| NPC expression settings | Bind an existing sprite folder, enable expressions, select a fallback label, and preview the pack in NPC Edit. |
| Static dialogue portraits | Each recognized NPC dialogue line gets its own expression. Playback never changes another line's portrait. |
| Full-size speech sprites | A separate, bottom-aligned display beside the chat shows the speaking NPC, preserving the full image with `object-fit: contain`. |
| Audible synchronization | The sprite switches only when that dialogue's audio emits `playing`, never when synthesis completes or audio is merely queued. |
| Independent TTS | Castward Play/Stop, opt-in automatic playback, separate narrator/NPC models, narrator voice, per-card voices, silence, and speed. |
| Ordered playback | Narration, dialogue, and actions play in message order, with bounded synthesis prefetch. |
| Completed-line streaming | Completed source lines render and enter automatic speech while generation continues; the unfinished tail flushes once at completion. |
| Designed NPC voices | Local Qwen VoiceDesign creates a persistent versioned NPC voice; narration can use Kokoro presets. |
| First-appearance voice cues | The story narrator supplies an optional voice description without a separate model request; cardless speakers can use a chat-owned provisional voice. |
| Ownership and transfer | Presentation preferences follow existing chat/reusable-card ownership. Imports mark asset/voice bindings unresolved and assign new card identities. |

## Dialogue and expression contract

Each speaker has their own recognized dialogue line. Attribution reuses the
existing highlighting rules; there is no additional multi-speaker attribution
engine. Classify only accepted quoted speech, excluding labels, surrounding
prose, actions, code, hidden content, tracker blocks, and widgets.

`readDialogueRecords` returns JSON-compatible records with message revision,
line index, NPC ID, display name, speaker label, persona flag, text, and quoted
text. Revision identity includes chat, character/group, message, swipe, source,
and translated display text. Discovery works when visual decoration is disabled.

Each completed reply classifies every recognized, expression-enabled NPC line.
The session cache and rendered results are bounded to 128 entries. Jobs are
serialized and deduplicated by revision, NPC, line, dialogue, classifier settings,
preferences, and pack vocabulary. Stale results cannot update changed chats,
swipes, sources, or card bindings. Variants are deterministic per line/revision.

In-chat portraits use the expression attached to their own dialogue line. They
remain independent of the speech display. Multiple quoted passages within one
recognized line share that line's expression. Fallback order is matching sprite,
configured fallback sprite, then the existing NPC portrait. Automatic expression
selection never writes the card's base `imageUrl`.

New foreground replies authorize automatic classification and speech. Streaming
replies commit completed source lines during generation; other replies start at completion.
History loading, rendering, and decoration refreshes only read cached pictures.
An explicit manual Play also prepares expressions for that message alongside
synthesis. Classification never blocks speech; a ready expression or portrait
fallback is used when audio starts. Stop prevents stale audio and expression work.

## Completed-line streaming

The host's `STREAM_TOKEN_RECEIVED` event supplies cumulative generated text.
Castward commits newline-terminated source lines and holds the last unfinished
line until generation finishes. It never uses host-added closing quotes or fences
as evidence that dialogue is complete. Unresolved quotes, code fences, and hidden
HTML blocks are withheld from speech discovery until their structure closes.
Completed text goes through the host formatter and shared dialogue discovery, so
speaker attribution, narration/action routing, and exclusions remain consistent.

Generation identities and stable line indices keep committed work valid as text
is appended. An open speech queue waits between arriving lines, synthesizes with
bounded prefetch, and plays each unit once in message order. Final completion
flushes the tail and closes the queue without restarting playback. Render updates
decorate only the active message and reuse committed expression results; they do
not run tracker extraction or whole-chat redraws per token.

Continue skips previous text. If it resumes an unfinished previous line, that
entire intersecting line is skipped for automatic speech; new lines are spoken.
Stop, generation cancellation, edits, swipes, deletion, chat/configuration changes,
and rewrites of committed text invalidate obsolete speech. Manual Play still
replays a message deliberately. Existing automatic-play opt-in and the native
automatic-TTS conflict gate apply during streaming as well.

First-appearance voice cues receive provisional identities before their first
committed dialogue is synthesized. Accepted cues and expression portraits are
saved under the finalized reply; cancellation discards provisional bindings.
Audio responses remain complete MP3 blobs through the unchanged host proxy.

## Full-size sprite behavior

Castward owns `#sillynpc-speech-sprite`, independently of native Expressions
holders and Visual Novel layers. The display sits on the right side of the chat,
uses full-body framing like native ST expressions, and scales down on narrow
screens. It does not intercept clicks.

When an NPC dialogue unit starts audibly, its line-specific expression is shown.
Narration and actions retain the last NPC sprite. Finishing playback retains it
as well. Stop, a new play request, generation, edit, swipe, deletion, chat switch,
or disabling the extension clears the display. Unknown/persona dialogue or an
NPC with expressions disabled clears it when that dialogue starts. Silent units
do not advance the displayed speaker. Missing image files fall back through the
pack fallback and base portrait.

The queue emits playing/end state with the speech unit. The `playing` state comes
from the HTML audio element's actual playback event. Synthesis completion cannot
advance the speaker. Native TTS's megaphone remains independent; synchronization
currently applies to Castward's own HTML audio playback.

## Classifier support and assets

Reuse the host's exported `getExpressionLabel` and sprite backend
`/api/sprites/get?name=...`. Supported classifiers are Local (0), Extras (1), and
WebLLM (3). Native available-sprite filtering is disabled because it resolves the
native character's pack. WebLLM receives labels constrained to the NPC pack;
custom labels also need registration in native Expressions. Classification shares
Castward’s standard Stop-button cancellation. Native WebLLM has no abort API;
Stop releases the caller and discards the result while retaining the native
request lock until that computation finishes.

Main-LLM classification (2) remains unavailable: full mode includes conversation
context, and raw mode lacks a shared request lock with native Expressions and
the background reader. NPC WebLLM requests run serially but do not share a lock
with other WebLLM consumers. The editor explains unsupported configurations.

Cards store `presentation.expressions` (enablement, stable sprite-folder binding,
fallback, binding status), provider-keyed `presentation.voices`, and versioned
`presentation.voiceDesign`. Sprite folders allow a folder and one subfolder.
Exports include preferences and references, not image files or credentials.
Imported older cards receive disabled/empty presentation defaults.

## Speech routing and designed voices

Castward reads the built-in OpenAI Compatible endpoint at synthesis time and
shares its server-side TTS secret. Its endpoint display is read-only; stale
legacy SillyNPC endpoint settings are discarded. Requests use SillyTavern's custom
speech proxy, keeping the key out of extension settings.

Narration and actions use the narrator model and preset voice. Recognized NPC
quotes use the NPC model and voice binding. Persona dialogue uses narration.
Unknown speakers use narration unless a usable chat voice cue supplies a design.
Missing voices and explicit silence retain their existing routing behavior.

The local `qwentts` service supports `qwen3-tts` NPC dialogue and `kokoro`
narration. The unmodified host proxy carries Qwen fields inside a `sillynpc-v1:`
URL-safe base64 JSON voice payload: stable `npc_id`, voice-description
`instructions`, and a bounded 128–512 token budget. The local service validates
and decodes this format; it is specific to that service. Kokoro receives no
Qwen-only fields. No generic host bridge or independent credentials were added.

The service designs the first spoken or preview line, then prepares a persistent
clone reference. Card identity plus voice version determines its server ID.
Changing a manual description increments the version. Imported cards receive
new UUIDs. Voice preview may therefore become the clone reference.

When Qwen speech is configured, the dialogue prompt requests a first-appearance
cue on its own line before an NPC's dialogue:

```text
[[NPC_VOICE speaker="Mira" description="adult feminine voice, low and warm, measured pace"]]

Mira: "Wait."
```

Only complete annotation lines for recognized non-persona speakers with quoted
dialogue in that reply are accepted. Cues are hidden from display and speech,
including host `<q>` formatting. Code-fenced, malformed, and unmatched cues are
ignored. The first accepted cue is stored in chat metadata with a stable ID and
version; repeated/edited cues do not redesign it. Manual card descriptions take
priority. A later card can resolve the existing cue through its name or literal
aliases. Missing cues keep the narrator fallback without another model request.

Stop and source/configuration changes invalidate synthesis and playback. Revision
is rechecked before requests and audio starts. Built-in automatic TTS blocks
Castward automatic playback and shows a warning without changing host settings.
Manual Castward Play remains available.

## Remaining optional work

- **Stage 6: broader providers and styling.** Add provider adapters and supported
  pitch, rate, or emotional-delivery controls. Global speed already exists.
- **Main-LLM expressions.** Requires explicit host request coordination and a
  dialogue-only classification path.
- **Portable sprite packaging.** Export/import image assets in addition to references.
- **Missing-cue fallback model.** Optionally design voices through a separate small
  model when the story narrator omits its cue.

Lip sync and animation are outside the implemented speech synchronization scope.
The old host TTS prototype and its source patch were removed, not left unfinished.

## Verification

On 2026-10-12, the Node suite passed 511 tests. Streaming tests cover raw line
boundaries, mutable tails, committed rewrites, unresolved markup, repeated lines,
Continue, final one-shot flushing, bounded queue prefetch, Stop, regeneration
authorization, and provisional cue commitment. `tests/ui-npc-streaming.py`
passed 36 checks of the host formatter and controlled streaming events without
model or audio requests, including host-trimmed tails and changed final display
cancellation. The full expression fixture passed with additional checks of stable
streaming records, pending classification adoption, and speech portraits after
finalization.

On 2026-10-11, all 76 Node test files passed. Focused queue tests cover ordered
prefetch, audio-start notifications, stale callbacks, and Stop during expression
preparation. The live Firefox `tests/ui-npc-expressions.py` fixture passed with
mocked packs, classification, synthesis, and controlled audio events: alternating
NPCs, distinct expressions for repeated speakers, full-body framing, static
line portraits, no synthesis-driven advance, retention after speech, Stop cleanup,
cache reuse, image fallbacks, stale rejection, and native-holder isolation.
Fixtures restore settings/chat metadata and do not save or make model requests.

Earlier checks verified shared dialogue extraction, ownership/transfer, narrator
voice cues with the host formatter, and real Kokoro/Qwen MP3 playback through the
unchanged host proxy. The Qwen design reference reached ready and was reused.
Those checks verified routing and non-silent waveforms, not audible voice quality.

Remaining deliberate manual checks: listening quality, real Local/Extras and
WebLLM classification, contention with native WebLLM, real sparse/deleted sprite
packs, and coexistence with native Expressions in Visual Novel/group mode. These
are verification tasks, not unimplemented MVP features.

## Main implementation files

- `src/chat/dialogue-discovery.js`, `dialogue-presentation.js`, `chat-speech.js`:
  shared attribution and dialogue/portrait line identity.
- `src/expressions/host-expressions.js`, `expression-engine.js`,
  `npc-expressions.js`, `speech-sprite.js`: classification, caching, static line
  portraits, and the independent full-size display.
- `src/tts/speech-units.js`, `speech-queue.js`, `openai-speech.js`, `npc-tts.js`:
  ordered speech units, preparation, synthesis, audible playback, and controls.
- `src/tts/line-stream.js`, `stream-format-source.js`, `npc-streaming.js`,
  `npc-stream-host.js`, `src/chat/dialogue-stream-state.js`: raw line commitment,
  safe formatting, generation ownership, incremental rendering, and final adoption.
- `src/tts/tts-settings.js`, `voice-cues.js`, `voice-cue-format.js`: routing,
  designed voice payloads, and chat-owned narrator cues.
- `src/ui/characters/ui-expressions.js`, `ui-voices.js`,
  `src/ui/tts/ui-tts-settings.js`: editors and speech configuration.
- `styles/16-npc-expressions.css`: editor and full-size sprite styling.

Keep source modules below 20 kB. Preserve card/chat ownership and transfer
boundaries. System definition changes must also update generation contracts,
stage requests, validation, and fixtures.
