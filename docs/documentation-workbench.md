# Documentation Workbench

The documentation workbench is a repo-native, reproducible environment for
authoring and validating the VI History Suite documentation set. It removes the
dependency on a contributor's host toolchain so the documentation gates run the
same way locally, inside CI, and inside the standards reviewer.

## Surfaces

The workbench is composed of three surfaces that must exist together. When all
three are present and coherent, the standards detector reports the
documentation-package workbench as `supported: true`.

| Surface | Purpose |
| --- | --- |
| `docker/docs-authoring/Dockerfile` | Reproducible Node-based image for authoring and validating docs |
| `docs/documentation-workbench.md` | This usage guide |
| `package.json` script `docs:gate` | Fail-closed gate that verifies the surfaces exist and stay coherent |

## Build the image

Build from the repository root so the build context includes the documentation
sources and the gate scripts:

```shell
docker build -f docker/docs-authoring/Dockerfile -t vi-history-suite-docs-authoring:local .
```

## Run the gates

Run the documentation gate (the image's default command) to confirm the
workbench surfaces are intact:

```shell
docker run --rm vi-history-suite-docs-authoring:local
```

Run the documentation link check inside the same image:

```shell
docker run --rm vi-history-suite-docs-authoring:local npm run docs:links
```

Both gates also run on the host without Docker:

```shell
npm run docs:gate
npm run docs:links
```

## What `docs:gate` validates

`npm run docs:gate` (backed by `scripts/checkDocumentationWorkbench.js`) is a
fail-closed gate. It verifies:

- `docker/docs-authoring/Dockerfile` exists and declares a base image.
- `docs/documentation-workbench.md` exists and references the authoring image
  and the `docs:gate` script.
- `package.json` wires the `docs:gate` script to
  `scripts/checkDocumentationWorkbench.js`.

The gate fails closed (non-zero exit) if any surface is missing or incoherent,
so the documentation workbench cannot silently drift back to an unsupported
state.

## Relationship to the CM plan

The "Documentation Workbench Status" section of the
[configuration management plan](cm/cm-plan.md) records the support status that
the standards detector reports. Keep that section aligned with the surfaces
above when the workbench contract changes. The authoritative branch and release
rules remain in [Maintainer Operations](maintainer-operations.md).
