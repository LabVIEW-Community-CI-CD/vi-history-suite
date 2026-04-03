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
| Report subsystem | report planning, runtime/tool selection, runtime execution, mutable packet storage, pair-archive retention, multi-report dashboard preparation, and provider isolation policy | TypeScript / Node |
| Harness smoke runner | clone-on-demand canonical harness verification | TypeScript / Node CLI |
| Governance pack | requirements, tests, ADRs, traceability | Markdown / CSV |
| Documentation-package workbench | requirements, ADR, RTM, release-readiness, and wiki-authority iteration | Docker / Node / Markdown tooling |
| Bundled documentation pack | version-matched local user docs derived from the published wiki set and packaged inside the extension | HTML fragments / JSON manifest / WebviewPanel |
| Cross-repo navigation surface | local jump map and repo-entrypoint CLI for the product repo, wiki repo, and companion assurance skill repo | Markdown / JSON / TypeScript CLI |

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
| Comparison runtime locator | Report subsystem | detect LabVIEW 2026 Q1 tooling and select the governed runtime provider and engine |
| Dashboard archive layer | Report subsystem | retain pairwise packet/report/runtime artifacts by commit pair for later dashboard concentration |
| Dashboard packet builder | Report subsystem | aggregate multiple retained comparison-report archives into one chronology-aware review packet |
| Bundled documentation action | Review UI | open packaged local documentation pages and surface version-matched navigation without repo access |
| Harness smoke command | Harness smoke runner | clone the canonical harness and emit factual local reports |

## Deployment View

- Environments:
  - local developer workstation
  - GitLab CI for compile/test/coverage
  - GitLab container registry for the docs-authoring workbench image
- Nodes:
  - VS Code desktop extension host
  - local filesystem and Git installation
- Runtime dependencies:
  - Node runtime bundled with VS Code extension host
  - Git executable on PATH
  - optional LabVIEW 2026 Q1 host-native tooling, primarily for Windows x32
  - optional Windows container runtime for active isolated 64-bit report
    execution without colliding with an already-open host-native LabVIEW 2026
    64-bit session
  - optional Linux VS Code runtime bootstrap for the governed fallback
    extension-host proof lane
  - dedicated docs-authoring image for documentation-package iteration
  - packaged bundled documentation under `resources/bundled-docs/` inside the
    shipped VSIX

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
  - Windows 64-bit isolated container execution is the preferred extension-user
    isolation path and is now wired into live report generation
  - the first-class multi-report dashboard is implemented as a retained
    pair-archive and concentration packet surface, while additional review UX
    tuning remains a follow-on slice
  - dashboard ETA quality is currently characterized through retained
    pair-level benchmark evidence; it is not yet treated as a calibrated
    release gate
- documentation-package iteration now has its own published workbench image,
  separate from extension runtime proof lanes
- published wiki pages now also drive a version-matched bundled user-doc
  surface that can be opened from the installed extension without repo access
- cross-repo navigation is governed from the main repo docs package and
  mirrored into the assurance skill instead of being rediscovered per session

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
- [ADR-0009](./adr/ADR-0009-dashboard-pair-archive-and-concentration-packet.md):
  Pair archive and concentration packet for dashboard review
- [ADR-0010](./adr/ADR-0010-dual-host-extension-proof-and-linux-bootstrap.md):
  Dual-host extension proof and Linux bootstrap
- [ADR-0011](./adr/ADR-0011-dashboard-pair-eta-characterization-benchmark.md):
  Dashboard pair ETA characterization benchmark
- [ADR-0012](./adr/ADR-0012-documentation-package-workbench-image.md):
  Documentation-package workbench image
- [ADR-0013](./adr/ADR-0013-authority-first-wiki-seeding.md):
  Authority-first wiki seeding from the governed docs package
- [ADR-0014](./adr/ADR-0014-cross-repo-navigation-control-plane.md):
  Cross-repo navigation control plane
- [ADR-0015](./adr/ADR-0015-version-matched-bundled-user-documentation.md):
  Version-matched bundled user documentation
