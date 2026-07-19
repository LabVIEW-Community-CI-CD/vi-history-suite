# Architecture Overview

## System

VI History Suite is a VS Code desktop extension for reviewing LabVIEW VI file
history in Git repositories. The architecture is intentionally local-first:
the extension reads Git and VI facts from the open workspace, presents factual
review surfaces in VS Code, and uses installed LabVIEW tooling only when the
user explicitly asks for a comparison report.

The active public repository is
`https://github.com/LabVIEW-Community-CI-CD/vi-history-suite`. `main` is the
Marketplace and release baseline. `develop` is the integration branch. Feature
branches merge to `develop`; `release/vX.Y.Z` and `hotfix/vX.Y.Z` branches are
the normal promotion paths to `main`. GitLab is historical read-only context
after migration.

## Stakeholders And Concerns

| Stakeholder | Concerns |
| --- | --- |
| Extension user | Factual VI history review, safe compare flow, installed bundled documentation, and clear blocked-state messages. |
| Maintainer / release steward | Repeatable GitHub release promotion, Marketplace evidence, package identity, and branch-governed back-sync. |
| Traceability steward | Requirements, RTM rows, traceability inventory, issue-driven closure evidence, and standards maturity findings kept separate from product behavior. |
| Support / debugging user | Diagnostic facts without secrets, retained runtime evidence, and issue intake that separates selected-file eligibility from LabVIEW runtime failures. |
| Contributor | Lightweight source evaluation in VS Code, Codespaces or devcontainers, optional LabVIEW validation, and bounded tests that do not require Marketplace credentials. |

## Context View

VI History Suite runs inside the VS Code desktop extension host. The extension
interacts with:

| External element | Relationship |
| --- | --- |
| VS Code | Provides command registration, menu contribution, workspace trust state, webview panels, extension storage, and settings. |
| User workspace | Provides the selected `.vi`, `.ctl`, or `.vit` file and workspace-scoped storage for retained evidence. |
| Git repository | Provides tracked-file state, commit history, blob object IDs, and remote metadata through the Git CLI and built-in Git API. |
| Local LabVIEW / LabVIEWCLI | Provides installed-user comparison report generation when the host provider is selected and configured. |
| Optional Docker runtime | Provides an explicit expert-selected comparison provider path when selected by settings and available locally. |
| GitHub | Hosts source, issues, pull requests, CI, package evidence, release automation, and Marketplace publication workflow records. |
| VS Code Marketplace | Publishes the packaged VSIX release built from exact `vX.Y.Z` tags reachable from `main`. |

## Container View

| Container | Responsibility | Main evidence |
| --- | --- | --- |
| Extension manifest | Declares activation events, commands, menu surfaces, settings, package metadata, bundled resources, and limited untrusted-workspace capability. | `package.json` |
| Extension runtime | Lazily creates workspace runtime services, registers commands, owns extension storage integration, and keeps startup side effects bounded. | `src/extension.ts` |
| Git adapter | Wraps built-in Git API and bounded Git CLI calls for repository roots, selected-file tracking and history facts, blob IDs, and revision content. | `src/git/` |
| History command and panel | Orchestrates selected-file eligibility, factual blocked states, retained commit windows, compare actions, review packets, and dashboard actions. | `src/commands/`, `src/ui/` |
| Reporting runtime | Plans comparison inputs, checks runtime provider facts, stages revision blobs, runs LabVIEW tooling, and retains comparison report packets. | `src/reporting/` |
| Dashboard and review evidence | Concentrates retained comparison evidence, dashboard archive data, ETA facts, latest-run facts, and decision records. | `src/dashboard/`, `src/scenarios/` |
| Semantic model and MCP surface | Projects comparison reports and Git history onto versioned VI-diff schemas and serves them to Copilot agent mode through a registered stdio MCP server (16 tools, 3 guided prompts, and 4 schema resources — the open VI-diff standard). | `src/semantic/`, `src/mcp/`, `src/cli/runViSemanticMcpServer.ts` |
| Bundled documentation | Loads the packaged documentation manifest and installed HTML pages through the open documentation command. | `src/docs/`, `resources/bundled-docs/` |
| Tooling and CI | Generates build info, audits package/runtime surfaces, runs traceability checks, builds diagnostic VSIX artifacts, and publishes exact-tag Marketplace releases. | `scripts/`, `.github/workflows/` |
| Requirements and standards evidence | Stores SyRS, SRS, RTM, ID index, traceability inventory, issue-wave guidance, and closeout runbook evidence. | `docs/requirements/` |

