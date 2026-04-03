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

## Publication Rules

- A wiki page is not considered published until it is pushed to the GitLab wiki
  repository.
- Every published page shall be recorded here with its wiki path, publication
  date, wiki commit, and primary authority docs.
- Published wiki pages remain derived surfaces. If a wiki page and the repo
  docs disagree, the repo docs win until the wiki is corrected.

## Current Next Page

The next incremental page, once the documentation package is ready, is:

1. **Install And Release**
   - primary authority:
     - `docs/release-procedure.md`
     - `docs/product/release-readiness-matrix.json`
   - secondary authority:
     - `README.md`
     - `docs/product/blocker-ledger.json`
