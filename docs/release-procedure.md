# Release Procedure

## Trigger

- For pre-release install testing, use the `package_extension_preview` artifact
  from the latest successful `main` pipeline.
- Release from a SemVer tag matching `vX.Y.Z`.
- Only release when [SHIP-0001](./product/SHIP-0001-releasable-vi-history-suite.md)
  and the [release readiness matrix](./product/release-readiness-matrix.json)
  do not retain open blockers against the targeted release criterion.
- The release target for the current ship program is `v0.2.0`, with expected
  artifact `vi-history-suite-0.2.0.vsix` and manifest
  `release-evidence/release-manifest.json`.
- The repo also publishes a separate docs-authoring workbench image for
  documentation-package iteration:
  `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`
- Documentation-package coherence and future wiki seeding are tracked in:
  - `docs/product/documentation-coherence-ledger.md`
  - `docs/product/wiki-seed-plan.md`
  - `docs/product/wiki-publication-ledger.md`
  - `docs/product/wiki-publication-ledger.json`

## Steps

1. Ensure `main` is in a governed baseline state.
   - Either wait for `npm run design:gate` to exit `0`, or run
     `npm run design:gate:assert-complete` against the retained latest report
     before claiming the gate is green.
   - If the available assurance skill path resolves under a mounted Windows
     path, the design gate mirrors it under
     `.cache/design-gate/assurance-skill/repo-standards-review/` before
     executing standards assurance.
2. Ensure `package.json` matches the release tag version exactly.
3. If the release tranche changed bundled-doc inputs, run `npm run docs:bundle`
   locally so the packaged installed-user guide can be inspected before CI
   packages the VSIX.
4. Run compile, test, coverage generation, and VSIX packaging through GitLab
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
5. Retain release evidence under `release-evidence/`.
6. Review the generated release record and release manifest before any
   downstream distribution step.
7. Ensure the release artifact includes the exact versioned VSIX intended for
   installation and sharing.
8. Ensure the retained release manifest names the tag, package version, commit,
   VSIX filename, and retained evidence paths.
9. Ensure the packaged extension still contains the bundled user-doc surface
   under `resources/bundled-docs/`.

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
- `resources/bundled-docs/manifest.json`
- `.cache/design-gate/assurance-skill/repo-standards-review/`

## Current State

- Marketplace publishing is not active in the current baseline.
- Preview VSIX artifacts are available from `main`, but they are not the same
  thing as the governed SemVer release artifact.
- The docs-authoring workbench image is a supporting documentation-package
  surface, not the end-user extension artifact.
- The GitLab release lane is configured to build the governed versioned VSIX
  artifact and release manifest.
- The first governed `v0.2.0` release evidence set is now retained through
  GitLab release `v0.2.0`, tag pipeline `2428809456`, and kept release job
  `13779604462`.
