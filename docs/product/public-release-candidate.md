# Public Release Candidate

- Version line: `1.3.9`
- Active develop candidate line: `v1.3.14`
- Active develop candidate package: `1.3.14`
- Active develop candidate state: patch consolidation; no public GitHub
  release, Marketplace mutation, exact tag, or `main` promotion
- Active develop candidate branch: `develop`
- Active release-candidate branch: `release/1.3.14`
- Release-branch opening packet:
  `docs/product/release-branch-opening-v1.3.14-2026-05-08.md`
- Source consolidation branch:
  `feature/develop-1.3.14-candidate-consolidation`
- Protected develop merge: GitLab MR `!192` merged
  `97efa937a5317d69a1d65607c4f704d603edbe52` into `develop` as
  `72899eb39e38ce34c697f0a227292ead6bcd8f2d`
- Protected develop pipeline: `2511040377` / `success`
- Vagrant VSIX acceptance receipt: GitLab job `14284054131` / `success`,
  retaining `vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json`
  and `vagrant/evidence/20260508-105809/manifest.json`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-04-23`
- Authority source of truth: GitLab `develop` -> `release/*` -> `main`
- Published exact public source commit: `fb0ef2b`
- Current public source head: `220111e`
- Public `develop` candidate commit: `11051ac`
- Published public wiki head: `141c39e`

## Branch Model

- Integration branch: `develop`
- Feature-lane public GitHub release hardening branch: none
- Software-factory governance branch: none
- Exact authority `v1.3.9` is now fully published across GitLab authority,
  public GitHub, and VS Code Marketplace, while blocked historical public
  GitHub incident evidence for `v1.3.8` remains retained separately
- Protected exact-release line: `main`
- Active release-candidate branch: `release/1.3.14`
- Release-candidate branch family: `release/*`
- Hotfix branch family: `hotfix/*`
- Required checks:
  - `public_exact_pretag_proof`
  - `docs_continuous_integration`
  - `docs_public_continuous_integration`
  - `docs_internal_continuous_integration`
  - `test_extension`
  - `package_extension_preview`
  - `Public Source Package Preview / public-source-package-preview`
  - `Public Linux Installed-User Smoke / public-linux-installed-user-smoke`
  - `Public Windows Installed-User Contract / public-windows-installed-user-contract`

## Readiness

- Authority baseline:
  `v1.3.9-published-across-gitlab-github-and-marketplace-with-v1.3.8-history-retained`
- Local installed VSIX build:
  `release-1.3.9-authority-candidate-package-line`
- Local public devcontainer: `v1.1.0-published-baseline`
- Local public fixture helper: `v1.1.0-published-baseline`
- Historical public repo bootstrap baseline:
  `exact-v1.2.0-human-baseline-retained`
- Authority `ISSUE-0414` implementation state:
  `closed-clean-before-next-public-candidate-step`
- Authority `ISSUE-0414` live-session proof:
  `fresh-governed-windows-proof-retained`
- Published-surface expert-agent review:
  `no-findings-on-current-v1.3.1-published-heads`
- Runtime-provider public-acceptance gate:
  `closed-on-published-v1.3.0-candidate-heads-retained`
- Pre-tag public-exact proof gate:
  `required-before-any-later-exact-reopen`
- Public GitHub exact transaction gate:
  `required-before-any-further-public-github-release-or-marketplace-act`
- Windows exact-VSIX install proof gate:
  `required-before-any-later-marketplace-act`
- Exact public release:
  `v1.3.9-github-release-and-marketplace-published; v1.3.8-public-github-release-externally-blocked-zero-assets-retained-history`

## Exact Release Baseline

- GitHub release: `v1.3.9`
- GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.9`
- GitHub release id: `312994104`
- GitHub asset: `vi-history-suite-1.3.9.vsix`
- GitHub asset SHA-256:
  `62c48a2ccdde3557680280a458bff52f2720541673b5a2dc2158f4f35addc353`
- VS Code Marketplace item: `svelderrainruiz.vi-history-suite`
- VS Code Marketplace version: `1.3.9`

## Public Publication

- The exact `v1.3.9` public source publication is retained at `fb0ef2b`, and
  the separate public source publication is retained in
  `docs/product/public-github-source-publication-ledger.{md,json}`.
- Public GitHub `main` now publishes `220111e` for the later `1.3.13` Windows
  Docker Desktop proof-intake promotion after public PR #68. The earlier
  `1.3.11` canonical Docker fixture docs promotion remains retained at
  `ce6dbd0` after public PR #60. Neither facade promotion moves public tag
  `v1.3.9`, mutates GitHub release `312994104`, or mutates the VS Code
  Marketplace listing.
- Public GitHub tag `v1.3.9` is now live, and GitHub release `312994104` is
  now published separately at
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.9`.
- The published GitHub release now retains the exact authority assets:
  `vi-history-suite-1.3.9.vsix` and
  `vi-history-suite-1.3.9.vsix.sha256`.
- The repo-owned verify receipt now proves:
  `verifyGateStatus=pass`,
  `verifyGateAllowed=true`,
  `publicReleaseLookupStatusCode=200`,
  `publicReleaseByIdStatusCode=200`,
  `draft=false`, and
  `immutable=true`.
- The separate public-source promotion check also now passes and is retained at
  `.cache/public-github-source-promotion/latest/public-github-source-promotion.json`.
- The maintained public `develop` admission-matrix baseline for `1.3.9` now
  publishes `11051ac` through GitHub PR `#43` and remains retained in
  `docs/product/public-github-source-publication-ledger.{md,json}`.
- The maintained public wiki head still publishes `141c39e` and remains
  retained in `docs/product/public-github-wiki-publication-ledger.{md,json}`.
- The latest retained expert-agent review still covers the current published
  source/wiki heads `ab293d5` / `141c39e` and returned
  `no findings; exact release / Marketplace publish may proceed`.
- Historical note: authority exact `v1.3.6` remained externally impossible to
  close in place after the repo-owned publish attempt returned
  `422 tag_name was used by an immutable release`, so `release/1.3.7` became
  the governed next exact line and is now published separately on GitHub and
  the VS Code Marketplace.
- Historical incident: authority exact `v1.3.8` exists on GitLab `main`, public
  GitHub `main` publishes `4f5f616`, and public tag `v1.3.8` exists, but
  GitHub release `312768592` is already published and immutable with zero
  assets. The blocker code is
  `published-immutable-release-assets-incomplete`; VS Code Marketplace now
  serves `1.3.9`, and the blocked `v1.3.8` line remains historical evidence
  only.

## Local Proof

- `npm run branch:governance:assert`, `npm run docs:gate:core`,
  `npm run design:gate`, and `npm run design:gate:assert-complete` passed on
  the authority tranche before `v1.3.9` exact tagging.
- `npm run public:exact:pretag:proof` remains the fail-closed local proof
  surface for any later exact reopen, and GitLab `public_exact_pretag_proof`
  retains the matching CI proof through
  `npm run public:exact:pretag:proof -- --evidence-dir public-exact-pretag-proof-evidence`.
- The retained authority exact `v1.3.9` VSIX evidence now lives at
  `.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/vi-history-suite-1.3.9.vsix`
  with matching checksum file
  `.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/vi-history-suite-1.3.9.vsix.sha256`.
- Public GitHub exact transaction verification is now the retained local proof
  surface for the completed GitHub act:
  `npm run public:github:exact:transaction:verify -- --tag v1.3.9`.
- The retained transaction receipt path is
  `.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json`.
- VS Code Marketplace publication prep is now the retained local proof surface
  for the completed Marketplace act:
  `npm run vscode:marketplace:prepare`.
- The retained Marketplace prep receipt path is
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`.
- Windows exact-VSIX install proof is now retained as the Windows pre-Marketplace
  local proof surface for the completed exact line:
  `npm run vscode:marketplace:install-proof`.
- The retained Windows exact-VSIX install proof receipt path is
  `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json`.
- That retained Windows exact-VSIX install proof proves bare `vihs` and
  `vihs --validate` both passed for the exact `v1.3.9` VSIX in isolated VS
  Code user-data/extensions roots with `runtimeValidationOutcome=ready`,
  `pathStrippedToLauncherAndSystem32=true`, and `ambientNodeOnPathRequired=false`.
- The software-factory orchestrator still retains separate non-production local
  proof surfaces:
  `npm run software:factory:assess`,
  `npm run software:factory:rehearse`,
  `npm run software:factory:repair`,
  `npm run software:factory:publish`, and
  `npm run software:factory:verify`.
- The retained software-factory receipt paths are
  `.cache/software-factory-orchestrator/latest/software-factory-state.json`,
  `.cache/software-factory-orchestrator/latest/rehearse/software-factory-state.json`,
  `.cache/software-factory-orchestrator/latest/repair/software-factory-state.json`,
  `.cache/software-factory-orchestrator/latest/publish/software-factory-state.json`,
  and
  `.cache/software-factory-orchestrator/latest/verify/software-factory-state.json`.
- The Marketplace prep receipt proves `status=ready`,
  `productionMutationAttempted=false`, `publicGitHub.verifyGateStatus=pass`,
  `currentMarketplaceVersion=1.3.9`, `expectedMarketplaceVersion=1.3.9`,
  `vsixSha256Verified=true`, `windowsExactVsixInstallProofStatus=pass`,
  `vscePatLocatorStatus=ok`, and the pinned `vsce` command shape with
  `<redacted>` PAT handling.
- The current software-factory closeout posture is now:
  exact authority `v1.3.9` is fully closed across public GitHub and VS Code
  Marketplace, `v1.3.8` remains retained as blocked historical publication
  evidence, and later SemVer openings now return to normal GitFlow.
- Current retained exact transaction facts: public exact source `fb0ef2b`, public tag
  `v1.3.9`, GitHub release `312994104`, exact VSIX
  `vi-history-suite-1.3.9.vsix`, VSIX SHA-256
  `62c48a2ccdde3557680280a458bff52f2720541673b5a2dc2158f4f35addc353`,
  checksum-asset SHA-256
  `25b4ff9a9c00b1a3e3a15946ce061b4b0c3f998dfb1fcaf6c342953bbd0d7ff6`,
  retained authority manifest
  `.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/release-manifest.json`,
  `releaseAssetsRetainedAgainstManifest=true`,
  `publicSourcePromotionStatus=passed`,
  `verifyGateStatus=pass`,
  `verifyGateAllowed=true`,
  `openingNewSemverAllowed=true`,
  `repairInPlaceRequired=false`,
  `repairInPlaceAllowed=false`, and
  `nextAllowedAction=normal-next-line-governance-after-v1.3.9-retention`.
- The controlled Windows-only private GitLab release for exact `v1.3.1`
  remains published at
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.1-windows-x64`.
- Fresh governed `ISSUE-0414` Windows live-session proof is retained at
  `.cache/runtime-settings-live-session-proof/latest/runtime-settings-live-session-proof.json`,
  generated `2026-04-21T06:48:16.064Z` from latest retained packet
  `2026-04-21T06-45-35-068Z`; latest retained proof keeps
  `liveUptakeObservation=in-session-updated`, `providerDrift=false`,
  `historyStance=candidate-live-uptake-observed`,
  `historyProofStatus=re-evaluation-required`, and
  `providerSelectionCoverage=bidirectional-selection-observed`.
- No further authority `ISSUE-0414` implementation slice is currently required
  before the next public candidate publication step.

## Historical Public Bootstrap Baseline

- The earlier retained public bootstrap submission remains historical exact
  `v1.2.0` baseline evidence only; it is not the active exact public retry
  gate.
- The retained historical submission is `passed-human-review`, recorded at
  `2026-04-08T01:22:21Z` on
  `/workspaces/hse-logger/Examples/Logging with Helper-VIs.vi`.
- Selected/base pair:
  `81325a775fdeb37141e08926d78aa0e47e887990 -> 4a265f6e64ff7d2aff22b67d0c95f67fa043b5fb`
- Reviewer note: `It worked on "Examples/Logging with Helper-VIs.vi".`

## Expert Agent Review Gate

- Required skill: `vi-history-suite-expert-agent-reviewer`
- Canonical Codex skill path:
  `/mnt/c/Users/sveld/.codex/skills/vi-history-suite-expert-agent-reviewer`
- Exact published public release commit retained for the current public exact
  baseline: `fb0ef2b`
- Exact published public wiki head retained for the current candidate:
  `141c39e`
- Latest retained verdict:
  `no findings; exact release / Marketplace publish may proceed`
- Retained at: `2026-04-21T13:04:21Z`
- Exact published public candidate commit under review: `ab293d5`
- Exact published public wiki head under review: `141c39e`
- Prior retained expert-agent review:
  `needs another fold before exact release` on `eecdfeb` / `2638ea9`.
- Prior retained finding count: `2`
- Those prior findings are now folded into the current published candidate
  heads `ab293d5` / `141c39e`.
- Gating rule:
  `exact-tag-and-marketplace-publication-blocked-until-latest-expert-agent-review-has-no-findings`

## Tester Fixture Strategy

- Decision: helper-backed canonical path plus generic public-repo reference manual
- Canonical helper command: `npm run public:fixture:icon-editor`
- Generic interactive command: `npm run public:repo:clone`
- Generic bootstrap command:
  `npm run public:repo:clone -- --repo-url <https-url>`
- Canonical helper target path: `../labview-icon-editor`
- Generic bootstrap target path: `../<repo-name>`
- Codespace target path pattern: `/workspaces/<repo-name>`
- Reference manual page: `Review-Public-LabVIEW-VI-Changes`
- Compatibility redirect page: `Clone-Public-Repo-In-Codespace`
- Refresh page: `Refresh-Codespace-Repositories`

## Governed Findings

- `FINDING-1.2.2-001-MISSING-DOCKER-FIRST-RUN-BOUNDARY`
  - status: `closed`
  - summary: first-run installed users without Docker installed or running were
    still being treated like image-acquisition failures instead of prerequisite
    failures with next-step guidance
  - requirement impact: `updated` via `VHS-REQ-528`
  - ADR impact: `none`
- `FINDING-1.2.2-002-EXACT-CLOSEOUT-BACKMERGE-OPERATOR-GAP`
  - status: `closed`
  - summary: exact release closeout was still depending on a later human prompt
    before back-merging released `main` into `develop`
  - requirement impact: `updated` via `VHS-REQ-527`
  - ADR impact: `updated` via `ADR-0030`
- `FINDING-1.2.2-003-MANUAL-REVIEW-GATE-DEPENDENCY`
  - status: `closed`
  - summary: exact-tag eligibility was still depending on Sergio's manual
    review instead of a retained expert-agent review skill and clean
    published-surface verdict
  - requirement impact: `updated` via `VHS-REQ-529`
  - ADR impact: `updated` via `ADR-0037`

## Remaining Blockers

- Exact `v1.3.0` remains closed cleanly.
- Runtime-provider public-acceptance gate remains closed on the published
  `v1.3.0` candidate heads (`0f19f4b` / `53b5348`).
- No published-surface blocker remains on the current `v1.3.1` candidate
  heads `ab293d5` / `141c39e`.
- Public GitHub exact now publishes `v1.3.9`, VS Code Marketplace now serves
  `1.3.9`, and `v1.3.8` remains retained as blocked historical incident
  evidence only.
- The current exact closeout blocker is closed after final Marketplace
  publication retention.
