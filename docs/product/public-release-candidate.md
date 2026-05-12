# Public Release Candidate

- Version line: `1.3.16`
- Active develop candidate line: none
- Active develop candidate package: none
- Active develop candidate state: none; exact `v1.3.16` is fully published
  across GitLab authority, public GitHub, Windows exact-VSIX install proof, and
  VS Code Marketplace
- Active release-candidate branch: none
- Retained prior release-candidate branch: `release/1.3.16`
- Retained `release/1.3.15` opening packet:
  `docs/product/release-branch-opening-v1.3.15-2026-05-09.md`
- Retained `release/1.3.15` readiness reassessment packet:
  `docs/product/release-branch-readiness-reassessment-v1.3.15-2026-05-09.md`
- Retained `release/1.3.16` branch-opening packet:
  `docs/product/release-branch-opening-v1.3.16-2026-05-11.md`
- Retained `release/1.3.16` readiness reassessment packet:
  `docs/product/release-branch-readiness-reassessment-v1.3.16-2026-05-11.md`
- Retained `v1.3.15` main-promotion preflight packet: closed by protected main
  promotion and exact publication
- Next admitted action:
  `retain-v1.3.16-marketplace-closeout-on-protected-develop`
- Source consolidation branch:
  `feature/develop-1.3.16-candidate-opening`
- Retained protected develop merge: GitLab MR `!209` merged
  `cb7d568af69cf4e8d0e2006b7fdfd0305736e6d9` into `develop` as
  `2443e601c2b1aa78122af785516376b9905ba43f`
- Retained protected develop pipeline: `2516180885` / `success`
- Retained release branch pipeline: `2516207722` / `success`
- Retained release branch Vagrant VSIX acceptance receipt: GitLab job
  `14309562384` / `success`, retaining
  `vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json` and
  `vagrant/evidence/20260511-070846/manifest.json`
- Retained release branch readiness reassessment: `release/1.3.16` is green,
  protected `main` is an ancestor of the release branch, and protected
  `develop` pipeline `2516304744` retained the branch-opening packet before
  the main-promotion path was admitted as a separate governed action
- Retained `release/1.3.15` branch pipeline: `2513019603` / `success`;
  duplicate operator pipeline `2513019188` also passed on the same ref and SHA
- Retained `release/1.3.15` readiness reassessment: historical
  pre-main-promotion blocker; protected `main` now publishes
  `196dd70878bf26e9722c031b9192581e5147bafb` for exact `v1.3.15`
