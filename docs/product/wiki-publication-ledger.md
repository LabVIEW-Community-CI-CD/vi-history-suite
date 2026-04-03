# Wiki Publication Ledger

## Purpose

Retain the actual publication state of the `vi-history-suite` wiki so future
wiki work can be traced back to governed documentation sources and explicit
publication commits.

The wiki is a derived reader surface. The repository documentation package
remains the authority of record.

## Published Pages

| Page | Wiki Path | Status | Published | Wiki Commit | Primary Authority |
| --- | --- | --- | --- | --- | --- |
| Overview | `home` | published | `2026-04-03` | `61ed90c` | `docs/product/SHIP-0001-releasable-vi-history-suite.md`; `docs/product/current-state.md`; `README.md`; `docs/product/release-readiness-matrix.json` |
| Install And Release | `Install-And-Release` | published | `2026-04-03` | `eb4febe` | `docs/release-procedure.md`; `docs/product/release-readiness-matrix.json`; `README.md`; `docs/product/blocker-ledger.json` |
| User Workflow | `User-Workflow` | published | `2026-04-03` | `db44152` | `docs/requirements/srs.md`; `docs/product/current-state.md`; `README.md`; `docs/testing/test-plan.md` |
| Comparison Reports And Dashboard Review | `Comparison-Reports-And-Dashboard-Review` | published | `2026-04-03` | `9b32d5a` | `docs/requirements/srs.md`; `docs/product/ni-comparison-report-metadata-inventory.md`; `docs/product/current-state.md`; `docs/testing/test-plan.md`; `docs/research/authoritative/research-alignment.md` |
| Review Scenarios And Decision Records | `Review-Scenarios-And-Decision-Records` | published | `2026-04-03` | `5c1d3ef` | `docs/product/review-scenarios.md`; `docs/product/decision-record-template.md`; `docs/requirements/srs.md`; `docs/testing/test-plan.md`; `docs/product/current-state.md` |

## Publication Rules

- A wiki page is not considered published until it is pushed to the GitLab wiki
  repository.
- Every published page shall be recorded here with its wiki path, publication
  date, wiki commit, and primary authority docs.
- Published wiki pages remain derived surfaces. If a wiki page and the repo
  docs disagree, the repo docs win until the wiki is corrected.

## Current Next Page

The next incremental page, once the documentation package is ready, is:

1. **Architecture**
   - primary authority:
     - `docs/architecture/overview.md`
     - `docs/architecture/adr/`
   - secondary authority:
     - `docs/requirements/srs.md`
