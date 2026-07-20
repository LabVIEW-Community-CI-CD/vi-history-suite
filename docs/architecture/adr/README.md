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
| [ADR-0007](./ADR-0007-selected-file-vi-history-core.md) | Selected-File VI History Core | Accepted |
| [ADR-0008](./ADR-0008-host-labview-comparison-runtime.md) | Host LabVIEW Comparison Runtime Selection And Gating | Accepted |
| [ADR-0009](./ADR-0009-fail-closed-runtime-evidence.md) | Fail-Closed Runtime Evidence And Diagnostics | Accepted |
| [ADR-0010](./ADR-0010-explicit-compare-reports-semantic-surfaces.md) | Explicit Compare Action, Reports, And Semantic Surfaces | Accepted |
| [ADR-0011](./ADR-0011-github-first-marketplace-identity.md) | GitHub-First Marketplace Identity | Accepted |
| [ADR-0012](./ADR-0012-lightweight-public-verification-dod.md) | Lightweight Public Verification And Definition Of Done | Accepted |
| [ADR-0013](./ADR-0013-optional-human-validation-surfaces.md) | Optional Human Validation And Maintainer Surfaces | Accepted |
| [ADR-0014](./ADR-0014-agent-targetable-requirements.md) | Agent-Targetable Requirements Contract | Accepted |
| [ADR-0015](./ADR-0015-release-state-read-model.md) | Release State Read-Model And Gated Publish Authority | Accepted |
| [ADR-0016](./ADR-0016-coverage-led-assurance.md) | Coverage-Led Assurance Operating Model | Accepted |
| [ADR-0017](./ADR-0017-container-image-version-selection-ux.md) | Container Image Version Selection UX | Accepted |
| [ADR-0018](./ADR-0018-agent-operating-control-plane.md) | Agent Operating Control-Plane And Repo-Truth Read-Model | Accepted |
| [ADR-0019](./ADR-0019-agent-environment-consistency-gate.md) | Agent Environment Consistency Gate | Accepted |
| [ADR-0020](./ADR-0020-governed-control-plane-write-path.md) | Governed Control-Plane Write Path | Accepted |
| [ADR-0021](./ADR-0021-governance-gate-tooling-integrity.md) | Governance Gate-Tooling Integrity | Accepted |
| [ADR-0022](./ADR-0022-dev-host-and-build-tooling-integrity.md) | Dev-Host And Build Tooling Integrity | Accepted |
| [ADR-0023](./ADR-0023-control-plane-loop.md) | Control-Plane Loop | Accepted |
