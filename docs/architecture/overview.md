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
| Report subsystem | report planning, later runtime/tool execution, report storage | TypeScript / Node |
| Harness smoke runner | clone-on-demand canonical harness verification | TypeScript / Node CLI |
| Governance pack | requirements, tests, ADRs, traceability | Markdown / CSV |

## Component View

| Component | Container | Responsibility |
| --- | --- | --- |
| VI magic detector | Extension runtime | detect `LVIN` / `LVCC` signatures |
| Eligibility indexer | Extension runtime | compute dynamic menu visibility |
| History service | Extension runtime | load commit history for the selected file |
| History panel | Review UI | render factual commit review surface |
| Git CLI adapter | Git adapter | execute and parse bounded Git commands |
| Comparison report planner | Report subsystem | derive deterministic report naming, staging, storage, and command plans |
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

## ADR Index

- [ADR-0001](./adr/ADR-0001-vscode-typescript-baseline.md): TypeScript-first
  VS Code desktop extension baseline
- [ADR-0002](./adr/ADR-0002-published-review-surface-webview.md): Published
  review surface uses WebviewPanel
- [ADR-0003](./adr/ADR-0003-workspace-report-storage-and-desktop-boundary.md):
  Workspace-scoped report storage and desktop-host product boundary
- [ADR-0004](./adr/ADR-0004-report-generation-subsystem-baseline.md):
  Report-generation subsystem baseline
