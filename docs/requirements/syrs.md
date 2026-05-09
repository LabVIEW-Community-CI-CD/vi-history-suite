# System Requirements Specification

## Document Control

- System of interest: `vi-history-suite` developer-review and governed release-control system
- Version: `v1.2.2` pass-3 baseline
- Owner: sole author
- Status: draft uplift baseline

## System Purpose

- Provide a governed developer-review system for LabVIEW VI history in Git repositories.
- Keep the product, runtime-selection surfaces, and release-control package under one explicit system boundary.
- Establish a truthful system-level package before broader requirement partitioning begins.

## System Scope

- In scope:
  - VS Code extension and its packaged review surfaces
  - local runtime-selection control plane for host-native and expert Docker compare execution
  - governed documentation, traceability, testing, CM, and release-control package
  - local and hosted proof surfaces needed to ship and sustain the product
- Out of scope:
  - non-Windows installed-user runtime execution for the current tranche
  - retrospective claims that the pre-pass-3 package already separated system and software requirements cleanly
  - external `comparevi-*` repos as required runtime dependencies for the current product baseline
- External environment:
  - Git repositories and local Git CLI
  - VS Code desktop on Windows
  - local LabVIEW and LabVIEWCLI installations
  - optional Docker engine for bounded expert execution
  - GitLab and GitHub release/publication surfaces

## Stakeholders and Operational Context

| Role | Need | Priority |
| --- | --- | --- |
| Extension user | Deterministic VI-history review and compare workflow on a governed Windows workstation. | High |
| Maintainer | One coherent product and release-control package instead of isolated feature prose. | High |
| Release operator | Protected branch, release, and publication flow with durable evidence. | High |
| Auditor | Clear separation between system intent and software implementation detail. | Medium |

## Assumptions

- Windows remains the governed installed-user execution environment for the active compare tranche.
- Users may have local LabVIEW installations but may not be allowed to install Docker.
- GitFlow remains the required branch-governance model for release control on this repo.

## Constraints

- Host-native compare remains the default installed-user path.
- Docker remains a bounded expert path selected explicitly through the generated settings CLI.
- Runtime selection remains fail-closed when the requested provider, version, or bitness cannot be satisfied truthfully.
- The existing `SRS` and `RTM` remain authoritative for software-level detail until later requirement partitioning completes.

## System Requirements

| ID | Requirement | Rationale | Fit Criterion | Verification |
| --- | --- | --- | --- | --- |
| VHS-SYS-REQ-001 | The system shall provide a governed VS Code-based developer-review surface for LabVIEW VI history in Git repositories. | The product boundary includes the extension surface, not only standalone scripts or documentation. | The package retains a VS Code extension, review surfaces, and governed product docs describing that system boundary. | Documentation review and static inspection |
| VHS-SYS-REQ-002 | The system shall retain a governed information-item package containing `SyRS`, `SRS`, `RTM`, architecture description, decision rationale, test plan, CM plan, release procedure, and information-item map. | The repo should apply the same standards package discipline it is using as an external contract. | Those information items exist at governed paths and the information-item map names them explicitly. | Documentation review |
| VHS-SYS-REQ-003 | The system shall separate system-level intent from software-level implementation detail. | The current repo carries broad product, runtime, and release-control doctrine that does not fit cleanly into one software-only specification. | `SyRS` defines system boundary and `SRS` explicitly refines the software behavior within that boundary. | Documentation review |
| VHS-SYS-REQ-004 | The system shall support Windows installed-user compare workflows with host-native LabVIEWCLI as the default runtime provider. | Current product direction requires installed users to rely on local LabVIEW instead of Docker by default. | Product and requirements surfaces state that host-native LabVIEWCLI is the default installed-user compare provider on Windows. | Documentation review and static inspection |
| VHS-SYS-REQ-005 | The system shall support a bounded expert Docker compare provider selected explicitly through the generated settings CLI. | Expert Docker use remains valid, but it is no longer the default installed-user path. | Product and requirements surfaces state that Docker is expert-selected through the generated CLI instead of implicit default behavior. | Documentation review and static inspection |
| VHS-SYS-REQ-006 | The system shall require compare-runtime requests to retain explicit provider, LabVIEW version, and LabVIEW bitness facts before execution starts. | Deterministic runtime attribution is required across both host-native and Docker paths. | The governing product and requirements surfaces state that provider, version, and bitness are explicit runtime facts. | Documentation review |
| VHS-SYS-REQ-007 | The system shall fail closed with retained runtime facts when an explicitly selected runtime bundle is unsupported or unavailable. | Silent fallback would make provider and runtime selection untrustworthy, but installed users should still be able to try Compare and surface the exact local seam. | Governing product and requirements surfaces state that unsupported bundles produce corrective guidance and retained runtime failure evidence instead of silent fallback. | Documentation review and static inspection |
| VHS-SYS-REQ-008 | The system shall provide an explicit compare action after commit selection instead of starting compare automatically or hiding execution behind runtime preflight certainty. | Users need to confirm the chosen commit pair and should be allowed to expose local LabVIEW/runtime failures directly. | Governing product and requirements surfaces state that compare opens from an explicit action showing selected/base commit, provider, version, and bitness, and that runtime failure is reported through the compare path. | Documentation review and static inspection |
| VHS-SYS-REQ-009 | The system shall govern release and sustainment through protected `main`, protected `develop`, and GitFlow `release/*` and `hotfix/*` branch families. | The repo now uses the released standards skill as a real governance baseline and must keep release control explicit. | CM, release, and current-state surfaces state the protected GitFlow model consistently. | Documentation review and unit tests |
| VHS-SYS-REQ-010 | The system shall retain repo-visible proof and roadmap surfaces for compliance uplift passes instead of relying on chat memory. | The ongoing compliance refactor needs durable checkpoints and visible next moves. | The compliance roadmap and pass inventory remain committed and updated as uplift passes land. | Documentation review |

## External Interfaces

- Inputs:
  - Git repositories and revision content
  - VS Code command and settings surfaces
  - local LabVIEW and LabVIEWCLI installations
  - optional Docker engine state
  - release-control metadata from GitLab and public publication surfaces
- Outputs:
  - review panels, retained report packets, and proof artifacts
  - governed compare-preflight state
  - release and publication evidence
  - compliance roadmaps and contradiction inventories
- External systems:
  - VS Code desktop
  - Git CLI
  - LabVIEW and LabVIEWCLI
  - Docker
  - GitLab and GitHub

## Quality and Life Cycle Requirements

- Safety: fail closed on unsupported or ambiguous runtime-selection states.
- Security: preserve protected-branch and governed publication controls.
- Reliability: keep proof and release-control surfaces deterministic and retained.
- Maintainability: separate system-level and software-level requirements before broad requirement churn.
- Supportability: retain enough roadmap and proof context that future sessions can resume without chat reconstruction.
