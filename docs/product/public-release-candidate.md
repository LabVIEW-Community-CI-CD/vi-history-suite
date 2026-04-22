# Public Release Candidate

- Version line: `1.3.5`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-04-21`
- Authority source of truth: GitLab `develop` -> `release/*` -> `main`
- Published public source commit: `ad351ed`
- Public `develop` candidate commit: `ab293d5`
- Published public wiki head: `141c39e`

## Branch Model

- Integration branch: `develop`
- Feature-lane public-exact hardening branch:
  `feature/public-exact-pretag-proof`
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
  `v1.3.5-tagged-on-main-feature-public-exact-pretag-proof-open-on-develop`
- Local installed VSIX build:
  `not-required-until-next-exact-reopen`
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
- Exact public release:
  `v1.3.1-github-release-published-v1.3.5-authority-tagged-public-exact-retry-blocked-until-pretag-proof`

## Exact Release Baseline

- GitHub release: `v1.3.1`
- GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.1`
- GitHub asset: `vi-history-suite-1.3.1.vsix`
- GitHub asset SHA-256:
  `7d7d2bd85cd47042953a2b397a9a7e50529b70ffb2af4d9ac9d195f4394f3f58`
- VS Code Marketplace item: `svelderrainruiz.vi-history-suite`
- VS Code Marketplace version: `1.3.0`

## Public Publication

- The exact published public source head on `main` still publishes `ad351ed`,
  and the separate public GitHub exact release `v1.3.1` is retained in
  `docs/product/public-github-source-publication-ledger.{md,json}`.
- The maintained public `develop` candidate for `v1.3.1` still publishes
  `ab293d5` through GitHub PR `#38` and remains retained in
  `docs/product/public-github-source-publication-ledger.{md,json}`.
- The maintained public wiki head still publishes `141c39e` and remains
  retained in `docs/product/public-github-wiki-publication-ledger.{md,json}`.
- The latest retained expert-agent review still covers the current published
  source/wiki heads `ab293d5` / `141c39e` and returned
  `no findings; exact release / Marketplace publish may proceed`.
- Authority exact `v1.3.5` is already tagged on `main` `8f0069d`, but the
  separate public GitHub exact release act is still pending because no later
  exact reopen is active right now; the remaining authority-side public-exact
  validation hardening now lives on `feature/public-exact-pretag-proof` from
  `develop` `9004102`, and any later retry stays blocked until
  `npm run public:exact:pretag:proof` plus GitLab
  `public_exact_pretag_proof` pass cleanly against the promoted public facade.

## Local Proof

- `npm run branch:governance:assert`, `npm run docs:gate:core`,
  `npm run design:gate`, and `npm run design:gate:assert-complete` passed on
  the authority tranche before `v1.3.3` exact tagging.
- `npm run public:exact:pretag:proof` is now the fail-closed local proof
  surface for any later exact reopen, and GitLab `public_exact_pretag_proof`
  retains the matching CI proof through
  `npm run public:exact:pretag:proof -- --evidence-dir public-exact-pretag-proof-evidence`.
- No later exact reopen is active, so no new preview VSIX is currently required
  before the remaining public-exact validation hardening lands on `develop`.
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
  baseline: `ad351ed`
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
- Public GitHub exact still serves `v1.3.1`, VS Code Marketplace remains
  retained at `1.3.0`, and any later retry of the public GitHub exact-release
  act stays blocked until the feature-lane pre-tag public-exact proof closes
  cleanly.
