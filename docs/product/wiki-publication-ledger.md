# Wiki Publication Ledger

## Purpose

Retain the actual publication state of the `vi-history-suite` wiki so future
wiki work can be traced back to governed documentation sources and explicit
publication commits.

The wiki is a derived reader surface. The repository documentation package
remains the authority of record.

The machine-readable companion surface for this ledger is:

- `docs/product/wiki-publication-ledger.json`

## Published Pages

| Page | Wiki Path | Status | Published | Wiki Commit | Primary Authority |
| --- | --- | --- | --- | --- | --- |
| Overview | `home` | published | `2026-04-03` | `3aa0c49` | `docs/product/SHIP-0001-releasable-vi-history-suite.md`; `docs/product/current-state.md`; `README.md`; `docs/product/release-readiness-matrix.json` |
| Install And Release | `Install-And-Release` | published | `2026-04-03` | `3aa0c49` | `docs/release-procedure.md`; `docs/product/release-readiness-matrix.json`; `README.md`; `docs/product/blocker-ledger.json` |
| User Workflow | `User-Workflow` | published | `2026-04-03` | `3aa0c49` | `docs/requirements/srs.md`; `docs/product/current-state.md`; `README.md`; `docs/testing/test-plan.md` |
| Comparison Reports And Dashboard Review | `Comparison-Reports-And-Dashboard-Review` | published | `2026-04-03` | `9b32d5a` | `docs/requirements/srs.md`; `docs/product/ni-comparison-report-metadata-inventory.md`; `docs/product/current-state.md`; `docs/testing/test-plan.md`; `docs/research/authoritative/research-alignment.md` |
| Review Scenarios And Decision Records | `Review-Scenarios-And-Decision-Records` | published | `2026-04-03` | `5c1d3ef` | `docs/product/review-scenarios.md`; `docs/product/decision-record-template.md`; `docs/requirements/srs.md`; `docs/testing/test-plan.md`; `docs/product/current-state.md` |
| Architecture | `Architecture` | published | `2026-04-03` | `d3d4be6` | `docs/architecture/overview.md`; `docs/requirements/srs.md`; `docs/architecture/adr/ADR-0006-windows64-container-isolation-for-extension-users.md`; `docs/architecture/adr/ADR-0009-dashboard-pair-archive-and-concentration-packet.md`; `docs/architecture/adr/ADR-0010-dual-host-extension-proof-and-linux-bootstrap.md`; `docs/architecture/adr/ADR-0012-documentation-package-workbench-image.md`; `docs/architecture/adr/ADR-0013-authority-first-wiki-seeding.md`; `docs/architecture/adr/ADR-0014-cross-repo-navigation-control-plane.md` |
| Documentation Workbench | `Documentation-Workbench` | published | `2026-04-04` | `4afbea1` | `docs/documentation-workbench.md`; `docs/product/documentation-coherence-ledger.md`; `docs/product/wiki-authority-map.md`; `docs/product/program-repo-jump.md`; `docs/product/wiki-publication-ledger.md` |

## Publication Rules

- A wiki page is not considered published until it is pushed to the GitLab wiki
  repository.
- Every published page shall be recorded here with its wiki path, publication
  date, wiki commit, and primary authority docs.
- Future publication prep shall use the governed wiki workbench so the repo
  retains a page-authority bundle and publication-prep receipt before a wiki
  page is pushed.
- Published wiki pages remain derived surfaces. If a wiki page and the repo
  docs disagree, the repo docs win until the wiki is corrected.

## Current Next Page

The next incremental page, once the documentation package is ready, is:

1. **Program Repo Jump**
   - primary authority:
     - `docs/product/program-repo-jump.md`
     - `docs/product/program-repo-jump-map.json`
   - secondary authority:
     - `docs/documentation-workbench.md`
     - `docs/product/current-state.md`
