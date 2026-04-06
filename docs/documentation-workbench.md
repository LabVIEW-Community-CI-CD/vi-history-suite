# Documentation Package Workbench

## Purpose

Provide one repo-published container image and one governed wiki-authoring
system for iterating on the documentation package of `vi-history-suite`:

- ship target and release-readiness docs
- requirements, RTM, and test plan
- ADRs and architecture overview
- current-state, debt-retirement, wiki-authority, and release procedure surfaces
- authority-driven wiki staging and publication-prep receipts

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

Refresh the packaged bundled user docs from the current curated extension-user
subset of the published wiki set:

```bash
npm run docs:bundle
```

Run the retained documentation continuous-integration lane locally:

```bash
npm run docs:ci
```

Run the same lane without the `lychee` link-check dependency:

```bash
npm run docs:ci:core
```

The default container command is:

```bash
npm run docs:gate
```

The workbench entrypoint honors `VIHS_DOCS_WORKSPACE`, falls back to
`CI_PROJECT_DIR` in GitLab CI when that directory contains the repo package,
and only then falls back to `/workspace`, so future cross-repo wiki iteration
is not locked to one mount path.

When invoked from this canonical WSL environment through the package scripts,
the Docker-first workbench commands prefer `docker.exe --context desktop-linux`
instead of the broken Linux `docker` client so the workbench remains usable on
this machine.

## Wiki Workbench

The workbench now includes a governed wiki-authoring system that resolves the
authority repo, sibling wiki repo, and publication ledger from the local
program repo-jump map instead of from ad hoc shell assumptions.

The wiki is only considered complete when the zero-gap completion contract in:

- `docs/product/wiki-coverage-matrix.md`
- `docs/product/wiki-coverage-matrix.json`

passes under the docs gate.

Local commands:

```bash
npm run wiki:workbench:doctor
npm run wiki:workbench:plan
npm run wiki:workbench:prepare
npm run wiki:workbench:sync-bundled-docs
```

Docker-first equivalents:

```bash
npm run docs:workbench:wiki:doctor
npm run docs:workbench:wiki:plan
npm run docs:workbench:wiki:prepare
npm run docs:workbench:wiki:sync-bundled-docs
```

Published-image local equivalents:

```bash
npm run docs:workbench:gitlab:pull
npm run docs:workbench:gitlab:gate
npm run docs:workbench:gitlab:shell
npm run docs:workbench:gitlab:wiki:doctor
npm run docs:workbench:gitlab:wiki:plan
npm run docs:workbench:gitlab:wiki:prepare
npm run docs:workbench:gitlab:wiki:sync-bundled-docs
```

When the published image lives under `registry.gitlab.com`, the local
published-image commands first look for GitLab registry credentials in:

- `VIHS_GITLAB_REGISTRY_USER` and `VIHS_GITLAB_REGISTRY_TOKEN`
- `GITLAB_REGISTRY_USER` and `GITLAB_REGISTRY_TOKEN`
- `GITLAB_TOKEN` as an `oauth2` token

If none of those are present and the machine is not already authenticated to
the GitLab registry, the workbench fails closed with an explicit registry
access diagnosis instead of surfacing raw Docker `access forbidden` noise.

The retained workbench outputs are:

- `.cache/wiki-workbench/latest-workbench.json`
- `.cache/wiki-workbench/staging/<page-id>/`
- `.cache/wiki-workbench/publication-prep/<page-id>/publication-prep.json`
- `docs/product/wiki-coverage-matrix.md`
- `docs/product/wiki-coverage-matrix.json`
- `wiki-workbench-evidence/wiki-workbench-manifest.json` from the published-image GitLab lane
- `wiki-workbench-evidence/iteration-report.md` from the same lane

If a stale retained page directory is unwritable on the current machine, the
workbench rotates that page into a writable recovery path instead of failing on
old cache ownership alone:

- `.cache/wiki-workbench/staging-runs/<page-id>-<timestamp>/`
- `.cache/wiki-workbench/publication-prep-runs/<page-id>-<timestamp>/`

The intended flow is:

1. run `doctor` to validate topology, remotes, ledger, and authority-doc
   readiness
2. run `plan` to see published pages plus the current next-page target
3. run `prepare` to materialize a page-authority bundle, current wiki copy
   when present, a draft wiki file, and a publication-prep receipt
   - if `docs/product/wiki-publication-ledger.json` already retains
     `nextPage = null`, `prepare` now retains a governed no-op completion
     receipt instead of failing on the already-finished wiki state
4. run `sync-bundled-docs` only after the staged wiki state and publication
   ledger are ready
5. treat the tranche as finished only when
   `docs/product/wiki-coverage-matrix.json` remains zero-gap and
   `docs/product/wiki-publication-ledger.json` retains `nextPage = null`

The workbench is fail-closed for page staging, publication prep, and bundle
sync. If the sibling wiki repo, control files, ledger targets, or authority
docs are wrong, those commands stop instead of staging weak publication input.
If the only problem is an unwritable stale retained page directory, the
workbench self-heals by using a writable recovery run path and records the
actual retained location in the stage or publication-prep receipt.
GitLab CI-authenticated HTTPS remotes are normalized before expected-remote
comparison, so the published-image lane stays strict about repo identity
without rejecting the runner's injected `gitlab-ci-token` credential form.

## Documentation Gate

The documentation-package gate is:

