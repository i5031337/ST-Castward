# Gemma E4B scene-location flag experiment

The tracker now outputs a top-level JSON boolean, `locationChanged`, alongside ordinary stats, cast, and inventory. It receives only the recorded current place's name/aliases and containing-place names. Place descriptions, discovery lists, parent links, and IDs are absent from its requested output. The schema and tracker examples use the boolean too. Schema enforcement was disabled during inference.

The final wording passed **16/16 location classifications and 64/64 total checks** on eight regression/control scenarios, repeated twice. This is encouraging regression evidence, not an independent reliability estimate: the scenarios informed the wording, and the final revision has not been rerun across the whole 24-scenario set.

| Revision | Trials | Flag correct | Known-location flag correct | All checks passed |
| --- | ---: | ---: | ---: | ---: |
| `location-flag-v1` | 48 | 42/48 | 38/40 | 228/234 |
| `location-flag-player-v2` | 16 | 13/16 | 13/16 | 61/64 |
| `location-flag-player-v3` | 16 | 16/16 | 16/16 | 64/64 |

The first revision covered 24 scenarios (48 trials): existing tracker cases, mixed stats/inventory/movement, aliases, room changes, moving within one room, departures with unknown destination, invitations, NPC-only travel, returning to the starting place, implicit arrival, second-person travel, and place descriptions without movement. The two follow-ups used eight scenarios selected before inference: fantasy travel, mixed dating travel/gift/energy, alias stay, room arrival, same-room movement, unknown-destination departure, NPC-only departure, and return to the original place.

V1 returned the boolean in all 48 replies. All 18 true player movements were detected. Two stationary replies treated an NPC's departure as player movement. Four of eight opening replies returned true despite an unknown recorded location. V2 explicitly compared the player's final location; one NPC-only false positive remained, and two room changes were missed. V3 added concise room granularity and explicit stationary-player/NPC-travel guidance. All selected checks passed, with no ordinary tracker failures or changed pool maxima.

Unknown opening locations remain code-owned bootstrap cases: the current prompt asks for false when the recorded location is unknown, but V1 shows that this convention is inconsistent. Future orchestration should trigger initial location processing directly from missing state, independently of this flag. V2/V3 focused on comparisons against an existing recorded location.

This evaluation covered the signal-only prototype. The subsequent separate location reader and runtime dispatch are documented in [the location reading flow](../location-persistence-plan.md) and [dedicated-reader evaluation](gemma-e4b-location-reader-shape-v2-report.md). Historical place-detail evaluations are retained but no longer test the tracker’s boolean contract.

Configuration: port 9931 only; Gemma `/mnt/D/backup_models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf`; llama.cpp `b11669-620d2225c`; four concurrent requests; 65,536-token context; 2400-token reply budget; server defaults (temperature 1, top-k 64, top-p approximately .95, random seed). No failed inference was replaced or discarded. Prompts/scorers were frozen within each run. Final production-source fingerprints matched the final frozen bundle.

Local validation: all 685 tests passed after the player-perspective revision; after the final wording change, all 15 location-context and flag-integration checks passed. `git diff --check` passed.

### location-flag-v1

[Full frozen requests](gemma-e4b-location-flag-v1-prompts.json) · [Raw responses and scores](gemma-e4b-location-flag-v1-results.json).

- `dating-opening` #2: locationFlag no.

- `fantasy-holdout-opening` #1: locationFlag no.

- `fantasy-holdout-opening` #2: locationFlag no.

- `dating-holdout-opening` #2: locationFlag no.

- `npc-departs-alone` #1: locationFlag no.

- `npc-departs-alone` #2: locationFlag no.

### location-flag-player-v2

[Full frozen requests](gemma-e4b-location-flag-player-v2-prompts.json) · [Raw responses and scores](gemma-e4b-location-flag-player-v2-results.json).

- `room-arrival` #1: locationFlag yes.

- `room-arrival` #2: locationFlag yes.

- `npc-departs-alone` #2: locationFlag no.

### location-flag-player-v3

[Full frozen requests](gemma-e4b-location-flag-player-v3-prompts.json) · [Raw responses and scores](gemma-e4b-location-flag-player-v3-results.json).
