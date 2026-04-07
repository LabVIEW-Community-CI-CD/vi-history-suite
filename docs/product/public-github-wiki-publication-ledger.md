# Public GitHub Wiki Publication Ledger

## Purpose

Retain the actual publication state of the public GitHub user wiki so future
sessions can distinguish that public extension-user reader surface from the
internal GitLab maintainer wiki.

The machine-readable companion surface for this ledger is:

- `docs/product/public-github-wiki-publication-ledger.json`

## Published Pages

| Page | Wiki Path | Status | Published | Wiki Commit | Primary Authority |
| --- | --- | --- | --- | --- | --- |
| Home | `Home` | published | `2026-04-06` | `ea06c37` | `README.md`; `docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md`; `docs/release-procedure.md` |
| User Workflow | `User-Workflow` | published | `2026-04-06` | `ea06c37` | `README.md`; `docs/product/extension-execution-policy.md`; `docs/product/current-state.md` |
| Install And Release | `Install-And-Release` | published | `2026-04-06` | `ea06c37` | `README.md`; `docs/release-procedure.md`; `CHANGELOG.md` |
| Current State | `Current-State` | published | `2026-04-06` | `ea06c37` | `README.md`; `docs/product/current-state.md`; `docs/product/extension-execution-policy.md` |

## Publication Rules

- A public GitHub wiki page is not considered published until it is pushed to
  the public GitHub wiki repository.
- Every published public page shall be recorded here with its wiki path,
  publication date, wiki commit, and primary authority docs.
- This ledger does not imply anything about the internal GitLab maintainer wiki.
- The current public page set is complete when `nextPage` in the companion JSON
  ledger is `null`.
