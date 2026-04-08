# Public Release Candidate

- Version line: `1.2.1`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-04-08T04:21:44Z`
- Authority source of truth: GitLab `develop` -> `main`
- Published public source commit: `2547344`
- Public `develop` candidate commit: `96af6a3`
- Published public wiki head: `a12eb16`

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
- Local exact VSIX build: `exact-v1.2.1-package-built-from-public-main`
- Local public devcontainer: `v1.1.0-published-baseline`
- Local public fixture helper: `v1.1.0-published-baseline`
- Public repo bootstrap: `passed-brand-new-fork-review-on-hse-logger`
- Public wiki candidate review:
  `waived-by-user-post-publish-installed-extension-review`
- Exact public release: `v1.2.1-published`

## Exact Release

- GitHub release: `v1.2.1`
- GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.2.1`
- GitHub asset: `vi-history-suite-1.2.1.vsix`
- GitHub asset SHA-256:
  `19129777e6e88d0b8667b11afad78889bddd1ca9ede263d9d2e003a5c5e15e7c`
- VS Code Marketplace item: `svelderrainruiz.vi-history-suite`
- VS Code Marketplace version: `1.2.1`

## Public Publication

- The exact published public source head is retained in
  `docs/product/public-github-source-publication-ledger.md` and
  `docs/product/public-github-source-publication-ledger.json`.
- The current published public `develop` candidate now lands through GitHub PR
  `#21` at commit `96af6a3`, with `package-preview` and
  `public-facade-linux-smoke` green before merge.
- The exact public `main` release promotion now lands through GitHub PR `#23`
  at commit `2547344`, with `package-preview` and
  `public-facade-linux-smoke` green before merge.
- The exact published public wiki head is retained in
  `docs/product/public-github-wiki-publication-ledger.md` and
  `docs/product/public-github-wiki-publication-ledger.json` and now points to
  `a12eb16`.
- The exact VS Code Marketplace item now publishes `1.2.1`, verified through
  the official gallery extension query after pinned `vsce` publication.

## Local Proof

- The exact public `v1.2.1` VSIX was rebuilt from merged public `main` commit
  `2547344` before GitHub release and VS Code Marketplace publication.
- The packaged extension now points installed users at the maintained public
  wiki home instead of the repo root.
- The local public devcontainer and helper-backed icon-editor path remain the
  published `v1.1.0` baseline.
- Authority `develop` was realigned to exact `main` through GitLab MR `!11`
  before `1.2.0` feature work continued, so the next feature line now starts
  from a compliant branch baseline instead of reopening from stale `develop`.
- The authority and public `1.2.0` line now carry `npm run public:repo:clone`,
  which accepts public `github.com` and `gitlab.com` HTTPS repo URLs without a
  provider selector.
- In a brand-new Codespace, `npm run public:repo:clone` supports an
  interactive repo-URL prompt and prints fallback guidance for the canonical
  helper-backed sample when the prompt is cancelled.
- When `--branch` is omitted, the generic bootstrap resolves the remote
  default branch; when `--branch` is provided, it is honored exactly.
- The canonical `npm run public:fixture:icon-editor` helper remains the
  easiest first-time proof for `ni/labview-icon-editor`.
- Sergio's accepted brand-new-fork rerun on `hse-logger` passed on
  `/workspaces/hse-logger/Examples/Logging with Helper-VIs.vi` for selected/base
  pair `81325a775fdeb37141e08926d78aa0e47e887990 -> 4a265f6e64ff7d2aff22b67d0c95f67fa043b5fb`.
- Moved-VI compare pairs now resolve the historical repo-relative path for
  each revision before blob reads and runtime staging proceed, so the review
  flow no longer fails closed with `left-blob-read-failed` when the VI moved
  between the selected and base commits.
- Bundled compare-flow docs now retire stale `Diff prev` and retained-pair
  wording in favor of the checkbox-selected pair review path.
- The maintained public `develop` branch now carries the installed-user-first
  README/install surface, the Marketplace homepage target, the public package
  surface test alignment, and the bundled-doc manifest that references the
  real published wiki head `a12eb16`.

## Accepted Waivers

- `WAIVER-1.2.1-001-POST-PUBLISH-INSTALLED-REVIEW`
  - status: `accepted`
  - scope: `pre-tag-installed-user-review-gate`
  - recorded outcome: Sergio elected to review the published extension
    directly in local VS Code after publication instead of holding the exact
    closeout for another pre-tag human review pass.

## Hosted Proof

- GitHub Codespace `novacula` remains retained hosted public-surface proof.
- Its hosted runtime proof baseline is commit `4a8b27b`; the exact public
  baseline later advanced to `v1.2.0` while this hosted proof remained the
  retained bootstrap evidence.

## Human Review Proof

- The latest retained human review submission is a real
  `passed-human-review` recorded at `2026-04-08T01:22:21Z` on
  `/workspaces/hse-logger/Examples/Logging with Helper-VIs.vi`.
- Selected/base pair:
  `81325a775fdeb37141e08926d78aa0e47e887990 -> 4a265f6e64ff7d2aff22b67d0c95f67fa043b5fb`
- Reviewer note: `It worked on "Examples/Logging with Helper-VIs.vi".`
- The earlier canonical helper-backed acceptance on
  `resource/plugins/lv_icon.vi` remains retained historical proof for the
  helper path.
- Sergio explicitly waived the later pre-tag installed-user review gate and
  will review the published `1.2.1` extension directly in local VS Code.

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
  - status: `closed`
  - exact public `main` now publishes `2547344`, the public GitHub release
    `v1.2.1` is live, and the maintained public wiki head remains `a12eb16`
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
- `FINDING-1.2.0-004-MOVED-VI-HISTORICAL-PATH-RESOLUTION`
  - status: `closed`
  - Sergio's brand-new-fork review found that moved VI pairs could still fail
    compare preflight with `left-blob-read-failed` even though VI History had
    correctly followed the file across the rename, so comparison generation now
    resolves the historical repo-relative path for each revision before blob
    reads and runtime staging proceed
  - requirement impact: `updated` via `VHS-REQ-521`
  - ADR impact: `none`
- `FINDING-1.2.1-001-MARKETPLACE-PUBLICATION-CONTROL-PLANE-GAP`
  - status: `closed`
  - the VS Code Marketplace is now a governed exact-release distribution
    surface, and the control plane now retains publisher, listing, closeout,
    PAT-governance truth, and verified `1.2.1` publication evidence instead of
    leaving Marketplace publication in chat or operator memory
  - requirement impact: `updated` via `VHS-REQ-522`, `VHS-REQ-523`, and
    `VHS-REQ-524`
  - ADR impact: `updated` via `ADR-0036`
- `FINDING-1.2.1-002-INSTALLED-USER-ENTRY-SURFACE-MISROUTED`
  - status: `closed`
  - Marketplace and installed-extension users were landing on repo-first,
    branch-specific source guidance, so the installed-user entry surface is now
    routed through the public wiki home/install pages and the packaged
    homepage instead
  - requirement impact: `updated` via `VHS-REQ-525` and `VHS-REQ-526`
  - ADR impact: `updated` via `ADR-0036`

## Remaining Blockers

- No release-path blocker remains on `v1.2.1`.
- Public `main` now publishes `2547344`, public `develop` retains candidate
  commit `96af6a3`, the public wiki remains `a12eb16`, the public GitHub
  release `v1.2.1` is live, the VS Code Marketplace item now publishes
  `1.2.1`, and Sergio elected post-publish installed-extension review in local
  VS Code instead of a pre-tag human gate.
