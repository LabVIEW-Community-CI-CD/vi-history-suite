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

## Steps

1. Ensure `main` is in a governed baseline state.
2. Ensure `package.json` matches the release tag version exactly.
3. Run compile, test, coverage generation, and VSIX packaging through GitLab
   CI.
4. Retain release evidence under `release-evidence/`.
5. Review the generated release record and release manifest before any
   downstream distribution step.
6. Ensure the release artifact includes the exact versioned VSIX intended for
   installation and sharing.
7. Ensure the retained release manifest names the tag, package version, commit,
   VSIX filename, and retained evidence paths.

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

## Current Limitation

- Marketplace publishing is not active in the current baseline.
- Preview VSIX artifacts are available from `main`, but they are not the same
  thing as the governed SemVer release artifact.
- The docs-authoring workbench image is a supporting documentation-package
  surface, not the end-user extension artifact.
- The GitLab release lane is configured to build the governed versioned VSIX
  artifact and release manifest.
- `SHIP-0001` still requires the first successful SemVer-tagged retained
  release evidence set before the release blocker can close.
