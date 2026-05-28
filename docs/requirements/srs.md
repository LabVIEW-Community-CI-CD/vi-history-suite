# Software Requirements Specification

## Document Control

- Software item: `vi-history-suite`
- Parent system specification: [docs/requirements/syrs.md](./syrs.md)
- Status: active GitHub-first baseline
- Traceability matrix: [rtm.csv](./rtm.csv)
- ID registry: [id-index.csv](./id-index.csv)

## Scope

This document defines active software requirements that can be used as stable
agent work contracts. Each requirement gives enough intent, scope, acceptance,
and evidence for a human to target the ID and for an agent to make a bounded
implementation change.

Historical requirements that are not active are listed in `id-index.csv`.
Missing numeric IDs are intentional.

## Requirements

### VHS-REQ-001: VI Content Signature Detection

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Detection
- Statement: The extension shall detect candidate LabVIEW VI files by reading
  bytes 8 through 11 and accepting the `LVIN` or `LVCC` signatures.
- Acceptance Criteria:
  - Positive fixtures with either signature classify as LabVIEW VI candidates.
  - Negative fixtures without either signature do not classify as candidates.
  - Detection behavior is independent of the file path extension.
- Agent Work Scope:
  - Change `src/domain/viMagicCore.ts`, `src/domain/viMagic.ts`, and related
    unit tests when changing signature logic.
- Implementation References:
  - `src/domain/viMagicCore.ts`
  - `src/domain/viMagic.ts`
- Verification References:
  - `tests/unit/viMagic.test.ts`
  - `tests/unit/viMagicWrapper.test.ts`
- Change Guidance:
  - Do not replace content detection with extension-only detection.

### VHS-REQ-003: Optional Strict RSRC Header

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Detection
- Statement: The extension shall support an optional strict mode that requires
  the leading `RSRC` header bytes in addition to the offset-8 VI signature.
- Acceptance Criteria:
  - Strict mode rejects a buffer with only the offset-8 signature.
  - Non-strict mode preserves the default signature behavior.
  - The package manifest exposes the strict header setting.
- Agent Work Scope:
  - Change the VI magic core and package configuration together when changing
    strict detection behavior.
- Implementation References:
  - `src/domain/viMagicCore.ts`
  - `package.json`
- Verification References:
  - `tests/unit/viMagic.test.ts`
  - `tests/unit/packageManifest.test.ts`
- Change Guidance:
  - Keep strict mode opt-in unless a separate requirement changes the default.

### VHS-REQ-010: Minimal Local Probe Reads

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Detection
- Statement: The extension shall read only the bytes required for signature
  probing when evaluating local file URIs.
- Acceptance Criteria:
  - Local file probing reads no more than the minimum detection header length.
  - Probe failures fail closed without classifying the file as a VI.
- Agent Work Scope:
  - Change local file probe behavior in `viFile` and wrapper tests.
- Implementation References:
  - `src/domain/viFile.ts`
  - `src/domain/viMagic.ts`
- Verification References:
  - `tests/unit/viFile.test.ts`
  - `tests/unit/viMagicWrapper.test.ts`
- Change Guidance:
  - Keep indexing I/O bounded for large repositories.

### VHS-REQ-011: Non-File URI Probe Fallback

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Detection
- Statement: The extension shall use VS Code workspace filesystem reads for
  non-file URI schemes and truncate the probe to the minimum detection header.
- Acceptance Criteria:
  - Non-file URI reads use `workspace.fs.readFile`.
  - The returned probe is truncated before signature evaluation.
  - Read failures fail closed.
- Agent Work Scope:
  - Change URI wrapper behavior without bypassing VS Code filesystem APIs.
- Implementation References:
  - `src/domain/viMagic.ts`
- Verification References:
  - `tests/unit/viMagicWrapper.test.ts`
- Change Guidance:
  - Preserve remote and virtual workspace compatibility.

### VHS-REQ-006: Tracked History Eligibility

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Git History Eligibility
- Statement: A file shall be eligible for VI History only when it is tracked in
  Git, content-detected as a VI, and has at least two modifying commits.
- Acceptance Criteria:
  - Untracked files are not eligible.
  - Files with fewer than two modifying commits are not eligible.
  - Content detection is part of eligibility evaluation.
- Agent Work Scope:
  - Change shared history model and indexer behavior together when eligibility
    rules change.
- Implementation References:
  - `src/services/viHistoryModel.ts`
  - `src/indexing/viEligibilityIndexer.ts`
  - `src/git/gitCli.ts`
- Verification References:
  - `tests/unit/viHistoryService.test.ts`
  - `tests/unit/viEligibilityIndexer.test.ts`
  - `tests/unit/gitCli.test.ts`
- Change Guidance:
  - Keep eligibility stricter than menu visibility hints.

### VHS-REQ-007: NUL-Safe Tracked File Enumeration

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Git History Eligibility
- Statement: The Git adapter shall enumerate tracked files with a NUL-safe
  result equivalent to `git ls-files -z`.
- Acceptance Criteria:
  - Paths containing spaces are parsed correctly.
  - Empty trailing records are ignored.
  - Enumeration errors fail closed at the caller boundary.
- Agent Work Scope:
  - Change Git CLI parsing and indexer tests when altering tracked-file
    enumeration.
- Implementation References:
  - `src/git/gitCli.ts`
  - `src/indexing/viEligibilityIndexer.ts`
- Verification References:
  - `tests/unit/gitCli.test.ts`
  - `tests/unit/viEligibilityIndexer.test.ts`
- Change Guidance:
  - Do not switch to newline parsing for Git path lists.

### VHS-REQ-008: Bounded Commit Queries

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Git History Eligibility
- Statement: The Git adapter shall use bounded commit queries when determining
  minimum history eligibility.