- Retained `release/1.3.15` Vagrant VSIX acceptance receipt: GitLab job
  `14293424513` / `success`, retaining
  `vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json` and
  `vagrant/evidence/20260509-171233/manifest.json`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-05-12`
- Authority source of truth: GitLab `develop` -> `release/*` -> `main`
- Published exact public source commit: `f679023`
- Current public source head: `fad5193f`
- Public `develop` candidate commit: `11051ac`
- Published public wiki head: `141c39e`

## Branch Model

- Integration branch: `develop`
- Feature-lane public GitHub release hardening branch: none
- Software-factory governance branch: none
- Exact authority `v1.3.16` is now fully published across GitLab authority,
  public GitHub, and VS Code Marketplace, while blocked historical public
  GitHub incident evidence for `v1.3.8` remains retained separately
- Protected exact-release line: `main`
- Retained release-candidate branch: `release/1.3.16`
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
  `v1.3.16-published-across-gitlab-github-and-marketplace-with-v1.3.8-history-retained`
- Local installed VSIX build:
  `develop-1.3.16-authority-candidate-package-line`
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
  `required-before-v1.3.16-exact-tag`
- Public GitHub exact transaction gate:
  `closed-for-v1.3.16`
- Windows exact-VSIX install proof gate:
  `closed-for-v1.3.16`
- Exact public release:
  `v1.3.16-github-release-and-marketplace-published; v1.3.8-public-github-release-externally-blocked-zero-assets-retained-history`

## Exact Release Baseline

- GitHub release: `v1.3.16`
- GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.16`
- GitHub release id: `320824958`
- GitHub asset: `vi-history-suite-1.3.16.vsix`
- GitHub asset SHA-256:
  `56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170`
- VS Code Marketplace item: `svelderrainruiz.vi-history-suite`
- VS Code Marketplace version: `1.3.16`

## Public Publication

- The exact `v1.3.16` public source publication is retained at `f679023`, and
  the separate public source publication is retained in
  `docs/product/public-github-source-publication-ledger.{md,json}`.
- Public GitHub `main` now publishes
  `fad5193f7aa0b9f543687eebf607cf2e94956afb` after public PR #91 adopted the
  first-run local LabVIEW guide that follows PR #90's public intake-surface
  normalization and PR #89's installed-user LabVIEW support matrix. The exact
  `v1.3.16` source handoff remains retained at
  `f679023ed760963779d9331a9395128ad01c7e54` after public PR #88, and public
  annotated tag `v1.3.16` has tag object
  `f6ca389269dac140dc416d76bb4c2ac142664567` peeling to that exact release
  source commit.
- Public GitHub release `320824958` is published at
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.16`,
  is immutable, and retains the manifest-matched exact assets. Public PR #69
  remains retained as the `v1.3.14` source/tag handoff, public PR #68 remains
  retained for the `1.3.13` Windows Docker Desktop proof-intake promotion, and
  public PR #60 remains retained at `ce6dbd0` for the `1.3.11` canonical
  Docker fixture docs promotion.
- The published GitHub release now retains the exact authority assets:
  `vi-history-suite-1.3.16.vsix` and
  `vi-history-suite-1.3.16.vsix.sha256`.
- The repo-owned verify receipt now proves:
  `verifyGateStatus=pass`,
  `verifyGateAllowed=true`,
  `publicReleaseLookupStatusCode=200`,
  `publicReleaseByIdStatusCode=200`,
  `draft=false`, and
  `immutable=true`.
- The separate public-source promotion check also now passes and is retained at
  `.cache/public-github-source-promotion/latest/public-github-source-promotion.json`.
- The post-release installed-user support matrix adoption is retained at public
  PR #89 and public `main` commit `90b6e600ea025aeb238832cf91fe15ff2b0c7db8`;
  Public Source Package Preview `25705189099`, Public Linux Installed-User
  Smoke `25705189121`, and Public Windows Installed-User Contract
  `25705189131` all passed. No public release, tag, Marketplace, or proof
  admission mutation was performed by PR #89.
- The follow-up public intake-surface normalization is retained at public PR
  #90 and public `main` commit `fe4b15894d8417e6f1e0d234cb19bd945ef716c3`;
  Public Source Package Preview `25705500127`, Public Linux Installed-User
  Smoke `25705500132`, and Public Windows Installed-User Contract
  `25705500124` all passed. No public release, tag, Marketplace, or proof
  admission mutation was performed by PR #90.
- The follow-up public first-run local LabVIEW guide adoption is retained at
  public PR #91 and public `main` commit
  `fad5193f7aa0b9f543687eebf607cf2e94956afb`; Public Source Package Preview
  `25730733192`, Public Linux Installed-User Smoke `25730733157`, and Public
  Windows Installed-User Contract `25730733137` all passed. No public release,
  tag, Marketplace, or proof admission mutation was performed by PR #91.
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
  `npm run design:gate`, and `npm run design:gate:assert-complete` remain the
  retained local authority gates before exact tagging.
- `npm run public:exact:pretag:proof` remains the fail-closed local proof
  surface for any later exact reopen, and GitLab `public_exact_pretag_proof`
  retains the matching CI proof through
  `npm run public:exact:pretag:proof -- --evidence-dir public-exact-pretag-proof-evidence`.
- The retained authority exact `v1.3.16` VSIX evidence now lives at
  `.cache/gitlab-release-artifacts/v1.3.16/expanded/release-evidence/vi-history-suite-1.3.16.vsix`
  with matching checksum file
  `.cache/gitlab-release-artifacts/v1.3.16/expanded/release-evidence/vi-history-suite-1.3.16.vsix.sha256`.
- Public GitHub exact transaction verification is now the retained local proof
  surface for the completed GitHub act:
  `npm run public:github:exact:transaction:verify -- --tag v1.3.16`.
- The retained transaction receipt path is
  `.cache/public-github-exact-v1.3.16-verify-after-marketplace/public-github-exact-release-transaction.json`.
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
  `vihs --validate` both passed for the exact `v1.3.16` VSIX in isolated VS
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
  `productionMutationAttempted=true`, `publicGitHub.verifyGateStatus=pass`,
  `currentMarketplaceVersion=1.3.16`, `expectedMarketplaceVersion=1.3.16`,
  `vsixSha256Verified=true`, `windowsExactVsixInstallProofStatus=pass`,
  `vscePatLocatorStatus=ok`, and the pinned `vsce` command shape with
  `<redacted>` PAT handling.
- The current software-factory closeout posture is now:
  exact authority `v1.3.16` is fully closed across public GitHub and VS Code
  Marketplace, `v1.3.8` remains retained as blocked historical publication
  evidence, and later SemVer openings now return to normal GitFlow.
- Current retained exact transaction facts: public exact source `f679023`,
  public tag `v1.3.16`, GitHub release `320824958`, exact VSIX
  `vi-history-suite-1.3.16.vsix`, VSIX SHA-256
  `56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170`,
  checksum-asset SHA-256
  `ef3b3091fbea95924cf5dc51847abebd658f0a21ebe49c81422664fa97f7a23d`,
  retained authority manifest
  `.cache/gitlab-release-artifacts/v1.3.16/expanded/release-evidence/release-manifest.json`,
  `releaseAssetsRetainedAgainstManifest=true`,
  `publicSourcePromotionStatus=passed`,
  `verifyGateStatus=pass`,
  `verifyGateAllowed=true`,
  `openingNewSemverAllowed=true`,
  `repairInPlaceRequired=false`,
  `repairInPlaceAllowed=false`, and
  `nextAllowedAction=normal-next-line-governance-after-v1.3.16-retention`.
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
- Public GitHub exact now publishes `v1.3.16`, VS Code Marketplace now serves
  `1.3.16`, and `v1.3.8` remains retained as blocked historical incident
  evidence only.
- The current exact closeout blocker is closed after final Marketplace
  publication retention.
