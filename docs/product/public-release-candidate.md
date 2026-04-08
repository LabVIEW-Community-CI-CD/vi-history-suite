# Public Release Candidate

- Version line: `1.2.2`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-04-08T07:05:20Z`
- Authority source of truth: GitLab `develop` -> `main`
- Published public source commit: `2547344`
- Public `develop` candidate commit: `12391e1`
- Published public wiki head: `f6ed8a5`

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
- Historical public repo bootstrap baseline:
  `exact-v1.2.0-human-baseline-retained`
- Published-surface expert-agent review:
  `expert-agent-review-rerun-pending`
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
- The maintained public `develop` candidate now lands through GitHub PRs `#24`,
  `#25`, `#26`, and `#27` at commit `12391e1`, with `package-preview` and
  `public-facade-linux-smoke` green before merge.
- The maintained public wiki head is now `f6ed8a5` and is retained in
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
- Exact published public `develop` candidate under review: `12391e1`
- Exact published public wiki head under review: `f6ed8a5`
- Latest retained verdict: `expert-agent-review-rerun-pending`
- Prior retained expert-agent review: `findings-present` on `96944d7` /
  `d6da0c4` with `2` published-surface findings folded into the current
  candidate.
- Exact `v1.2.2` tagging and Marketplace publication remain blocked until the
  latest retained expert-agent review returns no findings.

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

- No release-path blocker remains on exact `v1.2.1`.
- `BLOCKER-1.2.2-001-EXPERT-AGENT-REVIEW-CLEAN-PASS`: public `main` remains
  `2547344`, public `develop` now publishes `12391e1`, the public wiki now
  publishes `f6ed8a5`, and no exact `v1.2.2` tag or Marketplace publish is
  eligible until `vi-history-suite-expert-agent-reviewer` reruns on those
  maintained public surfaces and comes back with no findings.
