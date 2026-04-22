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
| Software factory orchestrator | non-production governance control plane with assess, rehearse, and repair contracts across authority, staging, production, and recovery surfaces with resumable receipts | Node CLI / JSON / Markdown receipts |
| Documentation-package workbench | requirements, ADR, RTM, release-readiness, and wiki-authority iteration | Docker / Node / Markdown tooling |
| Bundled documentation pack | version-matched local user docs derived from the published wiki set and packaged inside the extension | HTML fragments / JSON manifest / WebviewPanel |
| Cross-repo navigation surface | local jump map and repo-entrypoint CLI for the product repo, wiki repo, and companion assurance skill repo | Markdown / JSON / TypeScript CLI |
| GitHub Linux benchmark lane | prepared in the authority repo for future non-authoritative `lv_icon.vi` performance experiments against the NI Linux runtime image while GitLab remains authority | GitHub Actions / Docker / TypeScript CLI |

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
  - private GitHub Actions experiment mirror for Linux benchmark iteration
  - GitLab container registry for the docs-authoring workbench image
- Nodes:
  - VS Code desktop extension host
  - local filesystem and Git installation
- Runtime dependencies:
  - Node runtime bundled with VS Code extension host
  - Git executable on PATH
  - optional Windows local LabVIEW 2026 plus matching `LabVIEWCLI` tooling for
    the selected version and bitness when the active provider is host
  - optional Docker engine plus the governed Windows or Linux image family
    when the bounded expert Docker provider is selected
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
  - host-default installed compare now depends on matching local LabVIEW plus
    `LabVIEWCLI` resolution for the selected version and bitness
  - expert Docker remains available, but only through the generated settings
    CLI and engine-derived image-family selection
  - the exact released Docker-only installed baseline is retained separately
    from the active develop-line installed-user architecture
  - the first-class multi-report dashboard is implemented as a retained
    pair-archive and concentration packet surface, while additional review UX
    tuning remains a follow-on slice
  - dashboard ETA quality is currently characterized through retained
    pair-level benchmark evidence; it is not yet treated as a calibrated
    release gate
- documentation-package iteration now has its own published workbench image,
  separate from extension runtime proof lanes
- extension execution policy is now governed separately from bitness
  preference, with host as the default installed provider, Docker retained as
  a bounded expert path, and explicit compare preflight documenting one
  canonical execution-request validation boundary before runtime work begins
- published wiki pages now also drive a version-matched bundled user-doc
  surface that can be opened from the installed extension without repo access
- cross-repo navigation is governed from the main repo docs package and
  mirrored into the assurance skill instead of being rediscovered per session
- GitHub-hosted Linux benchmarks are retained diagnostic evidence only; they do
  not replace GitLab authority or Windows installed-user proof

## Software Factory Governance Contract

- Authority boundary:
  GitLab remains the authority source and branch-control system through
  `develop`, `release/*`, and protected `main`.
- Staging boundary:
  `feature/*`, `release/*`, and `hotfix/*` remain temporary GitFlow lanes with
  required proof and receipt surfaces before any protected promotion.
- Production boundary:
  public GitHub `main` / tag / release and the VS Code Marketplace listing are
  production mutation surfaces and are not to be changed directly from ad hoc
  operator choreography.
- Recovery boundary:
  partial-public states are retained as governed recovery cases; the current
  one is frozen on exact `v1.3.6` until the repo-owned controller proves a safe
  repair path.
- Trust model:
  the Windows operator host, self-hosted runner lanes, local token locators,
  GitLab authority state, public GitHub state, Marketplace state, and retained
  receipts are all first-class system surfaces rather than ambient assumptions.
- Environment baseline:
  the supported operator baseline is a Windows host with standard installs plus
  the admitted `Ubuntu-24.04` Linux assurance lane.
- Rehearsal policy:
  the software factory must assess, rehearse, and retain a non-mutating
  repair contract against retained proof states before any future production
  mutation phase is opened.
