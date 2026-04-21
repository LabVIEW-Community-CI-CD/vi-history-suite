# Public Release Candidate

- Version line: `1.3.0`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-04-21`
- Authority source of truth: GitLab `develop` -> `release/*` -> `main`
- Published public source commit: `0ea58af`
- Public `develop` candidate commit: `0f19f4b`
- Published public wiki head: `53b5348`

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

- Authority baseline: `v1.3.0-exact-closeout-complete-no-next-line-open`
- Local installed VSIX build: `private-v1.3.0-windows-x64-published`
- Local public devcontainer: `v1.1.0-published-baseline`
- Local public fixture helper: `v1.1.0-published-baseline`
- Historical public repo bootstrap baseline:
  `exact-v1.2.0-human-baseline-retained`
- Published-surface expert-agent review:
  `no-findings-post-publication-v1.3.0-candidate`
- Runtime-provider public-acceptance gate: `closed`
- Exact public release: `v1.3.0-github-release-and-marketplace-published`

## Exact Release Baseline

- GitHub release: `v1.3.0`
- GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.0`
- GitHub asset: `vi-history-suite-1.3.0.vsix`
- GitHub asset SHA-256:
  `2fcafa94dc87e78bfe7f85484b62763f8506b0d706c9574c0f5ee60052fa8811`
- VS Code Marketplace item: `svelderrainruiz.vi-history-suite`
- VS Code Marketplace version: `1.3.0`

## Public Publication

- The exact published public source head on `main` now publishes `0ea58af`,
  and public GitHub exact release `v1.3.0` is retained in
  `docs/product/public-github-source-publication-ledger.{md,json}`.
- The last clean public `develop` candidate for `v1.3.0` remains `0f19f4b`
  through GitHub PR `#35` and is retained here.
- The last clean public wiki head remains `53b5348` and is retained in
  `docs/product/public-github-wiki-publication-ledger.{md,json}`.
- The latest expert-agent review on those live candidate heads returned
  `no findings` after the public-wiki review fold publication `c71af69` and
  the bundled-doc wording follow-up publication `0f19f4b`.
- Exact closeout is now retained complete because authority `main` `9587a99`
  was back-merged into `develop` `04b07bd` through the protected path and the
  resulting `develop` pipeline `2467081960` is green.

## Local Proof

- `npm run branch:governance:assert`, `npm run docs:gate:core`,
  `npm run design:gate`, and `npm run design:gate:assert-complete` all passed
  on the authority tranche before public publication and exact closeout.
- The controlled Windows-only private GitLab release for the current candidate
  is now published at
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64`.
- Installed-user docs, bundled docs, and runtime-doctor next actions now treat
  missing Docker CLI or a stopped daemon as a first-run prerequisite boundary.
- Exact release closeout is now retained complete on authority `main`
  `9587a99` back-merged into `develop` `04b07bd` with green `develop`
  pipeline `2467081960`.

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
- Exact published public release commit retained for exact `v1.3.0`:
  `0ea58af`
- Exact published public wiki head retained for the last clean candidate:
  `53b5348`
- Latest retained verdict: `no findings; exact release / Marketplace publish may proceed`
- Retained at: `2026-04-21T02:48:58Z`
- Exact published public candidate commit under review: `0f19f4b`
- Exact published public wiki head under review: `53b5348`
- Prior retained expert-agent review: `findings-present` on `1c369f7` /
  `fc6af3c` with `2` published-surface findings folded into the current
  candidate.
- Exact `v1.3.0` tagging, public GitHub release, and Marketplace publication
  now remain closed cleanly on published-surface review grounds, and
  authority exact closeout is retained complete on back-merge `04b07bd` with
  green pipeline `2467081960`.

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

- No release-path blocker remains on exact `v1.3.0`.
- Runtime-provider public-acceptance gate remains closed on the published
  `v1.3.0` candidate heads (`0f19f4b` / `53b5348`).
- The next SemVer line is not open yet.
