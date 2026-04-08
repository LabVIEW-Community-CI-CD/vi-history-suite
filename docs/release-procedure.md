# Release Procedure

## Trigger

- For pre-release install testing, use the `package_extension_preview` artifact
  from the latest successful `main` pipeline.
- Release from a SemVer tag matching `vX.Y.Z`.
- Only release when [SHIP-0001](./product/SHIP-0001-releasable-vi-history-suite.md)
  and the [release readiness matrix](./product/release-readiness-matrix.json)
  do not retain open blockers against the targeted release criterion.
- The first retained exact-version release is `v0.2.0`, with retained artifact
  `vi-history-suite-0.2.0.vsix` and manifest
  `release-evidence/release-manifest.json`.
- The current exact released line is `v1.1.0`.
- The burned exact released line is `v1.0.2`.
- The current published package line on `main` is `1.1.0`.
- The current develop package line on `develop` is `1.2.0`.
- The active exact release candidate line on `develop` is `v1.2.0`.
- The active release-candidate branch is `release/1.2.0`.
- The active SemVer opening decision is `minor`.
- The public GitHub default branch is `main` because it carries the latest
  exact released source line.
- The public Codespaces evaluation branch is `develop`.
- The integration branch is `develop`.
- The release branch is `main`.
- The next-line branch model is `gitflow-lite` with temporary
  `feature/*`, `release/*`, and `hotfix/*` lanes.
- The hosted automation governance matrix is retained in:
  - `docs/product/hosted-ci-governance.md`
  - `docs/product/hosted-ci-governance.json`
- Protected-branch promotion shall rely on required checks, not operator memory.
- After an exact release is published, the current published package line on
  `main` shall match that exact release line.
- When `develop` carries post-release work, its package line shall advance to
  the next exact release candidate before public guidance or publication
  changes land on that branch.
- Any later repo change intended for publication shall advance `package.json`
  and the top `CHANGELOG.md` heading to the next SemVer line before additional
  publication or release normalization continues.
- A SemVer bump is not complete until the matching public tag and public
  GitHub release are both published.
- The release tag shall match both `package.json` and the top unreleased
  heading in [CHANGELOG.md](../CHANGELOG.md).
- Tags shall be cut only from a green `main` commit after the required checks
  on the integration and release branches have already passed.
- The repo also publishes a separate docs-authoring workbench image for
  documentation-package iteration:
  `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`
- Documentation-package coherence and future wiki seeding are tracked in:
  - `docs/product/documentation-coherence-ledger.md`
  - `docs/product/wiki-seed-plan.md`
  - `docs/product/wiki-publication-ledger.md`
  - `docs/product/wiki-publication-ledger.json`
- Public-source publication is tracked separately in:
  - `docs/product/public-github-source-authority-map.md`
  - `docs/product/public-github-source-publication-ledger.md`
  - `docs/product/public-github-source-publication-ledger.json`

## Steps

1. Ensure branch promotion followed the governed branch model.
   - Before opening or promoting the next candidate line, run
     `npm run branch:governance:assert` or let `npm run design:gate` run it
     first.
   - Fail closed if `develop` does not yet contain the exact released `main`
     baseline.
   - Land integration work on `develop`.
   - Promote release candidates from `develop` into `main`.
   - Do not tag from `develop`.
   - Do not rely on direct pushes to a protected release branch as the primary
     release path.
2. Ensure `main` is in a governed baseline state.
   - Either wait for `npm run design:gate` to exit `0`, or run
     `npm run design:gate:assert-complete` against the retained latest report
     before claiming the gate is green.
   - If the available assurance skill path resolves under a mounted Windows
     path, the design gate mirrors it under
     `.cache/design-gate/assurance-skill/repo-standards-review/` before
     executing standards assurance.
   - Verify the required checks on the protected branch are green before any
     tag is created.
3. Ensure `package.json` and the top unreleased entry in `CHANGELOG.md` match
   the release tag version exactly.
4. If the release tranche changed bundled-doc inputs, run `npm run docs:bundle`
   locally so the packaged installed-user guide can be inspected before CI
   packages the VSIX.
5. Run both split documentation CI surfaces before release normalization:
   - `npm run docs:ci:public:core`
   - `npm run docs:ci:internal:core`
   - `npm run docs:ci:core` may still be used as the retained umbrella lane
     when one combined local report is more convenient.
6. Run compile, test, coverage generation, and VSIX packaging through GitLab
   CI.
   - The guarded `npm run package` path now runs compile,
     `npm run docs:bundle`, `npm run package:audit`, and then `vsce package`.
     Stale bundled installed-user docs are therefore unshippable through the
     governed packaging path.
   - Packaging-only npm tooling is intentionally excluded from the default
     repo `npm ci` surface and is invoked only on demand through the pinned
     `scripts/runPinnedVsce.js` helper when packaging is requested.
   - Packaging must fail closed if the packaged surface includes runtime
     `node_modules` or transient/test artifacts such as `.cache` or
     `.vscode-test`.
