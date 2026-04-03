# Architecture Overview

## Overview

- System: `vi-history-suite`
- Purpose: provide a VS Code-native review surface for content-detected VI
  history in Git repositories
- Scope: desktop extension baseline with local indexing and history viewing

## Stakeholders And Concerns

| Stakeholder | Concern | Viewpoint |
| --- | --- | --- |
| Product | command appears only when meaningful | UX and product scope |
| Engineering | content detection and Git history are correct | runtime and code structure |
| QA | requirements are testable from the first baseline | verification |
| Security | workspace trust gates scanning and process launch | safety and trust |

## Context View

- External actors:
  - VS Code user
  - Git CLI
  - built-in `vscode.git` extension
  - cloned external Git repository under review
- Upstream systems:
  - VS Code extension host
  - local Git installation
- Downstream systems:
  - webview history panel
  - later NI comparison/report tooling

## Container View

| Container | Responsibility | Technology |
| --- | --- | --- |
| Extension manifest | commands, menus, settings, activation | VS Code package manifest |
| Extension runtime | indexing, command execution, trust gating | TypeScript / Node |
| Git adapter | tracked-file and history queries | Git CLI plus built-in Git API |
| Review UI | history presentation and review actions | WebviewPanel |
| Report subsystem | report planning, runtime/tool selection, runtime execution, packet storage, multi-report dashboard preparation, and provider isolation policy | TypeScript / Node |
| Harness smoke runner | clone-on-demand canonical harness verification | TypeScript / Node CLI |
| Governance pack | requirements, tests, ADRs, traceability | Markdown / CSV |

## Component View

| Component | Container | Responsibility |
| --- | --- | --- |
| VI magic detector | Extension runtime | detect `LVIN` / `LVCC` signatures |
| Eligibility indexer | Extension runtime | compute dynamic menu visibility |
| History service | Extension runtime | load commit history for the selected file |
| History panel | Review UI | render factual commit review surface |
| Developer dashboard | Review UI | concentrate multiple retained comparison reports for one VI across a commit window, surface review hotspots, and preserve drill-down to raw evidence |
| Git CLI adapter | Git adapter | execute and parse bounded Git commands |
| Comparison report planner | Report subsystem | derive deterministic report naming, staging, storage, and command plans |
| Comparison runtime locator | Report subsystem | detect LabVIEW 2026 Q1 tooling and select the governed host-native runtime path |
| Dashboard packet builder | Report subsystem | aggregate multiple retained comparison-report packets into one chronology-aware review packet |
| Harness smoke command | Harness smoke runner | clone the canonical harness and emit factual local reports |

## Deployment View

- Environments:
  - local developer workstation
  - GitLab CI for compile/test/coverage
- Nodes:
  - VS Code desktop extension host
  - local filesystem and Git installation
- Runtime dependencies:
  - Node runtime bundled with VS Code extension host
  - Git executable on PATH
  - optional LabVIEW 2026 Q1 host-native tooling for future report execution
  - optional Windows container runtime for future isolated 64-bit report execution
    without colliding with an already-open host-native LabVIEW 2026 64-bit
    session

## Correspondence And Rationale

- Requirement-to-component notes:
  - detection requirements map to the VI magic detector
  - eligibility requirements map to the indexer and Git adapter
  - review-surface requirements map to the history service and panel
- Decision rationale:
  - TypeScript-first because the product is a VS Code extension
  - Git CLI for bounded file history and parity with documented behavior
  - no dependency on other VI-history repos
- Known tradeoffs:
  - Git CLI requires Git on PATH
  - non-file URI fallback is less I/O efficient than local partial reads
  - Windows 64-bit isolated container execution is architecture-approved as the
    preferred extension-user isolation path, but not yet wired into live report
    generation
  - the first-class multi-report dashboard is architecture-approved but not yet
    implemented, so human reviewers still consume pairwise report evidence
    through narrower surfaces today

## ADR Index

- [ADR-0001](./adr/ADR-0001-vscode-typescript-baseline.md): TypeScript-first
  VS Code desktop extension baseline
- [ADR-0002](./adr/ADR-0002-published-review-surface-webview.md): Published
  review surface uses WebviewPanel
- [ADR-0003](./adr/ADR-0003-workspace-report-storage-and-desktop-boundary.md):
  Workspace-scoped report storage and desktop-host product boundary
- [ADR-0004](./adr/ADR-0004-report-generation-subsystem-baseline.md):
  Report-generation subsystem baseline
- [ADR-0005](./adr/ADR-0005-runtime-provider-selection-and-windows64-isolation.md):
  Runtime-provider selection and Windows 64-bit isolation
- [ADR-0006](./adr/ADR-0006-windows64-container-isolation-for-extension-users.md):
  Windows 64-bit container isolation for extension users
- [ADR-0007](./adr/ADR-0007-multi-report-review-dashboard.md):
  Multi-report review dashboard
- [ADR-0008](./adr/ADR-0008-concentration-first-dashboard-for-high-volume-review.md):
  Concentration-first dashboard for high-volume review
