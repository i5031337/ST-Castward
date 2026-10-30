# New NPC starting quantities: Gemma E4B probe

Gemma E4B on `http://127.0.0.1:9931/v1` read a Fantasy Adventure reply introducing Bram, a newly created river guard. His saved card held 12 crossbow bolts, one crossbow, and two healing potions. The reply described him checking those items; nothing was acquired. Requests used the production reader prompt and a 1,200-token limit, without schema enforcement, sampler overrides, or fixed seeds.

| Prompt input | Trials | Result |
| --- | ---: | --- |
| Saved card in the known offstage section, updated collection wording | 5 | Three complete replies used `add` for the saved holdings and would double them. One truncated reply contained a partial addition; one had no usable NPC result. |
| Creation-turn card shown in prompt-only CURRENT STATE, simplified collection wording, examples aligned with that state | 5 | Four replies kept quantities unchanged. One complete reply used `add` and would double the holdings. |
| Creation-turn view before the example alignment; Bram gives Alex one of his two potions | 3 | All three assigned one potion to Alex and left one with Bram, without adding other saved items. |

The prompt-only view does not write scene state. It applies only to a card created for the current user turn under the active System and named in the reply. A separate two-run probe, also before the example alignment, showed its limitation: when the newly created card was mentioned as remaining elsewhere, E4B treated the NPC as present both times, and one reply also proposed adding its saved items. The approach favors the usual immediate introduction but cannot establish presence from a name mention alone.

The reader still rejects bare collection lists before applying model updates. Valid `add` operations follow the configured review mode; this change does not force review.