1. compile current TypeScript surfaces
2. run the governed documentation-alignment unit suite
3. fail closed on bundled-doc drift against the governed wiki-derived bundle
4. run link checking over `README.md` and `docs/**/*.md`

The retained documentation continuous-integration lane builds on that gate and
adds first-class evidence for future sessions:

- `npm run docs:ci`
- `npm run docs:ci:core`
- retained local evidence under `.cache/docs-integration/latest/`
  - `.cache/docs-integration/latest/docs-integration-report.json`
  - `.cache/docs-integration/latest/docs-integration-report.md`
- retained CI evidence under `docs-integration-evidence/`
- explicit installed-user truth checks for:
  - Docker-first Windows `auto` behavior when Docker Desktop is installed
  - no silent provider fallback
  - hard stops when Docker is required but unusable
  - front-facing provider/progress visibility in the bundled installed-user guide
- explicit package-path freshness:
  - `npm run package` reruns `npm run docs:bundle` before `vsce package`
  - stale bundled installed-user docs are therefore unshippable through the
    governed packaging path

When the gate needs to assert zero-gap wiki coverage against the live published
wiki set, the canonical wiki root is:

- `VIHS_WIKI_REPO_ROOT` when explicitly set
- otherwise the sibling checkout at `../vi-history-suite.wiki`

In GitLab CI, every job that evaluates the live wiki-backed documentation
invariants first clones `${CI_PROJECT_PATH}.wiki.git` into
`../vi-history-suite.wiki`, exports `VIHS_WIKI_REPO_ROOT`, and then runs its
gate:

- `docs_continuous_integration` before the wider test/package lanes, retaining
  `docs-integration-evidence/docs-integration-report.json` and
  `docs-integration-evidence/docs-integration-report.md`
- `test_extension` before `npm run test`
- `release_extension` before the tag-gated `npm run test`

That keeps the same coverage invariant enforced in CI without relying on an
implicit runner-side checkout.

The bundled user-doc surface is refreshed explicitly and through packaging:

- `npm run docs:bundle`
- `npm run package`
- output:
  - `resources/bundled-docs/manifest.json`
  - `resources/bundled-docs/pages/*.html`

That packaged bundle is intentionally a curated installed-user guide, not a
mirror of every published wiki/control-plane page. The bundle now keeps only
the extension-user pages, trims them to developer-relevant installed-user
sections, and strips private GitLab plus standards/control-plane authority-link
sections before packaging the HTML shipped inside the VSIX.

`npm run docs:bundle` is the direct authoring path when you want to inspect the
installed guide locally during docs iteration. `npm run package` reruns the
same refresh before the VSIX is created so package and release jobs cannot ship
stale bundled docs from repo state alone.

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

The same pipeline now retains documentation continuous-integration evidence:

- `docs-integration-evidence/docs-integration-report.json`
- `docs-integration-evidence/docs-integration-report.md`
- `docs-integration-evidence/bundled-docs-check.json`
- `docs-integration-evidence/wiki-doctor.json`
- `docs-integration-evidence/wiki-plan.json`

The local published-image commands deliberately keep the same contract. They
either pull the published image after resolving supported GitLab registry
credentials or stop with a stable message that the local registry credential is
missing or insufficient.

The published docs-authoring image also self-resolves the repo root when GitLab
starts the job under `${CI_PROJECT_DIR}` instead of `/workspace`, so the
published-image package lane does not depend on an implicit mount path.

The commit-aligned wiki-preparation lane is:

- `wiki_workbench_prepare_published`

That job runs inside `${CI_REGISTRY_IMAGE}/docs-authoring:sha-${CI_COMMIT_SHORT_SHA}`,
clones the sibling wiki repo, runs doctor/plan/prepare from the published
image, and retains `wiki-workbench-evidence/` as the authoritative CI-side wiki
iteration pack. When the publication ledger already retains `nextPage = null`,
the prepare step records a no-op completion receipt and the lane stays green
without inventing a fake staged page.

## Scope Boundary

Use this workbench when the change is primarily about:

- requirements or RTM updates
- ADR creation or revision
- ship-control surfaces
- release procedure and documentation-package coherence
- wiki-preparation work driven from governed docs
- packaged bundled-user-doc refresh when the published wiki set changes

Primary repo surfaces for that work include:

- `docs/product/debt-retirement-contract.md`
- `docs/product/debt-taxonomy.md`
- `docs/product/debt-ledger.md`
- `docs/product/debt-ledger.json`
- `docs/product/documentation-coherence-ledger.md`
- `docs/product/wiki-seed-plan.md`
- `docs/product/wiki-publication-ledger.md`
- `docs/product/wiki-publication-ledger.json`
- `docs/product/wiki-coverage-matrix.md`
- `docs/product/wiki-coverage-matrix.json`
- `resources/bundled-docs/manifest.json`
- `docs/product/wiki-authority-map.md`
- `docs/product/program-repo-jump.md`
- `.cache/wiki-workbench/latest-workbench.json`

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
`npm run wiki:workbench:sync-bundled-docs` or `npm run docs:bundle` in the
same documentation tranche so publication state and the version-matched
bundled-doc surface stay governed inside the main repo. When the same tranche
retires, defers, or newly discovers meaningful technical/documentation debt,
update the debt contract surfaces in the same documentation tranche instead of
leaving that carryover implicit.