## Component View

| Area | Components | Boundary |
| --- | --- | --- |
| Activation | `activate`, command registrations, `HistoryPanelTracker` | Command activation creates runtime services lazily and exposes testable API summaries without changing Marketplace behavior. |
| Workspace safety | Workspace trust checks, manifest untrusted-workspace capability, command handlers | Selected-file VI History evaluation and comparison execution are disabled or blocked in untrusted workspaces while bundled docs and local settings CLI preparation remain available. |
| Git history eligibility | `createOpenViHistoryCommand`, `ViHistoryService`, `gitCli`, `gitApi`, `viMagicCore` | Eligibility is evaluated for the selected file using tracked Git state, VI content signatures, and bounded single-file history queries rather than a repository-wide VI inventory. |
| Review surface | `createOpenViHistoryCommand`, `ViHistoryService`, `historyPanel`, `historyPanelTracker` | The user-facing webview is minimized to the retained commit table with explicit two-revision selection and a Compare action; the factual review packet is available through the `labviewViHistory.copyReviewPacket` command. |
| Comparison reports | Runtime locator, doctor, preflight, execution, packet, archive, and retained report open action | Comparison uses staged revision blobs and records factual runtime outcome evidence; it does not silently substitute runtime providers. |
| Dashboard aggregate review | Multi-report dashboard, parser, archive, ETA/latest-run records, retained evidence import | Dashboard surfaces concentrate retained evidence for human review and do not claim automatic VI correctness decisions. |
| Semantic model and MCP tools | `buildViSemanticComparisonModel`, `compareViRevisions`, `buildViSemanticHistory`, `buildViRepositoryIndex`, `handleViSemanticMcpMessage`, `registerViSemanticMcpServerProvider` | The parsed comparison report and Git history are projected onto versioned `vi-history-suite/*@v1` schemas and served to agents over a dependency-free JSON-RPC stdio MCP server that VS Code registers during activation. |
| Installed docs | Bundled documentation manifest/page loader and action | Documentation is shipped in the VSIX and opened through `labviewViHistory.openDocumentation`. |
| Local runtime settings CLI | CLI materialization and terminal PATH admission | The installed prepare command materializes a local helper for user settings without changing runtime selection by itself. |
| Release governance | Branch governance CI, package audit, Marketplace release workflow, pinned VSCE runner | Release publication is exact-tag-only from `main`; `develop` receives released state through back-sync. |
| Traceability governance | Requirements docs, RTM, ID index, traceability inventory, audit script | Agent work starts from requirement evidence and keeps implementation/test/doc surfaces classified before issue closeout. |

## Deployment View

| Deployment surface | Runtime location | Notes |
| --- | --- | --- |
| Installed VSIX | VS Code extension installation directory | Contains compiled `out/**`, `node_modules/jsonc-parser/**`, bundled docs, Marketplace icon, README, changelog, and license. |
| Extension host process | User's VS Code desktop session | Executes command handlers and webviews under VS Code's extension host Node runtime. |
| Workspace storage | VS Code workspace-scoped extension storage | Retains comparison report archives, dashboard evidence, and review artifacts when workspace storage is available. |
| Global storage | VS Code extension-global storage | Holds materialized local runtime settings CLI helpers prepared by the installed command. |
| Local Git and LabVIEW tools | User machine `PATH`, configured settings, and local installation paths | Git is required for history facts; LabVIEW/LabVIEWCLI is required only for installed comparison execution. |
| Optional Docker provider | User-selected local Docker environment | Expert path for comparison provider diagnostics and execution when explicitly configured. |
| Hosted CI | GitHub Actions Ubuntu runner | Runs branch governance, install, typecheck, traceability audit, unit tests, and package sanity. |
| Trusted Windows/LabVIEW validation | Manual self-hosted maintainer runner | Optional evidence path for LabVIEW-specific validation, not a public PR gate. |
| Marketplace release | Protected GitHub Actions environment and VS Code Marketplace | Publishes from exact `vX.Y.Z` tags reachable from `main` and verifies live listing evidence. |

## View Correspondences

