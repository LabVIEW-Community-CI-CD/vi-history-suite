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
- Current published Marketplace version: `1.3.12`
- Current publication date: `2026-04-27`
- Current publication kind: public-validation pre-release
- Current regular Marketplace version: `1.3.9`
- Current regular publication date: `2026-04-23`
- Current pre-release Marketplace version: `1.3.12`
- Current pre-release last updated: `2026-04-27T00:36:15.800Z`
- Current verification surface: official gallery extension query, `vsce show`,
  and isolated VS Code CLI install readback
- Current pending publication: none; `1.3.12` public validation pre-release is
  published and verified
- Pending publication install-proof command:
  `npm run vscode:marketplace:install-proof`
- Pending publication install-proof receipt:
  `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json`
- Pending publication install-proof status:
  not-required-for-community-validation-prerelease-windows-proof-deferred
- Pending publication prep command: `npm run vscode:marketplace:prepare`
- Pending publication prep receipt:
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`
- Pending publication prep status:
  closed-public-validation-prerelease-published-and-verified

## Community-Validation Preview Preparation

- Status: published and verified
- Publication claim: public validation pre-release
- Target preview version: `1.3.12`
- Published preview version: `1.3.12`
- Preview publication date: `2026-04-27`
- Marketplace last updated: `2026-04-27T00:36:15.800Z`
- Preview VSIX:
  `preview-evidence/vi-history-suite-1.3.12.vsix`
- Preview VSIX SHA-256:
  `e0d72bc198756d0f3302779830fc4e187d4bc63818769ffedaedaffb23d4dc25`
- Prep command: `npm run vscode:marketplace:community-preview:prepare`
- Prep receipt:
  `.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json`
- Preferred Marketplace mode: pre-release through pinned `vsce --pre-release`
- Target version policy: choose a distinct higher `major.minor.patch` version
  before a Marketplace preview can be published; the current live `1.3.11`
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
- Public GitHub mutation attempted by publication: true
- Marketplace mutation attempted by publication: true

## Public Validation Pre-Release 1.3.12

- Status: published and verified
- Packet:
  `docs/product/public-validation-prerelease-v1.3.12.md`
- Packet JSON:
  `docs/product/public-validation-prerelease-v1.3.12.json`
- Marketplace target version: `1.3.12`
- Public GitHub release target: `v1.3.12-public-validation-prerelease`
- Public GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.12-public-validation-prerelease`
- Public GitHub PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/63`
- Public GitHub main commit:
  `1853a4332eff40665e30db6e632febaa9821cf98`
- Public GitHub release VSIX SHA-256:
  `e0d72bc198756d0f3302779830fc4e187d4bc63818769ffedaedaffb23d4dc25`
- Superseded immutable public GitHub release:
  `v1.3.12-public-validation` / `313840031`
- Public GitHub mutation authorized: true and performed
- Marketplace mutation authorized: true and performed
- Marketplace published version: `1.3.12`
- Marketplace last updated: `2026-04-27T00:36:15.800Z`
- Executable fixture command:
  `vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof`
- Linux host fixture command:
  `vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof`
- Linux/Docker `2026` `x64`: admitted
- Retained Linux/Docker `validate-fixture` proof:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-docker-2026-v1.3.12-2026-04-27.md`
- Linux host LabVIEW `2026` `x64`: admitted
- Retained Linux host `validate-fixture` proof:
  `docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-linux-host-2026-v1.3.12-2026-04-26.md`
- Windows installed-user LabVIEW proof: community/deferred

## Public Validation Pre-Release 1.3.11

- Status: published and verified
- Packet:
  `docs/product/public-validation-prerelease-v1.3.11.md`
- Packet JSON:
  `docs/product/public-validation-prerelease-v1.3.11.json`
- Marketplace target version: `1.3.11`
- Public GitHub release target: `v1.3.11-public-validation`
- Nominal package tag: `v1.3.11`
- Tag repair note: the first `v1.3.11` published pre-release became immutable
  before assets could be attached; the zero-asset release and tag were deleted,
  but GitHub retained the tag name as used, so the asset-bearing public
  validation release uses `v1.3.11-public-validation`.
- Public GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.11-public-validation`
- Public GitHub PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/46`
- Public GitHub current main commit:
  `ce6dbd0b1b5783f7015b9d0589f3803636564789`
- Public GitHub latest facade PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/60`
- Public GitHub release assets:
  `preview-evidence/vi-history-suite-1.3.11.vsix`;
  `preview-evidence/vi-history-suite-1.3.11.vsix.sha256`
- Public GitHub release VSIX SHA-256:
  `21a21f7638d5348274ef66a9e58e0ba8d58918b72937e1b8c2e104bc6a0136ff`
- Public GitHub mutation authorized: true
- Marketplace mutation authorized: true
- Marketplace published version: `1.3.11`
- Marketplace last updated: `2026-04-26T16:51:22.260Z`
- Windows installed-user LabVIEW proof: community/deferred
- Runtime proof command:
  `vihs --validate --proof-out ./vihs-proof`
- Proof-status policy: selectable paths report success, failure, or
  not-yet-implemented behavior through stable runtime codes
- Canonical public Docker fixture: `https://github.com/ni/labview-icon-editor`
  `resource/plugins/lv_icon.vi`
- Canonical fixture commits:
  `ab94f6c4b375062492036c63a6dab7ea8824748a` to
  `8741bb08026c104100720c0ef48621e4ab7762fd`
- Canonical Docker battery: positive historical compare succeeded with
  `diff-report-lv_icon.vi.html`, no-change compare succeeded, and
  missing-file control blocked before Docker at `left-blob-read-failed`
- Docker image pull warning:
  `nationalinstruments/labview:2026q1-linux` may be pulled on first compare
  and is about `1.4 GB`
- Public evidence issues: `#48`, `#49`, and `#59`
- Public facade docs promotion decision:
  completed through public PR #60 after the GitLab authority MR went green
- Public facade docs promotion post-merge checks:
  Public Source Package Preview `24965599550` / success, Public Windows
  Installed-User Contract `24965599548` / success, and Public Linux
  Installed-User Smoke `24965599557` / success
- Public GitHub mutation during the GitLab authority fixture-battery closeout:
  not performed; the later docs promotion was the separate public PR #60 act
- VS Code Marketplace mutation during the public facade docs promotion: not
  performed

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
| VS Code Marketplace public-validation preview | published | `2026-04-26` | `1.3.11` | `pinned-vsce-cli-pre-release` | `docs/product/public-validation-prerelease-v1.3.11.md`; `docs/product/release-publication-state.md`; `docs/product/vscode-marketplace-publication-ledger.md`; public GitHub PR #46 |
| VS Code Marketplace public-validation preview | published | `2026-04-27` | `1.3.12` | `pinned-vsce-cli-pre-release` | `docs/product/public-validation-prerelease-v1.3.12.md`; `docs/product/release-publication-state.md`; `docs/product/vscode-marketplace-publication-ledger.md`; public GitHub PR #63 |

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
