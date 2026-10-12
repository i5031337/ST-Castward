# TTS and expressions audit — 2026-10-12

This records every finding from the adversarial review and its repair status.
The review's focused Node tests and live Firefox expression UI check passed;
the findings concern cases missing from that coverage.

| ID | Finding | Required repair | Status |
| --- | --- | --- | --- |
| 1 | Cardless/persona dialogue sends narrator voice to NPC model. | Route narrator fallback through narrator model. | Fixed |
| 2 | Fresh expression jobs join cancelled/stale work; cancellation and replacement semantics are lost. | Respect job lifecycle and replacement when deduplicating. | Fixed |
| 3 | Generation resets strip historical inline expression portraits. | Preserve valid historical portraits during cancellation. | Fixed |
| 4 | Stalled classification blocks future expressions and speech preparation. | Bound classification waits and cancel stale work without uncontrolled WebLLM overlap. | Fixed |
| 5 | NPC preview uses narrator model except Qwen. | Share preview/playback routing; support arbitrary model identifiers and explicit voice capabilities. | Fixed |
| 6 | Prefetch retains consumed audio until the message finishes. | Release consumed audio and scheduling references. | Fixed |
| 7 | Repeated lines reload identical packs and repeatedly rediscover/redecorate the whole message; scene updates clear unrelated pack caches. | Reuse packs, target avatar updates, invalidate only changed packs. | Fixed |
| 8 | Every NPC stores 84 built-in prompts (~12.9 KB) and lookups repeatedly normalize/stringify all cards. | Store custom overrides only; normalize chat cards once at ingestion. | Fixed |
| 9 | Expression generation stores both permanent Image Edit source and sprite copy; regeneration accumulates sources. | Dispose only generated source images owned by this operation after transfer or failure. | Fixed |
| 10 | Scene matching stringifies alias objects rather than reading patterns. | Use actual alias schema and realistic fixtures. | Fixed |
| 11 | Broken editor preview claims portrait fallback but hides the image. | Actually attempt portrait fallback and handle its failure. | Fixed |

Additional UX observation: the last speech sprite intentionally remains visible
through narration and natural completion (covered by existing UI checks). Keep
that behavior, but describe the retained portrait without claiming active speech.

Model support must distinguish arbitrary OpenAI-compatible model/voice IDs from
the local service's encoded voice-design protocol. Narrator and dialogue models
may have different voice lists. Default/unassigned voices must use the narrator
model; explicit NPC voices must use the dialogue model. Preview must follow the
same rules. No other model installations or real synthesis are required to verify
these routing contracts.


## Repairs and verification

All eleven findings are repaired. Added regression coverage for cancellation and
fresh retry, retained native WebLLM locking, classification deadlines, generic
preview/model routing, collectible consumed audio, realistic aliases, sparse
prompt overrides, and one-time chat-card normalization.

Validation on 2026-10-12:

- `node --test tests/*.mjs`: 490 tests passed, including the isolated forced-GC
  audio-memory regression (subprocess permission required in this sandbox).
- `python3 tests/ui-npc-expressions.py`: passed against local SillyTavern,
  including preserved historical portraits, shared pack loads, and actual editor
  portrait fallback.
- `python3 tests/ui-tts-routing.py`: passed in Firefox with mocked speech audio;
  verifies arbitrary narrator/dialogue models, independent voice lists, actual
  preview/playback routing, prefetch, and explicit designed-voice capability.
- `git diff --check`: passed.

Constraints: native WebLLM cannot be interrupted by this extension, so its lock
remains held and new lines use fallback until it finishes. Already running image
edits finish in the background after cancellation so their exact generated source
can be deleted; edits remain serialized. Source cleanup applies to new generated
UUID files only, without scanning or deleting old files. Failed cleanup warns and
does not hide an otherwise successful sprite upload. Models share the host
endpoint/key and its MP3/speed request contract; other provider protocols require
an adapter. No additional model was installed or queried.
