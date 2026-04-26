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
- Current published Marketplace version: `1.3.10`
- Current publication date: `2026-04-25`
- Current publication kind: community-validation pre-release
- Current regular Marketplace version: `1.3.9`
- Current regular publication date: `2026-04-23`
- Current pre-release Marketplace version: `1.3.10`
- Current pre-release last updated: `2026-04-26T00:05:09.09Z`
- Current verification surface: official gallery extension query and
  `vsce show`
- Current pending publication: `1.3.11` public validation pre-release
- Pending publication install-proof command:
  `npm run vscode:marketplace:install-proof`
- Pending publication install-proof receipt:
  `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json`
- Pending publication install-proof status: retain-passed-install-proof
- Pending publication prep command: `npm run vscode:marketplace:prepare`
- Pending publication prep receipt:
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`
- Pending publication prep status: retain-marketplace-publication; the retained
  production publication used the pinned `vsce` path for `1.3.9`

## Community-Validation Preview Preparation

- Status: prepared, authorized, pending publication
- Publication claim: public validation pre-release
- Target preview version: `1.3.11`
- Published preview version: not yet published by this packet
- Preview publication date: pending
- Marketplace last updated: pending post-publication readback
- Preview VSIX:
  `preview-evidence/vi-history-suite-1.3.11.vsix`
- Preview VSIX SHA-256: pending package build
- Prep command: `npm run vscode:marketplace:community-preview:prepare`
- Prep receipt:
  `.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json`
- Preferred Marketplace mode: pre-release through pinned `vsce --pre-release`
- Target version policy: choose a distinct higher `major.minor.patch` version
  before a Marketplace preview can be published; the current live `1.3.10`
  pre-release package line cannot be reused.
- Publish trigger: maintainer authorized public GitHub and Marketplace public
  validation publication
- Windows installed-user proof state: community/deferred
- Windows/LabVIEW feature policy:
  all provider/year/bitness variants selectable with runtime error-code and
  proof-packet disclosure
- Traceability matrix: `docs/requirements/rtm.csv`
- Public GitHub mutation attempted by prep: false
- Marketplace mutation attempted by prep: false
- Public GitHub mutation attempted by publication: false, authorized pending
- Marketplace mutation attempted by publication: false, authorized pending

## Public Validation Pre-Release 1.3.11

- Status: prepared, authorized, pending publication
- Packet:
  `docs/product/public-validation-prerelease-v1.3.11.md`
- Packet JSON:
  `docs/product/public-validation-prerelease-v1.3.11.json`
- Marketplace target version: `1.3.11`
- Public GitHub release target: `v1.3.11`
- Public GitHub release assets:
  `preview-evidence/vi-history-suite-1.3.11.vsix`;
  `preview-evidence/vi-history-suite-1.3.11.vsix.sha256`
- Public GitHub mutation authorized: true
- Marketplace mutation authorized: true
- Windows installed-user LabVIEW proof: community/deferred
- Runtime proof command:
  `vihs --validate --proof-out ./vihs-proof`
- Proof-status policy: selectable paths report success, failure, or
  not-yet-implemented behavior through stable runtime codes

## Community-Validation Intake

- Status: public GitHub published and verified
- Intake packet:
  `docs/product/marketplace-community-validation-intake-v1.3.10.md`
- Intake packet JSON:
  `docs/product/marketplace-community-validation-intake-v1.3.10.json`
- Prepared issue template source:
  `public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml`
- Prepared label manifest:
  `public-github-source/.github/labels.yml`
- Public GitHub intake promotion plan:
  `docs/product/public-github-community-validation-intake-promotion-plan-v1.3.10.md`
- Public GitHub intake promotion plan JSON:
  `docs/product/public-github-community-validation-intake-promotion-plan-v1.3.10.json`
- Public GitHub intake promotion trigger:
  `publish the public intake now`
- Public GitHub intake publication PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/45`
- Public GitHub intake published commit:
  `b56fde158fe151a736fe72c833efdfd0874d8537`
- Public GitHub intake labels applied: true
- Public GitHub mutation attempted: true
- Public GitHub release/tag/wiki mutation attempted: false
- Marketplace mutation attempted by intake preparation: false
- Proof-status policy: selectable does not mean maintainer-proven
- Triage loop:
  intake, evidence completeness, classification, maintainer reproduction,
  close or promote

## Publications

| Published Surface | Status | Published | Version | Publication Mode | Primary Authority |
| --- | --- | --- | --- | --- | --- |
| VS Code Marketplace exact release | published | `2026-04-07` | `1.2.0` | `manual-marketplace-portal-upload` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/release-procedure.md` |
| VS Code Marketplace exact release | published | `2026-04-08` | `1.2.1` | `pinned-vsce-cli` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/release-procedure.md`; `docs/product/current-state.md` |
| VS Code Marketplace exact release | published | `2026-04-08` | `1.2.2` | `pinned-vsce-cli` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/release-procedure.md`; `docs/product/current-state.md` |
| VS Code Marketplace exact release | published | `2026-04-21` | `1.3.0` | `pinned-vsce-cli` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/release-procedure.md`; `docs/product/current-state.md`; `docs/product/public-release-candidate.md` |
| VS Code Marketplace exact release | published | `2026-04-23` | `1.3.7` | `pinned-vsce-cli` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/release-procedure.md`; `docs/product/current-state.md`; `docs/product/public-release-candidate.md`; `docs/product/vscode-marketplace-publication-ledger.md` |
| VS Code Marketplace exact release | published | `2026-04-23` | `1.3.9` | `pinned-vsce-cli` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/release-procedure.md`; `docs/product/current-state.md`; `docs/product/public-release-candidate.md`; `docs/product/release-publication-state.md`; `docs/product/vscode-marketplace-publication-ledger.md` |
| VS Code Marketplace community-validation preview | published | `2026-04-25` | `1.3.10` | `pinned-vsce-cli-pre-release` | `README.md`; `package.json`; `CHANGELOG.md`; `docs/product/release-publication-state.md`; `docs/product/vscode-marketplace-publication-ledger.md`; `docs/release-procedure.md` |

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
  the retained Windows exact-VSIX install proof passed for the selected
  authority VSIX in isolated VS Code user-data/extensions roots with bare
  `vihs` plus `vihs --validate`, launcher-only PATH, and no ambient Node
  dependency,
  the prep receipt shall prove
  the public GitHub exact release is verified, the authority VSIX/checksum
  evidence matches, the live Marketplace version is still stale, the local PAT
  locator is ready without retaining the secret, and the pinned `vsce` command
  shape is retained.
- After the mutating Marketplace publication act, the official gallery
  extension query shall verify that the live Marketplace version matches the
  exact release before the final publication act is retained.
- Community-validation preview intake is separate from Marketplace preview
  publication. The public GitHub intake facade has now been published through
  the separate public intake promotion plan and protected-branch PR #45. Future
  intake template or label changes shall follow the same separate public
  promotion path.