- Acceptance Criteria:
  - Eligibility can be established by querying at most two commit hashes.
  - File history queries normalize relative Git paths.
  - Rename following remains best effort and scoped to single-file history.
- Agent Work Scope:
  - Change `gitCli` and history model tests when changing history query shape.
- Implementation References:
  - `src/git/gitCli.ts`
  - `src/services/viHistoryModel.ts`
- Verification References:
  - `tests/unit/gitCli.test.ts`
  - `tests/unit/viHistoryService.test.ts`
- Change Guidance:
  - Keep repository-wide scans bounded and cancellable.

### VHS-REQ-061: Most-Specific Git Repository Resolution

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Git History Eligibility
- Statement: When multiple Git repositories can match a target path, the
  service shall select the most specific matching repository root.
- Acceptance Criteria:
  - Nested repositories resolve to the nearest matching root.
  - The service falls back to CLI root discovery when the Git API cannot match.
- Agent Work Scope:
  - Change repository resolution in `viHistoryService` and corresponding unit
    tests.
- Implementation References:
  - `src/services/viHistoryService.ts`
  - `src/git/gitCli.ts`
  - `src/git/gitApi.ts`
- Verification References:
  - `tests/unit/viHistoryService.test.ts`
  - `tests/unit/gitApi.test.ts`
- Change Guidance:
  - Keep Git API and CLI fallback behavior aligned.

### VHS-REQ-012: Workspace Trust Gate

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: Workspace Safety
- Statement: The extension shall gate background scanning and external process
  execution on VS Code workspace trust.
- Acceptance Criteria:
  - Untrusted workspaces clear the eligibility context.
  - Invoking VI History in an untrusted workspace stops with a warning.
  - External comparison execution does not proceed from an untrusted workspace.
  - Warning messages explain why indexing and comparison are disabled and what
    low-risk paths remain available.
- Agent Work Scope:
  - Change command, indexer, and manifest trust behavior together.
- Implementation References:
  - `src/indexing/viEligibilityIndexer.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `package.json`
- Verification References:
  - `tests/unit/viEligibilityIndexer.test.ts`
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
- Change Guidance:
  - Trust checks are safety boundaries, not convenience prompts.

### VHS-REQ-013: Dynamic Eligibility Context

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Menu Gating
- Statement: The indexer shall maintain dynamic menu eligibility through the
  `labviewViHistory.eligiblePaths` context key.
- Acceptance Criteria:
  - Eligible files are represented in the context map.
  - Windows path variants include lowercase forms.
  - Empty or failed refreshes fail closed to an empty map.
- Agent Work Scope:
  - Change context-key shape and package menu expectations together.
- Implementation References:
  - `src/indexing/viEligibilityIndexer.ts`
  - `package.json`
- Verification References:
  - `tests/unit/viEligibilityIndexer.test.ts`
  - `tests/unit/packageManifest.test.ts`
- Change Guidance:
  - Keep dynamic context conservative even if manifest menu hints remain broader.

### VHS-REQ-015: Bounded Indexing Concurrency

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Menu Gating
- Statement: Repository indexing shall bound concurrent eligibility checks using
  the `viHistorySuite.maxIndexedConcurrency` setting.
- Acceptance Criteria:
  - The setting has a documented minimum and maximum.
  - The indexer uses the configured value when processing tracked files.
  - Worker loops stop cleanly when the queue is exhausted.
- Agent Work Scope:
  - Change indexer concurrency and package configuration together.
- Implementation References:
  - `src/indexing/viEligibilityIndexer.ts`
  - `package.json`
- Verification References:
  - `tests/unit/viEligibilityIndexer.test.ts`
  - `tests/unit/packageManifest.test.ts`
- Change Guidance:
  - Do not make large repositories spawn unbounded probe work.

### VHS-REQ-082: Primary Command Identifier

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Extension Manifest
- Statement: The primary command shall remain registered as
  `labviewViHistory.open`.
- Acceptance Criteria:
  - The manifest contributes the command.
  - Activation is command-driven for this command.
  - The extension registers the corresponding runtime handler.
- Agent Work Scope:
  - Change manifest, extension activation, and integration tests together if the
    command identifier changes.
- Implementation References:
  - `package.json`
  - `src/extension.ts`
- Verification References:
  - `tests/unit/packageManifest.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
- Change Guidance:
  - Treat command IDs as public extension API.

### VHS-REQ-004: Explorer And Editor Menu Contributions

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Extension Manifest
- Statement: The extension shall contribute the `VI History` command to both
  Explorer context and editor title context menus for trusted LabVIEW-like files.
- Acceptance Criteria:
  - Explorer context contributes `labviewViHistory.open`.
  - Editor title context contributes `labviewViHistory.open`.
  - Menu visibility requires a trusted workspace.
- Agent Work Scope:
  - Change menu entries and manifest tests together.
- Implementation References:
  - `package.json`
- Verification References:
  - `tests/unit/packageManifest.test.ts`
- Change Guidance:
  - Runtime eligibility must remain stricter than these visible menu hints.

### VHS-REQ-083: Command-Only Activation

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Extension Manifest
- Statement: The extension shall avoid startup activation and activate through
  explicit command events.
- Acceptance Criteria:
  - The manifest does not use startup activation.
  - Activation events include the public commands.
  - Lazy activation does not create indexing side effects before command use.
- Agent Work Scope:
  - Change activation events and lazy side-effect tests together.
- Implementation References:
  - `package.json`
  - `src/extension.ts`
- Verification References:
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
- Change Guidance:
  - Do not add broad activation events without a requirement update.

### VHS-REQ-084: Limited Untrusted Workspace Capability

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: Extension Manifest
- Statement: The manifest shall declare limited untrusted-workspace support and
  restrict external runtime configuration in untrusted workspaces.
