# ADR-0027: ML Latent-Structure Research Data, Evaluation, And Honesty Rails

- Status: Proposed
- Date: 2026-07-21

<!--
Promotion note: this is the design-of-record for the gated ML research track
(#2295, Correlation Iter 9) under the Semantic Diff Intelligence bet (#2262). It
governs a *possible future* model that would augment the deterministic
preview⇄comparison correlation (VHS-REQ-703, parent VHS-SYS-REQ-008); it ships
no model and promotes no new requirement. A model may only ship after this ADR
is accepted and its rails are met.
-->

## Context

The deterministic correlation pipeline (VHS-REQ-703) extracts, from the LabVIEW
comparison report, per-object **diagram-space** coordinates and image sizes, and
— only when the base/head previews are available AND a raster locator is injected
— optional located **pixel** regions on the preview rasters. Two facts bound what
reference data actually exists: the base/head previews are **optional**
(VHS-REQ-703.3–.7; an ordinary comparison with correlation disabled, or a cache
miss, has only the comparison report), and without an injected locator
`buildViPreviewRegionCorrelationFromModel` records changes as **diagram-space
only** — it never fabricates a pixel placement. The three artifacts every
comparison can produce are:

1. the base preview HTML (`PrintToSingleFileHtml`), when available;
2. the head preview HTML (`PrintToSingleFileHtml`), when available;
3. the LabVIEW comparison report (`CreateComparisonReport`), always.

The maintainer note on #2295 observes that the flat `PrintToSingleFileHtml`
output carries **latent information a deterministic parser leaves on the table**
— per-case images, their ordering, labels, and embedded visual/geometry cues. A
machine-learning phase is hypothesized to *discover* that structure (recover
per-object/per-case placement and ownership, associate diff regions with diagram
elements, translate toward a Python-like intermediate representation) to improve
interpretation, diff, and explanation.

This is long-horizon research, gated behind the deterministic iterations. Before
any model is trained, evaluated, or shipped, the project needs explicit rails so
the effort cannot quietly compromise the determinism, honesty, and offline
guarantees the semantic surfaces depend on. This ADR records those rails; it does
not authorize a model.

## Decision

If and when an ML model is pursued for latent-structure recovery, it must satisfy
all of the following. Until this ADR is accepted, no model code ships.

### Data provenance (closed corpus)

- Training and evaluation data is **only** what this repository already generates
  from a real comparison: the two `PrintToSingleFileHtml` previews and the
  `CreateComparisonReport` output. **No authoring of new VIs** and **no external
  LabVIEW datasets**.
- Corpus samples are produced through the shipped runtime path (real NI LabVIEW
  container), captured as retained evidence, and are reproducible from a named
  base/head revision pair. The git-swap harness (two byte-different but
  semantically identical revisions of one tracked path) is the reference way to
  generate labeled true-negative (no-change) samples.
- Known blocker on record: the empty→rich enumeration path trips a LabVIEW
  headless `Error 66` recursive-load in the Linux container, so a full labeled
  corpus via empty-swap needs a non-headless/host runtime or a workaround; the
  feasibility spike must resolve this before any corpus-scale claim.

### Evaluation (deterministic is the source of truth)

- The deterministic correlation (VHS-REQ-703) remains the **source of truth** for
  the structure it recovers: on samples where the deterministic parser is
  confident (report-derived diagram coordinates/sizes, and located pixel regions
  when a locator was injected), the model must not contradict it.
- For the **latent structure the deterministic parser does not recover** (the
  model's claimed added value), the deterministic parser supplies no expected
  labels, so measuring against it would only score agreement on the
  already-deterministic subset. Evaluating those targets therefore **requires an
  independent, reproducible held-out ground-truth annotation source** — for
  example runtime-derived labels (a LabVIEW/VI-server enumeration of the true
  per-object placement and ownership) or a committed human-annotated fixture set —
  named and versioned alongside the corpus. No latent-structure metric may be
  claimed without such labels.
- Every evaluation reports precision/recall (or an equivalent) against a held-out
  set of reproducible samples, with the exact corpus revision pairs and the
  ground-truth label source named, so a result is auditable and re-runnable, not
  a one-off score.
- No metric may be computed on data the model was trained on.

### Honesty and safety

- Every ML output is **confidence-labeled and advisory-only**. It is presented as
  a hint alongside — never in place of — the deterministic result, mirroring the
  "hint, not a verdict" posture already used for no-itemized-change detection
  (VHS-REQ-661.14) and never fabricating a pixel overlay (VHS-REQ-703).
- A low-confidence or absent model output degrades to the deterministic view; the
  model can never block, override, or silence a deterministic signal.
- Model artifacts, if any, stay out of the offline/dependency-free core; the
  semantic model, schemas, and MCP handler remain VS Code- and network-free.

### Process gate

- A **feasibility spike** comes first (deterministic exploration of the latent
  `PrintToSingleFileHtml` structure is permitted and encouraged; it needs no
  model). The spike reports whether the latent structure is recoverable and
  whether a reproducible corpus is obtainable given the Error-66 blocker.
- A model ships only after this ADR is **Accepted** and a promoted requirement
  (a new `VHS-REQ-*`) captures the shipped behavior with its own acceptance
  criteria and tests. This ADR intentionally promotes no requirement yet.

## Consequences

- The research track has an explicit contract: closed corpus, deterministic-as-
  truth evaluation, advisory-only honesty, and a spike-then-sign-off process.
  Anyone picking up #2295 has unambiguous rails.
- The determinism, offline, and honesty guarantees of the semantic surfaces are
  protected from being eroded by a speculative model.
- No behavior ships from this ADR; it is a governance placeholder. Accepting it
  (and authoring the promoted requirement) is a separate, deliberate step.
- Superseded ADRs: none.

Requirements: VHS-SYS-REQ-008; VHS-REQ-703.
