# Gemma E4B: dedicated location reader, initial evaluation

Completed 2026-10-20T20:55:59.758Z. **84/118 checks passed** across 16 trials. 5 trials failed at least one check.

Used only port 9931, four concurrent requests, two repetitions per scene, server sampling defaults, no schema, maximum 2400 reply tokens. No retries or discarded replies. Source hashes match frozen prompts: true.

Model: `/mnt/D/backup_models/gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf`. Build: `b11669-620d2225c`.

Four replies used a name-keyed object for `places`, which production validation rejected. One otherwise valid opening reply omitted the containing town and parent relationship. The prompt had not explicitly called `places` an array. Every valid reply selected the correct current destination. One rejected reply also invented the alias “the Heron”; alias grounding needs broader coverage.

This evaluates the separate place reader with production prompt construction, response coercion, and proposal validation. It does not test tracker-trigger recall or end-to-end orchestration. These are small focused scenarios, not a broad reliability claim.

Known facts preservation uses exact containment of the previous description. A faithful paraphrase could fail that conservative check. Other semantic description checks use stated keywords.

[Frozen full prompts and source hashes](gemma-e4b-location-reader-initial-prompts.json) · [All raw replies, checks and proposals](gemma-e4b-location-reader-initial-results.json)

| Case | Repetition | Checks | Failed checks |
| --- | --- | --- | --- |
| opening-fantasy | 1 | 6/8 | exactCreatedPlaces, parent:Blue Heron Inn |
| opening-fantasy | 2 | 8/8 | — |
| opening-dating | 1 | 8/8 | — |
| opening-dating | 2 | 0/8 | completeResponse, validLocationShape, proposalWarningsEmpty, currentPlace, exactCreatedPlaces, root:Moonbeam Café, description:Moonbeam Café, existingFactsPreserved |
| known-alias-revisit | 1 | 6/6 | — |
| known-alias-revisit | 2 | 6/6 | — |
| new-parent-inn-mixed | 1 | 0/8 | completeResponse, validLocationShape, proposalWarningsEmpty, currentPlace, exactCreatedPlaces, parent:Blue Heron Inn, description:Blue Heron Inn, existingFactsPreserved |
| new-parent-inn-mixed | 2 | 0/8 | completeResponse, validLocationShape, proposalWarningsEmpty, currentPlace, exactCreatedPlaces, parent:Blue Heron Inn, description:Blue Heron Inn, existingFactsPreserved |
| independent-root-mixed | 1 | 8/8 | — |
| independent-root-mixed | 2 | 0/8 | completeResponse, validLocationShape, proposalWarningsEmpty, currentPlace, exactCreatedPlaces, root:Moonbeam Café, description:Moonbeam Café, existingFactsPreserved |
| room-arrival | 1 | 8/8 | — |
| room-arrival | 2 | 8/8 | — |
| unknown-destination-departure | 1 | 6/6 | — |
| unknown-destination-departure | 2 | 6/6 | — |
| stationary-invitation | 1 | 7/7 | — |
| stationary-invitation | 2 | 7/7 | — |

## opening-fantasy, repetition 1

Failed: exactCreatedPlaces, parent:Blue Heron Inn.

```json
```json
{
  "current": "Blue Heron Inn",
  "places": [
    {
      "name": "Blue Heron Inn",
      "description": "An inn featuring leaded windows and a common room warmed by a fire."
    }
  ]
}
```
```

Proposal warnings: []

## opening-dating, repetition 2

Failed: completeResponse, validLocationShape, proposalWarningsEmpty, currentPlace, exactCreatedPlaces, root:Moonbeam Café, description:Moonbeam Café, existingFactsPreserved.

Error: Error: Invalid location reading: places must be an array of at most 40 entries.

```json
```json
{
  "current": "Moonbeam Café",
  "places": {
    "Moonbeam Café": {
      "name": "Moonbeam Café",
      "description": "a quiet café with blue chairs and a brass espresso machine."
    }
  }
}
```
```

Proposal warnings: []

## new-parent-inn-mixed, repetition 1

Failed: completeResponse, validLocationShape, proposalWarningsEmpty, currentPlace, exactCreatedPlaces, parent:Blue Heron Inn, description:Blue Heron Inn, existingFactsPreserved.

Error: Error: Invalid location reading: places must be an array of at most 40 entries.

```json
```json
{
  "current": "Blue Heron Inn",
  "places": {
    "Brackenport": {
      "name": "Brackenport"
    },
    "Blue Heron Inn": {
      "name": "Blue Heron Inn",
      "aliases": [
        "the Heron"
      ],
      "description": "A small tavern within Brackenport, featuring an oak bar under a green lantern.",
      "parent": "Brackenport"
    }
  }
}
```
```

Proposal warnings: []

## new-parent-inn-mixed, repetition 2

Failed: completeResponse, validLocationShape, proposalWarningsEmpty, currentPlace, exactCreatedPlaces, parent:Blue Heron Inn, description:Blue Heron Inn, existingFactsPreserved.

Error: Error: Invalid location reading: places must be an array of at most 40 entries.

```json
```json
{
  "current": "Blue Heron Inn",
  "places": {
    "Brackenport": {
      "name": "Brackenport",
      "description": "A town containing the Blue Heron Inn."
    },
    "Blue Heron Inn": {
      "name": "Blue Heron Inn",
      "description": "A small tavern within Brackenport."
    }
  }
}
```
```

Proposal warnings: []

## independent-root-mixed, repetition 2

Failed: completeResponse, validLocationShape, proposalWarningsEmpty, currentPlace, exactCreatedPlaces, root:Moonbeam Café, description:Moonbeam Café, existingFactsPreserved.

Error: Error: Invalid location reading: places must be an array of at most 40 entries.

```json
```json
{
  "current": "Moonbeam Café",
  "places": {
    "MoonbeamCafé": {
      "name": "Moonbeam Café",
      "description": "A standalone roadside building with pink curtains."
    }
  }
}
```
```

Proposal warnings: []
