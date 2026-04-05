# Documentation Package Workbench

## Purpose

Provide one repo-published container image for iterating on the governed
documentation package of `vi-history-suite`:

- ship target and release-readiness docs
- requirements, RTM, and test plan
- ADRs and architecture overview
- current-state, wiki-authority, and release procedure surfaces

This workbench is for documentation-package iteration only. It is not the NI
runtime-proof lane and it is not itself the extension-user VSIX install
surface, although it prepares bundled user-doc content that can ship inside
that surface.

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

For future wiki work that needs the sibling `vi-history-suite.wiki` checkout to
remain visible inside the same container, mount the parent directory and point
the entrypoint at the repo root you want to operate on:

```bash
docker run --rm -it \
  -v "$(dirname "$PWD")":/repo-parent \
  -e VIHS_DOCS_WORKSPACE=/repo-parent/vi-history-suite \
  -w /repo-parent/vi-history-suite \
  vi-history-suite-docs-authoring:local \
  bash
```

Refresh the packaged bundled user docs from the current published wiki set:

```bash
npm run docs:bundle
```

The default container command is:

```bash
npm run docs:gate
```

The workbench entrypoint honors `VIHS_DOCS_WORKSPACE`, so future cross-repo
wiki iteration is not locked to `/workspace`.

## Documentation Gate

The documentation-package gate is:

1. compile current TypeScript surfaces
2. run the governed documentation-alignment unit suite
3. run link checking over `README.md` and `docs/**/*.md`

The bundled user-doc surface is refreshed separately from the gate:

- `npm run docs:bundle`
- output:
  - `resources/bundled-docs/manifest.json`
  - `resources/bundled-docs/pages/*.html`

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
- packaged bundled-user-doc refresh when the published wiki set changes

Primary repo surfaces for that work include:

- `docs/product/documentation-coherence-ledger.md`
- `docs/product/wiki-seed-plan.md`
- `docs/product/wiki-publication-ledger.md`
- `docs/product/wiki-publication-ledger.json`
- `resources/bundled-docs/manifest.json`
- `docs/product/wiki-authority-map.md`
- `docs/product/program-repo-jump.md`

Use the governed local repo-jump surface when the work spans this repo, the
wiki repo, and the companion assurance-skill repo:

```bash
npm run program:repos
python3 /mnt/c/Users/sveld/.codex/skills/repo-standards-review/scripts/repo_jump.py /home/sveld/code/standards/vi-history-suite --format text
```

Do not use this workbench as the primary surface for:

- Windows NI comparison-report proof
- extension-host runtime proof
- installed-extension milestone testing

Those remain separate product-proof lanes.

When a wiki page is actually published, update
`docs/product/wiki-publication-ledger.md`,
`docs/product/wiki-publication-ledger.json`, and the packaged bundle via
`npm run docs:bundle` in the same documentation tranche so publication state
and the version-matched bundled-doc surface stay governed inside the main
repo.
