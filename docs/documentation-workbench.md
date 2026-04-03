# Documentation Package Workbench

## Purpose

Provide one repo-published container image for iterating on the governed
documentation package of `vi-history-suite`:

- ship target and release-readiness docs
- requirements, RTM, and test plan
- ADRs and architecture overview
- current-state, wiki-authority, and release procedure surfaces

This workbench is for documentation-package iteration only. It is not the NI
runtime-proof lane and it is not the extension-user VSIX install surface.

## Local Commands

Build the local workbench image:

```bash
npm run docs:workbench:build
```

Run the full documentation gate inside that image:

```bash
npm run docs:workbench:gate
```

Open an interactive shell in the workbench:

```bash
npm run docs:workbench:shell
```

The default container command is:

```bash
npm run docs:gate
```

## Documentation Gate

The documentation-package gate is:

1. compile current TypeScript surfaces
2. run the governed documentation-alignment unit suite
3. run link checking over `README.md` and `docs/**/*.md`

Run it directly on the host only when the required tooling is available:

```bash
npm run docs:gate
```

If `lychee` is not installed locally, use the containerized gate instead.

## Published Image

GitLab CI publishes the docs-authoring image to the project container registry:

- `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`
- `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:sha-<commit>`
- `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:vX.Y.Z` on
  governed SemVer tags

The pipeline also retains `docs-workbench-evidence/docs-workbench-manifest.json`
so future sessions can see which image references were published.

## Scope Boundary

Use this workbench when the change is primarily about:

- requirements or RTM updates
- ADR creation or revision
- ship-control surfaces
- release procedure and documentation-package coherence
- wiki-preparation work driven from governed docs

Primary repo surfaces for that work include:

- `docs/product/documentation-coherence-ledger.md`
- `docs/product/wiki-seed-plan.md`
- `docs/product/wiki-authority-map.md`

Do not use this workbench as the primary surface for:

- Windows NI comparison-report proof
- extension-host runtime proof
- installed-extension milestone testing

Those remain separate product-proof lanes.
