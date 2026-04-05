# Wiki Seed Plan

## Purpose

Define the governed wiki publication order and completion state for
`vi-history-suite` from governed documentation only.

## Preconditions

Do not draft or refresh wiki pages until:

- `docs/product/wiki-authority-map.md` readiness conditions are satisfied
- `docs/product/documentation-coherence-ledger.md` records no unresolved
  internal contradiction across the authority stack
- the latest retained design gate is `pass`
- `npm run wiki:workbench:doctor` or `npm run docs:workbench:wiki:doctor`
  reports no error-level topology or ledger issues

## Publication Status

- **Overview**: published on `2026-04-03`; see
  `docs/product/wiki-publication-ledger.md`
- **Install And Release**: published on `2026-04-03`; see
  `docs/product/wiki-publication-ledger.md`
- **User Workflow**: published on `2026-04-05`; see
  `docs/product/wiki-publication-ledger.md`
- **Comparison Reports And Dashboard Review**: published on `2026-04-03`; see
  `docs/product/wiki-publication-ledger.md`
- **Review Scenarios And Decision Records**: published on `2026-04-03`; see
  `docs/product/wiki-publication-ledger.md`
- **Architecture**: published on `2026-04-05`; see
  `docs/product/wiki-publication-ledger.md`
- **Documentation Workbench**: published on `2026-04-04`; see
  `docs/product/wiki-publication-ledger.md`
- **Program Repo Jump**: published on `2026-04-04`; see
  `docs/product/wiki-publication-ledger.md`
- **Documentation Coherence Ledger**: published on `2026-04-04`; see
  `docs/product/wiki-publication-ledger.md`
- **Current State**: published on `2026-04-05`; see
  `docs/product/wiki-publication-ledger.md`
- **Wiki Authority Map**: published on `2026-04-04`; see
  `docs/product/wiki-publication-ledger.md`
- **Development Queue**: published on `2026-04-05`; see
  `docs/product/wiki-publication-ledger.md`
- **Blocker Ledger**: published on `2026-04-04`; see
  `docs/product/wiki-publication-ledger.md`
- **Requirements And Verification**: published on `2026-04-05`; see
  `docs/product/wiki-publication-ledger.md`
- **Architecture Decision Records**: published on `2026-04-05`; see
  `docs/product/wiki-publication-ledger.md`
- **Debt Retirement Contract**: published on `2026-04-05`; see
  `docs/product/wiki-publication-ledger.md`
- **Debt Ledger**: published on `2026-04-05`; see
  `docs/product/wiki-publication-ledger.md`
- **Next page**: none
  - the stop rule is now the zero-gap completion invariant in
    `docs/product/wiki-coverage-matrix.json`, not a soft “good progress”
    threshold

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
     - `docs/product/extension-execution-policy.md`
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
    - `docs/product/program-repo-jump.md`
    - `docs/product/SHIP-0001-releasable-vi-history-suite.md`

8. **Program Repo Jump**
   - Primary authority:
     - `docs/product/program-repo-jump.md`
     - `docs/product/program-repo-jump-map.json`
   - Secondary authority:
     - `docs/documentation-workbench.md`
     - `docs/product/current-state.md`

9. **Documentation Coherence Ledger**
   - Primary authority:
     - `docs/product/documentation-coherence-ledger.md`
   - Secondary authority:
     - `docs/documentation-workbench.md`
     - `docs/product/current-state.md`
     - `docs/product/wiki-authority-map.md`

10. **Current State**
   - Primary authority:
     - `docs/product/current-state.md`
     - `docs/product/extension-execution-policy.md`
   - Secondary authority:
     - `README.md`
     - `docs/product/SHIP-0001-releasable-vi-history-suite.md`
     - `docs/product/development-queue.json`
     - `docs/product/blocker-ledger.json`

11. **Wiki Authority Map**
   - Primary authority:
     - `docs/product/wiki-authority-map.md`
   - Secondary authority:
     - `docs/documentation-workbench.md`
     - `docs/product/wiki-seed-plan.md`
     - `docs/product/current-state.md`

12. **Development Queue**
   - Primary authority:
     - `docs/product/development-queue.json`
   - Secondary authority:
     - `docs/product/current-state.md`
     - `docs/product/SHIP-0001-releasable-vi-history-suite.md`
     - `docs/product/blocker-ledger.json`

13. **Blocker Ledger**
   - Primary authority:
     - `docs/product/blocker-ledger.json`
   - Secondary authority:
     - `docs/product/current-state.md`
     - `docs/product/SHIP-0001-releasable-vi-history-suite.md`
     - `docs/product/development-queue.json`

14. **Requirements And Verification**
   - Primary authority:
     - `docs/requirements/srs.md`
     - `docs/requirements/rtm.csv`
     - `docs/testing/test-plan.md`
   - Secondary authority:
     - `docs/product/extension-execution-policy.md`
     - `docs/product/current-state.md`

15. **Architecture Decision Records**
   - Primary authority:
     - `docs/architecture/overview.md`
     - `docs/architecture/adr/`
   - Secondary authority:
     - `docs/product/extension-execution-policy.md`
     - `docs/product/current-state.md`

16. **Debt Retirement Contract**
   - Primary authority:
     - `docs/product/debt-retirement-contract.md`
     - `docs/product/debt-taxonomy.md`
   - Secondary authority:
     - `docs/product/debt-ledger.md`
     - `docs/product/debt-ledger.json`
     - `docs/product/current-state.md`

17. **Debt Ledger**
   - Primary authority:
     - `docs/product/debt-ledger.md`
     - `docs/product/debt-ledger.json`
   - Secondary authority:
     - `docs/product/debt-retirement-contract.md`
     - `docs/product/current-state.md`

## Drafting Rules

- Draft only the page currently being seeded; do not widen multiple pages in
  one pass without first updating the coherence ledger.
- Retain a governed staging bundle and publication-prep receipt through
  `npm run wiki:workbench:prepare` or `npm run docs:workbench:wiki:prepare`
  before treating a page as ready for publication.
- Treat the wiki as finished only when `docs/product/wiki-coverage-matrix.json`
  is zero-gap and `docs/product/wiki-publication-ledger.json` retains no
  `nextPage` target.
- If a tranche changes the current debt picture, publish the debt wiki pages in
  the same tranche instead of leaving technical/documentation debt discoverable
  only from authority Markdown or JSON.
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