- Acceptance Criteria:
  - The manifest declares limited untrusted workspace support.
  - Runtime provider, LabVIEW version, and bitness settings are restricted.
  - The description explains disabled indexing and comparison execution.
- Agent Work Scope:
  - Change untrusted-workspace manifest capability only with matching runtime
    safety behavior.
- Implementation References:
  - `package.json`
- Verification References:
  - `tests/unit/packageManifest.test.ts`
- Change Guidance:
  - Keep manifest capability claims aligned with runtime behavior.

### VHS-REQ-016: History Webview Panel

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: History Panel
- Statement: The VI History command shall open a webview panel for an eligible
  selected file.
- Acceptance Criteria:
  - No selected resource produces an informational message.
  - Ineligible files produce a factual informational message stating the reason
    (unrecognized file format, no Git history, or insufficient commits) and a
    next action.
  - Untrusted workspaces produce a factual warning message with available
    alternatives.
  - Files outside Git repositories produce a factual error message with next
    steps.
  - Eligible files open a webview panel with review content.
- Agent Work Scope:
  - Change command orchestration, history service loading, and integration tests
    together.
- Implementation References:
  - `src/commands/openViHistoryCommand.ts`
  - `src/ui/historyPanel.ts`
  - `src/services/viHistoryService.ts`
- Verification References:
  - `tests/integration/suite/extensionHost.test.ts`
  - `tests/unit/viHistoryService.test.ts`
- Change Guidance:
  - Keep user-facing stops explicit instead of silent.
  - Blocked or empty states must include factual reasons and next actions.

### VHS-REQ-017: Factual History Panel Content

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: History Panel
- Statement: The history panel shall show repository, relative path, VI
  signature, and commit facts for the selected file.
- Acceptance Criteria:
  - Rendered content includes repository name, repository root, and origin URL
    or unavailable state.
  - Rendered content includes the relative path and detected VI signature.
  - Rendered content includes retained commit count, newest commit, oldest
    commit, and chronology order.
  - Binary review limitation text stays factual and does not claim semantic VI
    differences from Git-only history.
  - User-controlled or path-derived panel values are escaped in rendered HTML
    text and attribute contexts. Inline script contexts (e.g., JSON-serialized
    data in `<script>` blocks) must neutralize script-tag boundaries in
    serialized payloads before embedding (for example replacing `<` with
    `\u003C`) so `</script>` data cannot terminate the script block.
- Agent Work Scope:
  - Change `historyPanel` rendering, unit tests, and extension-host assertions
    together.
- Implementation References:
  - `src/ui/historyPanel.ts`
  - `src/services/viHistoryModel.ts`
- Verification References:
  - `tests/unit/historyPanelRendering.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
- Change Guidance:
  - Do not replace factual Git content with inferred summaries.

### VHS-REQ-039: Copy Review Packet

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: History Panel
- Statement: The history panel shall expose a panel-level action that copies a
  factual review packet.
- Acceptance Criteria:
  - The panel exposes a copy review packet action.
  - The action writes plain text to the VS Code clipboard.
  - The action result is retained by the panel tracker.
- Agent Work Scope:
  - Change panel message handling, review packet rendering, and tracker tests
    together.
- Implementation References:
  - `src/ui/historyPanel.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `src/ui/historyPanelTracker.ts`
- Verification References:
  - `tests/unit/historyPanelRendering.test.ts`
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/historyPanelTracker.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
- Change Guidance:
  - Keep copied review packets grounded in the same model shown in the panel.

### VHS-REQ-040: Factual Review Packet Text

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: History Panel
- Statement: Copied review packet text shall include repository, root, origin
  or unavailable state, path, signature, retained revision count, history
  window facts, newest and oldest retained commit facts, and compare-pair
  facts.
- Acceptance Criteria:
  - Packet text includes repository, root, origin or unavailable state, target
    path, signature, retained revision count, history window summary, newest
    retained commit fact, oldest retained commit fact, and compare-pair facts.
  - Packet text remains plain text, avoids HTML-only markup in copied output,
    and uses factual fallback text when optional fields or retained history are
    missing.
  - Packet text avoids claims that require external binary comparison evidence
    or unsupported semantic VI difference conclusions from Git-only facts.
- Agent Work Scope:
  - Change review packet text and any assertions about copied packet content
    together.
- Implementation References:
  - `src/ui/historyPanel.ts`
- Verification References:
  - `tests/unit/historyReviewPacket.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
- Change Guidance:
  - Keep binary semantic claims out of Git-only packet text.

### VHS-REQ-133: Explicit Compare Pair Workflow

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: The history panel shall let users select two retained revisions and
  initiate comparison through an explicit selected/base pair action.
- Acceptance Criteria:
  - Exactly two distinct retained revisions resolve to one selected/base pair.
  - Selected/base ordering is explained consistently in panel preflight text.
  - The newer of the two selected revisions becomes selected and the older
    becomes base.
  - Compare controls remain explicit user actions with no auto-compare or
    auto-generate behavior when the second checkbox is selected.
  - Runtime preflight state is visible without silently blocking all compare
    attempts.
- Agent Work Scope:
  - Change panel rendering, command message handling, and runtime preflight
    together when changing compare workflow.
- Implementation References:
  - `src/ui/historyPanel.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `src/reporting/comparisonReportPreflight.ts`
