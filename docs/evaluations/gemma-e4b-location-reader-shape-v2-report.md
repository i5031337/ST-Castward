# Gemma E4B: dedicated location reader, location-reader-shape-v2

Completed 2026-10-20T20:57:17.080Z. **54/64 checks passed** across 8 trials. 3 trials failed at least one check.

Used only port 9931, four concurrent requests, two repetitions per scene, server sampling defaults, no schema, maximum 2400 reply tokens. No retries or discarded replies. Source hashes match frozen prompts: true.

Model: `/mnt/D/backup_models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf`. Build: `b11669-620d2225c`.

All eight replies used `places` arrays after the format clarification. Seven parsed successfully and selected the correct current place. One opening reply added an unsupported `type` field and was rejected; it also omitted the inn’s parent relationship. Two valid replies omitted established descriptive details.

Manual grounding audit found another limitation: one mixed-inn reply described Brackenport as riverside, apparently copying Ashford’s known description, and supplied an unestablished alias. These unsupported details are visible in the preserved raw response but are not separate checks in the numeric score. The final reader therefore remains short of the acceptance criteria.

This evaluates the separate place reader with production prompt construction, response coercion, and proposal validation. It does not test tracker-trigger recall or end-to-end orchestration. These are small focused scenarios, not a broad reliability claim.

Focused retest of every scenario that failed at least once in location-reader-initial. These cases informed the revised wording. Other scenarios were not rerun.

Known facts preservation uses exact containment of the previous description. A faithful paraphrase could fail that conservative check. Other semantic description checks use stated keywords.

[Frozen full prompts and source hashes](gemma-e4b-location-reader-shape-v2-prompts.json) · [All raw replies, checks and proposals](gemma-e4b-location-reader-shape-v2-results.json)

| Case | Repetition | Checks | Failed checks |
| --- | --- | --- | --- |
| opening-fantasy | 1 | 8/8 | — |
| opening-fantasy | 2 | 0/8 | completeResponse, validLocationShape, proposalWarningsEmpty, currentPlace, exactCreatedPlaces, parent:Blue Heron Inn, description:Blue Heron Inn, existingFactsPreserved |
| opening-dating | 1 | 8/8 | — |
| opening-dating | 2 | 8/8 | — |
| new-parent-inn-mixed | 1 | 8/8 | — |
| new-parent-inn-mixed | 2 | 7/8 | description:Blue Heron Inn |
| independent-root-mixed | 1 | 8/8 | — |
| independent-root-mixed | 2 | 7/8 | description:Moonbeam Café |

## opening-fantasy, repetition 2

The response was complete, valid JSON and named the correct current place. The
parser rejected the entire response because Brackenport included the unsupported
field `"type":"town"`. This left `parsed` null and produced no proposals, so all
eight checks failed downstream. These are not eight independent extraction errors;
`completeResponse` also requires successful parsing in this evaluator, despite its
name. The reply independently omitted `"parent":"Brackenport"` on Blue Heron Inn.
Its description mentions the town, but that does not create the containment link.

Failed: completeResponse, validLocationShape, proposalWarningsEmpty, currentPlace, exactCreatedPlaces, parent:Blue Heron Inn, description:Blue Heron Inn, existingFactsPreserved.

Error: Error: Invalid location reading: each place needs named place fields.

```json
{
  "places": [
    {
      "name": "Blue Heron Inn",
      "description": "An inn in the town of Brackenport featuring leaded windows and a common room warmed by a fire."
    },
    {
      "name": "Brackenport",
      "type": "town"
    }
  ],
  "current": "Blue Heron Inn"
}
```

Proposal warnings: []

## new-parent-inn-mixed, repetition 2

Failed: description:Blue Heron Inn.

```json
{
  "places": [
    {
      "name": "Brackenport",
      "description": "A riverside town.",
      "parent": ""
    },
    {
      "name": "Blue Heron Inn",
      "aliases": [
        "the Blue Heron Inn"
      ],
      "description": "A small tavern",
      "parent": "Brackenport"
    },
    {
      "name": "Ashford",
      "description": "A riverside town.",
      "parent": ""
    }
  ],
  "current": "Blue Heron Inn"
}
```

Proposal warnings: []

## independent-root-mixed, repetition 2

Failed: description:Moonbeam Café.

```json
{
  "places": [
    {
      "name": "Moonbeam Café",
      "description": "A standalone roadside building outside every town."
    }
  ],
  "current": "Moonbeam Café"
}
```

Proposal warnings: []

## Offline replay with tolerant extra-field handling

The location parser now ignores unsupported response/place fields with a warning,
while validating supported fields as before. Replaying the same eight raw responses
passed **61/64 checks (95.31%)**, up from 54/64. No new model requests were made;
the original results above remain unchanged.

`opening-fantasy` repetition 2 now passes **7/8** checks. It preserves both new
places, the description, and the correct current place, with the warning
`Location reading ignored unsupported fields at places[1]: "type".`
The missing `parent: "Brackenport"` remains a genuine omission. The other two
remaining misses are descriptive details. Previously noted unsupported descriptive
facts and aliases remain model limitations outside these numeric checks.

[Replay results, original checks, warnings, and parser/scorer fingerprints](gemma-e4b-location-reader-extra-fields-replay.json).
