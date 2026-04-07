# Public Release Candidate

- Version line: `1.0.4`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-04-07T07:30:00.000Z`
- Authority source of truth: GitLab `develop` -> `main`
- Published public source commit: `4952acc`
- Published public wiki head: `1fb3a00`

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

- Authority baseline: `local-gates-passing`
- Local installed VSIX: `exact-v1.0.3`
- Local public devcontainer: `passed`
- Local public fixture helper: `passed`
- Public Codespace: `passed`
- Gate D public acceptance: `passed`
- Exact public release: `v1.0.3-published`

## Exact Release

- GitHub release: `v1.0.3`
- GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.0.3`
- GitHub asset: `vi-history-suite-1.0.3-public-release.vsix`
- GitHub asset SHA-256:
  `0e5e5018043807bd3823e0db2918191246f9dd212e598a24144d557af9f50abf`

## Public Publication

- The exact published public source head is retained in
  `docs/product/public-github-source-publication-ledger.md` and
  `docs/product/public-github-source-publication-ledger.json`.
- The exact published public wiki head is retained in
  `docs/product/public-github-wiki-publication-ledger.md` and
  `docs/product/public-github-wiki-publication-ledger.json`.

## Local Proof

- The local public devcontainer passes on the governed machine surface.
- The governed public fixture helper now stages `ni/labview-icon-editor` into
  a visible repo-sibling `labview-icon-editor` folder instead of a hidden cache
  path.
- The helper-backed fork-owner path now targets upstream `develop`, which
  preserves the commit history needed for the `VI History` context action on
  `resource/plugins/lv_icon.vi`.
- The public `VI History` action now surfaces immediately on `.vi`, `.ctl`,
  and `.vit` files instead of waiting for background eligibility indexing.
- The public package-preview required check now creates `artifacts/` before the
  VSIX build so upload cannot fail after a successful package step.

## Hosted Proof

- GitHub Codespace `novacula` remains retained hosted public-surface proof.
- Its hosted runtime proof baseline is commit `4a8b27b`; the later `v1.0.3`
  delta is the burned-release recovery, branch-model, and fork-owner procedure
  correction slice.

## Human Review Proof

- The latest retained human review submission is a real
  `passed-human-review` at `2026-04-07T04:06:58.998Z` on
  `resource/plugins/lv_icon.vi`.
- Reviewer note: `Comparison report is as expected.`

## Tester Fixture Strategy

- Decision: optional governed helper
- Command: `npm run public:fixture:icon-editor`
- Target path: `../labview-icon-editor`
- Codespace target path: `/workspaces/labview-icon-editor`
- Manual alternative: `Manual-Actor-Framework-Clone`
- Refresh page: `Refresh-Codespace-Repositories`

## Remaining Blockers

- None on the exact released line. `v1.0.2` is retained as burned, `v1.0.3` is
  the current exact green line, and `1.0.4` is the active `develop` candidate
  slice for the next exact public promotion.
