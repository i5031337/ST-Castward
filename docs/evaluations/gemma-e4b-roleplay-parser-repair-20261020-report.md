# E4B malformed reply: parser repair and saved-reply replay

The absolute-string experiment's second `dating-mutual-agreement` reply swapped two adjacent closing delimiters. After the cardigan's `details` field it emitted `] }` where the nesting required `} ]`. The response ended normally; this was a syntax error rather than token truncation.

The original evaluator used strict `JSON.parse`, whereas production used `safeJsonParse`. Production's existing fallback could recover the main stats, but silently shortened `"soft, oversized"` to `"soft"` and discarded the following `"items": []` field. Consequently, the original benchmark overstated the lost state checks and did not expose the payload damage.

## Code change

`src/core/utils-format.js` now tries strict parsing first, then a bounded repair for one adjacent transposition of object/array closing delimiters. A stack determines the required order; quoted text and escaped quotes are respected. The candidate must pass `JSON.parse`. This repair changes only the two delimiters and preserves the complete description and sibling items field. Existing fallback paths remain available afterward.

Strict parsing first also prevents the existing trailing-comma cleanup from altering punctuation inside already-valid JSON strings.

The evaluator now uses production parsing for state checks and records `strictJsonValid` and `parseRecovered` separately. A recovered response still fails the raw JSON validity check.

## Replay results

All 80 saved replies were replayed without new model requests. Original inference artifacts remain unchanged; replay artifacts record their source labels and updated scoring source hashes.

| Metric | Current mixed contract | Absolute strings |
| --- | ---: | ---: |
| Strict JSON validity | 40/40 | 39/40 |
| Usable after production parsing | 40/40 | 40/40 |
| All scored checks, including raw JSON validity | 286/298 | 285/298 |
| Checks excluding raw JSON validity | 246/258 | 246/258 |

The malformed reply now passes all its state checks and still fails raw JSON validity. The increase from the original absolute score of 280 to 285 primarily corrects the evaluator's parsing mismatch; it is not evidence of better model output. The old production fallback already recovered the important stats. The new repair's additional benefit is preserving the full payload, including fields not measured by those state checks.

Both contracts therefore tie on the scored checks excluding raw syntax in this sample. The absolute contract still reduces numeric/string violations and duplicate stat representations, as recorded in the [original experiment report](gemma-e4b-roleplay-absolute-readings-20261020-report.md).

## Validation and artifacts

43 focused tests pass:

```sh
node --test tests/json-repair.mjs tests/status-extractor-request.mjs tests/gemma-absolute-contract.mjs tests/gemma-evaluation.mjs tests/gemma-roleplay-evaluation.mjs
```

Regression coverage includes the exact saved reply, production response coercion, full payload preservation, reverse transposition, punctuation and escapes inside strings, existing fallback behavior, and separate scoring of recovery versus raw validity.

- [Original malformed reply](../../tests/fixtures/reader-swapped-closers.txt)
- [Mixed-contract replay](gemma-e4b-roleplay-user-turn-parser-replay-20261020-results.json)
- [Absolute-string replay](gemma-e4b-roleplay-absolute-parser-replay-20261020-results.json)
