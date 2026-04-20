# Public Release Candidate

- Version line: `1.3.0`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-04-14T10:45:07Z`
- Authority source of truth: GitLab `develop` -> `release/*` -> `main`
- Published public source commit: `86b19a2`
- Public `develop` candidate commit: `b1de8c5`
- Published public wiki head: `fc6af3c`

## Branch Model

- Integration branch: `develop`
- Protected exact-release line: `main`
- Release-candidate branch family: `release/*`
- Hotfix branch family: `hotfix/*`
- Required checks:
  - `docs_continuous_integration`
  - `docs_public_continuous_integration`
  - `docs_internal_continuous_integration`
  - `test_extension`
  - `package_extension_preview`
  - `Public Facade Package Preview / package-preview`
  - `Public Facade Linux Smoke / public-facade-linux-smoke`

## Readiness

- Authority baseline: `v1.2.2-exact-public-release-published`
- Local installed VSIX build: `private-v1.3.0-windows-x64-published`
- Local public devcontainer: `v1.1.0-published-baseline`
- Local public fixture helper: `v1.1.0-published-baseline`
- Historical public repo bootstrap baseline:
  `exact-v1.2.0-human-baseline-retained`
- Published-surface expert-agent review:
  `no-findings-post-publication-v1.3.0-candidate`
- Runtime-provider public-acceptance gate: `closed`
- Exact public release: `v1.2.2-published`

## Exact Release Baseline

- GitHub release: `v1.2.2`
- GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.2.2`
- GitHub asset: `vi-history-suite-1.2.2.vsix`
- GitHub asset SHA-256:
  `182b7b033fddc09191b6a7852bc94a045a9cc6847a4e3c22661dd288e42f76a9`
- VS Code Marketplace item: `svelderrainruiz.vi-history-suite`
- VS Code Marketplace version: `1.2.2`

## Public Publication

- The exact published public source head on `main` now publishes `86b19a2` and is
  retained in `docs/product/public-github-source-publication-ledger.{md,json}`.
- The maintained public `develop` candidate for `v1.3.0` now publishes
  `b1de8c5` through GitHub PR `#32` and is retained here.
- The maintained public wiki head is now `fc6af3c` and is retained in
  `docs/product/public-github-wiki-publication-ledger.{md,json}`.
- Review-ready is retained and the runtime-provider public-acceptance gate is
  now closed because the post-publication expert-agent review returns a clean
  verdict on those live candidate heads.
- The exact VS Code Marketplace item still verifies `1.2.2` through the
  official gallery extension query.

## Local Proof

- `npm run branch:governance:assert`, `npm run docs:gate:core`,
  `npm run design:gate`, and `npm run design:gate:assert-complete` all passed
  on the `1.2.2` authority tranche before public publication.
- The controlled Windows-only private GitLab release for the current candidate
  is now published at
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64`.
- Installed-user docs, bundled docs, and runtime-doctor next actions now treat
  missing Docker CLI or a stopped daemon as a first-run prerequisite boundary.
- Exact release closeout is now governed as incomplete until the released
  `main` line has been back-merged into `develop` through the protected path
  and the resulting `develop` pipeline is green.

## Historical Public Bootstrap Baseline

- The earlier retained public bootstrap submission remains historical exact
  `v1.2.0` baseline evidence only; it is not the active `v1.2.2` tag gate.
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
- Exact published public release commit under review: `86b19a2`
- Exact published public wiki head under review: `527a8b4`
- Latest retained verdict: `no findings; exact release / Marketplace publish may proceed`
- Retained at: `2026-04-14T10:30:20Z`
- Exact published public candidate commit under review: `b1de8c5`
- Exact published public wiki head under review: `fc6af3c`
- Prior retained expert-agent review: `findings-present` on `722c1f7` /
  `fc6af3c` with `2` published-surface findings folded into the current
  candidate.
- Exact `v1.2.2` tagging and Marketplace publication remain closed cleanly on
  published-surface review grounds, and the latest `v1.3.0` expert-agent
  review on live public candidate heads is now retained with no findings.

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

- No release-path blocker remains on exact `v1.2.2`.
- Runtime-provider public-acceptance gate is now closed on the published
  `v1.3.0` candidate heads (`b1de8c5` / `fc6af3c`).
