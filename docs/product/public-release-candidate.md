# Public Release Candidate

- Version line: `1.3.8`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-04-23`
- Authority source of truth: GitLab `develop` -> `release/*` -> `main`
- Published public source commit: `704e629`
- Public `develop` candidate commit: `ab293d5`
- Published public wiki head: `141c39e`

## Branch Model

- Integration branch: `develop`
- Feature-lane public GitHub release hardening branch: none
- Software-factory governance branch: none
- Exact `v1.3.7` remains the closed public GitHub and VS Code Marketplace
  baseline while `release/1.3.8` carries the installed `vihs` launcher fix for
  users without global `node` on `PATH`
- Protected exact-release line: `main`
- Release-candidate branch family: `release/*`
- Hotfix branch family: `hotfix/*`
- Required checks:
  - `public_exact_pretag_proof`
  - `docs_continuous_integration`
  - `docs_public_continuous_integration`
  - `docs_internal_continuous_integration`
  - `test_extension`
  - `package_extension_preview`
  - `Public Facade Package Preview / package-preview`
  - `Public Facade Linux Smoke / public-facade-linux-smoke`

## Readiness

- Authority baseline:
  `v1.3.7-tagged-on-main-public-main-tag-github-release-and-marketplace-published`
- Local installed VSIX build:
  `release-1.3.8-authority-candidate-package-line`
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
- Exact public release:
  `v1.3.7-github-release-and-marketplace-published; v1.3.8-not-yet-published`

## Exact Release Baseline

- GitHub release: `v1.3.7`
- GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.7`
- GitHub release id: `312517425`
- GitHub asset: `vi-history-suite-1.3.7.vsix`
- GitHub asset SHA-256:
  `89c01d0841399661b2bfaf272361926ba5c0fe99ba4cf463319aa17f7776396b`
- VS Code Marketplace item: `svelderrainruiz.vi-history-suite`
- VS Code Marketplace version: `1.3.7`

## Public Publication

- Public GitHub `main` now publishes `704e629`, and the separate public source
  publication is retained in
  `docs/product/public-github-source-publication-ledger.{md,json}`.
- Public GitHub tag `v1.3.7` is now live, and GitHub release `312517425` is
  now published separately at
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.7`.
- The published GitHub release now retains the exact authority assets:
  `vi-history-suite-1.3.7.vsix` and
  `vi-history-suite-1.3.7.vsix.sha256`.
- The repo-owned verify receipt now proves:
  `verifyGateStatus=pass`,
  `verifyGateAllowed=true`,
  `publicReleaseLookupStatusCode=200`,
  `publicReleaseByIdStatusCode=200`,
  `draft=false`, and
  `immutable=true`.
- The separate public-source promotion check also now passes and is retained at
  `.cache/public-github-source-promotion/latest/public-github-source-promotion.json`.
- The maintained public `develop` candidate for `v1.3.1` still publishes
  `ab293d5` through GitHub PR `#38` and remains retained in
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

## Local Proof

- `npm run branch:governance:assert`, `npm run docs:gate:core`,
  `npm run design:gate`, and `npm run design:gate:assert-complete` passed on
  the authority tranche before `v1.3.7` exact tagging.
- `npm run public:exact:pretag:proof` remains the fail-closed local proof
  surface for any later exact reopen, and GitLab `public_exact_pretag_proof`
  retains the matching CI proof through
  `npm run public:exact:pretag:proof -- --evidence-dir public-exact-pretag-proof-evidence`.
- The retained authority exact `v1.3.7` VSIX evidence now lives at
  `.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/vi-history-suite-1.3.7.vsix`
  with matching checksum file
  `.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/vi-history-suite-1.3.7.vsix.sha256`.
- Public GitHub exact transaction verification is now the retained local proof
  surface for the completed GitHub act:
  `npm run public:github:exact:transaction:verify -- --tag v1.3.7`.
- The retained transaction receipt path is
  `.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json`.
- VS Code Marketplace publication prep is now the retained local proof surface
  for the completed Marketplace act:
  `npm run vscode:marketplace:prepare`.
- The retained Marketplace prep receipt path is
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`.
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
  `currentMarketplaceVersion=1.3.7`, `expectedMarketplaceVersion=1.3.7`,
  `vsixSha256Verified=true`, `vscePatLocatorStatus=ok`, and the pinned
  `vsce` command shape with `<redacted>` PAT handling.
- The current software-factory closeout posture is now:
  exact `v1.3.7` is closed across public GitHub and VS Code Marketplace, and
  `release/1.3.8` may proceed only through normal GitFlow and the repo-owned
  factory/orchestrator governance path before any public GitHub or Marketplace
  mutation.
- Current retained transaction facts: public `main` `704e629`, public tag
  `v1.3.7`, GitHub release `312517425`, exact VSIX
  `vi-history-suite-1.3.7.vsix`, VSIX SHA-256
  `89c01d0841399661b2bfaf272361926ba5c0fe99ba4cf463319aa17f7776396b`,
  checksum-asset SHA-256
  `82a0545dacbdbcad7c8c3e99f2a23de95f78998199a4a1368f44ddca00d7f612`,
  retained authority manifest
  `.cache/gitlab-release-artifacts/v1.3.7/expanded/release-evidence/release-manifest.json`,
  `releaseAssetsRetainedAgainstManifest=true`,
  `publicSourcePromotionStatus=passed`,
  `verifyGateStatus=pass`,
  `verifyGateAllowed=true`,
  `openingNewSemverAllowed=true`,
  `repairInPlaceRequired=false`,
  `repairInPlaceAllowed=false`, and
  `nextAllowedAction=normal-next-line-governance-after-v1.3.7-retention`.
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
  baseline: `704e629`
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
- Public GitHub exact now publishes `v1.3.7`, VS Code Marketplace now serves
  `1.3.7`, and `release/1.3.8` is the active governed patch candidate for the
  installed `vihs` launcher fix.
- The current exact closeout blocker is closed after final Marketplace
  publication retention.
