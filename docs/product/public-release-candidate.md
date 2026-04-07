# Public Release Candidate

- Version line: `1.2.0`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-04-07T20:33:02Z`
- Authority source of truth: GitLab `develop` -> `main`
- Published public source commit: `daef8bd`
- Authority `develop` candidate baseline: `804ec9d`
- Public `develop` candidate commit: `not-yet-promoted`
- Published public wiki head: `d184be2`

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

- Authority baseline: `v1.1.0-exact-public-release-published`
- Local exact VSIX build: `exact-v1.1.0-release-built`
- Local public devcontainer: `v1.1.0-published-baseline`
- Local public fixture helper: `v1.1.0-published-baseline`
- Public repo bootstrap: `in-progress-1.2.0`
- Public wiki candidate review: `pending-sergio`
- Exact public release: `v1.1.0-published`
- Required review environment: brand new fork plus brand new Codespace

## Exact Release

- GitHub release: `v1.1.0`
- GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.1.0`
- GitHub asset: `vi-history-suite-1.1.0-public-release.vsix`
- GitHub asset SHA-256:
  `637b3c592cb39d6259f9aee1dd29b848998c8fac9d166a86b9bc7bd3ebf70956`

## Public Publication

- The exact published public source head is retained in
  `docs/product/public-github-source-publication-ledger.md` and
  `docs/product/public-github-source-publication-ledger.json`.
- The exact published public wiki head is retained in
  `docs/product/public-github-wiki-publication-ledger.md` and
  `docs/product/public-github-wiki-publication-ledger.json`.

## Local Proof

- The exact public `v1.1.0` VSIX was rebuilt from merged public `main` commit
  `daef8bd` before GitHub release publication.
- The local public devcontainer and helper-backed icon-editor path remain the
  published `v1.1.0` baseline.
- Authority `develop` was realigned to exact `main` through GitLab MR `!11`
  before `1.2.0` feature work continued, so the next feature line now starts
  from a compliant branch baseline instead of reopening from stale `develop`.
- The authority candidate line now carries `npm run public:repo:clone`, which
  accepts public `github.com` and `gitlab.com` HTTPS repo URLs without a
  provider selector.
- When `--branch` is omitted, the generic bootstrap resolves the remote
  default branch; when `--branch` is provided, it is honored exactly.
- The canonical `npm run public:fixture:icon-editor` helper remains the
  easiest first-time proof for `ni/labview-icon-editor`.
- The exact `v1.2.0` tag is intentionally blocked until the maintained public
  wiki procedures are dry-run reviewed and accepted from a brand new fork and
  a brand new Codespace.

## Hosted Proof

- GitHub Codespace `novacula` remains retained hosted public-surface proof.
- Its hosted runtime proof baseline is commit `4a8b27b`; the later `v1.0.5`
  and exact `v1.1.0` deltas retain public publication, fork-owner procedure
  hardening, branch-model/workflow governance, and disposed-webview fail-closed
  behavior while the hosted bootstrap evidence itself remains on `novacula`.

## Human Review Proof

- The latest retained human review submission is a real
  `passed-human-review` at `2026-04-07T04:06:58.998Z` on
  `resource/plugins/lv_icon.vi`.
- Reviewer note: `Comparison report is as expected.`

## Tester Fixture Strategy

- Decision: helper-backed canonical path plus generic public-repo bootstrap
- Canonical helper command: `npm run public:fixture:icon-editor`
- Generic bootstrap command:
  `npm run public:repo:clone -- --repo-url <https-url>`
- Canonical helper target path: `../labview-icon-editor`
- Generic bootstrap target path: `../<repo-name>`
- Codespace target path pattern: `/workspaces/<repo-name>`
- Manual alternative: `Manual-Actor-Framework-Clone`
- Refresh page: `Refresh-Codespace-Repositories`

## Governed Findings

- `FINDING-1.2.0-001-BRANCH-BASELINE-GOVERNANCE-GAP`
  - status: `closed`
  - authority `develop` realigned at `804ec9d` through GitLab MR `!11`
  - requirement impact: `updated` via `VHS-REQ-505` and `VHS-REQ-515`
  - ADR impact: `updated` via `ADR-0030`
- `FINDING-1.2.0-002-PUBLIC-CODESPACES-PUBLIC-REPO-BOOTSTRAP`
  - status: `active`
  - requirement impact: `updated` via `VHS-REQ-516`, `VHS-REQ-517`, and
    `VHS-REQ-518`
  - ADR impact: `updated` via `ADR-0034`

## Remaining Blockers

- The generic public GitHub/GitLab bootstrap is not yet promoted onto the
  public `develop` branch.
- The maintained public wiki procedures for that generic bootstrap still need
  Sergio dry-run feedback from a brand new fork and a brand new Codespace
  before exact tagging.
- `v1.1.0` remains the current exact green line on `main`, while `v1.2.0`
  stays open on `develop`.