7. Retain release evidence under `release-evidence/`.
8. Review the generated release record and release manifest before any
   downstream distribution step.
9. Ensure the release artifact includes the exact versioned VSIX intended for
   installation and sharing.
10. Ensure the retained release manifest names the tag, package version, commit,
   VSIX filename, and retained evidence paths.
11. Ensure the packaged extension still contains the bundled user-doc surface
   under `resources/bundled-docs/`.
12. When the public Docker product contract changes materially, rerun the
    public-facade Linux smoke lane through:
    - local `npm run public:smoke:linux`
    - local `npm run public:gate-d:preflight`
    - local `npm run public:gate-d:prepare-cold-pull` immediately before the
      real cold-pull Gate D rerun
    - GitHub `workflow_dispatch` on `.github/workflows/public-facade-linux-smoke.yml`
13. When the public source facade changes materially, promote the curated
    public GitHub source repo from authority and record the published commit:
    - bind the intended local public checkout with `--target-root` or
      `VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT` whenever the canonical sibling
      checkout is not the repo you intend to validate or write
    - `npm run public:source:check`
    - `npm run public:source:promote`
    - clean the target repo first if the governed check/promotion surface
      reports dirty-target failure; do not treat dirty side-worktree drift as
      publishable truth
    - update `docs/product/public-github-source-publication-ledger.{md,json}`
14. Keep public source publication separate from public GitHub wiki
    publication; one publication act does not imply the other.
15. Mark a candidate `review-ready` only after the maintained public candidate
    surfaces are actually published.
    - local authority-green proof is necessary but not sufficient
    - the maintained public `develop` candidate head must be live
    - the maintained public wiki head must be live
    - both published heads must be retained in
      `docs/product/public-release-candidate.{md,json}`
    - do not open the next human review gate until that `review-ready` state is
      recorded
16. Treat dirty public source/wiki worktrees as governed publication surfaces,
    not as a generic stopping point.
    - preserve unrelated dirt
    - inspect overlapping changes
    - patch only the maintained candidate files narrowly
    - pause only when a direct unresolved conflict remains
    - do not publish blindly, but do not stop publication solely because the
      worktree is dirty
17. Keep exact tagging blocked until the post-publication human review gate is
    accepted on the maintained public candidate surfaces.

## Retained Evidence

- `preview-evidence/vi-history-suite-<version>.vsix`
- `preview-evidence/preview-manifest.json`
- `release-evidence/coverage/`
- `release-evidence/coverage.xml`
- `release-evidence/vi-history-suite-<version>.vsix`
- `release-evidence/vi-history-suite-<version>.vsix.sha256`
- `release-evidence/release-record.md`
- `release-evidence/release-manifest.json`
- `docs-workbench-evidence/docs-workbench-manifest.json`
- `docs-integration-evidence/docs-integration-report.json`
- `docs-integration-evidence/docs-integration-report.md`
- `docs-integration-evidence/public/`
- `docs-integration-evidence/internal/`
- `resources/bundled-docs/manifest.json`
- `.cache/design-gate/assurance-skill/repo-standards-review/`

## Current State

- Marketplace publishing is not active in the current baseline.
- Preview VSIX artifacts are available from `main`, but they are not the same
  thing as the governed SemVer release artifact.
- The docs-authoring workbench image is a supporting documentation-package
  surface, not the end-user extension artifact.
- The release gate now expects split public-user and internal-authority docs
  CI surfaces in addition to the retained umbrella docs CI lane.
- The public Docker product surface is additionally characterized by the
  public-facade Linux smoke lane for Linux-engine cold-pull behavior.
- The GitLab release lane is configured to build the governed versioned VSIX
  artifact and release manifest.
- The first governed `v0.2.0` release evidence set is now retained through
  GitLab release `v0.2.0`, tag pipeline `2428809456`, and kept release job
  `13779604462`.
- `v1.0.2` is retained as a burned release because the immutable tag published
  before the exact authority docs CI failure was discovered.
- The current published package line on `main` is `1.1.0`, tracked in
  `CHANGELOG.md`, and it should not rewrite the retained `v0.2.0`, `v1.0.0`,
  `v1.0.1`, burned `v1.0.2`, exact `v1.0.3`, exact `v1.0.4`, exact `v1.0.5`,
  exact `v1.0.6`, or exact `v1.1.0` release evidence.
- The current develop package line on `develop` is `1.2.0`, the active exact
  release candidate line is `v1.2.0`, `release/1.2.0` is the active
  release-candidate branch, and the opening decision remains `minor`.
