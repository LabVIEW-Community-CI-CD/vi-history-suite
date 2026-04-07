# Public GitHub Wiki Publication Ledger

## Purpose

Retain the actual publication state of the public GitHub user wiki so future
sessions can distinguish that public extension-user reader surface from the
internal GitLab maintainer wiki.

The machine-readable companion surface for this ledger is:

- `docs/product/public-github-wiki-publication-ledger.json`

## Published Wiki HEAD

- Current published public GitHub wiki HEAD: `d184be2`

## Published Pages

| Page | Wiki Path | Status | Published | Wiki Commit | Primary Authority |
| --- | --- | --- | --- | --- | --- |
| Overview | `Home` | published | `2026-04-07` | `3ef5bee` | `README.md`; `docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md`; `docs/release-procedure.md` |
| User Workflow | `User-Workflow` | published | `2026-04-06` | `ea06c37` | `README.md`; `docs/product/extension-execution-policy.md`; `docs/product/current-state.md` |
| Install And Release | `Install-And-Release` | published | `2026-04-07` | `3ef5bee` | `README.md`; `docs/release-procedure.md`; `CHANGELOG.md` |
| Comparison Reports And Dashboard Review | `Comparison-Reports-And-Dashboard-Review` | published | `2026-04-06` | `e28491c` | `README.md`; `docs/product/current-state.md`; `docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md`; `docs/product/issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md` |
| Fork Codespace Quickstart | `Fork-Codespace-Quickstart` | published | `2026-04-07` | `d184be2` | `README.md`; `docs/product/current-state.md`; `docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md` |
| Manual Actor Framework Clone | `Manual-Actor-Framework-Clone` | published | `2026-04-07` | `d184be2` | `README.md`; `docs/product/current-state.md`; `docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md` |
| Refresh Codespace Repositories | `Refresh-Codespace-Repositories` | published | `2026-04-07` | `3ef5bee` | `README.md`; `docs/product/current-state.md`; `docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md` |
| Current State | `Current-State` | published | `2026-04-07` | `1fb3a00` | `README.md`; `docs/product/current-state.md`; `docs/product/extension-execution-policy.md` |

## Publication Rules

- A public GitHub wiki page is not considered published until it is pushed to
  the public GitHub wiki repository.
- The companion JSON ledger shall retain `publishedHeadCommit` for the current
  public GitHub wiki checkout head. Page rows may retain older per-page commits
  when a later publication changes only part of the wiki.
- Every published public page shall be recorded here with its wiki path,
  publication date, wiki commit, and primary authority docs.
- This ledger does not imply anything about the internal GitLab maintainer wiki.
- The current public page set is complete when `nextPage` in the companion JSON
  ledger is `null`.
