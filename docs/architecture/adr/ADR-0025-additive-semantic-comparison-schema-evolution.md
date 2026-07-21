# ADR-0025: Additive Semantic-Comparison Schema Evolution For Change Classification

- Status: Accepted
- Date: 2026-07-21

<!--
Promotion note: this decision is captured as active requirement VHS-REQ-702
(VI Semantic Change Classification, parent VHS-SYS-REQ-008). The text below is
the design record behind that requirement.
-->

## Context

The VI semantic comparison model is published under the stable schema id
`vi-history-suite/vi-semantic-comparison@v1` and consumed by multiple surfaces:
the Source Control change hover (VHS-REQ-660), the on-demand PR review
(VHS-REQ-661), the dependency-free MCP tools and offline validator
(VHS-REQ-662), and any external consumer of the open VI-diff standard. The model
today exposes changed surfaces, section/item counts, and a plain-language
narrative, but no per-change *kind* or aggregate *risk* — the signal a reviewer
needs to tell an error-handling rewire from a cosmetic nudge.

The Semantic Diff Intelligence work (VHS-REQ-702) adds reviewer-grade
classification. The only available raw signal is the NI CreateComparisonReport
output already parsed by the model pipeline (detail-item text plus NI's own
included/excluded functional-vs-cosmetic attribute flags); there is no VI binary
or abstract-syntax tree. The enrichment must therefore be a heuristic, and it
must not break the published contract that existing readers and cached documents
depend on.

## Decision

Enrich `ViSemanticComparisonModel` and its Draft-07 JSON Schema with **additive,
optional** fields under the **same** schema id `vi-history-suite/vi-semantic-comparison@v1`
— no version bump. The new fields are `classification` (per-item surface + kind +
text), `changeKinds` (distinct kinds present), `riskLevel`, `riskRationale`, and
`classificationConfidence`. None are added to the schema's `required` list, so a
document produced before the enrichment (or by an `@v1` consumer that omits them)
still validates.

Classification is a pure, deterministic function of the already-parsed report, so
it adds no new runtime signal and stays cacheable and testable. Honesty posture:
the fields are heuristic over NI diff text and NI attribute flags, never binary or
AST truth, and always carry a `classificationConfidence` signal; unrecognized
items are classified `unknown` rather than force-fit.

A schema version bump to `@v2` is explicitly **rejected** for this additive change
(it would force every reader, the schema registry, and the validation fixtures to
migrate for purely additive data). A separate sidecar schema is also rejected (it
would split one logical model and complicate consumers). A version bump is
**reserved** for a future *breaking* change — removing or renaming an existing
field, or promoting a new field to required — which will supersede this ADR.

## Consequences

- Existing readers (hover, PR review, MCP, external consumers) need zero
  migration; they ignore the optional fields until they opt in.
- Previously cached `@v1` comparison documents remain valid.
- The enrichment can roll out incrementally across later phases (engine, then MCP
  output, then PR-review narrative, then editor hover) behind one stable schema.
- Consumers must treat the new fields as optional and may see them absent.
- Classification accuracy is bounded by the NI report's textual vocabulary and
  locale; the keyword map must be grown from real reports and the confidence
  signal must be preserved so heuristics are never presented as certainty.
- A future breaking change to the model must introduce `@v2` and supersede this
  ADR, keeping the versioning decision auditable.

## Requirements recorded

VHS-SYS-REQ-008; VHS-REQ-702.
