# ADR-0003: Workspace-Scoped Report Storage And Desktop Boundary

- Status: accepted
- Date: 2026-04-02
- Deciders: sole author

## Context

- The authoritative research directs generated report artifacts to
  `context.storageUri`.
- The extension relies on local file IO, Git process execution, and future
  LabVIEW comparison tooling.
- The authoritative research treats VS Code web support as out of target scope
  for this product shape.

## Decision

- Store generated report artifacts and report metadata under workspace-scoped
  `context.storageUri` directories.
- Keep the product boundary on desktop and remote extension hosts while the
  extension depends on child processes and local tool discovery.

## Rationale

- Workspace storage is the least surprising and most governable place for
  large, per-workspace generated artifacts.
- A desktop/remote-host boundary prevents the repo from overclaiming support
  for environments that cannot run the required tooling.

## Consequences

- Positive:
  - generated artifacts remain workspace-scoped and reviewable
  - product support boundaries are explicit
- Negative:
  - no publishable VS Code web target while current tooling assumptions hold
