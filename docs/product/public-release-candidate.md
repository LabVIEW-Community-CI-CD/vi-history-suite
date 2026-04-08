# Public Release Candidate

- Version line: `1.2.2`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-04-08T06:04:12Z`
- Authority source of truth: GitLab `develop` -> `main`
- Published public source commit: `2547344`
- Public `develop` candidate commit: `894cd5f`
- Published public wiki head: `1b2f476`

## Branch Model

- Integration branch: `develop`
- Release branch: `main`
- Required checks:
  - `docs_continuous_integration`
  - `docs_public_continuous_integration`
  - `docs_internal_continuous_integration`
  - `test_extension`
  - `package_extension_preview`
  - `Public Facade Package Preview / package-preview`
  - `Public Facade Linux Smoke / public-facade-linux-smoke`

## Readiness

- Authority baseline: `v1.2.1-exact-public-release-published`
- Local installed VSIX build: `candidate-v1.2.2-package-built-through-design-gate`
- Local public devcontainer: `v1.1.0-published-baseline`
- Local public fixture helper: `v1.1.0-published-baseline`
- Public repo bootstrap: `passed-brand-new-fork-review-on-hse-logger`
- Public wiki candidate review: `review-ready-awaiting-user-review`
- Exact public release: `v1.2.1-published`

## Exact Release Baseline

- GitHub release: `v1.2.1`
- GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.2.1`
- GitHub asset: `vi-history-suite-1.2.1.vsix`
- GitHub asset SHA-256:
  `19129777e6e88d0b8667b11afad78889bddd1ca9ede263d9d2e003a5c5e15e7c`
- VS Code Marketplace item: `svelderrainruiz.vi-history-suite`
- VS Code Marketplace version: `1.2.1`

## Public Publication

- The exact published public source head on `main` remains `2547344` and is
  retained in `docs/product/public-github-source-publication-ledger.{md,json}`.
- The maintained public `develop` candidate now lands through GitHub PRs `#24`
  and `#25` at commit `894cd5f`, with `package-preview` and
  `public-facade-linux-smoke` green before merge.
- The maintained public wiki head is now `1b2f476` and is retained in
  `docs/product/public-github-wiki-publication-ledger.{md,json}`.
- The exact VS Code Marketplace item still publishes `1.2.1`; `1.2.2` has not
  been published or tagged yet.

## Local Proof

- `npm run branch:governance:assert`, `npm run docs:gate:core`,
  `npm run design:gate`, and `npm run design:gate:assert-complete` all passed
  on the `1.2.2` authority tranche before public publication.
- Installed-user docs, bundled docs, and runtime-doctor next actions now treat
  missing Docker CLI or a stopped daemon as a first-run prerequisite boundary.
- Exact release closeout is now governed as incomplete until the released
  `main` line has been back-merged into `develop` through the protected path
  and the resulting `develop` pipeline is green.

## Human Review Proof

- The latest retained public bootstrap submission is still the accepted
  `passed-human-review` recorded at `2026-04-08T01:22:21Z` on
  `/workspaces/hse-logger/Examples/Logging with Helper-VIs.vi`.
- Selected/base pair:
  `81325a775fdeb37141e08926d78aa0e47e887990 -> 4a265f6e64ff7d2aff22b67d0c95f67fa043b5fb`
- Reviewer note: `It worked on "Examples/Logging with Helper-VIs.vi".`

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

## Remaining Blockers

- No release-path blocker remains on exact `v1.2.1`.
- `v1.2.2` is now `review-ready` on the maintained public candidate surfaces:
  public `main` remains `2547344`, public `develop` now publishes `894cd5f`,
  the public wiki now publishes `1b2f476`, and the next gate is the human
  review on those published `1.2.2` surfaces before any exact `v1.2.2` tag is
  cut.