- Verification References:
  - `tests/unit/explicitComparePairWorkflow.test.ts`
  - `tests/unit/comparisonReportPreflight.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
- Change Guidance:
  - Keep pair selection explicit and reviewable.

### VHS-REQ-127: Revision Blob Specifiers

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: Comparison preflight shall derive revision blob specifiers as
  `<revision>:<normalized-relative-path>` before staging or report generation.
- Acceptance Criteria:
  - Selected and base revision blobs use normalized relative Git paths.
  - Missing revision identifiers fail closed.
  - Paths with spaces or Windows-style separators normalize to repo-relative Git
    paths before blob reads.
  - Preflight does not read the working-tree file in place of revision blobs.
- Agent Work Scope:
  - Change preflight planning and tests together.
- Implementation References:
  - `src/reporting/comparisonReportPreflight.ts`
- Verification References:
  - `tests/unit/comparisonReportPreflight.test.ts`
- Change Guidance:
  - Preserve revision-specific comparison, not current-file comparison.

### VHS-REQ-128: Revision Blob VI Verification

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: Comparison preflight shall verify both selected revision blobs are
  content-detected LabVIEW VI files before reporting the pair as ready.
- Acceptance Criteria:
  - Left and right revision blobs are checked independently.
  - Non-VI or unreadable blobs block readiness.
  - Blocked readiness includes side-specific reason details.
- Agent Work Scope:
  - Change preflight VI checks and report tests together.
- Implementation References:
  - `src/reporting/comparisonReportPreflight.ts`
  - `src/domain/viMagicCore.ts`
- Verification References:
  - `tests/unit/comparisonReportPreflight.test.ts`
- Change Guidance:
  - Do not invoke external comparison tooling before content checks pass.

### VHS-REQ-155: Comparison Runtime Discovery Diagnostics

- Status: Active
- Parent: VHS-SYS-REQ-007
- Area: Runtime Discovery
- Statement: The comparison runtime resolver shall retain actionable diagnostic
  notes when report generation is blocked because the LabVIEW runtime,
  LabVIEWCLI, or comparison tooling is missing or unsupported.
- Acceptance Criteria:
  - Runtime selection records the requested provider, version, and bitness.
  - Missing local tools produce corrective notes instead of silent fallback.
  - Runtime doctor summaries are available to user-facing comparison flows.
  - Blocked runtime outcomes retain requested provider, requested LabVIEW version,
    requested bitness, selected provider or unavailable, blocked reason, checked
    facts, provider decisions, and actionable next step.
  - Compare preflight and retained report packet surfaces preserve the runtime
    doctor facts instead of replacing them with generic runtime-blocked text.
  - Explicit user-selected runtime facts do not silently fall back to another
    provider, version, or bitness.
- Agent Work Scope:
  - Change runtime locator, runtime doctor, and comparison action behavior
    together when changing discovery or diagnostic rules.
- Implementation References:
  - `src/reporting/comparisonRuntimeLocator.ts`
  - `src/reporting/comparisonRuntimeDoctor.ts`
  - `src/reporting/comparisonReportAction.ts`
  - `src/reporting/comparisonReportPacket.ts`
- Verification References:
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/comparisonRuntimeDoctor.test.ts`
  - `tests/unit/comparisonReportPacket.test.ts`
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `manual:runtime-discovery-missing-tool-check`
- Change Guidance:
  - Keep runtime diagnostics factual and provider-specific.

### VHS-REQ-147: Staged Comparison Inputs

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Comparison Reports
- Statement: Runtime execution shall stage selected revision blobs to stable
  left/right input paths before launching comparison tooling.
- Acceptance Criteria:
  - Selected and base blobs are staged before execution.
  - Staged filenames remain deterministic for the pair.
  - File-move scenarios keep selected/base blob identity clear in retained evidence.
  - Staging failures fail closed with a retained reason.
  - Timed-out or failed executions reject stale generated reports with retained evidence that explains why.
- Agent Work Scope:
  - Change runtime execution staging and tests together.
