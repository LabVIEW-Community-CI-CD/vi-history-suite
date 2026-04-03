# ADR-0014: Cross-Repo Navigation Control Plane

- Status: Accepted
- Date: 2026-04-03

## Context

`vi-history-suite` no longer operates as an isolated repository. Product work,
wiki publication, and standards-guided documentation-package review now span:

- the main product repo
- the derived wiki repo
- the companion `repo-standards-review` skill repo

Without one governed navigation surface, future sessions must rediscover local
paths, primary entrypoints, and authority roles from chat memory or shell
history.

## Decision

Retain a cross-repo navigation control plane in `vi-history-suite` consisting
of:

- a machine-readable repo constellation map
- a local CLI that resolves the current machine's repo paths from that map
- repo entrypoint docs that point future sessions to the jump surface
- a reciprocal resolver in `repo-standards-review` that consumes the same map

## Consequences

### Positive

- future sessions can jump between product, wiki, and assurance repos from one
  governed source
- companion skill integration reuses the main repo's map instead of duplicating
  the constellation definition
- docs-authoring and wiki-seeding work gain a stable cross-repo entrypoint

### Negative

- the main repo now owns one more documentation-package artifact that must stay
  aligned with local repo layout conventions
- local path resolution must handle both sibling repos and Codex skill-repo
  locations

## Implementation Surfaces

- `docs/product/program-repo-jump-map.json`
- `docs/product/program-repo-jump.md`
- `src/tooling/programRepoJump.ts`
- `src/cli/runProgramRepoJump.ts`
- companion `repo-standards-review/scripts/repo_jump.py`