| Architecture concern | Requirements evidence | Architecture view coverage |
| --- | --- | --- |
| VS Code LabVIEW VI history system | `VHS-SYS-REQ-001`, `VHS-REQ-016`, `VHS-REQ-017` | Context, Container, Component |
| Host LabVIEW comparison path | `VHS-SYS-REQ-004`, `VHS-SYS-REQ-007`, `VHS-REQ-147`, `VHS-REQ-148`, `VHS-REQ-155` | Context, Container, Component, Deployment |
| Optional Docker comparison path | `VHS-SYS-REQ-005` | Context, Deployment |
| GitHub-first source authority | `VHS-SYS-REQ-011`, `VHS-REQ-600`, `VHS-REQ-609` | Context, Container, Deployment |
| Lightweight public verification | `VHS-SYS-REQ-012`, `VHS-REQ-597` | Container, Deployment |
| Optional human validation surfaces | `VHS-SYS-REQ-013`, `VHS-REQ-596`, `VHS-REQ-598`, `VHS-REQ-599`, `VHS-REQ-608` | Context, Deployment |
| Requirements as agent work contracts | `VHS-SYS-REQ-014`, `VHS-REQ-601` | Container, Component |
| Selected-file history responsiveness | `VHS-SYS-REQ-018`, `VHS-REQ-006`, `VHS-REQ-008`, `VHS-REQ-013`, `VHS-REQ-607`, `VHS-REQ-635` | Container, Component, Deployment |
| Installed bundled documentation | `VHS-REQ-611` | Container, Component, Deployment |
| Installed runtime settings CLI preparation | `VHS-REQ-612` | Component, Deployment |

## Retained Decision Rationale

The retained architecture decisions are recorded as Architecture Decision
Records under [docs/architecture/adr/](./adr/README.md), indexed in
[the ADR index](./adr/README.md#index). The index and each ADR's required
structure are gated by `npm run adr:check` (also run on pre-push), which
additionally enforces that every Active software requirement (SRS) is linked
into an ADR and that every system requirement (SYRS) with an Active software
requirement is cited by an ADR.

Highlights:

- [ADR-0001: GitHub-First Release And Traceability Governance](./adr/ADR-0001-github-first-release-and-traceability-governance.md)
  keeps GitHub source authority, Marketplace release automation, requirements
  traceability, and standards evidence in a single reviewable governance path
  while preserving the extension's local-first behavior.
- [ADR-0002: Selected-File On-Demand VI History Eligibility](./adr/ADR-0002-selected-file-on-demand-vi-history-eligibility.md)
  records why VI History eligibility is evaluated on demand for the selected file
  (VHS-SYS-REQ-018, VHS-REQ-635) instead of through a repository-wide index.
- [ADR-0003](./adr/ADR-0003-dynamic-labview-container-image-selection.md) and
  [ADR-0004](./adr/ADR-0004-version-aware-labview-container-execution.md) cover
  dynamic and version-aware LabVIEW container execution (VHS-SYS-REQ-019,
  VHS-REQ-657).
- [ADR-0005: Preview-Cache Fabric](./adr/ADR-0005-preview-cache-fabric.md)
  records the content-addressed preview-cache fabric (VHS-REQ-671–675).
- [ADR-0006: Independent Dev-Tools Versioning And Runtime Pinning](./adr/ADR-0006-independent-dev-tools-versioning.md)
  records the independent dev-tools version line, runtime pinning, and the
  Marketplace pre-release channel (VHS-REQ-676–680).

## Verification Model

The default verification path is:

```bash
npm ci
npm run check
npm run traceability:audit
npm test
npm run package
```

Developers can use the devcontainer or Codespaces for the normal loop. Vagrant
is available only for humans who already have a suitable local Windows/LabVIEW
box and want extra confidence.

## Runtime Dependencies

- VS Code extension host Node runtime
- Git on `PATH`
- local LabVIEW plus matching `LabVIEWCLI` for host comparison
- optional Docker engine for the explicit Docker provider path
- `jsonc-parser` as the only runtime npm dependency

## Related Architecture Notes

- [Preview-Cache Fabric](./preview-cache-fabric.md): the content-addressed
  preview cache as portable, verifiable, shareable infrastructure — the
  VHS-REQ-671..675 arc that lets a Codespace or CI runner generate caches once
  and share them.
