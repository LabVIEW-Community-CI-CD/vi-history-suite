# VS Code Marketplace Publication Ledger

## Purpose

Retain the actual publication state of the VS Code Marketplace distribution
surface so future sessions can distinguish Marketplace publication from GitHub
release publication, public source publication, and public wiki publication.

The machine-readable companion surface for this ledger is:

- `docs/product/vscode-marketplace-publication-ledger.json`

## Current Marketplace Publication

- Publisher id: `svelderrainruiz`
- Marketplace item id: `svelderrainruiz.vi-history-suite`
- Listing URL:
  `https://marketplace.visualstudio.com/items?itemName=svelderrainruiz.vi-history-suite`
- Installed-user homepage:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki`
- Current published Marketplace version: `1.3.9`
- Current publication date: `2026-04-23`
- Current verification surface: official gallery extension query
- Current pending publication: none
- Pending publication prep command: `npm run vscode:marketplace:prepare`
- Pending publication prep receipt:
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`
- Pending publication prep status: retain-marketplace-publication; the retained
  production publication used the pinned `vsce` path for `1.3.9`

## Publications

| Published Surface | Status | Published | Version | Publication Mode | Primary Authority |
| --- | --- | --- | --- | --- | --- |
| VS Code Marketplace exact release | published | `2026-04-07` | `1.2.0` | `manual-marketplace-portal-upload` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/release-procedure.md` |
| VS Code Marketplace exact release | published | `2026-04-08` | `1.2.1` | `pinned-vsce-cli` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/release-procedure.md`; `docs/product/current-state.md` |
| VS Code Marketplace exact release | published | `2026-04-08` | `1.2.2` | `pinned-vsce-cli` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/release-procedure.md`; `docs/product/current-state.md` |
| VS Code Marketplace exact release | published | `2026-04-21` | `1.3.0` | `pinned-vsce-cli` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/release-procedure.md`; `docs/product/current-state.md`; `docs/product/public-release-candidate.md` |
| VS Code Marketplace exact release | published | `2026-04-23` | `1.3.7` | `pinned-vsce-cli` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/release-procedure.md`; `docs/product/current-state.md`; `docs/product/public-release-candidate.md`; `docs/product/vscode-marketplace-publication-ledger.md` |
| VS Code Marketplace exact release | published | `2026-04-23` | `1.3.9` | `pinned-vsce-cli` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/release-procedure.md`; `docs/product/current-state.md`; `docs/product/public-release-candidate.md`; `docs/product/release-publication-state.md`; `docs/product/vscode-marketplace-publication-ledger.md` |

## Publication Rules

- VS Code Marketplace publication is not implied by a GitHub release, GitLab
  tag, or a locally packaged VSIX.
- Every actual Marketplace publication shall be recorded here with publisher
  id, item id, listing URL, installed-user homepage, published version,
  publication date, and publication mode.
- Exact closeout shall verify the published Marketplace version through the
  official gallery extension query or an equivalent official Marketplace
  verification surface before the exact release is treated as closed.
- Secret material such as Azure DevOps PAT values shall not be retained in this
  ledger, its JSON companion, or other repo evidence.
- Before a mutating Marketplace publication act, the prep receipt shall prove
  the public GitHub exact release is verified, the authority VSIX/checksum
  evidence matches, the live Marketplace version is still stale, the local PAT
  locator is ready without retaining the secret, and the pinned `vsce` command
  shape is retained.
- After the mutating Marketplace publication act, the official gallery
  extension query shall verify that the live Marketplace version matches the
  exact release before the final publication act is retained.
