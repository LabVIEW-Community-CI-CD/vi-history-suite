# Public Release Candidate

- Version line: `1.2.0`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-04-07T23:43:38Z`
- Authority source of truth: GitLab `develop` -> `main`
- Published public source commit: `daef8bd`
- Authority `develop` candidate baseline: `8c99163`
- Public `develop` candidate commit: `c9806c3`
- Published public wiki head: `b30d356`

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
- Local authority findings fold:
  `published-and-retained-on-maintained-public-candidate-surfaces`
- Public repo bootstrap:
  `published-maintained-candidate-with-doc-clarification-fold`
- Public wiki candidate review:
  `ready-for-next-brand-new-fork-review-on-published-candidate`
- Review-ready gate:
  `ready-for-brand-new-fork-review`
- Exact public release: `v1.1.0-published`
- Required review environment: brand new fork plus brand new Codespace

## Candidate State Machine

- Ordered states:
  - `local-authority-green`
  - `public-develop-published`
  - `public-wiki-published`
  - `review-ready`
  - `review-feedback-received`
  - `review-feedback-folded`
  - `tag-eligible`
- Current state: `review-ready`
- Review-ready rule: local authority-green proof is necessary but not
  sufficient; the maintained public `develop` candidate head and maintained
  public wiki head must both be published and retained here before the next
  brand-new-fork review opens
- Dirty public-surface rule: preserve unrelated dirt, inspect overlapping
  changes, patch the maintained candidate slice narrowly, and pause only on
  direct unresolved conflicts instead of stopping candidate publication merely
  because the public source/wiki worktree is dirty

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
- In a brand-new Codespace, `npm run public:repo:clone` now supports an
  interactive repo-URL prompt and prints the fallback guidance for the
  canonical helper-backed sample when the prompt is cancelled.
- When `--branch` is omitted, the generic bootstrap resolves the remote
  default branch; when `--branch` is provided, it is honored exactly.
- The canonical `npm run public:fixture:icon-editor` helper remains the
  easiest first-time proof for `ni/labview-icon-editor`.
- Public `develop` now carries the maintained generic bootstrap candidate with
  Sergio's first findings fold at `e8b0925`, and the maintained public wiki
  package that carried the same fold was published at `63a4208`.
- A repo-access LLM pre-review reassessed those published candidate surfaces,
  withdrew false blockers, and left one smaller doc-clarification slice for the
  public README, install summary, host restriction wording, and compile
  troubleshooting language.
- That clarification slice was then republished on maintained public `develop`
  head `c9806c3` through GitHub PR `#16` and on maintained public wiki head
  `b30d356`, and it is validated by the focused doc/package proof plus
  `npm run docs:gate:core` and `npm run design:gate:assert-complete`.
- The next brand-new-fork review can now reopen against those refreshed
  maintained public candidate heads.
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

- `FINDING-1.2.0-001-BRANCH-BASELINE-GOVERNANCE-GAP`
  - status: `closed`
  - authority `develop` realigned at `804ec9d` through GitLab MR `!11`
  - requirement impact: `updated` via `VHS-REQ-505` and `VHS-REQ-515`
  - ADR impact: `updated` via `ADR-0030`
- `FINDING-1.2.0-002-PUBLIC-CODESPACES-PUBLIC-REPO-BOOTSTRAP`
  - status: `active`
  - public `develop` candidate with Sergio's first findings fold was published
    at `e8b0925` through GitHub PR `#15`
  - Sergio review findings were submitted from a brand new fork and a brand
    new Codespace against the public wiki head `23604e7`, then republished on
    maintained public wiki head `63a4208`
  - a repo-access LLM pre-review then found one smaller doc-clarification
    slice; that slice was then republished on maintained public `develop` head
    `c9806c3` through GitHub PR `#16` and on maintained public wiki head
    `b30d356`
  - requirement impact: `updated` via `VHS-REQ-516`, `VHS-REQ-517`, and
    `VHS-REQ-518`
  - ADR impact: `updated` via `ADR-0034`
- `FINDING-1.2.0-003-REVIEW-READY-BOUNDARY-GOVERNANCE-GAP`
  - status: `closed`
  - local authority-green proof previously stopped short of maintained public
    candidate publication, so the control plane now retains an explicit
    `review-ready` boundary instead of treating local proof as reviewable truth
  - requirement impact: `updated` via `VHS-REQ-519` and `VHS-REQ-520`
  - ADR impact: `updated` via `ADR-0035`

## Remaining Blockers

- One final acceptance review from a brand new fork and a brand new Codespace
  is still required on maintained public `develop` candidate head `c9806c3`
  and maintained public wiki head `b30d356` before exact tagging.
- `v1.1.0` remains the current exact green line on `main`, while `v1.2.0`
  stays open on `develop`.
