# Wiki Seed Plan

## Purpose

Define the first incremental wiki pages for `vi-history-suite` from governed
documentation only.

## Preconditions

Do not draft or refresh wiki pages until:

- `docs/product/wiki-authority-map.md` readiness conditions are satisfied
- `docs/product/documentation-coherence-ledger.md` records no unresolved
  internal contradiction across the authority stack
- the latest retained design gate is `pass`

## Publication Status

- **Overview**: published on `2026-04-03`; see
  `docs/product/wiki-publication-ledger.md`
- **Next page**: `Install And Release`

## Page Order

1. **Overview**
   - Primary authority:
     - `docs/product/SHIP-0001-releasable-vi-history-suite.md`
     - `docs/product/current-state.md`
   - Secondary authority:
     - `README.md`
     - `docs/product/release-readiness-matrix.json`

2. **Install And Release**
   - Primary authority:
     - `docs/release-procedure.md`
     - `docs/product/release-readiness-matrix.json`
   - Secondary authority:
     - `README.md`
     - `.gitlab-ci.yml`
     - `docs/product/blocker-ledger.json`

3. **User Workflow**
   - Primary authority:
     - `docs/requirements/srs.md`
     - `docs/product/current-state.md`
   - Secondary authority:
     - `README.md`
     - `docs/testing/test-plan.md`

4. **Comparison Reports And Dashboard Review**
   - Primary authority:
     - `docs/requirements/srs.md`
     - `docs/product/ni-comparison-report-metadata-inventory.md`
     - `docs/product/current-state.md`
   - Secondary authority:
     - `docs/testing/test-plan.md`
     - `docs/research/authoritative/research-alignment.md`

5. **Review Scenarios And Decision Records**
   - Primary authority:
     - `docs/product/review-scenarios.md`
     - `docs/product/decision-record-template.md`
     - `docs/requirements/srs.md`
   - Secondary authority:
     - `docs/testing/test-plan.md`
     - `docs/product/current-state.md`

6. **Architecture**
   - Primary authority:
     - `docs/architecture/overview.md`
     - `docs/architecture/adr/`
   - Secondary authority:
     - `docs/requirements/srs.md`

7. **Documentation Workbench**
   - Primary authority:
     - `docs/documentation-workbench.md`
     - `docs/product/documentation-coherence-ledger.md`
   - Secondary authority:
     - `docs/product/wiki-authority-map.md`
     - `docs/product/SHIP-0001-releasable-vi-history-suite.md`

## Drafting Rules

- Draft only the page currently being seeded; do not widen multiple pages in
  one pass without first updating the coherence ledger.
- Every substantive product claim should cite a repo-relative governed doc
  path.
- If a fact exists only in `src/` or `tests/`, stop and promote it into the
  docs package first.
- Use the docs-authoring workbench for substantial documentation edits before
  widening into wiki output.

## Excluded Inputs

Do not use these as primary wiki inputs:

- `src/`
- `tests/`
- shell transcripts
- prior chat messages