- Implementation References:
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonReportPlan.ts`
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
- Change Guidance:
  - Keep external tool invocations decoupled from Git blob access.

### VHS-REQ-148: Retained Runtime Execution Evidence

- Status: Active
- Parent: VHS-SYS-REQ-007
- Area: Comparison Reports
- Statement: Runtime execution shall retain command outcome evidence including
  exit code, duration, stdout, stderr, report presence, and failure reason.
- Acceptance Criteria:
  - Successful executions record produced report evidence.
  - Failed executions retain factual failure evidence.
  - Missing report output fails closed even when the process exits successfully.
  - Failed and blocked comparisons render a compact evidence summary that
    humans and agents can read without digging through raw artifacts first.
  - The compact summary includes outcome, failure/blocked reason, exit code,
    duration, report existence, artifact paths, and doctor summary lines.
  - HTML rendering escapes all user-controlled or path-derived values.
- Agent Work Scope:
  - Change execution result shape, packet rendering, and runtime tests together.
- Implementation References:
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonReportPacket.ts`
  - `src/reporting/comparisonReportExecutionPlan.ts`
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/comparisonReportPacket.test.ts`
- Change Guidance:
  - Treat external tool execution as evidence-producing, not inherently
    trustworthy.

### VHS-REQ-596: Devcontainer Source Evaluation

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: CI And Developer Environment
- Statement: The repository shall support devcontainer or Codespaces source
  evaluation as the primary human-friendly local test path.
- Acceptance Criteria:
  - A devcontainer configuration exists.
  - The public devcontainer surface is tested.
  - The test plan describes the devcontainer human check.
  - First-time source-evaluation feedback asks for the path used, first failed
    command or launch step, and Extension Development Host result.
- Agent Work Scope:
  - Change devcontainer config, source-evaluation docs, onboarding feedback
    template, and public surface tests together.
- Implementation References:
  - `.devcontainer/devcontainer.json`
  - `README.md`
  - `INSTALL.md`
  - `FIRST-RUN.md`
  - `docs/development.md`
  - `docs/testing/test-plan.md`
  - `.github/ISSUE_TEMPLATE/first_time_onboarding_feedback.yml`
- Verification References:
  - `tests/unit/publicDevcontainerSurface.test.ts`
  - `tests/unit/publicDocSourceLinks.test.ts`
  - `manual:devcontainer-extension-host`
- Change Guidance:
  - Keep the devcontainer path focused on source evaluation, not release
    authority.

### VHS-REQ-597: Lightweight Hosted CI

- Status: Active
- Parent: VHS-SYS-REQ-012
- Area: CI And Developer Environment
- Statement: Hosted CI shall run the lightweight public check set: install,
  typecheck, unit tests, and package sanity.
- Acceptance Criteria:
  - The workflow runs `npm ci`.
  - The workflow runs `npm run check`.
  - The workflow runs `npm test`.
  - The workflow runs `npm run package`.
  - The workflow runs on `main`, `develop`, `feature/**`, `release/**`, and
    `hotfix/**` branch pushes.
  - Pull request branch governance is enforced inside the required
    `Build, Test, Package` job.
- Agent Work Scope:
  - Change workflow commands and test plan together.
- Implementation References:
  - `.github/workflows/ci.yml`
  - `docs/testing/test-plan.md`
- Verification References:
  - `tests/unit/branchGovernanceWorkflow.test.ts`
  - `manual:github-actions-build-test-package`
- Change Guidance:
  - Keep branch governance inside the required hosted CI job so the public
    merge gate stays simple and visible.

### VHS-REQ-598: Trusted Windows/LabVIEW Maintainer Workflow

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: CI And Developer Environment
- Statement: The Windows/LabVIEW maintainer workflow shall be manual-only,
  read-only, trusted-ref-only, and run on a runner labeled
  `vihs-windows-labview-maintainer`.
- Acceptance Criteria:
  - The workflow triggers only through `workflow_dispatch`.
  - The workflow grants read-only repository contents permission.
  - The workflow fails closed unless the ref is `main`, `release/vX.Y.Z`, or an
    exact `vX.Y.Z` tag.
  - The environment evidence summary includes ref, SHA, runner context, Node/npm
    versions, VSIX evidence path, and whether LabVIEWCLI was detected.
  - The trusted-ref decision is visible in workflow output or artifact text.
  - The workflow uploads a VSIX and environment evidence summary artifact.
- Agent Work Scope:
  - Change workflow YAML, maintainer operations docs, and static workflow tests
    together.
- Implementation References:
  - `.github/workflows/windows-labview-maintainer.yml`
  - `docs/maintainer-operations.md`
- Verification References:
  - `tests/unit/windowsLabviewMaintainerWorkflow.test.ts`
  - `manual:trusted-windows-labview-runner-dispatch`
- Change Guidance:
  - Do not run self-hosted validation on arbitrary pull request code.

### VHS-REQ-599: Optional Vagrant Helper

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: CI And Developer Environment
- Statement: Vagrant shall remain an optional human-run local validation helper,
  not a release requirement.
- Acceptance Criteria:
  - Vagrant documentation states the optional role.
  - `npm run vagrant:validate` remains available.
  - Hosted CI does not require Vagrant.
  - Vagrant provisioning scripts prepare the guest environment without CI
    dependency.
- Agent Work Scope:
  - Change Vagrant docs, package scripts, and optional helper files together.
- Implementation References:
  - `docs/vagrant.md`
  - `vagrant/Vagrantfile`
  - `vagrant/provision/bootstrap.ps1`
  - `vagrant/provision/prepare-cold-labview.ps1`
  - `package.json`
- Verification References:
  - `tests/unit/packageManifest.test.ts`
  - `manual:vagrant-validate-when-installed`
- Change Guidance:
  - Keep Vagrant useful for humans without making it a public release gate.

### VHS-REQ-600: Marketplace Identity And Public Source Metadata

- Status: Active
- Parent: VHS-SYS-REQ-011
- Area: Package Identity
- Statement: The package shall preserve Marketplace identity
  `svelderrainruiz.vi-history-suite` while pointing repository, homepage, and
  issue metadata at the organization repository.
- Acceptance Criteria:
  - `publisher` remains `svelderrainruiz`.
  - `name` remains `vi-history-suite`.
  - Repository, homepage, and bugs URLs point to the organization repository.
  - License remains `0BSD` and package publication remains disabled.
  - Public docs (README, INSTALL, SUPPORT, SECURITY) do not present the old
    personal repo as the active source or issue tracker.
  - First-time Marketplace feedback captures stale Marketplace/source/support
    links without changing Marketplace identity.
- Agent Work Scope:
  - Change package metadata, public docs, onboarding feedback template, and
    package/public-link tests together.
- Implementation References:
  - `package.json`
  - `README.md`
  - `INSTALL.md`
  - `FIRST-RUN.md`
  - `SUPPORT.md`
  - `SECURITY.md`
  - `docs/maintainer-operations.md`
  - `.github/ISSUE_TEMPLATE/first_time_onboarding_feedback.yml`
- Verification References:
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/publicDocSourceLinks.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `external:vscode-marketplace-svelderrainruiz.vi-history-suite`
- Change Guidance:
  - Do not change Marketplace identity as part of normal source migration work.

### VHS-REQ-601: Requirements As Agent Work Contracts

- Status: Active
- Parent: VHS-SYS-REQ-014
- Area: Requirements
- Statement: The repository shall maintain active requirements, RTM, and ID
  index files so humans can target requirement IDs for agent-assisted changes.
- Acceptance Criteria:
  - Active SRS requirements use the required structured block fields.
  - Active SRS IDs and RTM IDs match exactly.
  - Active and historical IDs remain discoverable through `id-index.csv`.
  - GitHub issue templates support requirement-targeted agent work.
  - A committed requirement-wave guide defines requirement-first, RTM-first
    Copilot Web issue generation with fail-closed issue-quality gates.
  - The requirement-wave guide defines a requirement-gap lane for bounded field
    evidence that reveals missing or incomplete active requirements.
  - Requirement-gap waves name source evidence, current requirement gaps,
    proposed new IDs, RTM impacts, and fail-closed checks before implementation
    work starts.
  - Requirement-wave validation separates repo-local commands required for
    remote agents from maintainer-local advisory checks that depend on local
    skills or read-only evidence checkouts.
  - CI fails when active requirement references drift from existing repo paths.
  - A committed traceability inventory defines classifications for mapped,
    supporting, dev-only, release-ci, asset-doc, and gap surfaces.
  - A repeatable local audit command reports unmapped implementation candidates,
    unmapped test candidates, and missing RTM references.
  - The current baseline is captured without immediately failing CI for
    historical unmapped files (gap entries are informational).
  - The guard is designed so a later PR can fail closed on newly added
    unclassified implementation files.
  - Documentation tells agents how to respond when touched code is unmapped.
- Agent Work Scope:
  - Change requirements docs, GitHub issue templates, and the coherence test
    together.
  - Change traceability inventory and audit script together with RTM updates.
- Implementation References:
  - `docs/requirements/README.md`
  - `docs/requirements/copilot-web-issue-generation-prompt.md`
  - `docs/requirements/syrs.md`
  - `docs/requirements/srs.md`
  - `docs/requirements/rtm.csv`
  - `docs/requirements/id-index.csv`
  - `docs/requirements/traceability-inventory.csv`
  - `scripts/auditTraceabilitySteward.js`
  - `.github/ISSUE_TEMPLATE/requirement_target.yml`
- Verification References:
  - `tests/unit/requirementsDocs.test.ts`
  - `tests/unit/traceabilityAuditScript.test.ts`
  - `manual:requirements-quality-check-system-scope`
- Change Guidance:
  - Do not silently remove requirement IDs; retire or supersede them through the
    index.
  - For new implementation files, add inventory entries before committing.

### VHS-REQ-602: Dependency Maintenance Automation

- Status: Active
- Parent: VHS-SYS-REQ-012
- Area: CI And Developer Environment
- Statement: Dependency maintenance automation shall keep routine dependency
  updates reviewable while preserving package-audit diagnostics for failed VSIX
  runtime-surface checks. CodeQL security analysis shall run on main, develop,
  pull requests, weekly schedule, and manual dispatch.
- Acceptance Criteria:
  - Dependabot groups npm development minor and patch updates separately from
    npm runtime minor and patch updates.
  - Major dependency updates are not grouped with routine minor and patch
    updates.
  - Node and VS Code type-package updates stay aligned with the supported CI
    runtime and VS Code engine policy.
  - Package audit failures report bounded stdout and stderr from the pinned VSCE
    listing command.
  - CodeQL analysis runs on push to main and develop, pull requests targeting
    those branches, weekly schedule, and manual dispatch.
  - CodeQL grants only actions read, contents read, and security-events write
    permissions.
- Agent Work Scope:
  - Change Dependabot config, package audit diagnostics, CodeQL workflow, and
    security maintenance tests together.
- Implementation References:
  - `.github/dependabot.yml`
  - `.github/workflows/codeql.yml`
  - `package.json`
  - `scripts/auditPackagedRuntimeSurface.js`
- Verification References:
  - `tests/unit/securityMaintenanceWorkflows.test.ts`
  - `tests/unit/packageRuntimeSurfaceAudit.test.ts`
  - `manual:dependabot-pr-checks`
- Change Guidance:
  - Keep major dependency updates independently reviewable unless a future
    requirement intentionally changes the dependency-maintenance policy.

### VHS-REQ-603: Large-Repository Indexing Operating Model

- Status: Active
- Parent: VHS-SYS-REQ-015
- Area: Git History Eligibility
- Statement: Repository eligibility indexing shall define large-repository
  refresh states, file-level branch-switch reuse behavior, and observable work
  accounting without wall-clock performance promises.
- Acceptance Criteria:
  - The indexing model distinguishes cold scan, warm restart, branch switch,
    cancellation, trust-disabled, and failed-refresh states.
  - Indexing evidence reports tracked, reused, evaluated, removed, skipped,
    failed, and eligible file counts where those counts are available.
  - Warm restart and branch-switch behavior is specified in terms of cache reuse
    and re-evaluated file counts rather than elapsed time, with unchanged clean
    tracked blobs eligible for reuse across `HEAD` changes.
  - Cancellation and failed refreshes preserve a last valid eligibility snapshot
    when one exists.
  - LabVIEWCLI or comparison-runtime validation failures are treated as separate
    runtime setup evidence, not as indexing-cache causes.
- Agent Work Scope:
  - Change eligibility indexing behavior, diagnostics, tests, and requirements
    together.
- Implementation References:
  - `src/indexing/viEligibilityIndexer.ts`
- Verification References:
  - `tests/unit/viEligibilityIndexer.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:large-repo-indexing-evidence-review`
- Change Guidance:
  - Keep performance requirements algorithmic and evidence-based; do not add
    wall-clock service-level promises without a new validated benchmark
    requirement.

### VHS-REQ-604: Persistent Git-Object Eligibility Cache

- Status: Active
- Parent: VHS-SYS-REQ-015
- Area: Git History Eligibility
- Statement: Eligibility indexing shall persist eligible and ineligible file
  decisions in VS Code extension storage so warm sessions can reuse valid Git
  object evidence without committing repository-local cache files.
- Acceptance Criteria:
  - Persistent eligibility cache data is stored through VS Code extension
    storage, not through files written into the workspace or repository.
  - Cache entries are reusable only when repository identity, normalized path,
    tracked Git blob object ID, strict header setting, and cache schema version
    match the current evaluation context.
  - Cached eligible entries are reused only when their recorded history proof
    commits remain reachable from the current `HEAD`; cached unknown-signature
    entries may reuse ineligible for the same clean blob.
  - Stale, missing, incompatible, or corrupt cache data fails closed by
    re-evaluating affected files.
  - Cache data records eligibility facts needed for reuse without storing file
    contents, secrets, private runtime paths, or comparison-runtime output.
  - Cache writes do not change Git working-tree status.
- Agent Work Scope:
  - Change indexer cache shape, extension storage wiring, invalidation tests, and
    requirements together.
- Implementation References:
  - `src/indexing/viEligibilityIndexer.ts`
  - `src/extension.ts`
- Verification References:
  - `tests/unit/viEligibilityIndexer.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Prefer conservative re-evaluation over using cache data whose provenance or
    schema is uncertain.

### VHS-REQ-605: Incremental Refresh And Invalidation Lifecycle

- Status: Active
- Parent: VHS-SYS-REQ-015
- Area: Git History Eligibility
- Statement: Eligibility indexing shall refresh incrementally when repository,
  workspace, or indexing settings change while preserving a conservative
  eligibility snapshot during cancellation or refresh coalescing.
- Acceptance Criteria:
  - Branch or HEAD changes, workspace-folder changes, Git repository state
    changes, and relevant indexing setting changes trigger eligibility refresh
    or invalidation.
  - Clean tracked files with matching repository identity, normalized path, Git
    blob object ID, strict header setting, cache schema version, and reachable
    history proof are reused instead of re-evaluated.
  - Removed files are dropped from the eligibility snapshot and counted as
    removed in diagnostics.
  - Changed, dirty, staged, unmerged, cache-missing, malformed, or
    history-unproven files are re-evaluated before becoming eligible and are not
    persisted as clean blob evidence unless clean tracked facts are available.
  - Rapid refresh requests are coalesced so newer work supersedes obsolete work
    without exposing partial obsolete results.
  - Cancellation preserves the last valid eligibility snapshot when one exists
    and reports that cancellation as a refresh reason.
- Agent Work Scope:
  - Change refresh triggers, invalidation accounting, cancellation behavior, and
    tests together.
- Implementation References:
  - `src/indexing/viEligibilityIndexer.ts`
- Verification References:
  - `tests/unit/viEligibilityIndexer.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep invalidation facts explicit enough for users and agents to understand
    why a file was reused, re-evaluated, dropped, or skipped.

### VHS-REQ-606: Indexing Diagnostics And Evidence

- Status: Active
- Parent: VHS-SYS-REQ-015
- Area: Menu Gating
- Statement: The extension shall expose user-visible indexing diagnostics that
  explain eligibility refresh state, work accounting, and the boundary between
  indexing behavior and comparison-runtime validation.
- Acceptance Criteria:
  - User-visible status distinguishes cold scan, cache reuse, incremental
    refresh, cancellation, trust-disabled, and failed-refresh states.
  - Diagnostics include tracked, reused, evaluated, removed, skipped, failed,
    and eligible counts where available.
  - Diagnostics identify the refresh reason when a branch switch, HEAD change,
    workspace-folder change, Git repository state change, relevant setting
    change, cancellation, or trust-disabled state drives the result.
  - Diagnostics state that LabVIEWCLI or comparison-runtime validation failures
    are comparison/runtime setup evidence, not indexing-cache causes.
  - Runtime discovery diagnostics required by `VHS-REQ-155` remain separate
    from indexing diagnostics.
- Agent Work Scope:
  - Change indexing status surfaces, runtime-evidence wording, command behavior,
    and tests together.
- Implementation References:
  - `src/indexing/viEligibilityIndexer.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `src/reporting/comparisonRuntimeDoctor.ts`
- Verification References:
  - `tests/unit/viEligibilityIndexer.test.ts`
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep diagnostics factual and avoid implying runtime setup failures caused
    indexing refresh behavior.

### VHS-REQ-607: Field Intake Separation For Indexing Reports

- Status: Active
- Parent: VHS-SYS-REQ-014
- Area: Requirements
- Statement: Public issue intake shall collect indexing evidence separately from
  runtime validation output so maintainers can route large-repository indexing
  reports without confusing them with comparison-runtime setup failures.
- Acceptance Criteria:
  - Bug and onboarding feedback templates collect affected surface, repository
    scale, restart behavior, branch-switch behavior, and indexing diagnostics
    separately from runtime validation output.
  - Runtime validation output fields request `vihs --validate` or comparison
    runtime output without implying those facts are indexing-cache causes.
  - Intake copy includes no-secrets guidance for logs, diagnostics, paths, and
    runtime output.
  - Indexing reports can be submitted without requiring LabVIEWCLI validation
    output.
  - Runtime-only reports can be submitted without requiring indexing cache
    evidence.
- Agent Work Scope:
  - Change public issue templates, intake wording, and requirements coherence
    tests together.
- Implementation References:
  - `.github/ISSUE_TEMPLATE/bug_report.yml`
  - `.github/ISSUE_TEMPLATE/first_time_onboarding_feedback.yml`
- Verification References:
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep field intake narrowly focused on routing evidence; do not add release
    governance, admin setup, or secret collection.

### VHS-REQ-608: Diagnostic Test VSIX Distribution

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: CI And Developer Environment
- Statement: Maintainers shall be able to package a diagnostic test VSIX from a
  trusted ref for reporter retesting without publishing to the VS Code
  Marketplace.
- Acceptance Criteria:
  - The diagnostic VSIX workflow triggers only through `workflow_dispatch`.
  - The workflow fails closed unless the ref is `main`, `release/vX.Y.Z`, or an
    exact `vX.Y.Z` tag.
  - The workflow runs install, typecheck, unit tests, and package commands
    before exposing a VSIX.
  - The workflow always uploads the VSIX as a short-lived Actions artifact.
  - Maintainers may optionally update a `test-vsix-latest` prerelease asset for
    reporter retesting.
  - The workflow does not use Marketplace publishing tokens or run Marketplace
    publication commands.
- Agent Work Scope:
  - Change workflow YAML, maintainer operations docs, test-plan docs, and
    static workflow/requirements tests together.
- Implementation References:
  - `.github/workflows/package-test-vsix.yml`
  - `docs/maintainer-operations.md`
  - `docs/testing/test-plan.md`
- Verification References:
  - `tests/unit/packageTestVsixWorkflow.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:diagnostic-test-vsix-dispatch`
- Change Guidance:
  - Keep this as diagnostic reporter support only; do not convert GitHub
    Releases into the normal install channel or add Marketplace credentials to
    GitHub Actions.

### VHS-REQ-609: Governed Branch Promotion And Marketplace Release Automation

- Status: Active
- Parent: VHS-SYS-REQ-016
- Area: CI And Developer Environment
- Statement: Hosted automation shall enforce governed branch promotion and
  publish Marketplace releases only from exact release tags on `main`.
- Acceptance Criteria:
  - Hosted CI admits pull requests to `main` only from `release/vX.Y.Z` or
    `hotfix/vX.Y.Z` branches.
  - Hosted CI admits pull requests to `develop` from `feature/*`,
    `dependabot/*`, `release/vX.Y.Z`, `hotfix/vX.Y.Z`, or `main` back-sync
    branches.
  - The Marketplace release workflow uses the protected
    `marketplace-release` environment.
  - The Marketplace release workflow fails closed unless the ref is an exact
    `vX.Y.Z` tag, the package version matches the tag, and the tag commit is
    reachable from `origin/main`.
  - The Marketplace release workflow runs install, typecheck, unit tests, and
    package commands before publication.
  - Marketplace publication uses the pinned VSCE wrapper and verifies the live
    Marketplace listing after publication.
  - Release evidence is retained as a workflow artifact.
- Agent Work Scope:
  - Change branch-governance workflow logic, Marketplace release workflow YAML,
    maintainer operations docs, requirements, and static tests together.
- Implementation References:
  - `.github/workflows/ci.yml`
  - `.github/workflows/marketplace-release.yml`
  - `.github/dependabot.yml`
  - `docs/maintainer-operations.md`
  - `docs/testing/test-plan.md`
- Verification References:
  - `tests/unit/branchGovernanceWorkflow.test.ts`
  - `tests/unit/marketplaceReleaseWorkflow.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:marketplace-release-environment-setup`
  - `manual:marketplace-release-tag-dispatch`
- Change Guidance:
  - Do not publish from branch refs; tag the merged `main` commit and publish
    from that exact tag only.

### VHS-REQ-610: Dashboard Aggregate Review

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: The extension shall provide a dashboard aggregate review that
  concentrates retained comparison report evidence across multiple commit pairs
  into a single HTML surface.
- Acceptance Criteria:
  - The dashboard shows all commit pairs in the loaded history window.
  - Each pair entry shows archive status, evidence state, and artifact links.
  - Report metadata including overview images, detail sections, and included
    attributes is extracted from NI comparison reports and displayed.
  - ETA estimation provides user feedback during dashboard preparation.
  - Dashboard artifacts are persisted to extension storage for reproducibility.
  - Evidence seeding imports retained evidence from external sources when
    available.
  - Dashboard generation requires at least three commits to form comparison
    pairs.
- Agent Work Scope:
  - Change dashboard build, action, evidence handling, and tests together.
- Implementation References:
  - `src/dashboard/multiReportDashboard.ts`
  - `src/dashboard/multiReportDashboardAction.ts`
  - `src/dashboard/niComparisonReportParser.ts`
  - `src/dashboard/comparisonReportArchive.ts`
  - `src/dashboard/dashboardEtaAccuracy.ts`
  - `src/dashboard/dashboardLatestRun.ts`
  - `src/dashboard/retainedDashboardEvidence.ts`
- Verification References:
  - `tests/unit/dashboardEtaAccuracy.test.ts`
  - `tests/unit/niComparisonReportParser.test.ts`
- Change Guidance:
  - Keep dashboard behavior concentrated on evidence aggregation and review, not
    comparison execution.

### VHS-REQ-611: Installed Bundled Documentation Surface

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Bundled Docs
- Statement: The extension shall provide installed bundled documentation through
  the `labviewViHistory.openDocumentation` command by loading packaged manifest
  and page assets that ship with the extension.
- Acceptance Criteria:
  - The extension manifest contributes `labviewViHistory.openDocumentation` and
    activates on that command.
  - The command registration routes requests to the bundled documentation action
    and surfaces user-facing outcomes for missing bundles or unknown pages.
  - Bundled documentation manifest and page loading resolves packaged
    `resources/bundled-docs` assets and renders an in-product documentation
    panel.
  - Packaged bundled documentation includes the manifest and shipped HTML pages
    for overview, user workflow, install/release, and comparison/dashboard
    review guidance.
- Agent Work Scope:
  - Change bundled documentation command routing, packaged docs assets,
    requirements mapping, and verification references together.
- Implementation References:
  - `src/docs/bundledDocumentation.ts`
  - `src/docs/bundledDocumentationAction.ts`
  - `resources/bundled-docs/manifest.json`
  - `resources/bundled-docs/pages/overview.html`
  - `resources/bundled-docs/pages/user-workflow.html`
  - `resources/bundled-docs/pages/install-and-release.html`
  - `resources/bundled-docs/pages/comparison-reports-and-dashboard-review.html`
  - `package.json`
  - `src/extension.ts`
- Verification References:
  - `tests/unit/bundledDocumentation.test.ts`
  - `tests/unit/bundledDocumentationAction.test.ts`
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep this requirement scoped to installed bundled documentation behavior and
    packaged assets, not external website or wiki governance.
