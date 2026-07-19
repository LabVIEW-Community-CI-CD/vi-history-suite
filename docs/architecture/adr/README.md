# Architecture Decision Records

This directory holds the retained architecture decision records (ADRs) for
vi-history-suite. Each ADR captures one significant design decision — its
context, the decision, and its consequences — so the reasoning behind the
architecture stays close to the code and reviewable in Git.

## How ADRs are leveraged by documentation

- Architecture documentation ([../overview.md](../overview.md)) links to the
  ADRs for the "why" behind a design rather than restating rationale inline.
- When a decision is also promoted into the requirements package
  (`docs/requirements/`), the ADR names the authoritative `VHS-REQ-*` /
  `VHS-SYS-REQ-*` requirement and serves as the design record behind it.
- New significant decisions add a new ADR (copy [ADR-template.md](./ADR-template.md),
  take the next number) and a row in the index below; superseding decisions set
  the older ADR's status to `Superseded` and link forward.

The index and the required structure are enforced by `npm run adr:check`
(`scripts/checkAdrIndex.js`), which also runs as a pre-push git hook.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [ADR-0001](./ADR-0001-github-first-release-and-traceability-governance.md) | GitHub-First Release And Traceability Governance | Active |
| [ADR-0002](./ADR-0002-selected-file-on-demand-vi-history-eligibility.md) | Selected-File On-Demand VI History Eligibility | Accepted |
| [ADR-0003](./ADR-0003-dynamic-labview-container-image-selection.md) | Dynamic LabVIEW Container Image Selection | Accepted |
| [ADR-0004](./ADR-0004-version-aware-labview-container-execution.md) | Version-Aware LabVIEW Container Execution | Accepted |
| [ADR-0005](./ADR-0005-preview-cache-fabric.md) | Preview-Cache Fabric | Accepted |
| [ADR-0006](./ADR-0006-independent-dev-tools-versioning.md) | Independent Dev-Tools Versioning And Runtime Pinning | Accepted |