- Approval model:
  the current contract admits only non-production `assess`, `rehearse`, and
  `repair`; later GitHub-release and Marketplace publish phases still require
  explicit production approval instead of being implied by local green proof
  alone.

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
- [ADR-0016](./adr/ADR-0016-gitlab-authority-and-github-linux-experiment-lane.md):
  GitLab authority with a GitHub Linux experiment lane
- [ADR-0017](./adr/ADR-0017-bounded-repo-family-support.md):
  Repo-agnostic support with separate governance depth
- [ADR-0018](./adr/ADR-0018-windows-benchmark-image-lane.md):
  Windows benchmark image lane
- [ADR-0019](./adr/ADR-0019-governed-wiki-workbench-system.md):
  Governed wiki workbench system
- [ADR-0020](./adr/ADR-0020-bounded-cross-os-benchmark-prefix-for-harness-vhs-002.md):
  Bounded cross-OS benchmark prefix for `HARNESS-VHS-002`
- [ADR-0021](./adr/ADR-0021-canonical-exact-pair-diagnosis-arguments.md):
  Canonical exact-pair diagnosis arguments
- [ADR-0022](./adr/ADR-0022-canonical-experiment-admission-control.md):
  Canonical experiment admission control for `PROGRAM-0003`
- [ADR-0023](./adr/ADR-0023-governed-debt-retirement-contract.md):
  Governed debt retirement contract
- [ADR-0024](./adr/ADR-0024-canonical-effective-runtime-override-validation.md):
  Canonical effective runtime-override validation
- [ADR-0025](./adr/ADR-0025-transparent-extension-execution-flexibility-and-runtime-acquisition-ux.md):
  Historical exact released Docker-only installed execution baseline
- [ADR-0026](./adr/ADR-0026-canonical-extension-execution-request-validation.md):
  Historical exact released Docker-only execution-request validation baseline
- [ADR-0027](./adr/ADR-0027-public-github-facade-and-user-wiki-vs-internal-gitlab-control-plane.md):
  Public GitHub facade and user-wiki boundary versus the internal GitLab control plane
- [ADR-0028](./adr/ADR-0028-governed-authority-to-public-source-promotion-system.md):
  Governed authority-to-public source promotion system
- [ADR-0029](./adr/ADR-0029-develop-integration-main-release-and-required-checks.md):
  `develop` as integration, `main` as release, and required-check discipline
- [ADR-0030](./adr/ADR-0030-semver-decision-framework-and-gitflow-branch-ci-topology.md):
  SemVer decision framework and GitFlow branch/CI topology
- [ADR-0031](./adr/ADR-0031-finding-driven-adr-and-requirement-evolution.md):
  Finding-driven ADR and requirement evolution
- [ADR-0032](./adr/ADR-0032-public-facade-github-workflow-responsibility-matrix.md):
  Public facade GitHub workflow responsibility matrix
- [ADR-0033](./adr/ADR-0033-hosted-automation-governance-matrix-and-protection-semantics.md):
  Hosted automation governance matrix and protection semantics
- [ADR-0034](./adr/ADR-0034-public-codespaces-public-repo-bootstrap-and-default-branch-resolution.md):
  Public Codespaces public-repo bootstrap and default-branch resolution
- [ADR-0035](./adr/ADR-0035-review-ready-candidate-publication-boundary-and-dirty-public-surface-handling.md):
  Review-ready candidate publication boundary and dirty public-surface handling
- [ADR-0036](./adr/ADR-0036-vscode-marketplace-publication-and-installed-user-entry-surface.md):
  VS Code Marketplace publication and installed-user entry surface
- [ADR-0037](./adr/ADR-0037-expert-agent-review-gate-for-public-candidates.md):
  Expert-agent review gate for public candidates
- [ADR-0038](./adr/ADR-0038-host-default-local-labviewcli-bounded-expert-docker-and-explicit-compare-preflight.md):
  Active host-default local `LabVIEWCLI`, bounded expert Docker, and explicit compare preflight
