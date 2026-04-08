# Public GitHub Wiki Publication Ledger

## Purpose

Retain the actual publication state of the public GitHub user wiki so future
sessions can distinguish that public extension-user reader surface from the
internal GitLab maintainer wiki.

The machine-readable companion surface for this ledger is:

- `docs/product/public-github-wiki-publication-ledger.json`

## Published Wiki HEAD

- Current published public GitHub wiki HEAD: `d6da0c4`

## Published Pages

| Page | Wiki Path | Status | Published | Wiki Commit | Primary Authority |
| --- | --- | --- | --- | --- | --- |
| Overview | `Home` | published | `2026-04-08` | `d6da0c4` | `README.md`; `docs/product/current-state.md`; `docs/product/extension-execution-policy.md` |
| User Workflow | `User-Workflow` | published | `2026-04-08` | `d6da0c4` | `README.md`; `docs/product/extension-execution-policy.md`; `docs/product/current-state.md` |
| Install And Release | `Install-And-Release` | published | `2026-04-08` | `d6da0c4` | `README.md`; `docs/release-procedure.md`; `docs/product/current-state.md` |
| Comparison Reports And Dashboard Review | `Comparison-Reports-And-Dashboard-Review` | published | `2026-04-08` | `1b2f476` | `README.md`; `docs/product/current-state.md`; `docs/product/extension-execution-policy.md`; `docs/product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md` |
| Fork Codespace Quickstart | `Fork-Codespace-Quickstart` | published | `2026-04-07` | `b30d356` | `README.md`; `docs/product/current-state.md`; `docs/product/execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md` |
| Clone Public Repo In Codespace | `Clone-Public-Repo-In-Codespace` | published | `2026-04-07` | `63a4208` | `README.md`; `docs/product/current-state.md`; `docs/product/execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md` |
| Review Public LabVIEW VI Changes | `Review-Public-LabVIEW-VI-Changes` | published | `2026-04-07` | `b30d356` | `README.md`; `docs/product/current-state.md`; `docs/product/execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md` |
| Manual Actor Framework Clone | `Manual-Actor-Framework-Clone` | published | `2026-04-07` | `63a4208` | `README.md`; `docs/product/current-state.md`; `docs/product/execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md` |
| Refresh Codespace Repositories | `Refresh-Codespace-Repositories` | published | `2026-04-07` | `63a4208` | `README.md`; `docs/product/current-state.md`; `docs/product/execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md` |
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
