# Public Release Candidate

- Version line: `1.0.6`
- Burned exact release line: `v1.0.2`
- Recorded at: `2026-04-07T17:48:58Z`
- Authority source of truth: GitLab `develop` -> `main`
- Published public source commit: `66bdf73`
- Public `develop` candidate commit: `975a7f2`
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

- Authority baseline: `v1.0.6-exact-public-release-published`
- Local exact VSIX build: `exact-v1.0.6-release-built`
- Local public devcontainer: `passed-v1.0.5-baseline`
- Local public fixture helper: `passed-v1.0.5-baseline`
- Public Codespace: `passed-v1.0.5-baseline`
- Gate D public acceptance: `passed-v1.0.5-baseline`
- Exact public release: `v1.0.6-published`

## Exact Release

- GitHub release: `v1.0.6`
- GitHub release URL:
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.0.6`
- GitHub asset: `vi-history-suite-1.0.6-public-release.vsix`
- GitHub asset SHA-256:
  `10eecf1cf0f8d9a7a65b4cbbf6a7b8a764f35e3f3109490359d76a60e0a8a5bf`

## Public Publication

- The exact published public source head is retained in
  `docs/product/public-github-source-publication-ledger.md` and
  `docs/product/public-github-source-publication-ledger.json`.
- The exact published public wiki head is retained in
  `docs/product/public-github-wiki-publication-ledger.md` and
  `docs/product/public-github-wiki-publication-ledger.json`.

## Local Proof

- The exact public `v1.0.6` VSIX was rebuilt from merged public `main` commit
  `66bdf73` before GitHub release publication.
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
- The current `1.0.6` local hardening slice also retires the disposed-webview
  progress race in `openViHistoryCommand` so in-flight compare progress cannot
  throw through the extension host after the panel is gone.

## Hosted Proof

- GitHub Codespace `novacula` remains retained hosted public-surface proof.
- Its hosted runtime proof baseline is commit `4a8b27b`; the later `v1.0.5`
  and exact `v1.0.6` deltas retain public publication, fork-owner procedure
  hardening, branch-model/workflow governance, and disposed-webview fail-closed
  behavior while the hosted bootstrap evidence itself remains on `novacula`.

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

## Governed Findings

- `FINDING-1.0.6-001-PUBLIC-DEVELOP-REALIGNMENT`
  - status: `closed`
  - public `develop` merged at `0985f96` with required GitHub checks green
  - requirement impact: `updated` via `VHS-REQ-505`, `VHS-REQ-506`,
    `VHS-REQ-507`, and `VHS-REQ-508`
  - ADR impact: `updated` via `ADR-0030` and `ADR-0031`
- `FINDING-1.0.6-002-HISTORY-PANEL-DISPOSED-WEBVIEW-PROGRESS-RACE`
  - status: `closed`
  - requirement impact: `updated` via `VHS-REQ-509`
  - ADR impact: `no-impact`
  - retained rationale: the fix stays within the existing history-panel
    command/webview architecture and does not change sustained branch, release,
    runtime-provider, or product-boundary decisions
- `FINDING-1.0.6-003-PUBLIC-WORKFLOW-GOVERNANCE-GAP`
  - status: `closed`
  - public `develop` merged at `975a7f2` with both required GitHub checks
    green
  - requirement impact: `updated` via `VHS-REQ-510`
  - ADR impact: `updated` via `ADR-0032`
  - retained rationale: the public workflow pair now has first-class
    requirement/ADR capture plus bounded trigger and churn-control refactoring

## Remaining Blockers

- The branch-model hardening blocker is closed because public `develop` already
  merged at `0985f96`.
- The disposed-webview progress blocker is also closed because the public
  hardening merge completed on `develop`.
- The workflow-governance blocker is now also closed because public `develop`
  merged at `975a7f2` with `package-preview` and
  `public-facade-linux-smoke` green.
- No active `1.0.6` public-source blockers remain.
- `v1.0.6` is now the current exact green line on `main`, and `develop`
  remains aligned to `1.0.6` until the next exact release candidate opens.
