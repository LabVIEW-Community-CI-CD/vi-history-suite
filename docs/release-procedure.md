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
- The current exact released line is `v1.0.2`.
- The current published package line on `main` is `1.0.2`.
- The public Codespaces evaluation branch is `develop`.
- After an exact release is published, the current published package line on
  `main` shall match that exact release line.
- Any later repo change intended for publication shall advance `package.json`
  and the top `CHANGELOG.md` heading to the next SemVer line before additional
  publication or release normalization continues.
- A SemVer bump is not complete until the matching public tag and public
  GitHub release are both published.
- The release tag shall match both `package.json` and the top unreleased
  heading in [CHANGELOG.md](../CHANGELOG.md).
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

1. Ensure `main` is in a governed baseline state.
   - Either wait for `npm run design:gate` to exit `0`, or run
     `npm run design:gate:assert-complete` against the retained latest report
     before claiming the gate is green.
   - If the available assurance skill path resolves under a mounted Windows
     path, the design gate mirrors it under
     `.cache/design-gate/assurance-skill/repo-standards-review/` before
     executing standards assurance.
2. Ensure `package.json` and the top unreleased entry in `CHANGELOG.md` match
   the release tag version exactly.
3. If the release tranche changed bundled-doc inputs, run `npm run docs:bundle`
   locally so the packaged installed-user guide can be inspected before CI
   packages the VSIX.
4. Run both split documentation CI surfaces before release normalization:
   - `npm run docs:ci:public:core`
   - `npm run docs:ci:internal:core`
   - `npm run docs:ci:core` may still be used as the retained umbrella lane
     when one combined local report is more convenient.
5. Run compile, test, coverage generation, and VSIX packaging through GitLab
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
6. Retain release evidence under `release-evidence/`.
7. Review the generated release record and release manifest before any
   downstream distribution step.
8. Ensure the release artifact includes the exact versioned VSIX intended for
   installation and sharing.
9. Ensure the retained release manifest names the tag, package version, commit,
   VSIX filename, and retained evidence paths.
10. Ensure the packaged extension still contains the bundled user-doc surface
   under `resources/bundled-docs/`.
11. When the public Docker product contract changes materially, rerun the
    public-facade Linux smoke lane through:
    - local `npm run public:smoke:linux`
    - local `npm run public:gate-d:preflight`
    - local `npm run public:gate-d:prepare-cold-pull` immediately before the
      real cold-pull Gate D rerun
    - GitHub `workflow_dispatch` on `.github/workflows/public-facade-linux-smoke.yml`
12. When the public source facade changes materially, promote the curated
    public GitHub source repo from authority and record the published commit:
    - `npm run public:source:promote`
    - update `docs/product/public-github-source-publication-ledger.{md,json}`
13. Keep public source publication separate from public GitHub wiki
    publication; one publication act does not imply the other.

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
- The current published package line on `main` is `1.0.2`, tracked in
  `CHANGELOG.md`, and it should not rewrite the retained `v0.2.0`, `v1.0.0`,
  or `v1.0.1` release evidence.
