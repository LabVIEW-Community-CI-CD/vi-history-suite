# ADR-0012: Documentation-Package Workbench Image

## Status

Accepted

## Context

`vi-history-suite` depends on a governed documentation package, not only on
code and tests. Requirements, RTM rows, ADRs, ship-control files, release
procedure updates, and future wiki preparation need a repeatable authoring
surface that does not depend on whatever tooling happens to be installed on the
local host.

The repository already exposes a docs gate and a GitLab publish lane for a
docs-authoring image. That direction needs an explicit architectural decision
so future sessions treat the docs workbench as a first-class control-plane
surface instead of ad hoc tooling.

## Decision

Adopt a dedicated docs-authoring workbench image as the governed execution
surface for documentation-package iteration.

The workbench shall:

1. mount the repository at `/workspace`
2. bootstrap `node_modules` when needed
3. default to `npm run docs:gate`
4. remain separate from end-user extension runtime proof and NI execution proof
5. publish to the GitLab container registry for reuse by future sessions

## Consequences

### Positive

- documentation-package iteration has one stable environment
- wiki-preparation work can start from a published, repo-native workbench
- docs gate behavior is less dependent on host drift

### Negative

- the repo must sustain a second container image alongside the extension
  packaging lanes
- local Docker availability may still vary by machine even when the published
  workbench exists

## Implementation Surface

- `docker/docs-authoring/Dockerfile`
- `docker/docs-authoring/entrypoint.sh`
- `scripts/run-docs-gate.js`
- `docs/documentation-workbench.md`
- `.gitlab-ci.yml`

