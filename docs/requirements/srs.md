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
- Statement: The selected target file shall be eligible for VI History only
  when it is tracked in Git, content-detected as a VI, and has at least two
  modifying commits.
- Acceptance Criteria:
  - The selected file is not eligible when Git cannot resolve it as tracked in
    the selected repository.
  - The selected file is not eligible when fewer than two modifying commits are
    available for that file.
  - Content detection is part of selected-file eligibility evaluation.
- Agent Work Scope:
  - Change shared history model, history service, command stops, and Git helper
    behavior together when selected-file eligibility rules change.
- Implementation References:
  - `src/commands/openViHistoryCommand.ts`
  - `src/services/viHistoryModel.ts`
  - `src/services/viHistoryService.ts`
  - `src/git/gitCli.ts`
- Verification References:
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/viHistoryModel.test.ts`
  - `tests/unit/viHistoryService.test.ts`
  - `tests/unit/gitCli.test.ts`
- Change Guidance:
  - Keep eligibility stricter than menu visibility hints.

### VHS-REQ-007: NUL-Safe Git Path Parsing

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Git History Eligibility
- Statement: The Git adapter shall parse NUL-delimited Git path output safely
  whenever Git commands return path lists.
- Acceptance Criteria:
  - Paths containing spaces are parsed correctly.
  - Empty trailing records are ignored.
  - Enumeration errors fail closed at the caller boundary.
- Agent Work Scope:
  - Change Git CLI parsing and Git adapter tests when altering path-list
    parsing.
- Implementation References:
  - `src/git/gitCli.ts`
- Verification References:
  - `tests/unit/gitCli.test.ts`
- Change Guidance:
  - Do not switch to newline parsing for Git path lists, and do not treat this
    parsing requirement as permission to scan every VI before opening one
    selected file.

### VHS-REQ-008: Bounded Commit Queries

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Git History Eligibility
- Statement: The Git adapter shall use bounded commit queries when determining
  minimum history eligibility for the selected file.
- Acceptance Criteria:
  - Selected-file eligibility can be established by querying at most two commit
    hashes for that file.
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
  - `tests/unit/viHistoryModel.test.ts`
- Change Guidance:
  - Keep minimum eligibility reads scoped to the requested file rather than
    introducing repository-wide VI scans.

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
- Statement: The extension shall gate selected-file VI History evaluation and
  external process execution on VS Code workspace trust.
- Acceptance Criteria:
  - Invoking VI History in an untrusted workspace does not evaluate selected-file
    eligibility.
  - Invoking VI History in an untrusted workspace stops with a warning.
  - External comparison execution does not proceed from an untrusted workspace.
  - Warning messages explain why VI History and comparison are disabled and what
    low-risk paths remain available.
- Agent Work Scope:
  - Change command and manifest trust behavior together.
- Implementation References:
  - `src/commands/openViHistoryCommand.ts`
  - `package.json`
- Verification References:
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
- Change Guidance:
  - Trust checks are safety boundaries, not convenience prompts.

### VHS-REQ-013: Selected-File Menu Entry And Eligibility Gate

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Menu Gating
- Statement: Explorer and editor menu hints shall remain broad while the
  command validates the selected file's actual VI History eligibility at
  invocation time.
- Acceptance Criteria:
  - The manifest may expose VI History for trusted files with LabVIEW-related
    extensions without requiring a repository-wide eligibility index.
  - Invoking the command on a non-eligible selected file fails closed with a
    factual reason and next action.
  - Runtime eligibility is stricter than menu visibility hints.
- Agent Work Scope:
  - Change package menu expectations and command ineligibility behavior
    together.
- Implementation References:
  - `src/commands/openViHistoryCommand.ts`
  - `package.json`
- Verification References:
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/packageManifest.test.ts`
- Change Guidance:
  - Keep command-time validation conservative even when manifest menu hints stay
    intentionally broad.

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
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
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

### VHS-REQ-083: Lean Activation Without Indexing Side Effects

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: Extension Manifest
- Statement: The extension shall activate lightly through `onStartupFinished`
  and its contributed commands without eager repository indexing side effects.
- Acceptance Criteria:
  - The manifest's only explicit activation event is `onStartupFinished`; it
    does not use the eager `*` startup activation.
  - VS Code infers `onCommand` activation from `contributes.commands`, so the
    public commands are not listed redundantly in `activationEvents`.
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
  - Do not add broad activation events (such as `*` or unfiltered language or
    view events) without a requirement update.

### VHS-REQ-084: Limited Untrusted Workspace Capability

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: Extension Manifest
- Statement: The manifest shall declare limited untrusted-workspace support and
  restrict external runtime configuration in untrusted workspaces.
- Acceptance Criteria:
  - The manifest declares limited untrusted workspace support.
  - Runtime provider, LabVIEW version, and bitness settings are restricted.
  - The description explains disabled selected-file history evaluation and
    comparison execution.
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
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
  - `tests/unit/viHistoryService.test.ts`
- Change Guidance:
  - Keep user-facing stops explicit instead of silent.
  - Blocked or empty states must include factual reasons and next actions.

### VHS-REQ-017: Factual History Panel Content

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: History Panel
- Statement: The history panel shall show the selected file's relative path and a
  selectable table of retained commit facts so the user can review the commits
  and choose a pair to compare.
- Acceptance Criteria:
  - The panel renders a slim orientation title carrying the selected file's
    relative path and the retained commit count.
  - The panel renders a commit table with one row per retained revision, each row
    carrying the abbreviated commit hash, author date, author name, commit
    subject, and the full commit body.
  - Revisions with an empty commit body render a factual fallback rather than a
    blank cell.
  - The commit table does not render a per-row action column; the panel exposes
    no per-row Open@commit or Copy hash buttons. The Select checkboxes and the
    explicit Compare action remain the panel's interactive controls.
  - The panel does not render the prior procedural sections (review-facts,
    repository-facts, binary-review-limitation, reviewer-guidance,
    confidence-and-scope, latest-compare-runtime, or host-review-submission); the
    factual review packet remains available through the
    `labviewViHistory.copyReviewPacket` command (VHS-REQ-039).
  - User-controlled or path-derived panel values are escaped in rendered HTML
    text and attribute contexts. Inline script contexts (e.g., JSON-serialized
    data in `<script>` blocks) must neutralize script-tag boundaries in
    serialized payloads before embedding (for example replacing `<` with
    `\u003C`) so `</script>` data cannot terminate the script block.
- Agent Work Scope:
  - Change `historyPanel` rendering, unit tests, and extension-host assertions
    together.
  - Change shared panel escaping or inline-script serialization safeguards with
    the owning renderer and unit tests together.
- Implementation References:
  - `src/ui/historyPanel.ts`
  - `src/services/viHistoryModel.ts`
  - `src/ui/runtimeReportPanel.ts`
- Verification References:
  - `tests/unit/viHistoryModel.test.ts`
  - `tests/unit/historyPanelRendering.test.ts`
  - `tests/unit/runtimeReportPanel.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
- Change Guidance:
  - Do not replace factual Git content with inferred summaries. Keep the panel
    focused on the commit table and the explicit Compare action; route additional
    factual evidence to the review-packet command rather than re-adding panel
    sections.

### VHS-REQ-039: Copy Review Packet

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: History Panel
- Statement: The extension shall expose a command that copies a factual review
  packet for the selected VI.
- Acceptance Criteria:
  - The extension contributes a `labviewViHistory.copyReviewPacket` Command
    Palette command that copies the review packet for the selected VI.
  - The command writes plain text to the VS Code clipboard.
  - The command applies the same workspace-trust and eligibility gates as opening
    the panel, surfacing a factual message when the selection is untrusted,
    unresolvable, or ineligible.
- Agent Work Scope:
  - Change command registration, review packet rendering, and their tests
    together.
- Implementation References:
  - `src/ui/historyPanel.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `src/extension.ts`
- Verification References:
  - `tests/unit/historyReviewPacket.test.ts`
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/historyPanelTracker.test.ts`
  - `tests/unit/packageManifest.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
- Change Guidance:
  - Keep copied review packets grounded in the same model the panel renders.

### VHS-REQ-040: Factual Review Packet Text

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: History Panel
- Statement: Copied review packet text shall include repository, root, origin
  or unavailable state, path, signature, retained revision count, history
  window facts, newest and oldest retained commit facts, and
  per-retained-commit subject and body facts.
- Acceptance Criteria:
  - Packet text includes repository, root, origin or unavailable state, target
    path, signature, retained revision count, history window summary, newest
    retained commit fact, oldest retained commit fact, and per-retained-commit
    subject and body facts.
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

### VHS-REQ-639: Commit Body In History Panel

- Status: Active
- Parent: VHS-SYS-REQ-001
- Area: History Panel
- Statement: The history panel shall display the full Git commit message body
  for each retained revision in place of the adjacent-pair chronology column.
- Acceptance Criteria:
  - Each retained-revision row renders a dedicated commit body column populated
    from the Git commit message body for that revision.
  - The commit body column replaces the prior adjacent-pair column; adjacent
    hash-pair text is no longer rendered as a row column.
  - Commit body text is captured per revision from existing bounded Git history
    reads without additional unbounded reads (no regression of VHS-REQ-008).
  - Multi-line commit body content is preserved in rendered output and is
    escaped in HTML text and attribute contexts (no regression of VHS-REQ-017
    escaping rules).
  - Revisions with an empty commit body render a factual fallback rather than a
    blank or misleading cell.
  - Explicit selected/base compare selection remains unchanged and independent
    of the removed adjacent-pair column (no regression of VHS-REQ-133).
- Agent Work Scope:
  - Change Git history capture, history-panel rendering, and their tests
    together.
- Implementation References:
  - `src/git/gitCli.ts`
  - `src/services/viHistoryModel.ts`
  - `src/ui/historyPanel.ts`
- Verification References:
  - `tests/unit/gitCli.test.ts`
  - `tests/unit/historyPanelRendering.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
- Change Guidance:
  - Keep panel content factual; render Git commit text without inferred
    summaries.

### VHS-REQ-133: Explicit Compare Pair Workflow

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: The history panel shall let users select two retained revisions and
  initiate comparison through an explicit selected/base pair action.
- Acceptance Criteria:
  - Exactly two distinct retained revisions resolve to one selected/base pair.
  - The newer of the two selected revisions becomes selected and the older
    becomes base, derived from the row commit-index ordering.
  - Selecting a third revision is prevented so at most two revisions are ever
    selected.
  - Compare controls remain explicit user actions with no auto-compare or
    auto-generate behavior when the second checkbox is selected; selecting the
    second revision only enables the Compare button.
  - Compare runtime feedback (provider, acquisition, and blocked-runtime
    remediation) is surfaced through notifications rather than an in-panel
    preflight section, and a blocked runtime never silently prevents the user
    from invoking Compare.
  - The explicit revision selection persists across a panel reload: the panel is
    retained when hidden, and the selected commit hashes are persisted to webview
    state and restored on load, so switching to another panel (for example
    Runtime & Report Settings) or an in-place re-render does not clear the user's
    selection.
- Agent Work Scope:
  - Change panel rendering, command message handling, and runtime preflight
    together when changing compare workflow.
- Implementation References:
  - `src/ui/historyPanel.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `src/reporting/comparisonReportPreflight.ts`
  - `src/reporting/comparisonReportAction.ts`
- Verification References:
  - `tests/unit/explicitComparePairWorkflow.test.ts`
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/comparisonReportPreflight.test.ts`
  - `tests/unit/comparisonReportAction.test.ts`
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
  - The single-blob guarantee covers the selected VI only; staging the
    surrounding dependency tree is governed by VHS-REQ-624.

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

### VHS-REQ-624: Newest-Revision Tree Staging For Comparison

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: Comparison staging shall materialize the selected (newest)
  revision's surrounding tree once and place both compared VI blobs (base and
  selected) at the compared VI's normalized repository-relative path within that
  tree, under distinct left and right filenames, so LabVIEW resolves in-repo
  dependencies at load time when CreateComparisonReport runs.
- Acceptance Criteria:
  - A single tree is materialized from the selected (newest) revision; the base
    revision does not receive its own tree.
  - Tree materialization faithfully reproduces every file tracked at the
    selected revision, including paths excluded from `git archive` by
    `.gitattributes export-ignore`, so in-repo dependencies are present beside
    the staged VIs at load time instead of being dropped.
  - Contents of submodules recorded at the selected revision are materialized at
    their repo-relative paths (including nested submodules) on a best-effort
    basis, so dependencies tracked through a submodule resolve at load time.
    When a submodule's objects are unavailable, it is skipped without failing
    the comparison.
  - Both compared VI blobs are written at the compared VI's normalized
    repo-relative path inside that tree, under distinct left and right filenames,
    so the two top-level VIs never collide on qualified name in one LabVIEW
    session.
  - The left filename carries the base blob and the right filename carries the
    selected blob; CreateComparisonReport receives them as VI1 and VI2.
  - When the selected-revision tree cannot be materialized, the run degrades to a
    factual blocked state with a recorded reason and the runtime is not invoked.
  - The report and retained packet disclose that both VIs were evaluated against
    the selected revision's dependencies, that dependency-only changes between
    the two revisions may therefore not appear, and that loading the base VI
    against newer dependencies may recompile it and distort the rendered diff.
  - When a selected-revision tree was materialized, the report and retained
    packet also disclose that only files tracked in the repository are staged, so
    dependencies outside the repository (for example LabVIEW-installed paths such
    as `vi.lib`, `instr.lib`, `user.lib`, or the `resource` directory, and
    absolute-path references) are not staged and may render as placeholder
    (white) items as a staging limitation rather than a change in the VI.
  - Staged inputs and a materialized-tree manifest are retained as runtime
    evidence consistent with VHS-REQ-147 and VHS-REQ-148.
- Agent Work Scope:
  - Change staging-plan construction, host-native execution-context preparation,
    and the report and packet caveat text together; add deterministic unit
    coverage for the single-tree layout and the fail-closed path.
- Implementation References:
  - `src/reporting/comparisonReportPlan.ts`
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonReportPacket.ts`
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/comparisonReportPacket.test.ts`
  - `manual:dependency-harness-newest-tree-staging`
- Change Guidance:
  - Optimize for dependency load success and simplicity; do not claim
    per-revision dependency fidelity or true historical diffing.
  - Materialize the tree with a faithful working-tree checkout (for example a
    temporary-index `git read-tree` then `git checkout-index`), not
    `git archive`, so files excluded by `.gitattributes export-ignore` are not
    dropped from the staged tree.
  - Recurse into submodule gitlinks best-effort (skip on failure) so submodule
    contents resolve, since `checkout-index` materializes only the
    superproject's own blobs; keep superproject materialization fail-closed.

### VHS-REQ-625: Library-Member Compared-VI Disclosure

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: When the compared VI is itself listed as a member of a LabVIEW
  library (`.lvlib`) or class (`.lvclass`) at the selected revision, the
  comparison report shall disclose that the VI is staged outside its owning
  library for side-by-side comparison.
- Acceptance Criteria:
  - Preflight detects, from the selected revision's tree, whether the compared
    VI's normalized path is a member URL of a `.lvlib` or `.lvclass`.
  - Detection is best-effort and never blocks the comparison or changes runtime
    behavior; failures resolve to no disclosure.
  - When membership is detected, the report packet renders a factual caveat
    naming the owning library and noting that staging renames the VI outside the
    library namespace, so library-context resolution may differ from the
    in-project VI.
  - When the VI is not a library member, no library-member caveat is rendered.
- Agent Work Scope:
  - Change preflight membership detection and packet caveat rendering together
    with their unit tests.
- Implementation References:
  - `src/reporting/comparisonReportPreflight.ts`
  - `src/reporting/comparisonReportPacket.ts`
- Verification References:
  - `tests/unit/comparisonReportPreflight.test.ts`
  - `tests/unit/comparisonReportPacket.test.ts`
- Change Guidance:
  - Keep the disclosure factual; do not claim a specific comparison defect that
    has not been observed.

### VHS-REQ-626: Comparison Report Export For External Viewing

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: The extension shall let users export an open comparison report,
  together with its graphics dependency folder, to a user-chosen accessible
  location for viewing in an external browser.
- Acceptance Criteria:
  - An export action is available from the comparison-report panel title bar
    while a comparison-report webview panel is the active panel.
  - The export prefers the LabVIEW-generated graphics report. A self-contained
    single-file report (VHS-REQ-640) is exported as the HTML file alone; a
    retained multi-file report also copies its sibling assets directory so
    relative image links keep resolving when the exported HTML is opened in an
    external browser.
  - The exported LabVIEW-generated graphics report embeds the same revision
    context block shown in the in-panel webview — the selected and base revision
    hash, date, author, subject, and full commit body — rendered through the
    shared context renderer so the commit body keeps its escaping, multi-line,
    not-retained, and empty-body behavior (VHS-REQ-644). The context is injected
    into the exported copy only; the retained source report is not mutated, no
    `<base href>` is added, and the report's relative `<name>_files/...` image
    links keep resolving in an external browser.
  - When no LabVIEW-generated graphics report is available, the export states
    the specific reason and only writes the diagnostic evidence packet after an
    explicit user confirmation.
  - The export writes a self-contained, timestamped bundle into the
    user-selected destination folder without overwriting prior exports.
  - After a successful export the user can open the exported HTML in the default
    external browser or reveal it in the operating-system file manager.
  - The comparison-report webview keeps scripts disabled; the export action is
    driven through the extension command surface rather than in-webview scripts.
- Agent Work Scope:
  - Change the export module, panel registration, command registration, and
    export tests together when changing export behavior.
- Implementation References:
  - `package.json`
  - `src/reporting/comparisonReportExport.ts`
  - `src/reporting/comparisonReportAction.ts`
  - `src/reporting/comparisonReportContextMarkup.ts`
  - `src/extension.ts`
- Verification References:
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/comparisonReportExport.test.ts`
  - `tests/unit/comparisonReportAction.test.ts`
- Change Guidance:
  - Keep the export limited to retained comparison evidence placed in an
    accessible location; the exported copy may embed retained revision context
    via the shared renderer, but the export must not run comparison execution or
    mutate the retained source artifacts on disk.

### VHS-REQ-640: Self-Contained Single-File Comparison Report Output

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: The extension shall generate LabVIEW comparison reports as a
  self-contained single-file HTML document, with all difference images embedded
  in the report file, so the comparison-report webview renders every image
  without issuing one sub-resource request per image.
- Acceptance Criteria:
  - The LabVIEW comparison runtime is invoked with the single-file report type
    (`-ReportType htmlsinglefile`) for every supported provider (host-native,
    Linux container, and Windows container).
  - A freshly generated report is a single HTML file whose images are embedded
    as data URIs; no sibling `<report>_files` assets directory is required for
    the report to display.
  - The comparison-report panel renders the generated single-file report with
    all images visible and keeps webview scripts disabled.
  - Previously retained multi-file reports continue to render; the report panel
    still loads their images without regression.
- Agent Work Scope:
  - Change the report format in the execution plan together with the
    execution-plan and report-panel tests; update the diagnostics-bundle and
    changelog notes describing the report file shape.
- Implementation References:
  - `src/reporting/comparisonReportExecutionPlan.ts`
  - `src/reporting/comparisonReportPlan.ts`
  - `src/reporting/comparisonReportAction.ts`
- Verification References:
  - `tests/unit/comparisonReportExecutionPlan.test.ts`
  - `tests/unit/comparisonReportAction.test.ts`
- Change Guidance:
  - Keep the single-file report type applied uniformly across providers; do not
    reintroduce a per-image multi-file layout for newly generated reports. Keep
    the interim lazy-image-loading behavior so retained multi-file reports still
    render.

### VHS-REQ-644: Commit Body In Comparison Report

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: The produced comparison report shall display the full Git commit
  message body for each compared revision alongside the existing date, author,
  and subject facts, so reviewers retain the human rationale captured in the
  commit body that is otherwise unrecoverable from the rendered binary VI diff.
- Acceptance Criteria:
  - The retained comparison-report packet renders the full Git commit body for
    both the selected and base revision context cards, in addition to the
    existing date, author, and subject facts. Because the packet export
    (VHS-REQ-626 fallback) copies this retained packet HTML, the exported packet
    carries the commit body as well.
  - The in-panel comparison context cards and the exported generated-report copy
    render the same per-revision commit body through the shared panel context
    markup. Per VHS-REQ-626, generated-report export injects revision context
    into the exported copy only while leaving the retained LabVIEW-generated
    source report unchanged; packet export copies the retained packet HTML,
    which already renders the cards.
  - Commit body text is sourced from the in-memory retained-history commits
    already passed to comparison-report generation, without additional Git
    history reads (no regression of VHS-REQ-008).
  - Multi-line commit body content is preserved in rendered output and is
    escaped in HTML text and attribute contexts (no regression of VHS-REQ-017
    escaping rules).
  - A revision whose metadata was not retained renders the same "not retained"
    fallback used for date/author/subject; a revision with retained but empty
    commit body content, including the synthesized working-tree revision
    (VHS-REQ-641), renders a distinct empty-body fallback rather than a blank or
    misleading cell.
  - Existing comparison-report behavior, staged evidence, and the history-panel
    and review-packet commit body (VHS-REQ-639) remain unchanged.
- Agent Work Scope:
  - Carry the commit body through the comparison-report revision metadata and
    render it in the packet and panel/export context cards together with their
    unit tests.
- Implementation References:
  - `src/reporting/comparisonReportPacket.ts`
  - `src/reporting/comparisonReportAction.ts`
  - `src/reporting/comparisonReportExport.ts`
- Verification References:
  - `tests/unit/comparisonReportPacket.test.ts`
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/comparisonReportExport.test.ts`
- Change Guidance:
  - Reuse the commit-body escaping, line-break preservation, and empty-body
    fallback pattern established for the history panel (VHS-REQ-639); do not
    introduce new Git reads or alter comparison runtime behavior.

### VHS-REQ-645: Configurable Comparison Report Flags

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: The extension shall expose the LabVIEW comparison report
  difference-suppression filters honored by the LabVIEWCLI CreateComparisonReport
  operation as native VS Code settings, so a user can tailor what each generated
  report contains without code changes while an unconfigured workspace
  reproduces the shipped defaults exactly. The report output format is fixed to
  single-file HTML (VHS-REQ-640) and is not configurable.
- Acceptance Criteria:
  - The extension contributes user- and workspace-scoped boolean
    difference-suppression settings under `viHistorySuite.report.*`:
    `ignoreViAttributes`, `ignoreFrontPanel`, `ignoreFrontPanelObjectPosition`,
    `ignoreBlockDiagram`, and `ignoreBlockDiagramCosmetic`. No report-format
    setting is contributed; the format is hardcoded to single-file HTML.
  - Each enabled boolean adds exactly its verified CreateComparisonReport flag
    (`-noattr`, `-nofp`, `-nofppos`, `-nobd`, `-nobdcosm` respectively) to the
    generated command. The report is always invoked with
    `-ReportType htmlsinglefile`, independent of any setting (VHS-REQ-640).
  - With no settings configured, the generated CreateComparisonReport invocation
    is identical to the prior hardcoded behavior: single-file HTML output and no
    suppression filters (no regression of VHS-REQ-640).
  - The settings render in the native VS Code Settings editor; no scripted
    webview is introduced and the comparison-report panel keeps scripts disabled
    (no regression of VHS-REQ-626).
  - The Runtime & Report Settings panel surfaces these flags as Include
    checkboxes (checked includes the difference class) and persists each edit to
    `viHistorySuite.report.*` with the Include-to-ignore inversion (unchecking a
    class writes `ignore=true`). The panel exposes no report-format control.
- Agent Work Scope:
  - Contribute the settings, read them at the comparison-report action boundary,
    and thread them through the execution plan and CLI plan builder together with
    their unit tests.
- Implementation References:
  - `package.json`
  - `src/reporting/comparisonReportPlan.ts`
  - `src/reporting/comparisonReportExecutionPlan.ts`
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonReportAction.ts`
  - `src/ui/runtimeReportPanel.ts`
  - `src/commands/openRuntimeReportPanelCommand.ts`
- Verification References:
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/comparisonReportExecutionPlan.test.ts`
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/runtimeReportPanel.test.ts`
  - `tests/unit/openRuntimeReportPanelCommand.test.ts`
  - `tests/unit/comparisonReportOptionSelection.test.ts`
- Change Guidance:
  - Keep the difference-suppression flag names aligned with the LabVIEWCLI
    CreateComparisonReport operation help; do not expose flags the CLI operation
    does not honor. Do not reintroduce a report-format setting or a multi-file
    report type for newly generated reports (VHS-REQ-640).

### VHS-REQ-646: LabVIEW Container Image Tag Model

- Status: Active
- Parent: VHS-SYS-REQ-019
- Area: Runtime Discovery
- Statement: The extension shall provide a pure model that parses, formats, and
  orders `nationalinstruments/labview` container image tags of the form
  `<year>q<quarter>[patch<n>]-<windows|linux>` into structured
  `{ year, quarter, patch, platform }` data, so available image versions are
  derived data rather than hardcoded strings.
- Acceptance Criteria:
  - A strict parser decomposes `2026q1-windows`, `2026q1patch2-windows`, and
    `2026q1-linux` into year (4-digit), quarter (1–4), optional patch (>=1), and
    platform (`windows` | `linux`).
  - Any string that does not match the grammar (including a `patch0` tag), and
    any full reference whose repository is not the official
    `nationalinstruments/labview` namespace, is rejected and never produces an
    image reference.
  - Ordering is newest-first by year, then quarter, then patch, where a higher
    patch is newer and the base (no-patch) release is the oldest within its
    year/quarter group.
  - A formatter reconstructs the canonical tag and full reference; parsing then
    formatting is the identity for every valid tag.
  - The model performs no I/O (no VS Code, filesystem, child process, or
    network) and is unit-tested.
- Agent Work Scope:
  - Add the `containerImageCatalog` model (parser, formatter, comparator). No
    locator, settings, or command wiring belongs in this requirement.
- Implementation References:
  - `src/tooling/containerImageCatalog.ts`
- Verification References:
  - `tests/unit/containerImageCatalog.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the tag grammar and namespace pin strict; widening either is a security
    decision (untrusted registry input), not a cosmetic change.

### VHS-REQ-647: Published Container Image Tag Discovery

- Status: Active
- Parent: VHS-SYS-REQ-019
- Area: Runtime Discovery
- Statement: The extension shall discover available LabVIEW container versions by
  querying the Docker Hub `nationalinstruments/labview` tag list with an
  anonymous, read-only, bounded request, filtering the result to the active
  platform and the supported year floor through the VHS-REQ-646 model.
- Acceptance Criteria:
  - Discovery uses an anonymous read-only HTTPS request with a bounded timeout
    and bounded paging, performed lazily (on picker open), never on activation.
  - Returned tags are parsed and namespace-pinned through VHS-REQ-646; tags that
    do not parse, target a different platform, or fall below the supported year
    floor are excluded, and results are ordered newest-first.
  - Network failure, timeout, or a non-success response degrades gracefully to an
    empty result plus a non-fatal note rather than throwing, so selection falls
    back to local images and the default.
  - The fetch boundary is injected so discovery is unit-tested without real
    network access.
- Agent Work Scope:
  - Add the registry tag-discovery function behind an injected fetch boundary and
    the default bounded HTTPS fetcher; return parsed, ordered, platform-filtered
    versions plus a fail-soft note.
- Implementation References:
  - `src/tooling/containerImageCatalog.ts`
  - `src/commands/pickContainerImageVersionCommand.ts`
- Verification References:
  - `tests/unit/containerImageCatalog.test.ts`
  - `tests/unit/pickContainerImageVersionCommand.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the request anonymous, read-only, and bounded; never add credentials or
    unbounded retries, and keep registry unavailability non-fatal.

### VHS-REQ-648: Local Container Image Tag Discovery

- Status: Active
- Parent: VHS-SYS-REQ-019
- Area: Runtime Discovery
- Statement: The extension shall discover available LabVIEW container versions
  from images already present on the local Docker host, merge them with published
  results into one availability catalog, and keep already-pulled images
  selectable offline without needless re-pulls.
- Acceptance Criteria:
  - Local discovery enumerates `nationalinstruments/labview` images on the host
    and parses each reference through VHS-REQ-646.
  - The merged catalog marks each version's local presence and registry
    publication so selection surfaces can distinguish already-pulled from
    available-to-pull, and a locally present version is retained even when the
    registry list omitted it.
  - Local discovery requires no network and succeeds in an air-gapped
    environment; absence of the Docker CLI yields an empty result, not an error.
  - The default `docker images` lister distinguishes three Docker states so a
    present image is never mislabeled: the CLI absent (spawn error) resolves to
    an empty list (nothing pulled), the CLI present but the daemon unreachable
    (non-zero exit) rejects, and success (exit 0) resolves the parsed list. On a
    lister rejection, local discovery sets `localPresenceUnknown` and returns an
    empty version list with a note, so consumers can report local presence as
    *unknown* rather than empty; a resolved empty list does not set the flag.
  - The Docker enumeration boundary is injected and unit-tested without invoking
    real Docker.
- Agent Work Scope:
  - Add the local enumeration function behind an injected command boundary, the
    default `docker images` lister, and the merge function (de-duplicated by
    canonical tag, newest-first).
- Implementation References:
  - `src/tooling/containerImageCatalog.ts`
  - `src/commands/pickContainerImageVersionCommand.ts`
- Verification References:
  - `tests/unit/containerImageCatalog.test.ts`
  - `tests/unit/pickContainerImageVersionCommand.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Treat the local list as authoritative for the offline/already-pulled case;
    merging with registry results must not drop a locally present version.

### VHS-REQ-649: Container Image Version Selection Setting And Quick-Pick

- Status: Active
- Parent: VHS-SYS-REQ-019
- Area: Menu Gating
- Statement: The extension shall expose a container image version setting and a
  quick-pick command that lists discovered versions newest-first, marks
  locally-present versions, and persists the user's choice (or clears it to the
  newest-supported default) for the comparison runtime to consume.
- Acceptance Criteria:
  - The extension contributes a `viHistorySuite.container.imageVersion` string
    setting that is empty by default and restricted in untrusted workspaces
    because it names the image the comparison launches.
  - A `labviewViHistory.pickContainerImageVersion` command lists discovered
    versions newest-first, labels each with its canonical tag, annotates whether
    each is pulled locally or available to pull, and marks the current selection.
  - When local presence could not be determined because the Docker engine was
    offline (`localPresenceUnknown`, surfaced by VHS-REQ-648), non-local versions
    are annotated `Local presence unknown (Docker engine offline)` instead of
    `Available to pull`, so a genuinely-pulled image is never misreported as
    needing a pull while the daemon is down. The same annotation is used by both
    the quick-pick (`buildContainerImageVersionItems`) and the runtime settings
    panel (`presenceLabel`).
  - Choosing a version persists its canonical tag to the setting at the Global
    target; a Clear option removes the setting; the command is blocked outside
    trusted workspaces.
  - When discovery yields nothing (offline and nothing pulled) and no selection
    is set, the command surfaces an actionable message naming the
    `docker pull nationalinstruments/labview:<tag>` recovery rather than failing.
  - The command lists versions for the *active Docker daemon container mode*
    rather than the host OS alone: at picker open it probes the daemon
    (`docker info` OSType) through an injected boundary and lists that platform's
    images, so a Windows host running Docker in Linux-container mode is offered
    Linux images. An unavailable or inconclusive probe falls back to the host
    default for image listing, and an explicit platform override skips the probe.
- Agent Work Scope:
  - Contribute the setting and command, register the command, and implement the
    window-free helpers (`buildContainerImageVersionItems`,
    `applyContainerImageVersionSelection`,
    `discoverAvailableContainerImageVersions`,
    `resolveConfirmedContainerPlatform`) with their unit tests; keep the
    command surface thin and the daemon probe behind an injected boundary.
- Implementation References:
  - `package.json`
  - `src/commands/pickContainerImageVersionCommand.ts`
  - `src/commands/openRuntimeReportPanelCommand.ts`
  - `src/extension.ts`
- Verification References:
  - `tests/unit/pickContainerImageVersionCommand.test.ts`
  - `tests/unit/openRuntimeReportPanelCommand.test.ts`
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the default resolution backward-compatible: an unset setting must
    preserve the prior pinned image for the current release.

### VHS-REQ-650: Selected Container Version Drives Both Providers With Fail-Closed Resolution

- Status: Active
- Parent: VHS-SYS-REQ-019
- Area: Runtime Discovery
- Statement: The comparison runtime locator shall consume the selected container
  image version for both the Windows-container and Linux-container providers and
  fail closed when a selected version cannot be launched rather than silently
  substituting a different version.
- Acceptance Criteria:
  - When `viHistorySuite.container.imageVersion` is set to a valid version for
    the active container platform, the locator resolves it to the concrete
    `nationalinstruments/labview:<tag>` reference and uses it for both the
    Windows-container and Linux-container providers; an explicit full-string
    `windowsContainerImage`/`linuxContainerImage` override still takes precedence.
  - With the setting unset, the locator resolves the prior platform default
    reference, preserving current behavior, and existing locator tests pass
    unchanged.
  - When a container image version is explicitly selected, a docker request for a
    host LabVIEW year other than the legacy default no longer resolves to
    `docker-provider-labview-version-not-implemented`; the selected image governs
    instead.
  - A selected version that cannot be acquired fails closed through the existing
    classified container-image acquisition path; an unparseable or wrong-platform
    setting value is rejected at the picker boundary before it is persisted.
  - When a selected version's platform conflicts with the active Docker container
    host mode (for example a `-linux` token while the engine runs Windows
    containers), the locator fails closed with the classified
    `container-image-platform-mismatch` blocked reason — reporting the selected
    image and naming both the active host mode and the two fixes (switch the
    Docker engine, or pick/clear the version) — instead of silently substituting
    the platform default. A full per-platform image override governs the active
    platform and suppresses the conflict.
  - The compare path makes the mismatch one-click recoverable rather than
    text-only: when a comparison is blocked with
    `container-image-platform-mismatch`, a concise warning toast frames the
    constraint — naming the selected image's container platform and the active
    Docker engine mode and steering to the two fixes (switch Docker's container
    mode, or pick a matching image version) without provider/rejected-provider
    internals or the misleading host-native clause — and offers a
    `Pick Image Version` action that opens
    `labviewViHistory.pickContainerImageVersion`. The blocked-evidence report is
    not auto-opened for this reason (the packet is still persisted and explicit
    `Export Comparison Report` still works), mirroring the concise Docker block
    toasts (VHS-REQ-642/643) and the host-conflict toasts (VHS-REQ-621/653,
    #532). The image-version picker surfaces a
    stale cross-platform persisted selection as a leading warning Clear row that
    names the stale tag and the active Docker platform instead of hiding it. The
    stale-selection flag fires only when the active platform is confirmed (an
    explicit override or a successful daemon probe); when the daemon mode is
    unknown (Docker stopped or the probe times out) no stale warning is shown, so
    a valid selection is never flagged against a host-OS guess.
  - The mismatch remediation is delivered through the concise warning toast and
    the `labviewViHistory.pickContainerImageVersion` command (palette and toast
    action); the minimized History panel does not render an in-panel
    Pick Image Version call-to-action or a compare-preflight section. After the
    picker completes, a subsequent Compare re-resolves the runtime, so a selection
    that clears the mismatch is honored without an in-panel preflight re-render.
- Agent Work Scope:
  - Thread `containerImageVersion` from settings into the locator's per-provider
    image resolution and bypass the legacy year pin when a version is selected;
    keep resolution pure and unit-tested. Do not change host-native selection.
  - Keep the remediation surfaces thin and pattern-consistent: the toast action
    reuses the existing blocked-runtime warning path, and the picker's stale-row
    detection stays in the pure `buildContainerImageVersionItems` helper.
- Implementation References:
  - `src/reporting/comparisonRuntimeLocator.ts`
  - `src/reporting/comparisonRuntimeDoctor.ts`
  - `src/reporting/comparisonReportAction.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `src/commands/pickContainerImageVersionCommand.ts`
- Verification References:
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/comparisonRuntimeDoctor.test.ts`
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/pickContainerImageVersionCommand.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Preserve the fail-closed runtime contract (VHS-SYS-REQ-007): a
    requested-but-missing runtime is always a classified block, never a silent
    substitution that would make report evidence ambiguous about which LabVIEW
    produced it.

### VHS-REQ-651: Chain Container Image Version Pick After Docker Provider Selection

- Status: Active
- Parent: VHS-SYS-REQ-019
- Area: Menu Gating
- Statement: The Runtime & Report Settings panel shall co-locate the LabVIEW
  container image version selector with the runtime provider selection, so a user
  who selects the container-based provider is offered the matching image version
  (VHS-REQ-649) inline in the same panel instead of through a chained quick-pick,
  the Command Palette, or the raw setting.
- Acceptance Criteria:
  - The panel renders a container image section only when Docker is the
    comparison runtime — the persisted `viHistorySuite.runtimeProvider` is
    `docker`, or it is unset and the active auto-detected provider is Docker —
    showing the current `viHistorySuite.container.imageVersion` selection (or the
    newest supported default when unset). The Docker provider option is labeled
    `Docker` with no LabVIEW version or bitness (VHS-REQ-657).
  - Selecting a discovered version persists it, and the Clear/default choice
    removes the setting, through `applyContainerImageVersionSelection` writing to
    `ConfigurationTarget.Global`.
  - Version discovery reuses the published and local image catalog behind injected
    fetch and list boundaries and degrades to the current selection without
    throwing when discovery is unavailable.
  - A `host` selection (including an auto-detected host runtime) and the Clear
    option present no container section (host comparisons use no container image).
  - The standalone `labviewViHistory.pickContainerImageVersion` command remains
    registered for the compare-preflight remediation CTAs but is removed from the
    Command Palette.
- Agent Work Scope:
  - Render and persist the container image selection inside the Runtime & Report
    Settings panel reusing the discovery and apply helpers; keep the standalone
    image picker for the in-app remediation CTAs. Do not change the image picker's
    discovery model or the locator.
- Implementation References:
  - `src/commands/openRuntimeReportPanelCommand.ts`
  - `src/ui/runtimeReportPanel.ts`
  - `src/commands/pickContainerImageVersionCommand.ts`
  - `src/extension.ts`
  - `package.json`
- Verification References:
  - `tests/unit/openRuntimeReportPanelCommand.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the container image selection co-located with the docker provider choice
    and discovery best-effort and bounded; never let an unavailable discovery or a
    cancelled selection throw out of the panel or clobber the persisted selection.

### VHS-REQ-641: Working-Tree (Uncommitted) Comparison Against a Prior Revision


- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: The extension shall let users compare the uncommitted working-tree
  version of a tracked LabVIEW VI against a prior committed revision, so changes
  can be reviewed before they are committed.
- Acceptance Criteria:
  - When the selected VI has uncommitted tracked changes, the history panel
    presents a selectable working-tree entry alongside the committed revisions,
    and a VI with at least one commit plus uncommitted changes is eligible even
    when it has fewer than two commits.
  - Selecting the working-tree entry together with any one committed revision
    compares the on-disk file bytes (newer side) against that selected revision
    (older side); both sides pass the VI signature preflight before the runtime
    is invoked.
  - The working-tree side resolves in-repo dependencies against the committed
    tree so the loose VI loads its siblings.
  - Working-tree comparisons are labeled as uncommitted; committed-pair
    behavior is unchanged. A working-tree comparison that produces a
    content-addressed snapshot identity is retained (see the retention-index
    criterion below) rather than discarded, and is surfaced in the dashboard as
    a non-reproducible uncommitted snapshot.
  - The working-tree comparison is read-only and never writes into the user's
    working directory, and the comparison-report webview keeps scripts disabled.
  - A working-tree comparison records the content-addressed identity of the
    compared uncommitted snapshot (a hash of the staged on-disk bytes) as
    provenance in the retained runtime diagnostic notes, so the evidence names
    which uncommitted content was compared; this is provenance only and does not
    add the comparison to the reproducible retained dashboard pair evidence.
  - A persisted per-VI working-tree snapshot retention index
    (`vi-history-suite/worktree-snapshot-index@v1`) provides a pure, I/O-free
    data model that records each retained working-tree comparison
    content-addressed by the staged on-disk bytes and applies a keep-last-N
    retention limit (a limit of 0 disables retention), de-duplicating a repeated
    comparison of unchanged content so it is idempotent while changed content
    yields a distinct entry, and fails closed when parsing a malformed index; it
    lets retained working-tree snapshots be enumerated independently of the
    commit list. When a working-tree comparison produces a content-addressed
    snapshot identity, it is archived under a content-addressed retained pair-ID,
    appended to that index, and surfaced in the dashboard as a non-reproducible
    "uncommitted snapshot" entry (re-running compares current on-disk bytes and
    may differ), while evicted snapshots beyond the retention limit have their
    retained archive directories garbage-collected; the retention limit is
    user-configurable through `viHistorySuite.comparison.worktreeSnapshotRetentionLimit`
    (default 5, 0 disables). A working-tree comparison that produced no snapshot
    identity (for example a blocked or daemon-down run that never staged bytes)
    stays unarchived.
- Agent Work Scope:
  - Change the eligibility model, panel working-tree selection row,
    preflight/runtime revision readers, and their tests together; use the
    reserved working-tree revision sentinel rather than overloading a commit hash.
- Implementation References:
  - `src/git/gitCli.ts`
  - `src/services/viHistoryModel.ts`
  - `src/reporting/comparisonReportPreflight.ts`
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonReportAction.ts`
  - `src/reporting/comparisonReportPacket.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `src/ui/historyPanel.ts`
  - `src/dashboard/worktreeSnapshotIndex.ts`
  - `src/dashboard/comparisonReportArchive.ts`
  - `src/dashboard/multiReportDashboard.ts`
  - `package.json`
- Verification References:
  - `tests/unit/gitCli.test.ts`
  - `tests/unit/viHistoryModel.test.ts`
  - `tests/unit/comparisonReportPreflight.test.ts`
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/worktreeSnapshotIndex.test.ts`
  - `tests/unit/comparisonReportArchive.test.ts`
  - `tests/unit/multiReportDashboard.test.ts`
- Change Guidance:
  - Keep the working-tree side read-only (never write to the user's working
    directory). Working-tree comparisons are retained only when a
    content-addressed snapshot identity is available, under a content-addressed
    pair-ID and a bounded keep-last-N index; do not weaken the committed
    two-revision flow.

### VHS-REQ-638: Comparison Report VI History Re-Entry Action

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: The extension shall provide a comparison-report title-bar action
  that re-opens VI History for the report's source LabVIEW VI, so users can
  return to the history panel after a comparison without depending on the
  active editor resource.
- Acceptance Criteria:
  - A `VI History` action is available from the comparison-report panel title
    bar while a comparison-report webview panel is the active panel.
  - The action re-opens VI History for the source VI of the displayed report by
    delegating to `labviewViHistory.open`, so trust, Git, and LabVIEW
    prerequisite gates continue to apply.
  - When the source VI path cannot be resolved, the action shows an actionable
    warning instead of failing silently.
  - Opening a comparison report places it beside the VI History panel so the
    history panel remains visible.
- Agent Work Scope:
  - Change the export source shape, panel registration, command registration,
    manifest contributions, and their tests together.
- Implementation References:
  - `src/reporting/comparisonReportAction.ts`
  - `src/reporting/comparisonReportExport.ts`
  - `src/extension.ts`
  - `package.json`
- Verification References:
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/unit/packageManifest.test.ts`
- Change Guidance:
  - The re-entry action must reuse `labviewViHistory.open` rather than
    duplicating prerequisite gating, and must not run comparison execution.

### VHS-REQ-642: Docker Daemon Not Running Comparison Toast

- Status: Active
- Parent: VHS-SYS-REQ-007
- Area: Comparison Reports
- Statement: When a comparison is blocked because the Docker daemon is not
  reachable (the daemon is explicitly unreachable and the Docker CLI is not
  confirmed absent), the extension shall suppress the full diagnostics report
  webview and instead show a concise, actionable notification offering Retry and
  Show diagnostics, so users can start the platform's Docker surface and rerun
  without parsing the diagnostics packet.
- Acceptance Criteria:
  - `isDockerDaemonNotRunningBlock(facts)` returns true only when
    `reportStatus === 'blocked-runtime'`, `blockedReason` is one of
    `docker-provider-unavailable`, `docker-only-provider-unavailable`, or
    `auto-docker-installed-provider-unavailable`, `dockerDaemonReachable ===
    false`, and `dockerCliAvailable !== false` (i.e. the CLI is not confirmed
    absent — `true` or `undefined`). The `!== false` CLI check mirrors the
    doctor next-action partition in `deriveContainerRecoveryAction`
    (`dockerCliAvailable === false` steers to "install Docker"; any other state
    with an unreachable daemon steers to "start Docker Desktop"), so the concise
    toast fires in exactly the cases the diagnostics classify as daemon-down,
    including the real-world `dockerCliAvailable === undefined` shape. The daemon
    side stays strict: a `dockerDaemonReachable === undefined` (unknown daemon
    state) returns false. Docker-not-installed (`dockerCliAvailable === false`),
    a reachable daemon, image-acquisition failures, bitness or VI-Server blocks,
    and preflight blocks all return false.
  - `ComparisonReportActionResult` carries `dockerCliAvailable`,
    `dockerDaemonReachable`, and the selected runtime `platform` (sourced from
    the runtime selection with the `windowsContainer*` fallback for the Docker
    facts) and, on a daemon-down block, the outcome
    `blocked-docker-daemon-not-running`.
  - On that outcome the comparison-report action does not create the report
    webview panel; the blocked packet is still persisted (and archived for
    committed pairs) so the full diagnostics remain reachable on demand. The
    webview is suppressed unless archiving genuinely FAILED
    (`archiveFailureReason === 'retained-archive-write-failed'`); on a real
    archive write failure the action falls through to open the webview directly
    so the user is never left without a diagnostics surface. A working-tree
    comparison that is not archived because a blocked/daemon-down run produced no
    content-addressed snapshot identity (VHS-REQ-641,
    `archiveFailureReason === 'retained-archive-unavailable'`,
    `retainedArchiveAvailable === false`) is still suppressed — the guard keys on
    the genuine write-failure reason, not on `retainedArchiveAvailable`, so a
    daemon-down working-tree compare no longer leaks an auto-opened report tab.
  - The comparison-report command shows a single warning notification whose copy
    is built by `buildDockerDaemonNotRunningMessage(platform)` and names the
    platform-appropriate recovery surface (Docker Desktop on `win32`, the Docker
    daemon otherwise), with a `Retry` action that re-runs the same comparison
    for the same revision pair and a `Show diagnostics` action that opens the
    retained comparison packet. The verbose
    `buildComparisonRuntimeWarningMessage` notification is not shown for this
    outcome.
  - All other blocked and failed reasons retain their existing webview and
    diagnostics surfaces unchanged.
- Agent Work Scope:
  - Add the pure `isDockerDaemonNotRunningBlock` predicate and
    `buildDockerDaemonNotRunningMessage` copy builder, and surface the Docker
    facts plus the selected `platform` and the new outcome on the action result
    in `comparisonReportAction.ts`; gate the panel open on the predicate and on
    archive success. Branch the toast in `openViHistoryCommand.ts` ahead of the
    existing warning and information notification paths. Keep the decision and
    copy window-free and unit-tested.
- Implementation References:
  - `src/reporting/comparisonReportAction.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `src/ui/historyPanelTracker.ts`
- Verification References:
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Scope strictly to the daemon-down case; never suppress diagnostics for
    image-acquisition, connection (`-350000`), bitness, or VI-Server failures.
    Detection of the Docker facts stays in the locator (VHS-REQ-155); this
    requirement owns only the suppression gate and toast copy.

### VHS-REQ-643: Docker Not Installed Comparison Toast

- Status: Active
- Parent: VHS-SYS-REQ-007
- Area: Comparison Reports
- Statement: When a comparison is blocked solely because Docker is not installed
  (Docker CLI absent), the extension shall suppress the full diagnostics report
  webview and instead show a concise, actionable notification offering Install
  Docker and Show diagnostics, the sibling of the VHS-REQ-642 daemon-down toast
  for the not-installed case.
- Acceptance Criteria:
  - `isDockerNotInstalledBlock(facts)` returns true only when
    `reportStatus === 'blocked-runtime'`, `blockedReason` is one of
    `docker-provider-unavailable`, `docker-only-provider-unavailable`, or
    `auto-docker-installed-provider-unavailable`, and
    `dockerCliAvailable === false`. The daemon-down case
    (`dockerCliAvailable !== false`), other blocks, preflight blocks, and absent
    facts all return false. The predicate is mutually exclusive with
    `isDockerDaemonNotRunningBlock` on `dockerCliAvailable`.
  - `ComparisonReportActionResult` gains the outcome
    `blocked-docker-not-installed` for a not-installed block; the
    `dockerCliAvailable` / `dockerDaemonReachable` / `platform` facts authored
    for VHS-REQ-642 are reused.
  - On that outcome the comparison-report action does not create the report
    webview panel; the webview is suppressed unless archiving genuinely FAILED
    (`archiveFailureReason === 'retained-archive-write-failed'`), in which case
    it falls through to open the webview directly so diagnostics are never lost
    (parity with the VHS-REQ-642 archive-failure fallback). A working-tree
    comparison not archived because a blocked/daemon-down run produced no
    content-addressed snapshot identity (VHS-REQ-641,
    `retained-archive-unavailable`) is still suppressed.
  - The comparison-report command shows a single warning notification whose copy
    is built by `buildDockerNotInstalledMessage(platform)` and names the
    platform-appropriate target (Docker Desktop on `win32`, Docker otherwise),
    with an `Install Docker` action that opens `INSTALL_DOCKER_URL` via
    `vscode.env.openExternal` and a `Show diagnostics` action that opens the
    retained comparison packet. The verbose
    `buildComparisonRuntimeWarningMessage` notification is not shown for this
    outcome.
  - No automatic Docker install or process launch occurs; the action only offers
    an external link, mirroring the LabVIEW and Git install offers. All other
    blocked and failed reasons (including the VHS-REQ-642 daemon-down case)
    retain their existing surfaces unchanged.
- Agent Work Scope:
  - Add the pure `isDockerNotInstalledBlock` predicate and
    `buildDockerNotInstalledMessage` copy builder and the new outcome on the
    action result in `comparisonReportAction.ts`; gate the panel open on the
    predicate and on archive success. Branch the toast in
    `openViHistoryCommand.ts` ahead of the existing warning path, reusing
    `INSTALL_DOCKER_URL` from `runtimeAvailabilityNotice.ts`. Keep the decision
    and copy window-free and unit-tested.
- Implementation References:
  - `src/reporting/comparisonReportAction.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `src/ui/historyPanelTracker.ts`
- Verification References:
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Scope strictly to the not-installed case; never suppress diagnostics for
    image-acquisition, connection (`-350000`), bitness, or VI-Server failures.
    Detection of the Docker facts stays in the locator (VHS-REQ-155) and the
    install URL stays single-sourced in `runtimeAvailabilityNotice.ts`; this
    requirement owns only the suppression gate, toast copy, and install action.

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
  - `tests/unit/comparisonReportAction.test.ts`
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
  - Windows host-native `labview-cli` comparisons retry exactly once when the
    first attempt fails with the cold-launch `labview-cli-connection-failed`
    (`-350000`) VI Server connect race, reusing the port derived from the
    selected install's `LabVIEW.ini` (`-PortNumber`) against the now-resident
    LabVIEW without closing it first. The windows-container (in-script) and
    Linux retry paths keep their existing behavior.
- Agent Work Scope:
  - Change execution result shape, packet rendering, and runtime tests together.
- Implementation References:
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonReportPacket.ts`
  - `src/reporting/comparisonReportExecutionPlan.ts`
  - `src/reporting/comparisonReportAction.ts`
  - `src/reporting/comparisonRuntimeDoctor.ts`
  - `src/reporting/diagnostics/diagnosticsRecorder.ts`
  - `src/reporting/runtime/labviewCliIni.ts`
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/comparisonReportPacket.test.ts`
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/comparisonRuntimeDoctor.test.ts`
  - `tests/unit/diagnosticsRecorder.test.ts`
  - `tests/unit/labviewCliIni.test.ts`
  - `tests/unit/windowsContainerLabviewCliScript.test.ts`
  - `tests/unit/linuxContainerLabviewCliScript.test.ts`
- Change Guidance:
  - Treat external tool execution as evidence-producing, not inherently
    trustworthy.

### VHS-REQ-156: Linux Host-Native Headless Comparison Invocation

- Status: Active
- Parent: VHS-SYS-REQ-007
- Area: Comparison Reports
- Statement: When the active runtime selection is host-native LabVIEW CLI on
  Linux, the comparison execution path shall provide opt-in headless invocation
  and actionable headless-failure classification by keeping the invocation
  non-headless by default, passing `-Headless` only when the operator explicitly
  opts in via `LV_RTE_LINUX_HEADLESS=1`, and recognizing a broken
  `HeadlessManager` (LabVIEW logs `Failed to initialize headless LabVIEW.`) plus
  the `(Hex 0x8) File permission error.` + `CreateComparisonReport operation
  failed.` stderr signature instead of allowing an unbounded stall.
- Acceptance Criteria:
  - Linux host-native LabVIEWCLI args do not include `-Headless` unless
    `LV_RTE_LINUX_HEADLESS=1` is set in the extension host environment.
  - The Linux container provider continues to invoke LabVIEWCLI with
    `-Headless` regardless of the env var.
  - Windows host-native invocations remain unchanged unless
    `LV_RTE_HEADLESS=1` or an explicit headless request is present.
  - Headless-log scanning emits `linux-headless-init-failed` when
    `Failed to initialize headless LabVIEW.` is observed.
  - Stderr classification recognizes the LabVIEW error 8 /
    `CreateComparisonReport operation failed.` failure with reason
    `labview-cli-create-report-permission-error`.
  - Either Linux headless reason (`linux-headless-init-failed` or
    `linux-headless-recursive-load`) wins over more general stderr or
    LabVIEW CLI diagnostic-log reasons; only `linux-headless-recursive-load`
    triggers the headless-session-reset retry, so init-failed runs do not
    waste a second attempt.
  - Before launching LabVIEWCLI, Linux host-native `labview-cli` runs read
    the active `labview.conf` (searched under
    `~/natinst/.config/LabVIEW-<version>/`,
    `~/.config/natinst/LabVIEW-<version>/`, and
    `/etc/natinst/LabVIEW-<version>/`) and block execution with
    `blockedReason: 'linux-vi-server-tcp-disabled'` when
    `server.tcp.enabled=False`, when the key is absent in a readable
    config, or when no candidate config is readable at all (NI Linux
    defaults VI Server TCP off, so the surface cannot be confirmed
    enabled). When the runtime selection does not carry an explicit
    `requestedLabviewVersion`, the year is inferred from the resolved
    `labviewExe` directory segment (e.g. `LabVIEW-2026-64`) so the preflight
    can still locate the config. The `lvcompare` engine is exempt from this
    preflight because it does not connect to LabVIEW VI Server. When TCP is
    enabled, the resolved `server.tcp.port` (default `3363`) is passed to
    LabVIEWCLI as `-PortNumber`.
  - Linux host-native runs mirror the staged VI inputs and report output
    under a short tmpdir (default `${os.tmpdir()}/vi-history-suite-runtime`,
    overridable via `LVIE_LINUX_RUNTIME_TMPDIR`, opt-out via
    `LVIE_LINUX_DISABLE_RUNTIME_TMPDIR=1`) before invoking LabVIEWCLI. The
    "already inside the tmp root" guard uses an exact directory boundary
    match so similarly-prefixed paths (e.g. `/tmp/foo` vs `/tmp/foo-old`)
    do not falsely disable the workaround. The
    rewritten command targets the tmp paths; on success the produced
    report and any sibling assets are copied back to the canonical
    `reportFilePath`. The tmp directory is removed after every run
    (success or failure). This works around a LabVIEW 2026 (26.1.1f1)
    Linux path-table corruption that surfaces as
    `Possible path leak, unable to purge elements of base #0` followed by
    `(Hex 0x8) File permission error.` when staged inputs live under
    deep, dot-prefixed paths such as
    `~/.config/Code/User/workspaceStorage/...`.
  - Copying the generated report and its sibling `<report>_files` asset
    tree back to the canonical `reportFilePath` is resilient to the
    read-only directories LabVIEW emits (for example the `support/`
    folder): a prior run's destination is removed by normalizing
    permissions (`chmod`) and retrying on `EACCES`/`EPERM` rather than
    relying on force-overwrite, and the freshly copied tree is normalized
    to owner-writable so subsequent runs can replace it. When the report
    command itself succeeds but this copy-back step fails, the runtime
    surfaces the distinct `failureReason: 'report-finalize-failed'` (with a
    diagnostic note naming the copy failure) instead of misclassifying it
    as `command-spawn-failed`. When the copy-back still cannot clear the
    destination after the permission reset (an `EPERM`/`EACCES` typically
    caused by a prior containerized run leaving root-owned files), the
    diagnostic note explains the cross-ownership cause and includes the
    exact `rm -rf` (prefix with `sudo`) remediation.
  - Linux containerized comparisons isolate their root-owned output in a
    dedicated `container-out/` subdirectory of the report directory instead
    of the shared retained report path. LabVIEW runs as root inside the
    container, so its generated report, `<report>_files`, and
    `container-temp` artifacts are confined to `container-out/`; the host
    copies the finished report back into the canonical `reportFilePath` as
    the invoking user, keeping the retained host-native report path
    user-owned and immune to cross-ownership collisions from prior
    container runs.
- Agent Work Scope:
  - Change the execution plan, runtime classification, and unit tests
    together; update troubleshooting notes when surfacing new symptoms.
- Implementation References:
  - `src/reporting/comparisonReportExecutionPlan.ts`
  - `src/reporting/comparisonReportRuntimeExecution.ts`
- Verification References:
  - `tests/unit/comparisonReportExecutionPlan.test.ts`
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
- Change Guidance:
  - Keep the headless decision inside the plan so runtime evidence reflects
    the actual args used. Do not silently force `-Headless` on Linux
    host-native; LabVIEW 2026 26.1.1f1 hangs in headless mode, while the
    non-headless path succeeds when VI Server TCP/IP is enabled
    (default port 3363).

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
  typecheck, traceability audit, documentation link check, unit tests, and
  package sanity.
- Acceptance Criteria:
  - The workflow runs `npm ci`.
  - The workflow runs `npm run check`.
  - The workflow runs `npm run traceability:audit`.
  - The workflow runs `npm run docs:links` through the `Docs Link Check /
    lychee` step.
  - The documentation link check scans committed Markdown and bundled
    documentation surfaces while excluding generated validation, cache,
    coverage, package, release-evidence, and Vagrant evidence directories.
  - The workflow runs `npm test`.
  - The workflow retains `coverage/cobertura-coverage.xml` and
    `coverage/coverage-summary.json` as PR coverage evidence.
  - The workflow enforces the baseline global coverage thresholds declared in
    `vitest.config.ts`: 80% statements, 70% branches, 84% functions, and
    80% lines after the coverage-led assurance wave.
  - The workflow runs `npm run package`.
  - The workflow runs `npm run dod:gate` through the `DoD Gate / dod` step
    after `npm run package`.
  - The workflow runs on `main`, `develop`, `feature/**`, `release/**`, and
    `hotfix/**` branch pushes.
  - Pull request branch governance is enforced inside the required
    `Build, Test, Package` job.
  - A parallel `Windows Unit Tests` job runs `npm ci`, `npm run check`, and
    `npm test` on `windows-latest` so platform-specific unit regressions fail
    closed in CI without promoting the heavier Windows/LabVIEW integration path
    to a required gate.
  - A parallel `Integration Host (Linux)` job runs the LabVIEW-free VS Code
    extension-host suite via `npm run test:integration:linux` on
    `ubuntu-24.04`, exercising activation, eligibility indexing, command
    registration, panel render, and the runtime-settings CLI so command-layer
    regressions fail closed; it requires no LabVIEW, Docker, or real compare and
    does not collect coverage (it runs in Electron, outside the vitest run).
- Agent Work Scope:
  - Change workflow commands and test plan together.
- Implementation References:
  - `.github/workflows/ci.yml`
  - `docs/testing/test-plan.md`
  - `scripts/checkDocsLinks.js`
  - `vitest.config.ts`
- Verification References:
  - `tests/unit/branchGovernanceWorkflow.test.ts`
  - `tests/unit/docsLinkCheckScript.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
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
  - The workflow runs a prerequisite doctor
    (`scripts/checkMaintainerRunnerPrerequisites.js`) as a fail-fast gate after
    checkout and before install, which reports every missing host prerequisite
    (VS Code, LabVIEW, LabVIEW CLI, Node, npm, Git) at once with remediation and
    exits non-zero when any required prerequisite is absent. The doctor also runs
    an advisory system-clock-skew preflight that warns (without failing unless
    `--fail-on-clock-skew` is passed) when the host clock differs from an
    authoritative network time source beyond a tolerance, and degrades to an
    advisory `unknown` when that source is unreachable, so the dual-boot
    clock-skew trap that silently knocks the runner offline with a misleading
    GitHub "registration has been deleted" error is surfaced. The same script is
    runnable directly on the runner for self-service readiness validation
    without dispatching the trusted-ref-gated workflow. The native-Windows
    integration host additionally fails fast with actionable remediation when
    VS Code is not installed, rather than dying with an opaque
    `CommandNotFoundException`.
- Agent Work Scope:
  - Change workflow YAML, maintainer operations docs, and static workflow tests
    together.
- Implementation References:
  - `.github/workflows/windows-labview-maintainer.yml`
  - `scripts/checkMaintainerRunnerPrerequisites.js`
  - `src/tooling/integrationHostRuntime.ts`
  - `docs/maintainer-operations.md`
- Verification References:
  - `tests/unit/windowsLabviewMaintainerWorkflow.test.ts`
  - `tests/unit/checkMaintainerRunnerPrerequisites.test.ts`
  - `tests/unit/integrationHostRuntime.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:trusted-windows-labview-runner-dispatch`
- Change Guidance:
  - Do not run self-hosted validation on arbitrary pull request code.

### VHS-REQ-652: Trusted Linux/LabVIEW Maintainer Workflow

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: CI And Developer Environment
- Statement: The Linux/LabVIEW maintainer workflow shall be manual-only,
  read-only, trusted-ref-only, and run on a runner labeled
  `vihs-linux-labview-maintainer`.
- Acceptance Criteria:
  - The workflow triggers only through `workflow_dispatch`.
  - The workflow grants read-only repository contents permission.
  - The workflow fails closed unless the ref is `main`, `release/vX.Y.Z`, or an
    exact `vX.Y.Z` tag.
  - The environment evidence summary includes ref, SHA, runner context, Node/npm
    versions, VSIX evidence path, and whether the Linux LabVIEW CLI was detected.
  - The trusted-ref decision is visible in workflow output or artifact text.
  - The workflow runs the Linux integration host and uploads a VSIX and
    environment evidence summary artifact.
  - The workflow runs a prerequisite doctor
    (`scripts/checkMaintainerRunnerPrerequisites.js`) as a fail-fast gate after
    checkout and before install, which reports every missing host prerequisite
    (VS Code, LabVIEW, LabVIEW CLI, Node, npm, Git) at once with remediation and
    exits non-zero when any required prerequisite is absent. The doctor also runs
    an advisory system-clock-skew preflight that warns (without failing unless
    `--fail-on-clock-skew` is passed) when the host clock differs from an
    authoritative network time source beyond a tolerance, and degrades to an
    advisory `unknown` when that source is unreachable. The same script is
    runnable directly on the runner for self-service readiness validation
    without dispatching the trusted-ref-gated workflow.
- Agent Work Scope:
  - Change workflow YAML, maintainer operations docs, and static workflow tests
    together. Keep the Linux workflow a faithful twin of the Windows maintainer
    workflow (VHS-REQ-598) on a separate self-hosted runner label.
- Implementation References:
  - `.github/workflows/linux-labview-maintainer.yml`
  - `scripts/checkMaintainerRunnerPrerequisites.js`
  - `docs/maintainer-operations.md`
- Verification References:
  - `tests/unit/linuxLabviewMaintainerWorkflow.test.ts`
  - `tests/unit/checkMaintainerRunnerPrerequisites.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:trusted-linux-labview-runner-dispatch`
- Change Guidance:
  - Do not run self-hosted validation on arbitrary pull request code.

### VHS-REQ-599: Optional Vagrant Helper

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: CI And Developer Environment
- Statement: Vagrant shall remain an optional, human-run local validation helper
  that hosted CI never requires and that is never wired into
  `.github/workflows`. The mandatory local release attestation the Vagrant lane
  produces is governed separately by VHS-REQ-666; Vagrant itself imposes no
  hosted-CI hypervisor dependency.
- Acceptance Criteria:
  - Vagrant documentation states its CI-independent role and its
    release-attestation relationship to VHS-REQ-666.
  - `npm run vagrant:validate` remains available.
  - Hosted CI does not require a Vagrant or hypervisor install.
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
  - Keep Vagrant useful for humans and free of any hosted-CI hypervisor
    dependency; the release gate it feeds (VHS-REQ-666) is enforced by reading a
    committed ledger, never by invoking Vagrant inside `.github/workflows`.

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
  - The requirement-target issue template defines a decision-complete
    requirement-target issue payload (requirement ID, files to inspect,
    acceptance criteria, validation commands, out-of-scope boundaries, and
    requirement/RTM update expectations) before implementation starts.
  - The requirement-target issue template includes an optional bounded
    Copilot prompt field that can be used without replacing the required issue
    contract fields.
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
  - CI fails when any requirements CSV row (rtm.csv, id-index.csv, or
    traceability-inventory.csv) does not match its header column count, and the
    check prints the enforced contract and the validated requirement IDs to the
    run summary so they are front-facing on every pull request.
  - CI fails when a requirements cross-reference is broken: an Active id-index
    anchor that does not resolve to its specification heading, an RTM ParentID
    that is not an Active system requirement, a traceability-inventory Path that
    does not exist on disk, an id-index ReplacementID that does not resolve, an
    SRS block whose Implementation or Verification References disagree with the
    RTM evidence map, an Active system requirement whose Verification References
    are absent or do not resolve on disk, or an Active requirement that declares
    no Verification Reference.
  - A requirement verification-linkage report lists Active requirements whose
    verification-reference tests do not cite the requirement ID (advisory; the
    RTM remains the authoritative requirement-to-test linkage).
  - CI fails when an Active requirement's verification-reference tests do not
    cite the requirement ID, enforced by running the verification-linkage guard
    in `--enforce` mode; the default report remains advisory.
  - A requirement acceptance-criteria inventory assigns each Active
    requirement's criteria a positional `VHS-REQ-NNN.M` id and reports which are
    cited at the criterion level by a verification-reference test (advisory; the
    positional ids are derived from srs.md bullet order, not annotated in it).
  - A unified requirement verification-health report aggregates structural
    integrity, requirement linkage, criterion citation, coverage risk, and
    mutation score into a single advisory per-requirement signal.
  - The unified report supports a strict mode that exits non-zero when a
    requirement is unlinked, structural integrity fails, a criterion lacks its
    `VHS-REQ-NNN.M` citation, or a requirement-mapped file is below the coverage
    risk threshold.
  - A committed traceability inventory defines classifications for mapped,
    supporting, dev-only, release-ci, asset-doc, and gap surfaces.
  - A repeatable local audit command reports unmapped implementation candidates,
    unmapped test candidates, and missing RTM references.
  - The current baseline is captured without immediately failing CI for
    historical unmapped files (gap entries are informational).
  - The guard is designed so a later PR can fail closed on newly added
    unclassified implementation files.
  - Documentation tells agents how to respond when touched code is unmapped.
  - A closeout evidence command generates GitHub-ready umbrella issue summaries
    with mandatory standards evidence.
  - Closeout evidence supports host Python and Docker assurance-workbench
    standards runners, defaults Docker mode to the published GitLab registry
    workbench image, and fails closed when neither can produce evidence.
  - Closeout evidence verifies `repo-standards-review` toolchain provenance by
    checking the GitLab source, private GitHub mirror, expected release tag,
    local non-authoritative skill cache, and published Docker registry image.
  - Closeout evidence reports Definition-of-Done status as explicit `PASS`,
    `N/A`, or `FAIL`, and a DoD `PASS` requires scanner-visible workflow
    evidence instead of generated evidence directories, generated build output,
    docs-only references, or unit-test fixture strings.
  - Closeout summaries treat Definition-of-Done evidence as active closeout
    evidence and separate any unresolved findings into blocking follow-up
    issues.
  - A versioned requirements manifest is generated under `out/requirements/` at
    build time, stamped with the extension version, commit, and a stable
    content digest, so the packaged VSIX ships the exact active requirements it
    was built from and a future consumer can detect requirements drift between
    shipped versions.
  - A ranked risk-ledger aggregator combines coverage, requirement-health, and
    optional standards signals into one advisory ledger with a single
    selectable next target, parking platform-proof risk that cannot be executed
    on the host as a non-selectable awareness list.
  - The risk ledger surfaces real-runtime validation freshness from a committed
    runtime-validation ledger that records each Linux-executable
    comparison-runtime track's last-validated build version, and any track not
    validated at the current build version is ranked as a selectable
    re-validation risk.
  - A committed helper records a comparison-runtime track's validation for a
    build version into the runtime-validation ledger and fails closed on an
    unknown track or a malformed version.
- Agent Work Scope:
  - Change requirements docs, GitHub issue templates, and the coherence test
    together.
  - Change traceability inventory and audit script together with RTM updates.
  - Change closeout evidence automation, standards runner docs, and closeout
    tests together.
- Implementation References:
  - `docs/requirements/README.md`
  - `docs/requirements/copilot-web-issue-generation-prompt.md`
  - `docs/requirements/syrs.md`
  - `docs/requirements/srs.md`
  - `docs/requirements/rtm.csv`
  - `docs/requirements/id-index.csv`
  - `docs/requirements/traceability-inventory.csv`
  - `scripts/auditTraceabilitySteward.js`
  - `scripts/checkRequirementsCsvColumns.js`
  - `scripts/checkRequirementsIntegrity.js`
  - `scripts/generateCloseoutEvidence.js`
  - `scripts/auditRequirementVerificationLinkage.js`
  - `scripts/auditRequirementCriteriaInventory.js`
  - `scripts/verifyRequirementsHealth.js`
  - `scripts/exportRequirementsManifest.js`
  - `scripts/buildRiskLedger.js`
  - `docs/requirements/runtime-validation-ledger.json`
  - `scripts/recordRuntimeValidation.js`
  - `.github/ISSUE_TEMPLATE/requirement_target.yml`
- Verification References:
  - `tests/unit/requirementsDocs.test.ts`
  - `tests/unit/traceabilityAuditScript.test.ts`
  - `tests/unit/requirementsCsvColumns.test.ts`
  - `tests/unit/requirementsIntegrity.test.ts`
  - `tests/unit/closeoutEvidenceScript.test.ts`
  - `tests/unit/requirementVerificationLinkage.test.ts`
  - `tests/unit/requirementCriteriaInventory.test.ts`
  - `tests/unit/verifyRequirementsHealth.test.ts`
  - `tests/unit/requirementsManifestExport.test.ts`
  - `tests/unit/riskLedgerScript.test.ts`
  - `tests/unit/schemaEnvelopeLib.test.ts`
  - `tests/unit/outputContractLib.test.ts`
  - `tests/unit/recordRuntimeValidationScript.test.ts`
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
  updates and security-analysis coverage reviewable by preserving package-audit
  diagnostics for failed VSIX runtime-surface checks and running CodeQL security
  analysis on main, develop, pull requests, weekly schedule, and manual dispatch.
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

### VHS-REQ-607: Field Intake Separation For Eligibility Reports

- Status: Active
- Parent: VHS-SYS-REQ-014
- Area: Requirements
- Statement: Public issue intake shall collect selected-file eligibility and Git
  history evidence separately from runtime validation output so maintainers can
  route history-opening reports without confusing them with comparison-runtime
  setup failures.
- Acceptance Criteria:
  - Bug and onboarding feedback templates collect affected surface, selected
    file path, tracking status when known, commit count or ineligibility
    message when available, and concise Git/history output separately from
    runtime validation output.
  - Runtime validation output fields request `vihs --validate` or comparison
    runtime output without implying those facts are selected-file eligibility
    causes.
  - Intake copy includes no-secrets guidance for logs, diagnostics, paths, and
    runtime output.
  - Eligibility or Git history reports can be submitted without requiring
    LabVIEWCLI validation output.
  - Runtime-only reports can be submitted without requiring indexing cache
    evidence or repository-wide VI counts.
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
  - Maintainers may optionally create a unique immutable diagnostic prerelease
    asset for reporter retesting.
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
  publish Marketplace releases only from exact release tags on `main` via a
  manual maintainer dispatch with no automatic trigger.
- Acceptance Criteria:
  - Hosted CI admits pull requests to `main` only from `release/vX.Y.Z` or
    `hotfix/vX.Y.Z` branches.
  - Hosted CI admits pull requests to `develop` from `feature/*`,
    `release/vX.Y.Z`, `hotfix/vX.Y.Z`, or `main` back-sync
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
  - Marketplace publication is idempotent: a pre-publish check inspects the
    live Marketplace listing for the target version and skips
    `Publish To Marketplace` when the version is already published, so a
    rerun of a previously failed verifier step never re-attempts publish and
    never aborts on `Version already exists`.
  - Marketplace listing verification retries bounded propagation lag (at
    least 20 attempts at 30s = 10 minutes) and retains
    the final `vsce show` evidence plus bounded retry-attempt evidence.
  - Release evidence is uploaded even when listing verification times out,
    so propagation lag never erases the release-evidence artifact (the
    upload step runs with `if: always()`).
  - Retained release evidence names required validation and retained artifacts
    for release closeout, including traceability audit, docs link check, tests,
    package validation, Marketplace listing evidence, and closeout expectation.
  - The CM plan records release baselines, branch-governed change control,
    status-accounting evidence, user-information review triggers, and the
    documentation-workbench support status without replacing the maintainer
    operations runbook.
  - Release evidence is retained as a workflow artifact.
  - The Marketplace release workflow has no automatic trigger: it runs only
    from a manual maintainer `workflow_dispatch` on an exact `vX.Y.Z` tag ref
    (dispatch on the tag preserves the exact-tag, package-version, and
    `origin/main` reachability guards), and agents must never dispatch or
    approve it.
- Agent Work Scope:
  - Change branch-governance workflow logic, Marketplace release workflow YAML,
    maintainer operations docs, requirements, and static tests together.
- Implementation References:
  - `.github/workflows/ci.yml`
  - `.github/workflows/marketplace-release.yml`
  - `.github/dependabot.yml`
  - `docs/maintainer-operations.md`
  - `docs/cm/cm-plan.md`
  - `docs/testing/test-plan.md`
  - `scripts/verifyMarketplaceListing.js`
- Verification References:
  - `tests/unit/branchGovernanceWorkflow.test.ts`
  - `tests/unit/marketplaceReleaseWorkflow.test.ts`
  - `tests/unit/marketplaceListingVerification.test.ts`
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
  - `tests/unit/comparisonReportArchive.test.ts`
  - `tests/unit/dashboardLatestRun.test.ts`
  - `tests/unit/multiReportDashboard.test.ts`
  - `tests/unit/multiReportDashboardAction.test.ts`
  - `tests/unit/retainedDashboardEvidence.test.ts`
  - `tests/unit/reviewDecisionRecord.test.ts`
  - `tests/unit/reviewScenarioSupportPolicy.test.ts`
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
    for overview, user workflow, install/release, comparison/dashboard review,
    and Copilot agent-mode guidance.
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
  - `resources/bundled-docs/pages/copilot-agent-mode.html`
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

### VHS-REQ-612: Installed Runtime Settings CLI Preparation

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: The extension shall keep installed runtime settings CLI preparation
  available through `labviewViHistory.prepareLocalRuntimeSettingsCli` while
  auto-materializing the local `vihs` launcher on every activation and surfacing
  preparation failures, including stale-launcher recovery, as actionable outcomes
  so users do not need to rerun the prepare command after install or upgrade.
- Acceptance Criteria:
  - The extension manifest contributes
    `labviewViHistory.prepareLocalRuntimeSettingsCli` and activates on
    `onStartupFinished` plus that command.
  - Activation calls `admitLocalRuntimeSettingsCliToTerminalPath` idempotently
    so the bare `vihs` terminal entrypoint always points at the currently
    installed extension build.
  - Command registration routes manual preparation through the same admission
    helper, returns `prepared-local-runtime-settings-cli` with
    launcher/settings-target contract fields, and surfaces an actionable
    success message.
  - When extension global storage is unavailable, the command reports
    `missing-global-storage-uri` and a user-facing warning that preparation
    could not proceed.
  - Preparation remains admitted in untrusted workspaces as a low-risk local
    materialization path while compare execution remains blocked there.
  - The generated `vihs` JavaScript launcher self-heals when its stamped
    module path is missing by scanning the per-user VS Code extension roots
    for any installed `svelderrainruiz.vi-history-suite-*` build.
- Agent Work Scope:
  - Change command exposure evidence, requirement mapping, and verification
    references together without changing runtime provider selection behavior.
- Implementation References:
  - `package.json`
  - `src/extension.ts`
  - `src/tooling/localRuntimeSettingsCli.ts`
- Verification References:
  - `tests/unit/localRuntimeSettingsCli.test.ts`
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/integration/suite/extensionHost.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep this requirement focused on installed CLI preparation, activation
    auto-materialization, and launcher self-healing; do not change runtime
    selection semantics here. Selection seed-or-repair and missing-runtime UX
    are owned by VHS-REQ-616 and VHS-REQ-617 respectively.

### VHS-REQ-613: Coverage Intelligence And Test-Risk Mapping

- Status: Active
- Parent: VHS-SYS-REQ-017
- Area: CI And Developer Environment
- Statement: The repository shall provide a coverage intelligence command that
  maps Vitest coverage evidence to the traceability inventory and RTM
  requirements so low-coverage product risk is visible before coverage floor
  ratchets.
- Acceptance Criteria:
  - `npm run coverage:map` reads `coverage/coverage-summary.json`,
    `docs/requirements/traceability-inventory.csv`, and
    `docs/requirements/rtm.csv`.
  - The report highlights requirement-mapped files below 50% coverage by
    requirement, classification, missing lines, missing branches, and missing
    functions.
  - The report highlights zero-coverage supporting files tied to active
    requirements.
  - `npm run coverage:map:enforce` fails closed when a requirement-mapped file
    is below the risk threshold or a supporting file tied to a requirement has
    zero coverage; the hosted CI coverage-risk gate runs it after `npm test`.
  - Coverage measurement instruments the product `src` tree and the
    requirement-supporting `scripts/*.js` guard and tool scripts, excluding
    dev-only host and CI-infrastructure runner scripts that require a real host,
    integration host, or git remote to exercise.
  - The initial coverage floor ratchet is statements 40%, branches 33%,
    functions 47%, and lines 40%.
  - The command fails closed with an actionable message when coverage evidence
    is absent.
  - Standards closeout invokes the coverage map after `npm test` and before
    package validation so coverage-risk findings are retained with other
    release-readiness evidence.
  - A scheduled advisory workflow runs Stryker mutation testing on the pure
    detection core and retains the mutation report as run evidence.
- Agent Work Scope:
  - Change the coverage mapping command, coverage floor configuration,
    requirements mapping, and verification references together.
- Implementation References:
  - `scripts/mapCoverageToTraceability.js`
  - `scripts/generateCloseoutEvidence.js`
  - `package.json`
  - `vitest.config.ts`
  - `docs/testing/test-plan.md`
  - `.github/workflows/mutation.yml`
- Verification References:
  - `tests/unit/coverageMapScript.test.ts`
  - `tests/unit/closeoutEvidenceScript.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `tests/unit/traceabilityAuditScript.test.ts`
  - `tests/unit/mutationWorkflow.test.ts`
- Change Guidance:
  - Keep this requirement focused on coverage intelligence and risk
    prioritization; do not use it to hide dev-only sources or reduce coverage
    include scope without an explicit requirements update.

### VHS-REQ-614: Test Harness Architecture For VS Code Orchestration

- Status: Active
- Parent: VHS-SYS-REQ-017
- Area: CI And Developer Environment
- Statement: The repository shall provide reusable unit-test harness utilities
  for VS Code orchestration surfaces so coverage-led follow-up work can test
  commands, webviews, workspace storage, filesystem, clipboard, progress, and
  output behavior through stable fakes.
- Acceptance Criteria:
  - Shared fakes cover extension context, command registration/execution,
    webview panels, workspace memento storage, workspace filesystem access,
    clipboard writes, progress reporting, and output channels.
  - The harness supports tests for VI History open-command routing, comparison
    action routing, dashboard action routing, and installed runtime settings CLI
    preparation.
  - Runtime behavior, command IDs, persisted formats, package identity, and
    Marketplace behavior are unchanged.
  - Production refactors for later coverage work remain limited to dependency
    injection needed for testability.
- Agent Work Scope:
  - Change shared test harness utilities, harness proof tests, requirement
    mapping, and verification references together.
- Implementation References:
  - `tests/unit/vscodeTestHarness.ts`
- Verification References:
  - `tests/unit/vscodeTestHarness.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `tests/unit/traceabilityAuditScript.test.ts`
- Change Guidance:
  - Keep this requirement focused on reusable test architecture. Do not change
    extension command exposure, runtime selection behavior, persisted data
    formats, package version, or Marketplace release flow under this requirement.

### VHS-REQ-615: Definition-of-Done Operating Requirement

- Status: Active
- Parent: VHS-SYS-REQ-012
- Area: CI And Developer Environment
- Statement: The repository shall define Done as an end-to-end release-readiness
  contract that joins issue quality, PR evidence, hosted CI, local validation,
  standards provenance, closeout evidence, and traceability drift prevention
  before work is treated as complete.
- Acceptance Criteria:
  - Target issues name the requirement ID, source evidence, files to inspect,
    acceptance criteria, validation commands, explicit out-of-scope
    boundaries, requirement/RTM update expectations, and an optional bounded
    Copilot prompt.
  - PR evidence references the target issue without premature closure language
    unless the PR actually satisfies the issue closeout contract.
  - PR evidence uses a lightweight contract that includes linked issue, target
    requirement, validation commands, traceability/RTM impact, out-of-scope
    statement, closeout readiness, required hosted CI checks, local gates,
    targeted tests, standards provenance status, and any environment blockers.
  - Local validation includes traceability audit, documentation link check,
    typecheck, full unit tests, coverage-to-traceability mapping, package
    sanity, and targeted tests for the changed requirement or implementation
    surface.
  - Standards closeout evidence reports host or Docker runner results,
    standards toolchain provenance, Definition-of-Done status, and disqualified
    evidence sources when a gate would otherwise pass from generated or fixture
    content.
  - Standards closeout evidence runs the standards-review tools against a
    temporary tracked-worktree snapshot from `git ls-files` and records
    `standards.auditTarget.mode`, `trackedFileCount`, and
    `generatedRootsExcluded` in `closeout-summary.json`.
  - Standards closeout evidence runs `npm run coverage:map` after `npm test`
    and before `npm run package` so low-coverage requirement-mapped files are
    visible as follow-up candidates.
  - Traceability drift prevention updates SRS, RTM, ID index, test plan,
    inventory, and requirements tests together when requirement scope changes.
  - The repo-native `npm run dod:gate` command verifies the DoD contract from
    committed repository evidence.
  - Hosted CI includes `DoD Gate / dod` running `npm run dod:gate`, and this
    `.github/workflows/ci.yml` evidence is the only scanner-visible standards
    source that can promote DoD to `PASS`.
  - Release-readiness evidence remains decision-complete by naming traceability
    audit, docs link check, tests, package validation, Marketplace listing
    evidence, and closeout expectation for release closeout review.
  - Local assurance-state evidence retains supplied post-merge review findings
    as classified planning signals with URL, issue, PR, and merge provenance.
  - A release-readiness verdict composes existing signals (risk ledger,
    requirements-manifest digest, and version/CHANGELOG coherence) into one
    advisory `READY`/`ATTENTION` status bound to the extension version and
    commit, with a display-only human-attested runtime line that never gates,
    so a maintainer can read one signal before the separate manual release.
  - The release-readiness runtime line is derived by default from the committed
    runtime-validation ledger, naming the real-runtime tracks validated at the
    candidate build version and any stale tracks needing re-validation, and
    remains display-only.
- Agent Work Scope:
  - Change requirements docs, RTM, ID index, test plan, and requirements
    coherence tests together.
- Implementation References:
  - `.github/workflows/marketplace-release.yml`
  - `.github/workflows/ci.yml`
  - `package.json`
  - `scripts/checkDefinitionOfDone.js`
  - `scripts/auditCustomizationGovernance.js`
  - `scripts/generateCloseoutEvidence.js`
  - `scripts/generateAssuranceState.js`
  - `scripts/runMultiStandardsAudit.js`
  - `scripts/verifyMarketplaceListing.js`
  - `scripts/checkReleaseReadiness.js`
  - `.github/pull_request_template.md`
  - `docs/maintainer-operations.md`
  - `docs/cm/cm-plan.md`
  - `docs/requirements/srs.md`
  - `docs/requirements/rtm.csv`
  - `docs/requirements/id-index.csv`
  - `docs/requirements/README.md`
  - `docs/testing/test-plan.md`
  - `docs/requirements/traceability-inventory.csv`
- Verification References:
  - `tests/unit/definitionOfDoneGate.test.ts`
  - `tests/unit/closeoutEvidenceScript.test.ts`
  - `tests/unit/assuranceStateScript.test.ts`
  - `tests/unit/multiStandardsAuditScript.test.ts`
  - `tests/unit/marketplaceReleaseWorkflow.test.ts`
  - `tests/unit/releaseReadinessScript.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `tests/unit/traceabilityAuditScript.test.ts`
  - `tests/unit/customizationGovernanceAuditScript.test.ts`
  - `manual:definition-of-done-release-readiness-review`
- Change Guidance:
  - Keep this requirement as the operating contract for Done and keep hosted
    `DoD Gate / dod` enforcement inside the required public CI workflow.

### VHS-REQ-616: Runtime Auto-Selection And Stale Settings Repair

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: The extension shall detect installed comparison runtimes
  (LabVIEW host \u22652025 and Docker CLI) on activation through a bounded
  filesystem-only probe and seed or repair the persisted
  `viHistorySuite.runtimeProvider`, `viHistorySuite.labviewVersion`, and
  `viHistorySuite.labviewBitness` user settings so a working comparison
  selection is in place after fresh installs and upgrades without requiring a
  manual command.
- Acceptance Criteria:
  - Activation runs `detectAvailableRuntimes` whose Windows, Linux, and macOS
    branches read only from the filesystem and PATH and never spawn child
    processes.
  - When no VI History runtime keys are persisted, the extension seeds the
    user settings.json with the recommended provider, year, and bitness.
  - When all three keys are persisted but the persisted combination is not
    satisfiable by the current detection, the extension repairs the values to
    the recommendation; partially populated keys are also repaired.
  - When the persisted combination is satisfiable, the extension preserves
    the existing values verbatim.
  - When no runtime is detected, the extension leaves persisted values
    unchanged and reports `no-runtime-detected` from the seed module.
  - The recommendation precedence is: highest installed LabVIEW year wins,
    tied years prefer x64; otherwise Docker host runtime at year 2026 / x64;
    otherwise no recommendation.
  - Failures during detection or seeding never block extension activation;
    they are logged with the `[vi-history-suite]` prefix.
- Agent Work Scope:
  - Change activation seed/repair logic, detection helpers, and their tests
    together; do not move logic into `comparisonRuntimeLocator` which remains
    the heavier validation surface.
- Implementation References:
  - `src/extension.ts`
  - `src/tooling/runtimeAutoDetect.ts`
  - `src/tooling/runtimeSettingsSeed.ts`
  - `src/tooling/localRuntimeSettingsCli.ts`
- Verification References:
  - `tests/unit/runtimeAutoDetect.test.ts`
  - `tests/unit/runtimeSettingsSeed.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep detection filesystem-only at activation time; richer registry,
    daemon-reachability, or process probes belong to
    `comparisonRuntimeLocator` and `vihs --validate`.

### VHS-REQ-617: Missing-Runtime User Notification And Status Surface

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: The extension shall surface comparison runtime availability in
  the VS Code status bar and raise a one-time first-run notification when no
  comparison runtime is detected, with a focus-event re-detect that is throttled
  so users learn promptly when they install LabVIEW or Docker without paying
  repeated detection costs.
- Acceptance Criteria:
  - A status bar item titled `VI History runtime` is shown after activation
    and reflects the latest detection outcome. When a runtime is available,
    the label includes the provider-specific suffix (e.g.,
    `VI History runtime: LabVIEW 2026 x64`, `VI History runtime: Docker`);
    when no runtime is detected, the label reads
    `VI History runtime: missing`.
  - When detection reports no runtime, the extension shows a single
    information notification per user globalState flag
    `vihs.firstRunNoRuntimeNoticeShown` so the message is not repeated on
    subsequent activations until the user clears it.
  - The watcher re-detects on `vscode.window.onDidChangeWindowState` focus
    transitions and ignores re-detect requests received within
    `RUNTIME_RE_DETECT_THROTTLE_MS` of the last run.
  - The watcher is registered as an extension subscription so its status bar
    item and listener are disposed when the extension deactivates.
  - Detection failures inside the watcher are logged but never throw out of
    activation.
  - The extension contributes three palette commands under category `VI
    History`: `Detect Runtime Now`
    (`labviewViHistory.detectRuntimeNow`), `Reset First-Run Runtime Notice`
    (`labviewViHistory.resetFirstRunNotice`), and `Show Runtime Summary`
    (`labviewViHistory.showRuntimeSummary`). Each command refuses to run in
    untrusted workspaces with a warning message.
  - `Detect Runtime Now` bypasses the focus-event throttle by forcing a
    fresh detection pass and updating the status bar.
  - `Reset First-Run Runtime Notice` requires explicit modal confirmation
    before clearing the `vihs.firstRunNoRuntimeNoticeShown` globalState
    flag.
  - `Show Runtime Summary` writes a structured multi-line report (platform,
    host installations, docker availability, recommendation, persisted
    settings) to the `VI History: Runtime` output channel and offers a
    `Copy` action to place the report on the clipboard.
- Agent Work Scope:
  - Change runtime availability UX surfaces, their pure decision helpers,
    and their tests together; modal copy and external install URLs are
    centralized in `runtimeAvailabilityNotice.ts`. The three runtime
    convenience commands live in `src/commands/runtimeCommands.ts` and
    inject `detect`/`isTrusted` boundaries for deterministic tests.
- Implementation References:
  - `src/extension.ts`
  - `src/ui/runtimeAvailabilityNotice.ts`
  - `src/commands/runtimeCommands.ts`
- Verification References:
  - `tests/unit/runtimeAvailabilityNotice.test.ts`
  - `tests/unit/runtimeCommands.test.ts`
  - `tests/unit/runtimeAvailabilityWatcher.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep first-run gating, throttling, and copy in this requirement; runtime
    detection itself stays under VHS-REQ-616.

### VHS-REQ-619: Git Prerequisite Detection And First-Run Guidance

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: The extension shall probe `git --version` once per activation,
  cache the result for the session, surface a status bar warning plus a
  one-time first-run information notification when Git is not detected, and
  refuse `labviewViHistory.open` with a warning toast that links to the Git
  install page so users learn before launching a comparison that the
  prerequisite is missing.
- Acceptance Criteria:
  - On activation the extension runs a single `git --version` probe through
    an injectable command runner and caches the discriminated detection
    result for re-use by the status bar, the first-run notice, and the
    `labviewViHistory.open` gate without re-spawning the child process.
  - When the probe reports Git is missing, a status bar item titled
    `VI History Git prerequisite` is shown with the text
    `Git not detected` and a tooltip pointing at install guidance; when the
    probe succeeds the status bar item stays hidden to avoid clutter.
  - When the probe reports Git is missing, a one-time information
    notification surfaces install guidance gated by the user globalState
    flag `vihs.firstRunGitNoticeShown` so the message is not repeated on
    subsequent activations.
  - The first-run notification offers an `Install Git` action that opens
    `https://git-scm.com/downloads` via `vscode.env.openExternal`.
  - `labviewViHistory.open` consults the cached detection. When Git is
    missing the command refuses with a warning toast that explains the
    prerequisite, offers an `Install Git` action linking to the install
    page, and does not start the comparison flow. When the cached result is
    not yet available the command falls back to allowing execution so
    activation races never block users.
  - The watcher is registered as an extension subscription so its status
    bar item is disposed when the extension deactivates, and probe
    failures are logged but never throw out of activation.
- Agent Work Scope:
  - Change Git detection, the cached UX surfaces, and the open-command gate
    together. The pure decision helpers (`buildGitStatusBarPresentation`,
    `decideGitFirstRunPresentation`, `decideOpenGate`) live in
    `src/ui/gitPrerequisiteNotice.ts` so unit tests can exercise routing
    without a window. Detection lives in
    `src/tooling/gitPrerequisiteDetect.ts` with an injected
    `runGitVersion` boundary.
- Implementation References:
  - `src/extension.ts`
  - `src/tooling/gitPrerequisiteDetect.ts`
  - `src/ui/gitPrerequisiteNotice.ts`
- Verification References:
  - `tests/unit/gitPrerequisiteDetect.test.ts`
  - `tests/unit/gitPrerequisiteNotice.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep Git detection synchronous in spirit (one probe, cached) and never
    re-probe inside the `labviewViHistory.open` hot path. Richer health
    checks (worktree state, repo bounds) belong to the existing Git CLI
    wrappers under `src/git/`.

### VHS-REQ-620: Reactive Runtime Provider Selection And Quick-Pick

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: The extension shall keep the `VI History runtime` status bar label
  and Runtime & Report Settings panel synchronized with persisted runtime and
  container-image selection by sourcing the label from the user's complete and
  satisfiable persisted runtime selection (`viHistorySuite.runtimeProvider`,
  `viHistorySuite.labviewVersion`, `viHistorySuite.labviewBitness`), falling
  back silently to the auto-detection recommendation otherwise, refreshing the
  label immediately on `vscode.workspace.onDidChangeConfiguration`, opening the
  status-bar-targeted `labviewViHistory.pickRuntimeProvider` panel to write or
  clear the same settings keys at `ConfigurationTarget.Global`, naming the active
  Docker container image as `Docker @ <tag>`, and rendering a warning label with
  a conflict tooltip when the selected docker image platform conflicts with the
  confirmed active Docker daemon container mode (VHS-REQ-650).
- Acceptance Criteria:
  - `selectActiveRuntime(detection, persisted)` honors a persisted selection
    only when it is complete and satisfiable per
    `isPersistedSelectionSatisfiable`: a host selection requires
    `runtimeProvider`, `labviewVersion`, and `labviewBitness`, while a docker
    selection is LabVIEW-agnostic and complete with `runtimeProvider` alone
    (VHS-REQ-657); otherwise it returns the auto-detection recommendation. There
    is no `mismatch` snapshot kind — unsatisfiable persisted selections cause a
    silent fallback.
  - `buildAvailableStatusBarSuffix` renders the docker label as
    `Docker @ <tag>`: it uses the selected
    `viHistorySuite.container.imageVersion` tag when set and the built-in
    `DEFAULT_DOCKER_IMAGE_LABEL_TAG` (`2026q1-linux`) when unset, so the status
    bar names the LabVIEW container image symmetrically with the host label's
    version and bitness. `selectActiveRuntime` carries
    `container.imageVersion` onto the docker label independently of the
    runtime-provider triple, so the image is named whether the docker provider
    was persisted or auto-detected.
  - `createRuntimeAvailabilityWatcher` caches the most recent detection,
    subscribes to `vscode.workspace.onDidChangeConfiguration` filtered to
    the `viHistorySuite` section, and re-renders the status bar from the
    cached detection (no re-detect) when those keys change. The watcher
    exposes `getLastDetection()` and `getLastSnapshot()` for downstream
    consumers and disposes the configuration listener with the watcher.
  - The runtime status bar item targets the
    `labviewViHistory.pickRuntimeProvider` command. The tooltip reads
    `Selected via settings.json. Click to change.` when the label sources
    from a persisted selection and `Auto-detected. Click to override.`
    when it sources from the recommendation.
  - The `labviewViHistory.pickRuntimeProvider` command opens the Runtime &
    Report Settings panel, whose runtime provider section is built from the
    cached detection: one option per detected host LabVIEW installation, one
    option for Docker when `cliAvailable` is true, plus a Clear option that
    removes the three persisted keys. Selecting an option writes to
    `ConfigurationTarget.Global` via `applyPickRuntimeProviderSelection`; the
    Docker option is labeled `Docker` and persists `runtimeProvider=docker`
    while clearing `labviewVersion`/`labviewBitness` because Docker is
    LabVIEW-agnostic (VHS-REQ-657); the
    command refuses to open in untrusted workspaces with a warning, and the
    panel surfaces an empty/no-detection state when detection has not completed
    or no runtimes are detected. The bitness/version open-gate toasts open the
    same panel through the same command id.
  - The `Show Runtime Summary` report appends a `Drift:` line that reads
    `none` when no persisted selection is set or it matches the
    recommendation, `selection differs from recommendation: persisted=…,
    recommendation=…` when persisted is satisfiable but diverges, and
    `selection unsatisfiable on this host; falling back to recommendation`
    when the persisted combination cannot be served on this host.
  - VHS-REQ-650: `buildStatusBarPresentation` renders the docker label in a
    warning state (`STATUS_BAR_TEXT_WARNING` prefix) with a conflict tooltip
    when the selected `container.imageVersion` platform differs from the
    confirmed active Docker daemon mode. The mode must be CONFIRMED — an
    explicit override or a successful `docker info` probe; an unknown mode
    (Docker stopped, unreachable, or the probe times out / rejects) never
    warns, so a valid selection is never flagged against a host-OS guess. The
    watcher probes the daemon mode out-of-band on the async detection path
    only when the active provider is docker, caches the confirmed mode, and
    reuses it for the synchronous re-render. Because the engine mode can be
    switched externally between probes, a change to
    `viHistorySuite.runtimeProvider` or `viHistorySuite.container.imageVersion`
    invalidates the cached mode (so the immediate render never shows a warning
    from a stale mode) and re-probes out-of-band to restore an accurate
    warning; other `viHistorySuite` changes re-render from the cached mode
    without a probe. An unset image selection is never flagged because the
    compare-time default adapts to the active platform.
  - The Runtime & Report Settings panel exposes an Advanced runtime control that
    edits the LabVIEW CLI connect timeout
    (`viHistorySuite.runtime.cliConnectTimeoutSeconds`): the panel renders the
    current value with the supported range, and applying an edit clamps the
    requested value into the supported window (rounding fractional entries and
    substituting the shipped default for a non-numeric request) before
    persisting to `ConfigurationTarget.Global`, so an out-of-range or fractional
    entry never reaches user settings and the panel re-renders the normalized
    value.
- Agent Work Scope:
  - Keep the persisted-selection arbitration in
    `src/ui/runtimeAvailabilityNotice.ts::selectActiveRuntime` reusing
    `isPersistedSelectionSatisfiable` from
    `src/tooling/runtimeSettingsSeed.ts`. The panel command lives in
    `src/commands/openRuntimeReportPanelCommand.ts` with the pure renderer in
    `src/ui/runtimeReportPanel.ts`; it reuses the pure helpers
    (`buildPickRuntimeProviderItems`, `applyPickRuntimeProviderSelection`)
    exported from `src/commands/pickRuntimeProviderCommand.ts` so the routing
    logic is unit testable without a window. Drift classification lives in
    `src/commands/runtimeCommands.ts::buildDriftSummaryLine`.
- Implementation References:
  - `src/extension.ts`
  - `src/ui/runtimeAvailabilityNotice.ts`
  - `src/ui/runtimeReportPanel.ts`
  - `src/commands/openRuntimeReportPanelCommand.ts`
  - `src/reporting/comparisonReportAction.ts`
  - `src/tooling/dockerDaemonPlatform.ts`
  - `src/tooling/containerImageCatalog.ts`
  - `src/commands/pickRuntimeProviderCommand.ts`
  - `src/commands/runtimeCommands.ts`
- Verification References:
  - `tests/unit/runtimeAvailabilityNotice.test.ts`
  - `tests/unit/runtimeAvailabilityWatcher.test.ts`
  - `tests/unit/runtimeReportPanel.test.ts`
  - `tests/unit/openRuntimeReportPanelCommand.test.ts`
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/dockerDaemonPlatform.test.ts`
  - `tests/unit/containerImageCatalog.test.ts`
  - `tests/unit/pickRuntimeProviderCommand.test.ts`
  - `tests/unit/runtimeCommands.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Treat the persisted selection as the authoritative source of truth
    when satisfiable; do not introduce a `mismatch` UI state or repeated
    toasts that nag the user about the divergence. Keep auto-detection
    re-runs gated by the existing focus-event throttle — config-change
    refreshes must always re-render from the cached detection.

### VHS-REQ-621: Concurrent LabVIEW Bitness Conflict Diagnostic

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: When the comparison-report runtime detects a running LabVIEW
  process whose bitness differs from the selected runtime bitness, the
  extension shall emit an actionable diagnostic in both the preflight
  blocking path (new `windows-host-bitness-conflict` runtime locator
  blocked reason) and the post-failure classification path (new
  `labview-host-bitness-conflict` execution failure reason), retain the
  observed LabVIEW bitness and executable path on the runtime selection
  facts and process-observation packet fields, and offer a
  `Pick Runtime Provider` action button on the resulting warning toast
  that invokes `labviewViHistory.pickRuntimeProvider` so the user can
  align `viHistorySuite.labviewBitness` with the running session without
  hunting for the setting.
- Acceptance Criteria:
  - The Windows host runtime preflight inspects the retained process
    observation, resolves the executable path for the first observed
    `LabVIEW.exe` via the injectable `resolveWindowsLabviewExecutablePath`
    seam, infers `'x86'` from a path under `\Program Files (x86)\`,
    `'x64'` from a path under `\Program Files\`, and `'unknown'`
    otherwise, and exposes the result on
    `RuntimeProcessObservation.labviewProcessBitness` plus
    `labviewProcessExecutablePath`.
  - `comparisonRuntimeLocator.locate()` short-circuits to
    `blockedReason='windows-host-bitness-conflict'` when the observed
    bitness is known and differs from the selected bitness, ahead of the
    generic `windows-host-runtime-surface-contaminated` arm, and retains
    `hostObservedLabviewBitness` and `hostObservedLabviewExecutablePath`
    on the resulting `ComparisonRuntimeSelection` so the doctor and
    quick-pick action can render the running bitness.
  - `classifyRuntimeFailure` rewrites a generic `command-exited-nonzero`
    failure to `'labview-host-bitness-conflict'` when the retained
    process-exit observation shows a running `LabVIEW.exe` whose
    `labviewProcessBitness` is known and differs from the selected
    bitness, attaching a note that names both bitnesses.
  - `comparisonRuntimeDoctor` emits a next-action line that names the
    observed bitness (or `match the running session` when unknown),
    references `viHistorySuite.labviewBitness`, and surfaces the same
    guidance for both the preflight `windows-host-bitness-conflict`
    blocked reason and the post-failure
    `labview-host-bitness-conflict` failure reason.
  - The VS Code comparison-report command surfaces the pre-launch block
    (`blockedReason='windows-host-bitness-conflict'`) as a concise
    warning toast that names the running vs. selected LabVIEW (year when
    known plus bitness) and steers to a single path — close the running
    LabVIEW, then click `Retry Compare` — with a `Retry Compare` action
    that re-runs the same compare (it re-blocks until the running LabVIEW
    is closed; no second LabVIEW is ever launched). The verbose
    provider/rejected-provider message is suppressed for this reason and
    no comparison report webview is auto-opened (the blocked-evidence
    packet is still persisted; explicit `Export Comparison Report` still
    works), mirroring the concise Docker block toasts (VHS-REQ-642/643).
    The mid-run reclassified
    `runtimeFailureReason='labview-host-bitness-conflict'` is unchanged:
    it keeps the verbose warning toast with a `Pick Runtime Provider`
    action that invokes `labviewViHistory.pickRuntimeProvider` (#530).
- Agent Work Scope:
  - Keep bitness inference path-based (no PE-header probe) and resolve the
    executable through `Get-Process -Id <pid>` so the diagnostic does not
    depend on additional probes. Reuse the existing
    `observeWindowsProcesses` injection seam, the
    `hostRuntimeConflictDetected` / `allowExistingWindowsHostRuntime`
    flow, and the doctor blocked-reason switch. Do not introduce a
    separate auto-correction path — VHS-REQ-621 surfaces the conflict
    and hands off to VHS-REQ-620's Runtime & Report Settings panel.
- Implementation References:
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonRuntimeLocator.ts`
  - `src/reporting/comparisonRuntimeDoctor.ts`
  - `src/reporting/comparisonReportAction.ts`
  - `src/commands/openViHistoryCommand.ts`
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/comparisonRuntimeDoctor.test.ts`
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - When extending the locator with new fact fields, propagate
    `hostObservedLabviewBitness` and `hostObservedLabviewExecutablePath`
    through every `locate()` return site so positive-path consumers can
    surface the running session details without re-detecting.
    Keep the diagnostic actionable: name both bitnesses in notes and
    reuse the `Pick Runtime Provider` action rather than introducing a
    new bespoke command.

### VHS-REQ-653: Concurrent LabVIEW Version Conflict Diagnostic

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: When the comparison-report runtime detects a running LabVIEW
  process whose major version (year) differs from the selected
  `viHistorySuite.labviewVersion` while its bitness matches (a differing bitness
  is already handled by VHS-REQ-621), the extension shall block the host-native
  compare with a new `windows-host-version-conflict` runtime locator blocked
  reason instead of admitting the running session under
  `allowExistingWindowsHostRuntime`, because LabVIEW is singleton per bitness:
  the selected version cannot start its own instance, so LabVIEWCLI would attach
  to the already-running wrong-year session (which also listens on that install's
  own VI Server port). This is the compare-time peer of the open-time
  VHS-REQ-637 version gate and a sibling of the compare-time VHS-REQ-621 bitness
  block. The resulting warning toast offers a `Pick Runtime Provider` action that
  invokes `labviewViHistory.pickRuntimeProvider`.
- Acceptance Criteria:
  - `comparisonRuntimeLocator.locate()` infers the running LabVIEW year from the
    observed `LabVIEW.exe` path with the best-effort
    `inferLabviewYearFromExecutablePath` helper and short-circuits to
    `blockedReason='windows-host-version-conflict'` when that year is known,
    differs from the requested `viHistorySuite.labviewVersion`, the bitness is
    not a VHS-REQ-621 conflict, and strict version+bitness selection is required.
  - Year inference is best-effort: an unknown or unparseable running year is
    never treated as a conflict, so a matching-year session and an
    unknown-year session remain admitted under `allowExistingWindowsHostRuntime`
    with no regression of VHS-REQ-621 or VHS-REQ-155.
  - The block defers to the VHS-REQ-621 bitness conflict so the two never
    double-fire, and it is evaluated ahead of the generic
    `windows-host-runtime-surface-contaminated` arm.
  - The locator retains `hostObservedLabviewVersion` (alongside
    `hostObservedLabviewBitness` and `hostObservedLabviewExecutablePath`) on the
    resulting `ComparisonRuntimeSelection` so the doctor can name the running
    year.
  - `comparisonRuntimeDoctor` emits a next-action line that names the observed
    year and the selected year, references `viHistorySuite.labviewVersion`, and
    offers a Docker-backed x64 compare as one recovery option.
  - The VS Code comparison-report command surfaces the
    `blockedReason='windows-host-version-conflict'` pre-launch block as a
    concise warning toast that names the running vs. selected LabVIEW year
    and steers to a single path — close the running LabVIEW, then click
    `Retry Compare` — with a `Retry Compare` action that re-runs the
    compare. The verbose provider message is suppressed for this reason
    and no comparison report webview is auto-opened (the blocked-evidence
    packet is still persisted; explicit `Export Comparison Report` still
    works), mirroring VHS-REQ-621 and the concise Docker block toasts
    (VHS-REQ-642/643) (#530).
  - The shared Windows runtime-conflict harness (VHS-REQ-622) exercises this
    block on real hardware through the `version-A` (host LabVIEW 2025 / selected
    2026) and `version-B` (host 2026 / selected 2025) scenarios at a shared
    bitness, asserting `runtimeBlockedReason='windows-host-version-conflict'` in
    the emitted proof JSON. The scenarios run only on the dispatch-only
    self-hosted maintainer runner and require both LabVIEW years installed at
    the scenario bitness.
- Agent Work Scope:
  - Reuse the existing `inferLabviewYearFromExecutablePath` seam, the
    `hostRuntimeConflictDetected` / `allowExistingWindowsHostRuntime` flow, the
    doctor blocked-reason switch, and the `Pick Runtime Provider` quick-pick. Do
    not add a new command or setting, do not mandate Docker, do not auto-switch
    `viHistorySuite.labviewVersion`, and do not change VHS-REQ-621 or VHS-REQ-637
    behavior. Scope is Windows host-native LabVIEW CLI only.
- Implementation References:
  - `src/reporting/comparisonRuntimeLocator.ts`
  - `src/reporting/comparisonRuntimeDoctor.ts`
  - `src/reporting/comparisonReportAction.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `scripts/runWindowsRuntimeMatrix.js`
  - `scripts/windows-runtime-matrix/Invoke-RuntimeMatrixSteadyState.ps1`
  - `.github/workflows/windows-runtime-matrix.yml`
- Verification References:
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/comparisonRuntimeDoctor.test.ts`
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/runWindowsRuntimeMatrixScript.test.ts`
  - `manual:windows-runtime-matrix-version-conflict-dispatch`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep year inference best-effort and never block on an unknown running year.
    Thread `hostObservedLabviewVersion` through any new `locate()` return site
    that carries the other observed-session facts, keep the block deferred to the
    VHS-REQ-621 bitness conflict, and reuse the `Pick Runtime Provider` action
    rather than introducing a new bespoke command.

### VHS-REQ-658: LabVIEW VI Version Too New Compare Failure Diagnostic

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: When a host-native comparison-report run reaches
  `ready-for-runtime` and then fails because LabVIEW reports error 0x465 ("File
  version is later than the current LabVIEW version") — meaning a staged
  revision of the VI was saved in a newer LabVIEW than the selected engine, which
  LabVIEW cannot open because it is not forward-compatible — the extension shall
  classify the failure as a dedicated `labview-vi-version-too-new` runtime
  failure reason instead of the generic `command-exited-nonzero`, and surface a
  single concise warning toast that names the selected LabVIEW and steers the
  user to pick a newer installed LabVIEW. This is the compare-time peer of the
  running-session conflict diagnostics VHS-REQ-621 (bitness) and VHS-REQ-653
  (version): those guard a running LabVIEW whose bitness/year differs from the
  selection, whereas this reason fires when the running and selected engine
  agree but the VI file itself is newer than the engine.
- Acceptance Criteria:
  - `classifyRuntimeFailure` reclassifies a nonzero-exit runtime failure whose
    retained stderr contains the engine-agnostic LabVIEW signature `File version
    is later than the current LabVIEW version` to
    `reason='labview-vi-version-too-new'` with a diagnostic note naming error
    0x465 and the forward-version cause, ahead of the generic
    `command-exited-nonzero` fallback. A nonzero exit without that stderr
    signature is unchanged (still `command-exited-nonzero`), and the existing
    `-350000` and bitness-conflict reclassifications are not regressed.
  - The `opened-comparison-report` action result carries the selected
    `requestedLabviewVersion` and `bitness` (as `selectedLabviewVersion` /
    `selectedLabviewBitness`) so the command layer can name the selected LabVIEW
    in the toast without re-reading settings.
  - `comparisonReportAction` exposes a window-free `isViVersionTooNewFailure`
    predicate (true only for `runtimeFailureReason='labview-vi-version-too-new'`)
    and a pure `buildViVersionTooNewMessage` builder that names the selected
    LabVIEW (year + bitness when known), states that LabVIEW cannot open a VI
    saved in a newer version, and steers to pick a newer installed LabVIEW, with
    no provider internals, no `viHistorySuite` setting keys, and no LabVIEWCLI
    clause.
  - The VS Code comparison-report command surfaces the
    `labview-vi-version-too-new` failure as a single concise warning toast built
    from `buildViVersionTooNewMessage` with a `Pick Runtime Provider` action that
    invokes `labviewViHistory.pickRuntimeProvider`; the verbose runtime-failure
    message is suppressed for this reason (added to the same suppression gate as
    the Docker and host-conflict concise toasts). The comparison-report action
    does not auto-open the report webview for this failure (it returns the
    dedicated `failed-vi-version-too-new` outcome before
    `openPersistedComparisonReportPanel`), so the concise toast is the only
    surface and the user is not forced to close an extra tab; the packet is still
    persisted on disk and explicit Export still works, mirroring the #530 host
    bitness/version conflict gates rather than auto-opening the failed evidence
    (#597).
  - `comparisonRuntimeDoctor` emits a failed-state next-action line for
    `labview-vi-version-too-new` that names the selected LabVIEW year and
    bitness, states the forward-version cause, and instructs the user to pick a
    newer installed LabVIEW (through the `Pick Runtime Provider` quick-pick or
    `viHistorySuite.labviewVersion`) before rerunning comparison report
    generation.
- Agent Work Scope:
  - Reuse the existing `classifyRuntimeFailure` stderr-signature branching, the
    concise-toast suppression gate and `describeConflictLabview` helper in
    `comparisonReportAction`, the `Pick Runtime Provider` quick-pick, and the
    doctor failed-state next-action switch. Do not add a new command or setting,
    do not auto-switch `viHistorySuite.labviewVersion`, and do not change the
    VHS-REQ-621 or VHS-REQ-653 running-session conflict behavior. Scope is the
    host-native compare-time failure classification and its concise toast.
- Implementation References:
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonReportAction.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `src/reporting/comparisonRuntimeDoctor.ts`
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/comparisonRuntimeDoctor.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the classifier keyed on the stable LabVIEW stderr text rather than the
    propagated exit code (1125), so the reason survives CLI exit-code changes and
    covers both the LabVIEW CLI and LVCompare engines. Keep the toast concise and
    free of provider internals, and keep the verbose-message suppression entry in
    lockstep with the toast branch so the two never diverge.

### VHS-REQ-654: Live Container Image Pull Progress

- Status: Active
- Parent: VHS-SYS-REQ-019
- Area: Runtime Discovery
- Statement: When the comparison runtime cold-pulls a LabVIEW Docker image, the
  extension shall report live, steadily-advancing pull progress in the
  acquisition progress notification, sourced from the Docker Engine API
  image-pull progress stream, so a user pulling the multi-gigabyte Windows image
  sees real, forward-moving progress instead of opaque status text with a faked
  increment.
- Acceptance Criteria:
  - `acquireWindowsContainerImage` drives the pull through the Docker Engine API
    `POST /images/create` stream over the local daemon socket (the Windows named
    pipe `\\.\pipe\docker_engine` or the Linux `/var/run/docker.sock`) and
    aggregates the per-layer stream events into a **layer-weighted** progress
    figure — each enumerated layer contributes an equal slice, smoothed by the
    in-flight layer's byte fraction — surfaced with the completed/total layer
    count and absolute downloaded bytes in the progress message (for example
    `Pulling container image: <image> — 31% (4/13 layers, 1.4 GB)`).
  - Because Docker reveals layers and their sizes progressively, the percentage
    shall not be byte-weighted against the running sum of known layer totals (a
    tiny, unstable early denominator that pins a small first layer at 100%); the
    reported percentage is monotonic, capped below 100% in progress (overall
    completion is signalled by the explicit "ready" message), and the toast is
    re-emitted whenever its visible text changes so it can never freeze at a
    premature 100%.
  - The Engine API path is attempted only on hosts where the daemon socket is
    directly reachable (a native Windows host or a Linux-native host); the
    Linux→Windows-docker WSL bridge and any other host fall back to the prior
    `docker pull` CLI acquisition with its coarse per-line progress, so behavior
    is never worse than before.
  - When the daemon socket is unreachable the acquisition transparently falls
    back to the CLI pull (no error surfaced for the unreachable socket); an
    in-band pull error or a non-2xx daemon response yields a failed acquisition
    whose notes carry the error.
  - The pull is a read-only anonymous pull of the namespace-pinned
    `nationalinstruments/labview` repository; no registry credential header is
    sent, and no new third-party dependency is introduced (Node `http.request`
    over the socket).
  - The stream parser, the percentage aggregator, and the daemon-socket request
    are separated so the parser/aggregator are pure and the request is behind an
    injected boundary, keeping the feature unit-testable on Linux without a real
    Docker daemon.
- Agent Work Scope:
  - Add the pull-progress module (parser, aggregator, injectable stream) and wire
    it into `acquireWindowsContainerImage` with the CLI fallback, together with
    the unit tests. Do not change which image is selected (VHS-REQ-650) or the
    comparison behavior after acquisition.
- Implementation References:
  - `src/tooling/dockerImagePullProgress.ts`
  - `src/reporting/comparisonRuntimeLocator.ts`
- Verification References:
  - `tests/unit/dockerImagePullProgress.test.ts`
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:windows-container-image-cold-pull-progress`
- Change Guidance:
  - Keep the Engine API call read-only, anonymous, and bounded, and keep the CLI
    fallback so an unreachable or older daemon never blocks acquisition. Keep the
    percentage monotonic and clamped, and keep the parser/aggregator pure so the
    daemon-socket surface stays the only impure boundary.


### VHS-REQ-655: Stable Byte-Percentage Pull Progress

- Status: Active
- Parent: VHS-SYS-REQ-019
- Area: Runtime Discovery
- Statement: When the comparison runtime cold-pulls a LabVIEW Docker image from
  Docker Hub, the extension shall resolve the image's total compressed download
  size up front from the registry manifest and report a true byte-percentage in
  the acquisition progress notification (for example `Pulling container image:
  <image> — 42% (8.1 GB / 19.3 GB)`), so the user sees a smooth fraction of the
  real download size rather than the layer-weighted approximation of VHS-REQ-654.
- Acceptance Criteria:
  - Before starting the pull, the extension resolves a stable total download size
    by fetching the registry manifest (Docker Hub anonymous pull token from
    `auth.docker.io`, then the manifest from `registry-1.docker.io`; a manifest
    list / OCI image index is resolved to the `windows/amd64` manifest) and
    summing the per-layer compressed `size` fields.
  - The aggregator divides downloaded bytes by that stable total (not the
    partially-known live-stream totals), crediting cached (`Already exists`)
    layers from a per-layer size map so a partial cache still reaches the total;
    the percentage stays monotonic and capped below 100% (100% remains the
    explicit "ready" signal), and the toast shows `<downloaded> / <total>` bytes.
  - When the stable total is unavailable for any reason — a non-Docker-Hub
    registry, an auth/network/parse error, a timeout, or a missing platform —
    progress falls back to the layer-weighted figure of VHS-REQ-654, so behavior
    is never worse than that baseline.
  - The manifest resolution is anonymous (no credentials are sent), bounded by a
    short per-request timeout and a response-size cap, and contacts only the fixed
    Docker Hub registry and token hosts derived from the image reference (never an
    arbitrary host), so it introduces no SSRF surface.
  - The registry reference/challenge/manifest helpers are pure and the HTTP
    request is behind an injected boundary, keeping the resolver unit-testable on
    Linux without network access.
- Agent Work Scope:
  - Add the registry manifest size resolver and feed its stable total (and
    per-layer size map) into the pull-progress aggregator, with the layer-weighted
    fallback preserved, together with the unit tests. Do not change which image is
    selected (VHS-REQ-650), the comparison behavior after acquisition, or the
    daemon-socket pull stream itself (VHS-REQ-654).
- Implementation References:
  - `src/tooling/dockerImageDownloadSize.ts`
  - `src/tooling/dockerImagePullProgress.ts`
- Verification References:
  - `tests/unit/dockerImageDownloadSize.test.ts`
  - `tests/unit/dockerImagePullProgress.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:windows-container-image-cold-pull-progress`
- Change Guidance:
  - Keep the manifest resolution anonymous, bounded, and pinned to the Docker Hub
    hosts; any new registry support must keep the outbound host set fixed and
    derived from the reference. Keep the resolver returning `undefined` (never
    throwing) on every failure so the layer-weighted fallback (VHS-REQ-654) always
    remains available.


### VHS-REQ-656: Container Image Pull Phase Signaling

- Status: Active
- Parent: VHS-SYS-REQ-019
- Area: Runtime Discovery
- Statement: When the comparison runtime cold-pulls a LabVIEW Docker image, the
  extension shall signal the pull lifecycle phase in the acquisition progress
  notification — distinguishing the download phase from the post-download
  extraction (unpack) phase — so that once the multi-gigabyte download completes
  the user sees the extraction progress rather than a frozen percentage.
- Acceptance Criteria:
  - The stream parser distinguishes the per-layer lifecycle states `Downloading`,
    `Download complete`, `Extracting`, `Pull complete`, and `Already exists`, and
    the aggregator derives an overall phase
    (`preparing` → `downloading` → `extracting` → `complete`) plus a layer-weighted
    extraction percentage.
  - The acquisition message names the current phase: a pulling message with the
    download percentage while downloading (VHS-REQ-654/655), an extracting message
    with its own percentage and completed/total layer count while extracting (for
    example `Extracting container image: <image> — 60% (8/13 layers)`), and a
    finalizing message once every layer is pulled, before the existing
    `Container image ready` signal.
  - The progress bar advances monotonically through both phases (the download
    phase owns the larger share and the extraction phase the remainder) so it does
    not sit frozen at the download ceiling during the multi-minute unpack.
  - Extraction signaling is robust when the daemon omits `Extracting` byte
    details: the extraction percentage still advances as layers reach
    `Pull complete`.
  - The download-phase behavior of VHS-REQ-654/655 (live byte-percentage, stable
    registry total, monotonic and capped figures, CLI fallback) is unchanged.
- Agent Work Scope:
  - Extend the pull-progress parser and aggregator with the lifecycle phases and
    extraction progress, name the phase in the acquisition message, and advance
    the progress bar on the blended overall percentage, together with the unit
    tests. Do not change which image is selected (VHS-REQ-650), the comparison
    behavior after acquisition, or the registry size resolver (VHS-REQ-655).
- Implementation References:
  - `src/tooling/dockerImagePullProgress.ts`
  - `src/reporting/comparisonRuntimeLocator.ts`
- Verification References:
  - `tests/unit/dockerImagePullProgress.test.ts`
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:windows-container-image-cold-pull-progress`
- Change Guidance:
  - Keep the phase figures monotonic and capped below 100% so the toast never
    shows a premature or frozen 100%, and keep extraction advancing on
    `Pull complete` steps so the signal survives daemons that omit `Extracting`
    byte detail. Preserve the download-phase contract of VHS-REQ-654/655 when
    adjusting the phase model.


### VHS-REQ-657: Version-Aware LabVIEW Container Execution

- Status: Active
- Parent: VHS-SYS-REQ-019
- Area: Runtime Discovery
- Statement: Container runtime behavior shall derive the in-container LabVIEW
  executable and headless-engagement mechanism from the selected container
  image's LabVIEW release year while treating the Docker runtime provider as
  LabVIEW-version-agnostic in settings and labels because the selected container
  image already determines the LabVIEW version.
- Acceptance Criteria:
  - For a Linux container image of LabVIEW 2026 Q1 or later, the LabVIEWCLI
    `CreateComparisonReport` invocation targets
    `/usr/local/natinst/LabVIEW-<year>-64/labviewprofull` and engages headless
    mode with the `-Headless` flag.
  - For a Linux container image of LabVIEW 2025 Q3 or earlier, the invocation
    targets `/usr/local/natinst/LabVIEW-<year>-64/labview`, engages CI/CD headless
    behavior by exporting `EnableCICDFeaturesForLabVIEW=TRUE` inside the container
    script, and does not pass `-Headless` (which is not valid for those images per
    NI's ni/labview-for-containers guidance).
  - An unparseable or absent image reference falls back to the prior LabVIEW 2026
    `labviewprofull` + `-Headless` behavior so existing selections are unaffected.
  - The Linux headless recursive-load recovery (LabVIEWCLI `CloseLabVIEW` reset
    and single retry) runs only for images that use the `-Headless` mechanism; an
    image using the environment toggle never issued `-Headless`, so the reset is
    skipped instead of failing.
  - The comparison runtime locator no longer rejects a non-2026 Docker request
    with `docker-provider-labview-version-not-implemented`; the resolved image
    governs the version and the supported-floor check
    (`labview-version-unsupported-for-comparison-report`) still rejects versions
    below the minimum.
  - The runtime doctor "Requested runtime" line reports the image-derived LabVIEW
    release year for a container provider instead of a persisted or stale year.
  - The Docker runtime-provider option is labeled `Docker` (no LabVIEW version or
    bitness); selecting it persists `viHistorySuite.runtimeProvider=docker` and
    clears `viHistorySuite.labviewVersion`/`labviewBitness`. A persisted Docker
    selection is satisfiable, complete (preserved across activation rather than
    repaired), and labeled from the selected container image with the provider key
    alone.
  - On Windows the installed-compare version+bitness preflight gate
    (`labview-runtime-selection-required`/`labview-version-required`/
    `labview-bitness-required`) applies only to the host-native lane; a Docker
    request (`requestedProvider=docker`, derived `docker-only` execution) is not
    blocked by that gate even when `requireVersionAndBitness` is set and
    `viHistorySuite.labviewVersion`/`labviewBitness` are unset, so the locator
    proceeds to probe the container provider and the selected image governs the
    LabVIEW version.
  - In the Runtime & Report Settings panel the Docker provider option label is
    `Docker` (no version/bitness text), and the LabVIEW container image section is
    shown only when Docker is the comparison runtime (persisted
    `runtimeProvider=docker`, or unset with an auto-detected Docker active
    provider) and hidden for a host selection, coordinating with VHS-REQ-651.
- Agent Work Scope:
  - Add the pure image→profile resolver and thread it through the Linux-container
    command, script, and LVCompare builders; gate the headless recovery; remove
    the legacy 2026 Docker year pin; derive the doctor's requested year from the
    image; make the Docker provider option, satisfiability, seed completeness,
    status-bar/panel label, and panel selection LabVIEW-agnostic; update the unit
    tests. Do not change Windows-container execution (it remains LabVIEW 2026
    pinned), host-provider behavior, image discovery/selection (VHS-REQ-646–650),
    or the `vihs` terminal CLI's docker prompt.
- Implementation References:
  - `src/tooling/containerImageCatalog.ts`
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonRuntimeLocator.ts`
  - `src/reporting/comparisonRuntimeDoctor.ts`
  - `src/commands/pickRuntimeProviderCommand.ts`
  - `src/tooling/runtimeSettingsSeed.ts`
  - `src/ui/runtimeAvailabilityNotice.ts`
  - `src/commands/openRuntimeReportPanelCommand.ts`
  - `src/ui/runtimeReportPanel.ts`
- Verification References:
  - `tests/unit/containerImageCatalog.test.ts`
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/comparisonRuntimeDoctor.test.ts`
  - `tests/unit/runtimeSettingsSeed.test.ts`
  - `tests/unit/runtimeAvailabilityNotice.test.ts`
  - `tests/unit/pickRuntimeProviderCommand.test.ts`
  - `tests/unit/openRuntimeReportPanelCommand.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the headless mechanism tied to the image year (`-Headless` for 2026 Q1+,
    `EnableCICDFeaturesForLabVIEW=TRUE` for 2025 Q3 and earlier) per NI's
    ni/labview-for-containers guidance, and keep the unparseable-image fallback on
    the LabVIEW 2026 profile. Preserve the Docker provider's LabVIEW-agnostic
    settings shape (the provider key alone is complete and satisfiable) so a
    Docker pick is never clobbered by activation seed/repair. Windows-container
    execution stays LabVIEW 2026 pinned; widen it only under a new requirement.


### VHS-REQ-627: LabVIEW CLI Prerequisite Gate For VI History Open

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: The extension shall consult the cached runtime detection when
  `labviewViHistory.open` is invoked and refuse to open the VI History panel
  with a warning toast that names the missing LabVIEW CLI prerequisite when no
  host LabVIEW CLI is installed and no satisfiable Docker comparison runtime is
  the active provider, so users learn before selecting revisions that the
  comparison runtime is missing instead of meeting a failure after choosing
  Compare.
- Acceptance Criteria:
  - `isLabviewCliInstalled(detection)` returns true only when at least one
    detected host installation exposes a non-empty `labviewCliPath`
    (`LabVIEWCLI.exe` on Windows, `labviewcli` on Linux).
  - `decideLabviewCliOpenGate(detection, snapshot)` returns `allow` when the
    cached detection is not yet available so an activation race never blocks
    the command, matching the Git prerequisite gate.
  - The gate returns `allow` when the LabVIEW CLI is installed, and also when
    the active runtime snapshot is an available Docker provider because
    container comparison runs the LabVIEW CLI inside the image and does not
    depend on a host LabVIEW CLI.
  - The gate returns `block` with `LABVIEW_CLI_OPEN_BLOCKED_MESSAGE` when the
    LabVIEW CLI is not installed and no satisfiable Docker provider is active,
    including when a host LabVIEW is the active provider but the shared LabVIEW
    CLI component is absent.
  - `labviewViHistory.open` consults the runtime availability watcher's cached
    detection and snapshot after the Git prerequisite gate; when the gate
    blocks it presents a warning toast offering an `Install LabVIEW` action
    that opens the NI download page via `vscode.env.openExternal` and does not
    start the history panel or the comparison flow.
  - The block decision reuses the existing filesystem-only runtime detection
    cached by VHS-REQ-617's watcher; the gate never spawns a child process or
    re-probes the filesystem on the open hot path.
- Agent Work Scope:
  - Change the LabVIEW CLI gate decision helpers and the open-command wiring
    together. The pure decision helpers (`isLabviewCliInstalled`,
    `decideLabviewCliOpenGate`) and the toast copy
    (`LABVIEW_CLI_OPEN_BLOCKED_MESSAGE`, `presentLabviewCliOpenBlockedToast`)
    live in `src/ui/runtimeAvailabilityNotice.ts` so unit tests exercise
    routing without a window. Reuse the watcher's `getLastDetection()` and
    `getLastSnapshot()` seams rather than introducing a second detection pass.
- Implementation References:
  - `src/extension.ts`
  - `src/ui/runtimeAvailabilityNotice.ts`
- Verification References:
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/unit/runtimeAvailabilityNotice.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the gate keyed on the LabVIEW CLI prerequisite and the cached
    detection; richer compare-time runtime diagnostics belong to
    `comparisonRuntimeLocator` and VHS-REQ-155. Do not re-probe the filesystem
    inside the `labviewViHistory.open` hot path; the watcher already caches and
    refreshes detection.
  - VHS-REQ-629 refines the block toast copy and install action for the
    "LabVIEW installed but CLI missing" state; keep both requirements'
    decision logic in `decideLabviewCliOpenGate`.




### VHS-REQ-629: LabVIEW CLI Install Offer When LabVIEW Is Installed

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: When the `labviewViHistory.open` LabVIEW CLI gate (VHS-REQ-627)
  blocks because the LabVIEW CLI is not installed, the extension shall tailor
  the warning toast to the detected state so that a host with LabVIEW
  \u22652025 installed but the LabVIEW CLI missing receives a message naming
  LabVIEW as already present and an `Install LabVIEW CLI` action that opens the
  dedicated NI LabVIEW Command-Line Interface download page, instead of the
  generic `Install LabVIEW` action that points at the full LabVIEW installer.
- Acceptance Criteria:
  - `isLabviewHostInstalledWithoutCli(detection)` returns true only when
    `detection.host.installations` is non-empty and no installation exposes a
    `labviewCliPath`; detection only records supported years, so a non-empty
    list already implies LabVIEW \u22652025.
  - When the gate blocks and `isLabviewHostInstalledWithoutCli` is true, the
    decision carries `LABVIEW_CLI_MISSING_WITH_HOST_MESSAGE` (which states that
    LabVIEW is installed but the LabVIEW CLI is not), an action label of
    `Install LabVIEW CLI`, and an install URL of `INSTALL_LABVIEW_CLI_URL`
    (`https://www.ni.com/en/support/downloads/software-products/download.ni-labview-command-line-interface.html`).
  - When the gate blocks and no host LabVIEW is installed, the decision keeps
    the original `LABVIEW_CLI_OPEN_BLOCKED_MESSAGE`, the `Install LabVIEW`
    action label, and the `INSTALL_LABVIEW_URL` full-installer download
    (no regression of VHS-REQ-627).
  - `presentLabviewCliOpenBlockedToast(decision)` shows the decision's message
    and action label and opens the decision's install URL via
    `vscode.env.openExternal`; the `labviewViHistory.open` wiring passes the
    gate decision to the presenter.
  - The allow paths from VHS-REQ-627 are unchanged: the gate still allows the
    command when the LabVIEW CLI is installed, when a satisfiable Docker
    provider is active, and when cached detection is not yet available.
  - The block decision remains a pure, window-free helper; only the presenter
    touches `vscode.window` and `vscode.env`. No automatic download or
    installer execution occurs \u2014 the action only offers an external link.
- Agent Work Scope:
  - Extend the LabVIEW CLI gate decision and toast copy in
    `src/ui/runtimeAvailabilityNotice.ts` and pass the decision to the
    presenter from `src/extension.ts`. Reuse the VHS-REQ-617 cached detection;
    do not add a second detection pass, a new command, or a pre-panel gate
    beyond the existing VHS-REQ-627 gate.
- Implementation References:
  - `src/extension.ts`
  - `src/ui/runtimeAvailabilityNotice.ts`
- Verification References:
  - `tests/unit/runtimeAvailabilityNotice.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the dedicated LabVIEW CLI download URL free of volatile tracking
    tokens (for example `srsltid`). The status-bar "runtime available"
    labeling when LabVIEW is present but the CLI is missing stays under
    VHS-REQ-616 / VHS-REQ-617; this requirement only owns the block-toast copy
    and install action.




### VHS-REQ-622: Automated End-to-End Windows Runtime Conflict Verification Harness

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Verification Infrastructure
- Statement: The repository shall provide a maintainer-driven Windows
  end-to-end verification harness that, when invoked on a host with both
  bitnesses of LabVIEW 2026 installed, drives the real `vihs --validate`
  CLI against a real running LabVIEW process in each of the two
  steady-state bitness directions (x64 host with x86 selected, x86 host
  with x64 selected), captures the resulting `runtimeBlockedReason` and
  proof JSON, and emits a machine-readable evidence file
  (`assurance-closeout-evidence/manual-vhs-req-621.json`) so VHS-REQ-621
  can be closed against deterministic, reproducible proof rather than
  manual screenshots. Race-condition reclassification scenarios
  (`labview-host-bitness-conflict`) remain covered by the existing
  unit-test contract at
  `tests/unit/comparisonReportRuntimeExecution.test.ts` and are
  out-of-scope for this harness.
- Acceptance Criteria:
  - `scripts/runWindowsRuntimeMatrix.js` exposes a pure
    `runRuntimeMatrix(argv, deps)` module entry whose process execution,
    filesystem, clock, host identity, environment, working directory,
    and output-stream collaborators are injectable for deterministic unit
    tests; the default CLI binding refuses to run on non-Windows hosts
    unless `VIHS_FAKE_WINDOWS=1` is set for tests.
  - Two scenarios — `steady-A` (`HostBitness=x64,
    SelectedBitness=x86`) and `steady-B` (`HostBitness=x86,
    SelectedBitness=x64`) — are driven by per-scenario PowerShell
    helpers under `scripts/windows-runtime-matrix/` that (i) close any
    running LabVIEW, (ii) launch LabVIEW at the chosen bitness from the
    bitness-correct install root, (iii) invoke `vihs --validate
    --proof-out <path>`, (iv) parse the emitted proof JSON, and (v)
    assert `runtimeBlockedReason === 'windows-host-bitness-conflict'`
    plus the observed `LabVIEW.exe` `ExecutablePath` matches the
    intended bitness root.
  - The harness aggregates scenario outcomes into a single evidence
    object validating the schema string
    `vi-history-suite/runtime-matrix-evidence@v1` with shape
    `{schema, runId, host, labviewVersion, scenarios:[{id, expected,
    observed, pass, durationMs, artifacts}], summary:{passed, failed,
    raceCoverage:'covered-by-unit-tests'}}` and exits zero only when
    `summary.failed === 0` and the file was written.
  - A new `.github/workflows/windows-runtime-matrix.yml` GitHub Actions
    workflow is `workflow_dispatch`-only, runs on
    `[self-hosted, Windows, X64, vihs-windows-labview-maintainer]`,
    enforces the trusted-ref allow-list (`main`, `release/v*`, and
    `v*.*.*` tags only), and uploads the matrix evidence plus captured
    proofs as a build artifact.
- Agent Work Scope:
  - Reuse the `vihs --validate --proof-out` channel as the assertion
    surface rather than parsing extension UI; do not extend the CLI
    error-code mapping in this requirement — assert on
    `runtimeBlockedReason` directly in the proof JSON. Do not couple
    to the `labview-icon-editor` repository at runtime; copy only the
    narrow helpers we need (path-based `LabVIEW.exe` cim filter,
    bitness install-root resolution) into this repo so the harness
    stays self-contained. Race-condition reclassification stays
    deferred to the existing unit-test contract.
- Implementation References:
  - `scripts/runWindowsRuntimeMatrix.js`
  - `scripts/windows-runtime-matrix/Invoke-RuntimeMatrixSteadyState.ps1`
  - `scripts/windows-runtime-matrix/Close-LabviewProcesses.ps1`
  - `.github/workflows/windows-runtime-matrix.yml`
- Verification References:
  - `tests/unit/runWindowsRuntimeMatrixScript.test.ts`
  - `tests/unit/windowsRuntimeMatrixWorkflow.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the assertion key on `runtimeBlockedReason` string equality
    so the harness stays decoupled from the CLI error-code mapping. If
    a future requirement tightens that mapping (dedicated
    `VIHS_E_WINDOWS_HOST_BITNESS_CONFLICT` code), extend the harness
    to also assert on `runtimeErrorCode` in addition to the
    blocked-reason string — never replace the string assertion.
  - The harness is shared: VHS-REQ-653 adds parallel `version-A` /
    `version-B` scenarios (same bitness, different year) that assert
    `windows-host-version-conflict`. Keep the steady-* bitness contract
    above unchanged when extending the scenario set, and keep the
    per-scenario expected blocked reason parameterized rather than
    hard-coded.

### VHS-REQ-623: Windows Host-Native VI Server TCP Preflight Parity

- Status: Active
- Parent: VHS-SYS-REQ-007
- Area: Comparison Reports
- Statement: Before launching LabVIEWCLI, Windows host-native
  `labview-cli` runs shall read the `LabVIEW.ini` adjacent to the
  selected LabVIEW executable and block execution with
  `blockedReason: 'windows-vi-server-tcp-disabled'` when
  `server.tcp.enabled=False` is explicitly set, so operators receive
  an actionable, classified preflight failure instead of the generic
  `labview-cli-connection-failed` reason after a `-350000` connect
  timeout. This mirrors the Linux `labview.conf` preflight
  established by VHS-REQ-156 while preserving the Windows default
  (VI Server TCP enabled when the key is absent or the file is not
  readable).
- Acceptance Criteria:
  - When the runtime selection is `platform='win32'`,
    `provider='host-native'`, and `engine='labview-cli'`, the existing
    Windows `LabVIEW.ini` parser exposes a tri-state
    `viServerTcpEnabled` field on `WindowsLabviewTcpSettings`:
    `true` when `server.tcp.enabled=True` is parsed or the key is
    absent in a readable ini, `false` only when the key is parsed as
    explicitly `False`, and `'unknown'` when the ini is not readable.
  - When `viServerTcpEnabled === false`, execution is blocked with
    `state='not-available'`, `blockedReason='windows-vi-server-tcp-disabled'`,
    `diagnosticReason='windows-vi-server-tcp-disabled'`, and a
    diagnostic note that names the inspected `LabVIEW.ini` path and
    points at Tools → Options → VI Server as remediation. The
    LabVIEWCLI process is not spawned in this state.
  - When `viServerTcpEnabled !== false` (true or unknown), the
    Windows host-native flow proceeds unchanged, preserving the
    pre-existing implicit-enabled behavior for unreadable `LabVIEW.ini`
    files (Windows LabVIEW defaults VI Server TCP on, opposite of NI
    Linux).
  - The `windows-vi-server-tcp-disabled` block runs after the Linux
    host preflight and before `preflightWindowsHostRuntimeSurface`, so
    the explicit ini-disabled signal wins over the bitness-conflict /
    contaminated-surface arm covered by VHS-REQ-621.
  - The `lvcompare` engine remains exempt from this preflight because
    it does not connect to LabVIEW VI Server.
  - The `vihs --validate` runtime-validation proof serializes the
    observed host VI Server port (`runtime.hostLabviewTcpPort`) and the
    `LabVIEW.ini` it was read from (`runtime.hostLabviewIniPath`), as
    explicit `null` when the runtime is not Windows host-native, so
    real-hardware validation evidence proves a non-default
    `server.tcp.port` was admitted without a false conflict block. The
    Windows runtime matrix harness `port-A` scenario derives its
    expected VI Server port from the selected install's own
    `LabVIEW.ini` (the same parse the product uses) rather than a
    hardcoded or operator-supplied constant, then asserts the admitted
    (`blockedReason=none`) run's proof reports `hostLabviewIniPath`
    equal to that selected install's ini and `hostLabviewTcpPort` equal
    to the port parsed from it. This keeps the contract correct for
    whatever port the operator configures and proves the product read
    the selected install rather than the latest-used one.
- Agent Work Scope:
  - Reuse the existing `resolveWindowsLabviewTcpSettingsForLabviewPath`
    parser; do not introduce a second ini reader. Add a small
    `preflightWindowsHostViServerTcpDisabled` function next to the
    existing Linux/Windows preflight helpers, wire it in
    `executeComparisonReport` between the Linux preflight check and
    `preflightWindowsHostRuntimeSurface`, and update unit tests
    together. Do not auto-mutate `LabVIEW.ini` — write actions race
    with running LabVIEW IDE rewrites on clean shutdown and are out of
    scope for this requirement.
- Implementation References:
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonReportPacket.ts`
  - `src/tooling/localRuntimeSettingsCli.ts`
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/localRuntimeSettingsCli.test.ts`
  - `tests/unit/runWindowsRuntimeMatrixScript.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Treat absent `server.tcp.enabled` on Windows as enabled; do not
    flip this default without a separate requirement. The Linux
    parity is intentionally one-way: Linux blocks on absent or
    unreadable, Windows only blocks on explicit `False`.

### VHS-REQ-628: Actionable VI Server Disabled Comparison Guidance

- Status: Active
- Parent: VHS-SYS-REQ-007
- Area: Comparison Reports
- Statement: When a comparison report is blocked because LabVIEW VI
  Server (TCP/IP) is disabled
  (`blockedReason`/`diagnosticReason` of `windows-vi-server-tcp-disabled`
  or `linux-vi-server-tcp-disabled` from the VHS-REQ-623 / VHS-REQ-156
  preflights), the runtime doctor shall emit a specific, actionable
  next-action that names VI Server as the unmet prerequisite and the
  enable path, so the existing blocked-compare warning notification,
  history panel runtime summary, and retained evidence tell the user how
  to fix it instead of falling back to the generic host-runtime guidance.
- Acceptance Criteria:
  - `deriveRuntimeDoctorNextAction` returns a VI-Server-specific
    next-action when the resolved runtime blocked reason is
    `windows-vi-server-tcp-disabled`: it names enabling VI Server in
    LabVIEW (Tools → Options → VI Server), mentions the
    `server.tcp.enabled=True` LabVIEW.ini key as an alternative, and
    instructs the user to restart LabVIEW and rerun comparison report
    generation.
  - `deriveRuntimeDoctorNextAction` returns a VI-Server-specific
    next-action when the resolved runtime blocked reason is
    `linux-vi-server-tcp-disabled`: it names enabling VI Server TCP/IP
    for the selected LabVIEW (`server.tcp.enabled=True` in
    `labview.conf`, or LabVIEW Tools → Options → VI Server), and
    instructs the user to restart LabVIEW and rerun comparison report
    generation.
  - The VI-Server next-action becomes the doctor summary's final line, so
    the open-command warning notification (which extracts the
    `Next action:` line from the doctor summary) and the history panel
    runtime result surface the same actionable guidance for both
    platforms.
  - The guidance points at the manual LabVIEW VI Server setting rather
    than a `viHistorySuite.*` runtime setting or a VS Code command,
    because VI Server enablement is not a runtime selection the
    extension can change.
- Agent Work Scope:
  - Add the two blocked-reason branches in `deriveRuntimeDoctorNextAction`
    inside `src/reporting/comparisonRuntimeDoctor.ts` and cover them with
    doctor unit tests. Reuse the existing blocked-reason resolution
    (`runtimeExecution.blockedReason ?? runtimeSelection.blockedReason`);
    do not add a second detection path or a pre-panel gate, because VI
    Server TCP state is only known once the selected runtime's
    `LabVIEW.ini` / `labview.conf` is read at compare time.
- Implementation References:
  - `src/reporting/comparisonRuntimeDoctor.ts`
- Verification References:
  - `tests/unit/comparisonRuntimeDoctor.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the VI Server detection itself in the VHS-REQ-623 / VHS-REQ-156
    preflights; this requirement only owns the user-facing next-action
    copy. Keep the guidance a compare-time surface — do not promote it
    into a pre-panel `labviewViHistory.open` gate, which would be
    Windows-only and could not see the Linux `labview.conf` state.
  - VHS-REQ-630 owns the complementary post-attempt case: when the ini
    preflight does not catch a disabled VI Server and LabVIEWCLI fails to
    connect with `-350000` (`labview-cli-connection-failed`), the failed
    next-action also names VI Server.

### VHS-REQ-663: Linux Container Bind-Mount Visibility Diagnostic

- Status: Active
- Parent: VHS-SYS-REQ-007
- Area: Comparison Reports
- Statement: When a Linux container comparison fails with an invalid-VI-path
  signature (`labview-cli-invalid-vi-path`) and the host report directory that
  is bind-mounted into the container is outside the user's home directory, the
  extension shall attach an actionable diagnostic note naming snap-Docker
  bind-mount confinement as the likely cause and the remediation (keep report
  storage under the home directory, or connect the required snap interface), so
  the operator is not left decoding a generic path error for a mount-visibility
  problem.
- Acceptance Criteria:
  - `buildLinuxContainerBindMountVisibilityNote(options)` returns an actionable
    remediation note only when `provider === 'linux-container'`, the
    `diagnosticReason` or `failureReason` is `labview-cli-invalid-vi-path`, and
    the supplied host bind-mount path is a non-empty path outside the supplied
    home directory; it returns `undefined` for any other provider, any other
    failure signature, a bind-mount path inside the home directory, or a missing
    host path or home directory.
  - The note names the offending host bind-mount path and home directory,
    identifies snap-packaged Docker confinement (only the connected `home`
    interface is mounted by default) as the cause, and offers the two
    remediations (keep report storage under the home directory, or
    `sudo snap connect docker:removable-media`), noting native Docker is
    unaffected.
  - `executeComparisonReport` appends the note to the failed run's
    `diagnosticNotes` for a `linux-container` provider only, and never for a
    successful run; the note is derived from `record.artifactPlan.reportDirectory`
    (the bind-mount source) and the resolved home directory, and does not change
    the `failureReason` or `diagnosticReason`.
- Agent Work Scope:
  - Keep the detection a pure exported helper next to
    `classifyLabviewCliDiagnosticText` and wire it through the existing
    `mergeDiagnosticNotes` assembly, gated on run failure; do not add a new
    provider probe or spawn `snap` at runtime. Detection of the invalid-path
    signature stays in `classifyLabviewCliDiagnosticText`; this requirement owns
    only the added remediation note.
- Implementation References:
  - `src/reporting/comparisonReportRuntimeExecution.ts`
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Scope strictly to the Linux container invalid-VI-path case; never attach the
    note to other providers or other failure signatures. Keep the remediation
    copy aligned with the TROUBLESHOOTING snap-Docker bind-mount section.

### VHS-REQ-630: Actionable VI Server Guidance For LabVIEW CLI Connection Failure

- Status: Active
- Parent: VHS-SYS-REQ-007
- Area: Comparison Reports
- Statement: When a host-native LabVIEWCLI comparison attempt fails with
  the VI Server connection error classified as
  `labview-cli-connection-failed` (LabVIEWCLI exit error `-350000`), the
  runtime doctor shall emit a specific, actionable next-action that names
  VI Server (TCP/IP) being disabled for the selected LabVIEW as the most
  common cause and the enable path, so the failed-compare warning
  notification, history panel runtime result, and retained evidence are
  actionable instead of falling back to the generic
  retained-runtime-notes guidance. This complements VHS-REQ-628 by
  covering the post-attempt failure that the VHS-REQ-623 / VHS-REQ-156 ini
  preflight cannot always catch (the `server.tcp.enabled` key may be
  absent, the ini unreadable, or written by LabVIEW only on clean exit).
- Acceptance Criteria:
  - `deriveRuntimeDoctorNextAction` returns a VI-Server-specific
    next-action when `runtimeExecution.state` is `failed` and
    `runtimeExecution.failureReason` is `labview-cli-connection-failed`:
    it states that LabVIEWCLI launched LabVIEW but could not connect over
    VI Server (error `-350000`), names VI Server (TCP/IP) being disabled
    for the selected LabVIEW as the most common cause, and instructs the
    user to enable VI Server in LabVIEW (Tools → Options → VI Server),
    confirm `server.tcp.enabled=True` and the configured port, restart
    LabVIEW, and rerun comparison report generation.
  - The VI-Server next-action becomes the doctor summary's final line, so
    the failed-compare warning notification (which extracts the
    `Next action:` line from the doctor summary) and the history panel
    runtime result surface the same actionable guidance.
  - The `-350000` → `labview-cli-connection-failed` classification in
    `classifyRuntimeFailure` is unchanged; this requirement only adds the
    failed-state next-action copy.
  - Existing failed-state next-action branches (password-protected,
    bitness-conflict, host-native timeout) are unchanged.
- Agent Work Scope:
  - Add the `labview-cli-connection-failed` failed-state branch in
    `deriveRuntimeDoctorNextAction` inside
    `src/reporting/comparisonRuntimeDoctor.ts` and cover it with doctor
    unit tests. Do not change the `-350000` classification, the
    VHS-REQ-623 / VHS-REQ-156 ini preflight, or add a pre-panel gate.
- Implementation References:
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonRuntimeDoctor.ts`
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/comparisonRuntimeDoctor.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep VI Server enablement guidance pointed at the manual LabVIEW
    setting, not a `viHistorySuite.*` runtime setting or command. A
    stricter pre-attempt block (treating an absent or unreadable
    `server.tcp.enabled` as blocked) is intentionally out of scope here
    because it risks false-positives for hosts that legitimately run VI
    Server on without an explicit key; that belongs to a separate
    requirement with dedicated tests.

### VHS-REQ-631: Pre-Panel VI Server Prerequisite Gate For VI History Open

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: The extension shall consult the selected host LabVIEW's VI
  Server configuration when `labviewViHistory.open` is invoked and refuse
  to open the VI History panel with a warning toast when that
  configuration does not explicitly enable VI Server TCP, so users learn
  before selecting revisions that VI Server TCP needs enabling instead of
  meeting a `-350000` connection failure at compare time. Per the
  maintainer decision the gate requires an explicit opt-in: an absent
  `server.tcp.enabled` key is treated as not enabled, a stricter rule than
  the compare-time VHS-REQ-623 preflight (which preserves the Windows
  absent-key default of enabled). The accepted tradeoff is a possible
  false-positive block for Windows hosts that run VI Server on without an
  explicit key.
- Acceptance Criteria:
  - `isViServerExplicitlyEnabledInConfig(text)` returns true only when a
    `server.tcp.enabled=True` line is present (case, surrounding
    whitespace, and optional quotes tolerant). An absent key, an explicit
    `False`, and unparseable text all return false.
  - `decideViServerOpenGate(detection, snapshot, deps)` returns `allow`
    when the cached detection is not yet available, when a satisfiable
    Docker provider is the active runtime, when no host installation
    resolves from the snapshot, or when the platform is not a host-compare
    platform (for example macOS); these keep activation races, container
    users, and unresolved selections from being blocked.
  - Otherwise the gate resolves the selected LabVIEW's VI Server config —
    on Windows the `LabVIEW.ini` adjacent to the selected `LabVIEW.exe`;
    on Linux the `labview.conf` candidate set for the selected
    version/bitness (reusing the VHS-REQ-156 candidate builder) — and
    returns `block` unless at least one readable config is explicitly
    enabled. Unreadable configs count as not enabled.
  - `labviewViHistory.open` runs this gate after the Git and LabVIEW-CLI
    gates using the watcher's cached detection and snapshot; when the gate
    blocks it presents a warning toast that names VI Server and the enable
    path (Tools → Options → VI Server, `server.tcp.enabled=True`, restart
    LabVIEW) and does not open the history panel. Because the Docker and
    no-CLI cases are short-circuited earlier, the gate performs at most one
    bounded config read on the open hot path.
  - The block decision is a pure, window-free async helper (an injected
    `readFile` keeps it unit-testable); only the presenter touches
    `vscode.window`.
  - The compare-time VHS-REQ-623 / VHS-REQ-156 resolvers are unchanged;
    this strict open-gate rule does not alter the compare-time preflight.
- Agent Work Scope:
  - Add the VI Server open-gate decision helpers and toast copy in
    `src/ui/runtimeAvailabilityNotice.ts` and wire them into
    `labviewViHistory.open` in `src/extension.ts` after the LabVIEW CLI
    gate. Reuse the VHS-REQ-617 cached detection and the VHS-REQ-156 Linux
    candidate builder; do not add a TCP port probe or change the
    compare-time preflight.
- Implementation References:
  - `src/extension.ts`
  - `src/ui/runtimeAvailabilityNotice.ts`
- Verification References:
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/unit/runtimeAvailabilityNotice.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the strict explicit-`True` rule open-gate-only; the compare-time
    VHS-REQ-623 Windows default (absent key → enabled) stays so retained
    runtime evidence is not changed. Detection is `LabVIEW.ini` /
    `labview.conf` parsing only — no TCP port probe — and the toast copy
    stays consistent with the VHS-REQ-628 / VHS-REQ-630 VI Server
    guidance. The accepted false-positive tradeoff (Windows VI Server on
    without an explicit key) is intentional for this gate.

### VHS-REQ-632: Host LabVIEW Install Catalog Parity

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: The extension shall derive the documented host LabVIEW,
  LabVIEW CLI, and LVCompare install locations from a single shared install
  catalog consumed by both activation-time runtime detection (VHS-REQ-616)
  and the comparison runtime locator (VHS-REQ-155), so the lightweight
  activation detector recognizes every documented LabVIEW and LabVIEW CLI
  filesystem install location the comparison locator recognizes. Activation
  detection resolves the host LabVIEW executable and its LabVIEW CLI;
  LVCompare is a locator-only surface that draws its paths from the same
  catalog. This prevents the LabVIEW CLI
  open gate (VHS-REQ-627 / VHS-REQ-629) from blocking a host the compare
  engine could serve when the two detectors' hardcoded path lists drift
  apart, the defect class first observed when a narrower Linux detector
  missed the shared LabVIEW CLI launcher.
- Acceptance Criteria:
  - A single module (`src/tooling/labviewInstallCatalog.ts`) is the source
    of the supported LabVIEW year range, the Linux install directories
    (the quarterly `LabVIEW-<year>Q1-64` / `LabVIEW-<year>Q3-64` forms and
    the plain `LabVIEW-<year>-64` form), the shared `nilvcli` LabVIEW CLI
    launchers, the Windows `LabVIEW <year>[ Q1| Q3]` folder names, the
    shared Windows LabVIEW CLI path, and the LVCompare paths.
  - `detectLinuxHostInstallations` and `detectWindowsHostInstallations`
    enumerate the catalog candidates; a Linux host whose only LabVIEW lives
    in a quarterly install directory is detected, closing the activation
    gate gap that previously false-blocked it.
  - `buildDocumentedRuntimeCandidates` in the comparison runtime locator
    derives its filesystem scan from the same catalog, so the documented
    LabVIEW executable and LabVIEW CLI candidate paths the locator scans are
    a subset of what activation detection probes; LVCompare is a
    locator-only candidate, and the locator's Windows registry query
    remains the locator-only superset for non-default installs.
  - The single canonical 32-bit shared Windows LabVIEW CLI scan path is
    unchanged.
  - The catalog is pure (no VS Code, filesystem, or child-process
    dependencies) so both the tooling and reporting layers consume it
    without an import cycle.
- Agent Work Scope:
  - Add `src/tooling/labviewInstallCatalog.ts` and refactor
    `src/tooling/runtimeAutoDetect.ts` and
    `src/reporting/comparisonRuntimeLocator.ts` to consume it. Do not add
    registry or child-process probing to activation detection; the
    VHS-REQ-616 filesystem-only cost contract stands and the Windows
    registry-only divergence is tracked separately.
- Implementation References:
  - `src/tooling/labviewInstallCatalog.ts`
  - `src/tooling/runtimeAutoDetect.ts`
  - `src/reporting/comparisonRuntimeLocator.ts`
- Verification References:
  - `tests/unit/labviewInstallCatalog.test.ts`
  - `tests/unit/runtimeAutoDetect.test.ts`
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the catalog the single source of truth: add new documented install
    locations here, not in the detector or the locator. Preserve the
    canonical 32-bit shared Windows LabVIEW CLI scan path so the locator's
    documented-candidate contract holds. Activation detection stays
    filesystem-only; registry-resolved and custom-path installs (the
    locator-only superset) are out of scope for this parity requirement.

### VHS-REQ-633: Manual LabVIEW Runtime Path Override

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: The extension shall let users override host LabVIEW runtime
  discovery with `viHistorySuite.labviewCliPath` and
  `viHistorySuite.labviewExePath`, which the comparison runtime locator
  consumes as configured candidates and which the LabVIEW CLI open gate
  honors, so a user whose LabVIEWCLI or LabVIEW executable lives where
  auto-detection does not look can run comparisons instead of being blocked.
  Both settings name executables the comparison launches, so both are
  restricted in untrusted workspaces. This makes the runtime doctor guidance
  that already advises setting these paths functional end to end.
- Acceptance Criteria:
  - `package.json` contributes `viHistorySuite.labviewCliPath` and
    `viHistorySuite.labviewExePath` (string), and both appear in
    `capabilities.untrustedWorkspaces.restrictedConfigurations` so an
    untrusted workspace cannot point the extension at an arbitrary executable.
  - `readComparisonRuntimeSettings` reads both keys (trimmed; blank becomes
    `undefined`) into `ComparisonRuntimeSettings`, so `locateComparisonRuntime`
    builds `configured` candidates and returns
    `configured-labview-cli-path-missing` / `configured-labview-exe-path-missing`
    when a configured path does not exist.
  - `decideLabviewCliOpenGate` allows `labviewViHistory.open` when a non-empty
    `viHistorySuite.labviewCliPath` is configured, trusting the explicit
    override; existence validation stays with the compare-time locator, so a
    wrong path yields a precise compare-time block rather than a gate block.
  - The gate remains pure and window-free: it inspects the configured string
    only and performs no filesystem probe.
- Agent Work Scope:
  - Contribute the two settings (and restrict them) in `package.json`, read
    them in `readComparisonRuntimeSettings`, add the override allow path to
    `decideLabviewCliOpenGate`, and pass the configured CLI path from
    `labviewViHistory.open` in `src/extension.ts`. Do not add filesystem
    probing to the gate; the locator owns existence validation.
- Implementation References:
  - `package.json`
  - `src/reporting/comparisonReportAction.ts`
  - `src/ui/runtimeAvailabilityNotice.ts`
  - `src/extension.ts`
- Verification References:
  - `tests/unit/comparisonReportAction.test.ts`
  - `tests/unit/runtimeAvailabilityNotice.test.ts`
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the gate override trust-based: the gate checks only that the
    configured path is a non-empty string and never stats it, so existence
    validation stays in the locator (a wrong path surfaces as
    `configured-labview-cli-path-missing` at compare time). Keep both settings
    in `restrictedConfigurations` because they name executables the comparison
    launches.

### VHS-REQ-634: Authoritative Host Fallback For LabVIEW CLI Open Gate

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: When the synchronous LabVIEW CLI open gate (VHS-REQ-627) would
  block `labviewViHistory.open` from the filesystem-only activation detection
  (VHS-REQ-616), the extension shall consult a bounded, on-demand authoritative
  probe before blocking, so a Windows LabVIEW install resolved only through the
  registry at a non-default path — which the activation detector intentionally
  cannot see because it never queries the registry — does not false-block the
  panel. Activation detection stays filesystem-only; the authoritative probe
  runs only on the gate's block branch on Windows.
- Acceptance Criteria:
  - `probeWindowsRegistryHostLabviewAvailable(deps)` reuses the locator's
    existing registry query plans and parser, returns true only when the
    registry resolves a `LabVIEW.exe` — either named directly or derived from
    the National Instruments install-directory `Path` value (for example
    `C:\Program Files\National Instruments\LabVIEW <year>\`, which is what a
    stock NI install actually records) — that exists on disk AND the shared
    Windows LabVIEW CLI exists on disk, and never throws (a failed registry
    query yields false). It performs no container or process probes.
  - `decideLabviewCliOpenGateWithRegistryFallback(baseDecision, deps)` returns
    the base decision unchanged unless it is `block`, the platform is Windows,
    and a probe is supplied; in that case it returns `allow` when the probe
    reports an available host LabVIEW, and otherwise returns the base block
    (including when the probe throws — fail closed).
  - `labviewViHistory.open` computes the synchronous gate decision (with the
    VHS-REQ-633 override) and then awaits the fallback with the registry probe
    before presenting the block toast, so the probe runs at most once per open
    and only when about to block.
  - The synchronous `decideLabviewCliOpenGate` contract (VHS-REQ-627/629/633)
    is unchanged; the fallback is an additive wrapper.
- Agent Work Scope:
  - Add the bounded registry probe to `src/reporting/comparisonRuntimeLocator.ts`
    (reusing the shipped `reg query` helpers), add the async fallback wrapper to
    `src/ui/runtimeAvailabilityNotice.ts`, and wire it into `labviewViHistory.open`
    in `src/extension.ts`. Do not add registry or child-process probing to
    activation detection.
- Implementation References:
  - `src/reporting/comparisonRuntimeLocator.ts`
  - `src/ui/runtimeAvailabilityNotice.ts`
  - `src/extension.ts`
- Verification References:
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/unit/runtimeAvailabilityNotice.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the probe bounded and fail-open-safe: it must never throw out of the
    open command, and it must not add container or process probes. Activation
    detection stays filesystem-only (VHS-REQ-616); only the gate's block branch
    consults the registry, and only on Windows. The synchronous gate decision
    helper stays pure so its existing tests and contract are preserved.

### VHS-REQ-635: Selected-File On-Demand Eligibility

- Status: Active
- Parent: VHS-SYS-REQ-018
- Area: Git History Eligibility
- Statement: The `labviewViHistory.open` command shall evaluate eligibility for
  the selected URI on demand without waiting for or requiring a repository-wide
  VI eligibility index before opening that file's history or returning a factual
  ineligibility message.
- Acceptance Criteria:
  - The command path evaluates the requested URI's repository root, content
    signature, Git tracking, and minimum two modifying commits for that file.
  - Opening history for one selected file does not enumerate every tracked VI in
    the repository or show repository-wide `Indexing LabVIEW VIs` progress as a
    prerequisite to the selected file result.
  - Ineligible selected files produce factual, actionable messages for unknown
    LabVIEW format, no Git history, one commit, or other failed eligibility
    facts.
  - Manifest menu visibility remains a hint; selected-file eligibility remains
    the command-time source of truth.
  - Selected-file eligibility is independent of repository-wide indexing and
    does not depend on a repository-wide scan; the separate LabVIEW CLI and VI
    Server pre-panel prerequisite gates (VHS-REQ-627, VHS-REQ-631) are unchanged
    and out of scope for this requirement.
- Agent Work Scope:
  - Change command open flow, selected-file history model, Git helper calls,
    manifest/menu assumptions, requirements, and verification together when the
    selected-file eligibility contract changes. Do not reintroduce
    repository-wide VI scans as a prerequisite for opening one selected file.
- Implementation References:
  - `src/extension.ts`
  - `src/commands/openViHistoryCommand.ts`
  - `src/services/viHistoryModel.ts`
  - `src/services/viHistoryService.ts`
  - `src/git/gitCli.ts`
  - `package.json`
- Verification References:
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/unit/openViHistoryCommand.test.ts`
  - `tests/unit/viHistoryModel.test.ts`
  - `tests/unit/viHistoryService.test.ts`
  - `tests/unit/gitCli.test.ts`
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Prefer selected-file Git and signature checks over background repository
    inventory. If future features need repository-wide inventory, keep them
    optional and outside the blocking open-history path.

### VHS-REQ-636: Pre-Panel LabVIEW Bitness Conflict Gate For VI History Open

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: When `labviewViHistory.open` is invoked on Windows and the runtime
  detection observes a running LabVIEW process whose bitness differs from the
  selected `viHistorySuite.labviewBitness`, the extension shall refuse to open
  the VI History panel and instead present a single plain-language warning toast
  that names the running LabVIEW (year when known, plus bitness) and the
  selected LabVIEW (year plus bitness), instructs the user to save and close the
  running LabVIEW session before retrying, and offers a `Pick Runtime Provider`
  action that invokes `labviewViHistory.pickRuntimeProvider`, so the conflict is
  caught at open time instead of after revision selection and Compare, where it
  currently surfaces as the verbose `windows-host-bitness-conflict`
  blocked-runtime comparison report (VHS-REQ-621).
- Acceptance Criteria:
  - A window-free `decideBitnessOpenGate` decision helper returns `allow` when
    the cached detection is not yet available so an activation race never blocks
    the command, matching the Git, LabVIEW CLI, and VI Server pre-panel gates.
  - The gate returns `allow` when the platform is not Windows, when the active
    runtime snapshot is a satisfiable Docker provider (container compare runs
    LabVIEW inside the image so a host bitness conflict is irrelevant), when no
    host LabVIEW installation resolves from the snapshot, and when no running
    `LabVIEW.exe` of a known bitness differing from the selected bitness is
    observed.
  - The gate returns `block` only when an observed running `LabVIEW.exe` has a
    known bitness (`x86` or `x64`) that differs from the selected
    `viHistorySuite.labviewBitness`; the block decision carries the toast
    message and a `Pick Runtime Provider` action label.
  - The gate reuses the VHS-REQ-621 path-based bitness inference (a path under
    `\Program Files (x86)\` is `x86`, a path under `\Program Files\` is `x64`,
    otherwise `unknown`) and a best-effort running-year inference from the
    observed executable path; the running year is omitted from the message when
    it cannot be inferred.
  - The block toast message (built by `buildBitnessOpenBlockedMessage`) names
    the running LabVIEW (year when known plus bitness), names the selected
    LabVIEW (year plus bitness), and instructs the user to save and close the
    running LabVIEW session, or to change `viHistorySuite.labviewBitness` (and
    `viHistorySuite.labviewVersion`) to match the running session, before
    retrying.
  - `presentBitnessOpenBlockedToast(decision)` shows the decision's message and
    `Pick Runtime Provider` action and, when the action is selected, invokes
    `labviewViHistory.pickRuntimeProvider`; it performs no automatic correction
    of `viHistorySuite.labviewBitness`.
  - `labviewViHistory.open` consults this gate after the VI Server gate
    (VHS-REQ-631) and before opening the history panel; when the gate blocks it
    presents the toast and does not start the history panel or the comparison
    flow.
  - The gate performs at most one bounded, Windows-only, on-demand process
    observation on the open path, reuses the existing `observeWindowsProcesses`
    injection seam, never spawns a process on non-Windows hosts, and fails open
    (allows the command) when the observation throws.
  - The compare-time VHS-REQ-621 detection and classification path is unchanged.
- Agent Work Scope:
  - Add the pure decision helper, the block message builder, the action label,
    and the toast presenter to `src/ui/runtimeAvailabilityNotice.ts` so unit
    tests exercise routing without a window, and wire the gate into the
    `labviewViHistory.open` gate chain in `src/extension.ts` after the VI Server
    gate. Reuse the VHS-REQ-621 bitness inference helpers
    (`observeWindowsRuntimeProcesses`, `inferLabviewBitnessFromExecutablePath`)
    plus the best-effort `inferLabviewYearFromExecutablePath` year helper from
    `src/reporting/comparisonReportRuntimeExecution.ts` and the existing
    `labviewViHistory.pickRuntimeProvider` command. Do not add a new process
    probe to the activation hot path, do not introduce a new command, do not
    auto-correct `viHistorySuite.labviewBitness`, and do not change the
    compare-time VHS-REQ-621 path.
- Implementation References:
  - `src/extension.ts`
  - `src/ui/runtimeAvailabilityNotice.ts`
  - `src/reporting/comparisonReportRuntimeExecution.ts`
- Verification References:
  - `tests/unit/runtimeAvailabilityNotice.test.ts`
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the gate window-free and keyed on the running-process bitness signal;
    richer compare-time runtime diagnostics stay with VHS-REQ-621 and
    VHS-REQ-155. Keep the bounded process observation Windows-only and off every
    non-block path. Name both bitnesses and treat the running year as
    best-effort. Reuse the `Pick Runtime Provider` quick-pick rather than a new
    command or an auto-switch of the bitness setting.

### VHS-REQ-637: Pre-Panel LabVIEW Version Mismatch Gate For VI History Open

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: When `labviewViHistory.open` is invoked on Windows and the runtime
  detection observes a running LabVIEW process whose major version (year)
  differs from the selected `viHistorySuite.labviewVersion` while its bitness
  matches (a differing bitness is already a hard conflict handled by
  VHS-REQ-636), the extension shall refuse to open the VI History panel and
  present a single plain-language warning toast that names the running LabVIEW
  year plus bitness and the selected LabVIEW year plus bitness, explains that VI
  History would connect to the LabVIEW already running (the wrong version), and
  instructs the user to save and close the running LabVIEW session, change
  `viHistorySuite.labviewVersion` to match it, or use a Docker-backed compare on
  x64 before retrying; the toast offers a `Pick Runtime Provider` action that
  invokes `labviewViHistory.pickRuntimeProvider`. A running LabVIEW whose year
  and bitness both match the selection remains admitted, preserving the
  `allowExistingWindowsHostRuntime` workflow.
- Acceptance Criteria:
  - A best-effort LabVIEW year is inferred from the observed `LabVIEW.exe`
    executable path (for example `...\National Instruments\LabVIEW 2026\LabVIEW.exe`
    yields `2026`) and exposed on `RuntimeProcessObservation` alongside
    `labviewProcessBitness`; the inferred year is treated as unknown when it
    cannot be parsed or falls outside the supported host year bounds
    (`MINIMUM_HOST_LABVIEW_YEAR`..`MAXIMUM_HOST_LABVIEW_YEAR`).
  - A window-free `decideVersionOpenGate` decision helper, composed after the
    VHS-REQ-636 bitness gate, returns `allow` when the cached detection is not
    yet available, the platform is not Windows, the active snapshot is a
    satisfiable Docker provider, no host LabVIEW installation resolves, the
    observed bitness differs from the selected bitness (deferred to VHS-REQ-636
    so the two gates never double-fire), the observed year is unknown, or the
    observed year equals the selected `viHistorySuite.labviewVersion`.
  - The gate returns `block` only when an observed running `LabVIEW.exe` has a
    known year that differs from the selected `viHistorySuite.labviewVersion`
    while the observed bitness matches the selected bitness (or is unknown); the
    block decision carries the toast message and a `Pick Runtime Provider`
    action label.
  - `VERSION_OPEN_BLOCKED_MESSAGE` names the running LabVIEW (year plus bitness)
    and the selected LabVIEW (year plus bitness), explains that VI History would
    connect to the already-running wrong-version LabVIEW, and instructs the user
    to save and close the running session, change `viHistorySuite.labviewVersion`
    to match the running session, or use a Docker-backed compare on x64.
  - `presentVersionOpenBlockedToast(decision)` shows the decision's message and
    `Pick Runtime Provider` action and, when the action is selected, invokes
    `labviewViHistory.pickRuntimeProvider`; it performs no automatic correction
    of `viHistorySuite.labviewVersion` and never mandates Docker.
  - `labviewViHistory.open` consults this gate after the VHS-REQ-636 bitness
    gate and before opening the history panel; when the gate blocks it presents
    the toast and does not start the history panel or the comparison flow.
  - The gate performs at most one bounded, Windows-only, on-demand process
    observation on the open path, reuses the existing `observeWindowsProcesses`
    injection seam (sharing the bitness gate's observation where practical),
    never spawns a process on non-Windows hosts, and fails open (allows the
    command) when the observation throws.
  - A running LabVIEW whose year and bitness both match the selection remains
    admitted with no regression of `allowExistingWindowsHostRuntime`; the
    compare-time VHS-REQ-155 path is unchanged, and the compare-time version
    conflict is handled by VHS-REQ-653 (the open gate and the compare-time gate
    never double-fire because the open gate runs first).
- Agent Work Scope:
  - Add the best-effort year-inference seam next to the VHS-REQ-621 bitness
    inference in `src/reporting/comparisonReportRuntimeExecution.ts`, add the
    pure decision helper, block message constant, action label, and toast
    presenter to `src/ui/runtimeAvailabilityNotice.ts`, and wire the gate into
    the `labviewViHistory.open` gate chain in `src/extension.ts` after the
    VHS-REQ-636 bitness gate. Reuse the existing `observeWindowsProcesses`
    observation and the `labviewViHistory.pickRuntimeProvider` command. Do not
    block or alter a matching-version session, do not add a new command or
    setting, do not mandate Docker, and do not change the VHS-REQ-636 or
    VHS-REQ-621 behavior.
- Implementation References:
  - `src/extension.ts`
  - `src/ui/runtimeAvailabilityNotice.ts`
  - `src/reporting/comparisonReportRuntimeExecution.ts`
- Verification References:
  - `tests/unit/runtimeAvailabilityNotice.test.ts`
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/extensionActivationLazySideEffects.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the gate window-free and keyed on the running-process year signal,
    composed strictly after the VHS-REQ-636 bitness gate so the two never
    double-fire. Keep the bounded process observation Windows-only and off every
    non-block path, and keep year inference best-effort and bounded to supported
    host years. Offer Docker as one recovery option rather than a requirement,
    and reuse the `Pick Runtime Provider` quick-pick rather than auto-switching
    `viHistorySuite.labviewVersion`.

### VHS-REQ-659: Single-VI Interactive Preview Rendering

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: The extension shall let a reviewer preview a single LabVIEW VI ("G
  code") as a self-contained HTML document rendered by NI's
  `PrintToSingleFileHtml` custom LabVIEWCLI operation (vendored under
  `resources/labview-cli-operations/PrintToSingleFileHtml`, sourced from
  ni/labview-for-containers), so a selected VI revision can be inspected without
  a second revision to compare against. The preview reuses the configured
  comparison runtime (host-native or LabVIEW container); the command-plan layer
  specified here builds the host and Linux-container invocations and is the
  first landed slice of the preview capability.
- Acceptance Criteria:
  - `buildLabviewCliPrintToSingleFileHtmlPlan` produces a `LabVIEWCLI`
    `-OperationName PrintToSingleFileHtml` command that passes the input VI via
    `-VI`, the output document via `-OutputPath`, and the vendored operation
    root via `-AdditionalOperationDirectory`, defaulting to `-LogToConsole
    TRUE`, `-c`, and `-o`; it emits `-LabVIEWPath`, `-PortNumber`, and
    `-Headless` only when those inputs are provided, and never emits the two-VI
    `CreateComparisonReport` flags (`-VI1`/`-VI2`/`-ReportPath`).
  - `rewriteViPreviewArgsForLinuxContainerWorkspace` maps `-VI` and
    `-OutputPath` to workspace-relative container paths, repoints
    `-AdditionalOperationDirectory` at the mounted operation root, replaces the
    host `-LabVIEWPath` with the in-container executable exactly once, and keeps
    `-Headless` present exactly once.
  - `buildLinuxContainerViPreviewCommandPlan` assembles a shell-less
    `docker run --rm` plan that bind-mounts the host workspace directory at the
    container workspace root and the vendored operation directory read-only at
    the operation root, and delivers the LabVIEWCLI invocation as a single
    `bash -lc` script.
  - `buildWindowsContainerViPreviewCommandPlan` assembles the Windows-container
    plan: the host PowerShell (`resolveWindowsPowerShellHostExecutable`) runs
    `docker run ... powershell -EncodedCommand <inner>`, bind-mounting the host
    workspace and the vendored operation directory at the Windows container
    roots. The inner PowerShell hardens the `LabVIEWCLI.ini` connect timeouts,
    optionally pre-launches LabVIEW, and retries once on the cold-launch
    `-350000`/`-350051` VI Server failure, mirroring the Windows-container
    comparison recipe. `mapComparisonRuntimeSelectionToViPreview` resolves the
    Windows runtime (image, in-container LabVIEW path, and host PowerShell from
    the injected process platform), and `executeViPreview` blocks with
    `windows-powershell-host-unavailable` when no host PowerShell resolves.
  - The container script enables VI Server in the per-version LabVIEW config
    with a widened connect window and retries once on the cold-launch `-350000`
    VI Server connectivity failure, with fail-soft config mutation, matching the
    comparison runtime recipe (VHS-REQ-148 / VHS-REQ-156 / VHS-REQ-657).
  - `executeViPreview` selects the host-native or Linux-container plan from the
    resolved runtime selection (blocking with `labview-cli-selection-incomplete`
    or `container-image-unavailable` when the selection is incomplete), runs it
    through an injected command runner, and classifies the result as `rendered`
    (zero exit with the output document present), `failed` (a nonzero exit is
    `labview-cli-connection-failed` for the cold-launch `-350000` signature,
    `labview-preview-operation-load-failed` for the operation-class load
    error 1125 — the selected LabVIEW is likely too old — otherwise
    `command-exited-nonzero`; a zero exit that leaves no document is
    `preview-output-not-produced`), or `blocked`.
  - VI Preview is opt-in and Docker-only: the `viHistorySuite.preview.enabled`
    setting defaults to `false`, so a freshly installed extension renders nothing
    until the user turns it on. The Runtime & Report Settings panel offers the
    toggle only when Docker is the effective runtime (`applyViPreviewEnabledSelection`
    writes the flag; `isViPreviewEnabled` reads it). When off, the custom editor
    shows an enable prompt (no render), the history-panel per-revision **Preview**
    button is hidden, and the `previewRevision` command reports that the feature
    is off. Enabling it (via the panel or a settings edit) immediately starts
    background caching through the warm Docker session; disabling it, or switching
    off the Docker runtime, cancels in-progress caching (`reconcilePreviewWarming`
    in `extension.ts` over the warmer's `startWarming`/`cancelWarming`).
  - Opening a `.vi`, `.vit`, `.vim`, or `.ctl` file activates the
    `viHistorySuite.viPreview` read-only custom editor (registered at `default`
    priority). When VI Preview is enabled and the resolved runtime is a container
    (Docker) provider it renders the file through
    `mapComparisonRuntimeSelectionToViPreview` and displays the produced
    document; when the resolved runtime is host-native it shows a "requires
    Docker" prompt and does not render (Docker-only feature). In an untrusted
    workspace the editor shows a disabled-preview message and never launches an
    external process. For a non-`file` document URI (for example the base side of
    a Source Control diff, served under the `git` scheme) the editor materializes
    the base revision's VI together with its project dependency tree —
    `resolveViPreviewRenderSource` runs `materializeRevisionViTree` at the ref
    resolved by `parseGitPreviewRef` — and renders that, so the committed revision
    renders with its subVIs resolved rather than the on-disk working-tree file;
    when the ref or repository cannot be resolved it falls back to materializing
    the single committed blob so behavior is never worse than reading the lone
    blob.
  - `buildViPreviewWebviewHtml` injects a strict Content-Security-Policy
    (`script-src 'none'`, `img-src data:`, inline styles only) into the rendered
    LabVIEW document, and renders themed loading and error states carrying the
    same policy with all interpolated text escaped.
  - `renderViPreviewForFile` stages the opened VI together with its LabVIEW
    source dependencies (covering
    `.vi`/`.vit`/`.vim`/`.ctl`/`.lvlib`/`.lvclass`/`.lvproj`/`.llb`) so subVI and
    type-definition references resolve at load time. It prefers the enclosing
    LabVIEW project (`.lvproj`) tree (`planViPreviewStagingWithProjectRoot` /
    `selectViPreviewStagingRoot`, resolved from the on-disk VI by walking up to
    the nearest project directory) so dependencies in sibling directories
    resolve, stepping the staging root down to the VI's containing-directory tree
    and then to single-file staging when a tree exceeds the file-count or
    total-size guard.
  - When a render cache is available, `renderViPreviewForFile` serves an
    unchanged VI (keyed by `computeViPreviewCacheKey` over the target VI plus the
    staged file set by path/size/mtime, so VIs sharing a staged tree never
    collide) from the cache without staging or launching LabVIEW, and populates
    the cache after a fresh render; cache read and write failures are non-fatal.
  - After VI Preview is enabled (or the first successful preview opens), a
    background warmer renders the
    remaining workspace VIs serially through a single warm session, populating
    the render cache. Progress is surfaced only as a monotonically increasing
    status-bar percentage (`formatWarmStatusLabel` over `warmViPreviewCache`); if
    every render fails the indicator becomes a warning (`VI previews could not be
    cached (0/N)`, warn-colored and lingering longer) instead of a misleading
    success check. Warming runs at most once per cycle; `cancelWarming` stops an
    in-progress cycle (on disable, a runtime switch off Docker, or disposal) and
    allows a later restart. The
    `viHistorySuite.preview.backgroundWarming` setting governs when it runs
    (`shouldWarmViPreviewProvider`): `docker-only` (default) warms only the
    container providers, so a host-native runtime does not warm and never
    occupies the user's host LabVIEW; `always` also warms the host-native
    runtime; `off` disables background warming entirely.
  - The warm container session (`buildLinuxContainerSessionStartArgs` /
    `buildLinuxContainerSessionHardenScript` /
    `buildLinuxContainerExecViPreviewCommandPlan`, orchestrated by
    `startViPreviewSession`) keeps LabVIEW resident across renders: it starts one
    detached container with the workspace bind-mounted once, hardens VI Server on
    start, and renders each VI in a per-render subdirectory via `docker exec`, so
    only the first render pays the cold launch and later renders connect in
    seconds. The session container and scratch are removed on disposal.
  - A single shared session manager (`createViPreviewSessionManager`) owns one
    warm session used by both the interactive editor and the background warmer:
    renders are serialized (one resident LabVIEW), interactive renders are
    prioritized over background warm renders (`selectNextRender`), and the
    session is disposed after an idle window (and re-created lazily on the next
    render).
  - The history panel exposes a per-revision **Preview** button (shown when the
    comparison/runtime surface is available) whose `previewRevision` message
    materializes that revision's VI together with its project source tree
    (`materializeRevisionViTree` lists the whole tree via `git ls-tree -r -l` and
    reuses `planViPreviewStagingWithProjectRoot`, so cross-directory dependencies
    in the enclosing project resolve, stepping down to the containing-directory
    tree and then single-file staging when the guard trips or the listing fails)
    into a scratch directory, then
    opens it in the `viHistorySuite.viPreview` editor via `vscode.openWith` so
    the revision preview reuses the same warm session and render cache. The VI
    blob is fatal if unreadable, missing sibling blobs are skipped, and the
    scratch directory is retired after a delay.
  - The preview may be presented as an interactive block diagram: the extension
    recovers a position-aware frames model from the flat `PrintToSingleFileHtml`
    export and renders it the way the LabVIEW editor shows a diagram — the root
    diagram painted once with every Case / Event / Stacked-Sequence structure
    composited in place, each carrying a `◀ n/N ▶` case selector that pages its
    cases without the diagram jumping, and nested structures paging inside the
    owning case. `buildFramesModelFromFlatExport` extracts the Block Diagram
    section's inline images (`extractBlockDiagramFrames`), decodes each PNG's
    pixel size from its IHDR (`decodePngSize`), treats the first image as the
    root diagram, and groups the remaining images by identical pixel size into
    structures (a structure's cases share its fixed border size — the only
    structural signal the flat export exposes), laying each group out stacked
    below the diagram since the flat export carries no coordinates.
  - `normalizeViPreviewFrames` normalizes the frames wire model (tolerant of the
    `Image`/`Base64 Image`, `Position` Width/Height-or-Right/Bottom,
    `Children`/`Child Indices`, and `Label` field variants), dropping
    out-of-range, self-referential, and duplicate child indices so a malformed
    export can never drive infinite paint recursion; `findFramesRoot` resolves
    the unreferenced frame as the root and `groupFramesIntoStructures` groups
    same-rectangle children into one structure. Child rectangles are
    parent-relative by contract, so the viewer places each child at its own
    `left`/`top` within the parent without subtracting the parent offset.
  - `buildViPreviewFramesViewerHtml` builds the interactive viewer webview
    document under a strict nonce-based Content-Security-Policy (only the single
    nonce'd script runs, `img-src data:`, inline styles only, all remote origins
    forbidden); the frames model is embedded in a JSON island with `<` and the
    U+2028/U+2029 line terminators escaped so a hostile label or image cannot
    break out of the script tag. The viewer supports drag-to-pan, Ctrl/Cmd+scroll
    and double-click zoom, a Fit control, and arrow-key paging of the
    last-touched structure.
  - `selectViPreviewDocument` chooses the presentation for a rendered document:
    `document` mode returns the strict script-free flat webview, while
    `interactive` mode builds the frames viewer from the flat export and falls
    back to `document` mode when no nonce is supplied or no block-diagram frames
    extract (for example a `.ctl` with no diagram), so an interactive request can
    never produce an empty pane; the returned mode reflects what was actually
    used. The custom editor requests `interactive` mode (enabling webview scripts
    with a per-load nonce) when the `viHistorySuite.preview.blockDiagramInteractive`
    setting is on, and `document` mode otherwise.
  - VI previews are GENERATED on Docker and DISPLAYED from the render cache, so a
    live render is Docker-only while serving a cached document (which launches no
    external process) works on any runtime. On a host-native runtime the custom
    editor performs a cache-only peek (`renderViPreviewForFile` with `cacheOnly`,
    which returns `preview-cache-miss` rather than staging or launching LabVIEW):
    a hit is displayed, and a miss shows guidance to generate the cache on Docker
    and reopen on Host. The `viHistorySuite.preview.allowHostNativeRender` setting
    (default off) lets a Docker-less LabVIEW environment — for example the Vagrant
    LabVIEW VM — render previews live on host-native so it can both generate the
    cache and visualize previews for troubleshooting without Docker.
- Agent Work Scope:
  - Keep the command-plan builders pure and dependency-free so they stay
    deterministically unit-testable without a LabVIEW runtime. Reuse the
    `ComparisonCommandPlan` shape and the existing container runtime conventions
    (workspace mount, temp roots, `-350000` retry) rather than introducing a new
    execution transport. Do not change `CreateComparisonReport` behavior. The
    on-disk render stages the VI's dependency source tree, caches renders by
    staged-file identity, and reuses a warm container session so only the first
    render is slow. A history-panel per-revision preview
    (`materializeRevisionViTree`) stages any revision's VI tree from git and
    reuses the same editor, warm session, and cache. Dependency staging prefers
    the enclosing LabVIEW project (`.lvproj`) tree so dependencies outside the
    VI's containing directory resolve, with a guarded step-down to the
    containing-directory tree and then single-file staging. The Windows
    container renders per invocation through `renderViPreviewForFile` (the warm
    session and background cache warmer stay Linux-container-only); keep the
    Windows transport mirroring the comparison Windows-container recipe rather
    than introducing a new one.
- Implementation References:
  - `package.json`
  - `src/reporting/viPreview/viPreviewCommandPlan.ts`
  - `src/reporting/viPreview/viPreviewExecution.ts`
  - `src/reporting/viPreview/viPreviewFileRender.ts`
  - `src/reporting/viPreview/viPreviewStaging.ts`
  - `src/reporting/viPreview/viPreviewCache.ts`
  - `src/reporting/viPreview/viPreviewCacheWarmer.ts`
  - `src/reporting/viPreview/viPreviewRuntimeAdapter.ts`
  - `src/reporting/viPreview/viPreviewWebview.ts`
  - `src/reporting/viPreview/viPreviewRenderSource.ts`
  - `src/reporting/viPreview/viPreviewFramesModel.ts`
  - `src/reporting/viPreview/viPreviewFramesViewer.ts`
  - `src/reporting/viPreview/viPreviewFlatFrames.ts`
  - `src/reporting/viPreview/viPreviewRenderMode.ts`
  - `src/ui/viPreviewEditor.ts`
  - `src/ui/viPreviewRenderHost.ts`
  - `src/ui/viPreviewCacheWarmerService.ts`
  - `src/ui/viPreviewContainerSession.ts`
  - `src/ui/viPreviewSessionManager.ts`
  - `src/git/revisionViTree.ts`
  - `src/reporting/viPreview/viPreviewSessionRuntime.ts`
  - `src/reporting/viPreview/viPreviewVerification.ts`
  - `src/tooling/viPreviewVerifyCli.ts`
  - `resources/labview-cli-operations/PrintToSingleFileHtml/PrintToSingleFileHtml.lvclass`
- Verification References:
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/viPreviewEditor.test.ts`
  - `tests/unit/viPreviewCommandPlan.test.ts`
  - `tests/unit/viPreviewExecution.test.ts`
  - `tests/unit/viPreviewFileRender.test.ts`
  - `tests/unit/viPreviewStaging.test.ts`
  - `tests/unit/viPreviewCache.test.ts`
  - `tests/unit/viPreviewCacheWarmer.test.ts`
  - `tests/unit/viPreviewRuntimeAdapter.test.ts`
  - `tests/unit/viPreviewWebview.test.ts`
  - `tests/unit/viPreviewRenderSource.test.ts`
  - `tests/unit/viPreviewFramesModel.test.ts`
  - `tests/unit/viPreviewFramesViewer.test.ts`
  - `tests/unit/viPreviewFlatFrames.test.ts`
  - `tests/unit/viPreviewRenderMode.test.ts`
  - `tests/unit/viPreviewSessionManager.test.ts`
  - `tests/unit/viPreviewSessionRuntime.test.ts`
  - `tests/unit/viPreviewVerification.test.ts`
  - `tests/unit/viPreviewVerifyCli.test.ts`
  - `tests/unit/revisionViTree.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - The renderer is NI's `PrintToSingleFileHtml` operation (from
    ni/labview-for-containers); it renders headless on the LabVIEW Linux
    container without the Web Services (`wsapi`) image-to-PNG dependency that
    blocks the alternative gpreview renderer. Keep the vendored operation folder
    intact and pointed at by `-AdditionalOperationDirectory` (the parent of the
    `PrintToSingleFileHtml/` class folder). Keep the container `-VI` /
    `-OutputPath` rewriting and the `-350000` retry in lockstep with the
    comparison runtime so the two share cold-launch behavior.
  - The Windows-container transport mirrors the comparison Windows recipe
    (host PowerShell -> `docker run ... powershell -EncodedCommand`, INI connect-
    timeout hardening, optional LabVIEW pre-launch, one-shot `-350000` retry).
    Keep `buildWindowsContainerViPreviewCommandPlan` aligned with
    `buildWindowsContainerLabviewCliScript`/`buildWindowsContainerCommandPlan`
    so both Windows paths share cold-launch behavior; the Windows LabVIEW
    container uses backslash workspace paths and `-Headless`.

### VHS-REQ-660: Source Control Semantic Change Hover

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Review Workflow
- Statement: The extension shall surface the semantic "what changed" narrative
  for a changed VI as a Source Control file decoration (a badge plus a hover
  tooltip shown in the Source Control, Explorer, and editor-tab surfaces),
  served only from a cache of previously produced comparison narratives and
  gated on workspace trust, so a reviewer can see what changed in a VI without
  opening the full comparison report. The decoration reflects the working-tree
  change (HEAD versus the uncommitted VI); committed-pair comparisons are out of
  scope for the Source Control surface. A modified VI that has no cached
  narrative shows a subtle pending decoration prompting a comparison, so the
  feature is discoverable before one is run.
- Acceptance Criteria:
  - VHS-REQ-660.1: `computeViSemanticNarrativeCacheKey` derives a deterministic
    key from the separator-normalized repository-relative path plus the base and
    selected content signatures, and the file-backed `ViSemanticNarrativeCache`
    round-trips a stored narrative, returns undefined for a miss or an invalid
    key, treats a read failure as a miss, and never throws on a write failure.
  - VHS-REQ-660.2: `recordViSemanticNarrativeFromReport` projects a produced
    comparison report onto the semantic model and writes the narrative and
    changed surfaces to the cache keyed by the compared VI and its content
    signatures, reusing the already-produced report HTML without invoking a
    LabVIEW runtime, and caches nothing when the report shows no differences.
  - VHS-REQ-660.3: `resolveViSemanticFileDecoration` returns a decoration whose
    badge is the semantic-change marker and whose tooltip is the cached
    narrative when a narrative is present.
  - VHS-REQ-660.4: The file decoration provider returns no decoration in an
    untrusted workspace and for non-VI files, and matches a cached narrative
    only while the VI's current HEAD and working-tree content signatures still
    equal the compared signatures, so a stale narrative badge clears once the VI
    changes again (VHS-REQ-012 fail-closed alignment).
  - VHS-REQ-660.5: The provider exposes a `refresh` method that raises its
    `onDidChangeFileDecorations` event (fired after a comparison completes so a
    newly cached narrative appears), and `registerViSemanticDecorationProvider`
    registers it through `window.registerFileDecorationProvider` with tracked
    disposables.
  - VHS-REQ-660.6: For a modified tracked VI whose HEAD content differs from the
    working tree and that has no cached narrative, `resolveViSemanticFileDecoration`
    and the provider return a subtle pending badge with a tooltip prompting the
    reviewer to run Compare; an unchanged VI, and a VI missing either content
    signature, receive no decoration.
- Agent Work Scope:
  - Keep the cache key, narrative recorder, and decoration-resolution logic pure
    and dependency-injected so they stay unit-testable without VS Code or a Git
    process. Do not change comparison execution, preflight, or packet behavior;
    populate the cache at the comparison-action boundary in the extension
    wiring. Serve decorations only from the cache and never trigger or block on a
    LabVIEW comparison from the decoration path.
- Implementation References:
  - `src/semantic/viSemanticNarrativeCache.ts`
  - `src/ui/viSemanticDecorationProvider.ts`
  - `src/extension.ts`
- Verification References:
  - `tests/unit/viSemanticNarrativeCache.test.ts`
  - `tests/unit/viSemanticDecorationProvider.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:source-control-semantic-change-hover`
- Change Guidance:
  - Keep the decoration path cache-only and workspace-trust gated; never run or
    await a LabVIEW comparison from a hover. Keep the narrative text the single
    `renderViSemanticNarrative` output shared with the MCP tools and PR/CI
    comment surfaces rather than introducing a second narrative dialect.

### VHS-REQ-661: On-Demand VI Semantic PR Review Workflow

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: CI And Developer Environment
- Statement: VI semantic PR review automation shall run against any target
  repository and pull request on a GitHub-hosted Linux runner (docker provided),
  pull the NI LabVIEW image, post the result as a sticky comment on the target
  pull request using a cross-repository token supplied through a secret, and
  expose the review logic through a reusable `workflow_call` unit so any LabVIEW
  repository can consume the same source of truth as the maintainer dispatch.
- Acceptance Criteria:
  - VHS-REQ-661.1: The workflow triggers only through `workflow_dispatch` and
    never through `pull_request` or `push`, so running untrusted target-repo VIs
    in a LabVIEW container is always a deliberate maintainer action.
  - VHS-REQ-661.2: The workflow exposes `repository`, `pr_number`, and
    `container_image_version` dispatch inputs, grants read-only repository
    contents permission, and fails closed to trusted `vi-history-suite` refs
    before the privileged cross-repository token can be used.
  - VHS-REQ-661.3: The workflow runs on a GitHub-hosted `ubuntu-latest` runner
    and, as a fail-fast gate, verifies docker is available and pulls the
    `nationalinstruments/labview:<version>-linux` image.
  - VHS-REQ-661.4: The workflow clones the target repository, resolves the
    review range as the merge-base of the PR base branch and the PR head commit,
    and invokes `runViSemanticPrReview` over that range with the docker runtime
    provider, passing the canonical `<version>-linux` container tag (the runtime
    locator falls back to the default image for a bare version, so a non-default
    `container_image_version` would otherwise run the wrong image). The PR head
    is fetched via the canonical `refs/pull/<n>/head` ref (which the base repo
    serves even for fork PRs whose head is not directly fetchable by SHA) and
    cross-checked against the API head, failing closed on a mismatch. The docker
    comparison stages under the runner workspace temp (`$RUNNER_TEMP`) rather
    than the default `/tmp`, so a snap-packaged Docker daemon (which uses a
    private `/tmp` mount namespace) can bind-mount the staging tree into the
    LabVIEW container.
  - VHS-REQ-661.5: Posting to the target pull request uses a cross-repository
    token supplied through a secret (`VI_REVIEW_TARGET_TOKEN`) passed as
    `GH_TOKEN`, and the sticky comment is upserted by the hidden marker so
    re-runs update the existing comment in place rather than adding new ones.
  - VHS-REQ-661.6: The workflow uploads the produced review artifact
    (`review-out/**`) and contains no `vagrant` reference (VHS-REQ-599
    alignment).
  - VHS-REQ-661.7: The review steps live in a reusable `workflow_call` workflow
    (`vi-semantic-pr-review-callable.yml`) that declares the review inputs and
    the required `VI_REVIEW_TARGET_TOKEN` secret and gates the trusted-ref guard
    on an `enforce_trusted_ref` input; the maintainer `workflow_dispatch`
    workflow delegates to it with the guard enforced, and an external LabVIEW
    repository can call it directly with its own runner and token.
  - VHS-REQ-661.8: A consumer auto-trigger template
    (`docs/consumer-workflows/vi-semantic-review-on-pr.yml`) lets any LabVIEW
    repository run the review automatically on every pull request (including
    fork PRs) with no comment or label: it triggers on `pull_request_target`,
    never checks out or runs the untrusted PR code (it only dispatches the
    review in vi-history-suite), gates the dispatch on the PR author's real
    repository permission resolved via the API (not the event payload's
    `author_association`, which reports `CONTRIBUTOR` for fork PRs even for org
    members), grants read-only permissions, and uses a least-privilege
    `VI_REVIEW_DISPATCH_TOKEN` (never the target-write token).
  - VHS-REQ-661.9: The reusable workflow announces a "review in progress" sticky
    comment (via the CLI `--announce-start` flag) before the container-backed
    comparison, so a reviewer sees the review was triggered during the
    multi-minute run; the final review upserts over it by the shared marker
    (one comment), and a run that never completes leaves the pending state as an
    actionable signal.
  - VHS-REQ-661.10: When writing artifacts to an output directory, the CLI
    copies each completed VI's self-contained comparison report (which embeds
    the rendered block-diagram/front-panel difference images) into a `reports/`
    subdirectory, so the uploaded review artifact carries the full visual diff
    and not only the narrative summary. A `--from-file` post skips this, since
    its saved report paths are stale temp locations from the original run.
  - VHS-REQ-661.11: With the CLI `--publish-images` flag (post mode only), the
    review uploads each changed VI's overview difference images (the block-
    diagram/front-panel comparison shots embedded as `data:` URIs in the
    self-contained report) to an assets branch in the target repository via the
    GitHub contents API and embeds the hosted image URLs as a collapsed
    visual-diff gallery in the sticky comment, since GitHub strips `data:` image
    URIs from rendered comments. Image hosting requires a token with
    `contents: write`; a hosting failure is best-effort and never blocks the
    textual review from posting. For a private target repository the hosted raw
    image URLs do not render inline in the rendered comment; the uploaded
    review artifact still carries the full visual diff as the fallback.
  - VHS-REQ-661.12: With the CLI `--commit-status` flag (exposed as the optional
    `create_commit_status` workflow input), the review posts a "VI Semantic
    Review" GitHub commit status on the PR head commit so the result is a
    branch-protection-gateable status on the pull request: `success` when the
    review completed (differences are informational, and a partial review is
    still success) and `failure` only when `--fail-on-incomplete` is set and a
    changed VI was not compared. A commit status (unlike a check run, which only
    a GitHub App can create) works with a plain token that has `statuses: write`,
    matching the PAT-based token model; a status failure is best-effort and
    never blocks the textual review.
- Agent Work Scope:
  - Change the workflow YAML and its static contract test together. Keep the
    workflow thin CI plumbing around the already-shipped
    `runViSemanticPrReview` CLI; do not add a review engine to the workflow.
    Keep the runner docker-based (not host LabVIEW) as the counterpart to the
    host-LabVIEW maintainer workflow (VHS-REQ-652).
- Implementation References:
  - `.github/workflows/vi-semantic-pr-review.yml`
  - `.github/workflows/vi-semantic-pr-review-callable.yml`
  - `docs/consumer-workflows/vi-semantic-review-on-pr.yml`
  - `src/cli/runViSemanticPrReview.ts`
  - `src/semantic/viSemanticPrReview.ts`
  - `src/semantic/stickyPrComment.ts`
  - `src/semantic/viSemanticReviewMarkdown.ts`
  - `src/semantic/viComparisonReportImages.ts`
  - `src/semantic/viReviewCommitStatus.ts`
- Verification References:
  - `tests/unit/viSemanticPrReviewWorkflow.test.ts`
  - `tests/unit/viSemanticReviewOnPrTemplate.test.ts`
  - `tests/unit/viSemanticReviewMarkdown.test.ts`
  - `tests/unit/viComparisonReportImages.test.ts`
  - `tests/unit/viReviewCommitStatus.test.ts`
  - `tests/unit/viSemanticPrReview.test.ts`
  - `tests/unit/stickyPrComment.test.ts`
  - `tests/unit/runViSemanticPrReview.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:vi-semantic-pr-review-workflow-dispatch`
- Change Guidance:
  - Never add a `pull_request` or `push` trigger; the LabVIEW container runs
    untrusted target-repo VIs and must stay a deliberate maintainer dispatch.
    Keep the cross-repo token in a secret, never in the workflow's own
    `GITHUB_TOKEN`, and never reference `vagrant`.

### VHS-REQ-662: VI Semantic Comparison Model And Agent MCP Surface

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Review Workflow
- Statement: The suite shall project a produced LabVIEW VI comparison onto a
  versioned dependency-free semantic model with a plain-language what-changed
  narrative, publish that model together with the VI history and
  repository-index models as an open JSON-Schema standard with an offline
  subset validator, and expose the model and its Git-driven orchestrators to
  agents through a dependency-free JSON-RPC MCP server that VS Code registers
  so Copilot agent mode can discover and launch the tools. The model, schemas,
  and MCP handler stay free of VS Code and network dependencies so they are
  unit-testable in isolation and reused by the Source Control hover
  (VHS-REQ-660) and the on-demand PR-review workflow (VHS-REQ-661).
- Acceptance Criteria:
  - VHS-REQ-662.1: `buildViSemanticComparisonModel` and the HTML entrypoint
    `buildViSemanticComparisonModelFromHtml` project a parsed NI comparison
    report onto the versioned `vi-history-suite/vi-semantic-comparison@v1`
    model, classifying each changed surface through `deriveViChangeSurface`,
    and `renderViSemanticNarrative` renders the single shared plain-language
    what-changed narrative reused by the hover and PR/CI comment surfaces.
  - VHS-REQ-662.2: `viSemanticSchemas` publishes the Draft-07 JSON Schemas for
    the comparison, history, and repository-index models under stable `@v1`
    schema ids, and `validateViSemanticDocument` with
    `validateAgainstJsonSchema` provide a dependency-free subset validator that
    fails closed on schema-id drift and on non-conforming documents.
  - VHS-REQ-662.3: `handleViSemanticMcpMessage` implements a dependency-free
    JSON-RPC 2.0 handler that answers `initialize` (advertising the tools
    capability and `VI_SEMANTIC_MCP_PROTOCOL_VERSION`), `tools/list`, and
    `tools/call`, and returns a structured JSON-RPC error for an unknown method
    or tool instead of throwing.
  - VHS-REQ-662.4: `VI_SEMANTIC_MCP_TOOLS` exposes the agent tool set
    (`summarize_vi_comparison`, `get_vi_semantic_comparison`,
    `compare_vi_revisions`, `summarize_vi_history`, `index_repository_vis`,
    `build_vi_pr_review`, `get_vi_semantic_schema`, and
    `validate_vi_semantic_document`), each with a declared input schema.
  - VHS-REQ-662.5: `compareViRevisions` is a dependency-injected orchestrator
    that runs a real LabVIEW comparison for two VI revisions through the
    vscode-free reporting primitives and projects the report onto the model,
    reporting a completed, blocked, or failed outcome and validating its inputs
    at the boundary; it powers the `compare_vi_revisions` tool.
  - VHS-REQ-662.6: `buildViSemanticHistory` walks a VI Git revision history and
    compares adjacent pairs to build the depth-bounded versioned
    `vi-history-suite/vi-semantic-history@v1` timeline, and
    `buildViRepositoryIndex` surveys the repository's tracked VIs through Git to
    build the activity-ranked `vi-history-suite/vi-repository-index@v1` model
    with no LabVIEW runtime; they power the `summarize_vi_history` and
    `index_repository_vis` tools.
  - VHS-REQ-662.7: `registerViSemanticMcpServerProvider` registers the stdio
    MCP server with VS Code through `vscode.McpStdioServerDefinition` (fields
    built by `buildViSemanticMcpServerDefinitionFields` and the script path
    resolved by `resolveViSemanticMcpServerScriptPath`) with tracked
    disposables so Copilot agent mode can discover and launch the tools.
  - VHS-REQ-662.8: `compareViRevisions` accepts an optional content-addressed
    comparison-model cache: when supplied it resolves each side's revision
    commit id (`git rev-parse <revision>^{commit}` by default) so the full tree
    and dependency context is captured, and on a cache hit it returns the
    stored model (with the caller's revision identifiers rehydrated and `cache`
    runtime provenance) and skips the container comparison, while a fresh
    success is written back. The cache is keyed by the repository-relative
    path, both revision commit ids, and the report type; a hit reuses the model
    and narrative but not the on-disk report (like a `--from-file` review). With
    no cache injected the orchestrator behaves exactly as before.
- Agent Work Scope:
  - Keep the model, schemas, MCP handler, and orchestrators pure and
    dependency-injected so they stay unit-testable without VS Code, a network,
    or a LabVIEW runtime on the read-only paths. Route real comparisons only
    through the injected reporting primitives. Do not fork the narrative text
    or the versioned schema ids; the hover (VHS-REQ-660) and the PR review
    (VHS-REQ-661) reuse them.
- Implementation References:
  - `src/semantic/viSemanticModel.ts`
  - `src/semantic/viSemanticSchemas.ts`
  - `src/semantic/viSemanticComparisonMcp.ts`
  - `src/semantic/compareViRevisions.ts`
  - `src/semantic/viComparisonModelCache.ts`
  - `src/semantic/viSemanticHistory.ts`
  - `src/semantic/viRepositoryIndex.ts`
  - `src/mcp/viSemanticMcpServerProvider.ts`
  - `src/mcp/viSemanticMcpServerDeps.ts`
- Verification References:
  - `tests/unit/viSemanticModel.test.ts`
  - `tests/unit/viSemanticSchemas.test.ts`
  - `tests/unit/viSemanticComparisonMcp.test.ts`
  - `tests/unit/compareViRevisions.test.ts`
  - `tests/unit/viComparisonModelCache.test.ts`
  - `tests/unit/viSemanticHistory.test.ts`
  - `tests/unit/viRepositoryIndex.test.ts`
  - `tests/unit/viSemanticMcpServerProvider.test.ts`
  - `tests/unit/viSemanticMcpServerDeps.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:vi-semantic-comparison-mcp-surface`
- Change Guidance:
  - Keep the MCP handler and model dependency-free and offline; never add VS
    Code or network imports to the read-only tools. When adding a tool, extend
    `VI_SEMANTIC_MCP_TOOLS` and the handler together, and keep the schema ids
    versioned so external consumers of the open VI-diff standard are not
    broken.

### VHS-REQ-664: Preview And Comparison Cache Warming On VI Change

- Status: Active
- Parent: VHS-SYS-REQ-008
- Area: Comparison Reports
- Statement: When the Docker comparison runtime is selected, the extension shall
  warm the caches for a LabVIEW VI as soon as it changes on disk so a reviewer
  finds both its preview and its Source Control change hover ready without
  waiting on a cold LabVIEW run. A `FileSystemWatcher` observes
  `.vi`/`.vit`/`.vim`/`.ctl` create and change events, debounces the burst of
  writes LabVIEW makes per save, and processes settled changes one at a time so
  overlapping background LabVIEW runs never start. For a settled change it warms
  the VI's preview render through the shared warm session (VHS-REQ-659) and runs
  a background HEAD-versus-working-tree comparison whose produced report records
  the semantic narrative (VHS-REQ-660), so the hover updates from its pending
  badge to the change summary without a manual comparison. The feature is opt-in
  and Docker-only: it is governed by `viHistorySuite.preview.warmOnChange`
  (default true), the preview warm additionally requires
  `viHistorySuite.preview.enabled`, and the comparison warm additionally requires
  a trusted workspace because it launches LabVIEW. Warming is best-effort and
  never surfaces an error.
- Acceptance Criteria:
  - `createViChangeWarmScheduler` debounces change notifications per path so the
    several writes LabVIEW makes while saving one VI coalesce into a single
    settled warm, and `dispose` cancels every pending timer so no warm fires
    after disposal.
  - `resolveViChangeWarmPlan` warms nothing unless the runtime is Docker and
    `viHistorySuite.preview.warmOnChange` is on; when it warms, the preview
    render warm additionally requires `viHistorySuite.preview.enabled` and the
    comparison narrative warm additionally requires workspace trust.
  - `warmChangedVi` performs the permitted warms best-effort and independently:
    a preview-warm failure never blocks the comparison warm, a comparison-warm
    failure is swallowed, and neither throws to the caller so a background warm
    never surfaces an error.
- Agent Work Scope:
  - Keep the debounce scheduler, the gating decision, and the warm orchestrator
    pure and dependency-injected in
    `src/reporting/viPreview/viChangeWarmScheduler.ts` so they are unit-testable
    without VS Code or a runtime, and keep the `FileSystemWatcher` registration
    and the concrete preview/comparison warm wiring thin in
    `src/ui/viChangeWarmerService.ts` and `src/extension.ts`. Reuse the shared
    warm session (VHS-REQ-659) for the preview warm and the existing worktree
    comparison path that records the narrative (VHS-REQ-660) for the comparison
    warm rather than introducing a new execution transport; skip the comparison
    when the VI is unchanged versus HEAD or its narrative is already cached.
- Implementation References:
  - `src/reporting/viPreview/viChangeWarmScheduler.ts`
  - `src/ui/viChangeWarmerService.ts`
  - `src/extension.ts`
  - `package.json`
- Verification References:
  - `tests/unit/viChangeWarmScheduler.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:warm-changed-vi-caches`
- Change Guidance:
  - Warming must stay Docker-only, opt-in, and best-effort: never launch host
    LabVIEW on change, never let a warm failure surface to the user, and keep
    the per-path debounce and single-flight serialization so a burst of LabVIEW
    saves cannot start overlapping background runs.

### VHS-REQ-665: Win32 Host-Native Headless Comparison For 32-bit LabVIEW Parity

- Status: Active
- Parent: VHS-SYS-REQ-007
- Area: Comparison Reports
- Statement: When the extension runs natively on Windows against a host-native
  LabVIEWCLI comparison and the opt-in `LV_RTE_WIN_HOSTNATIVE_HEADLESS=1`
  environment toggle is set, the runtime shall prelaunch the selected LabVIEW
  with `--headless` (binding the VI Server without an interactive desktop),
  tune the LabVIEWCLI.ini connect window, run the CLI, and retry once on the
  cold-launch VI Server connect race (`-350000`/`-350051`), reusing the same
  launch technique as the authoritative windows-container provider so a
  non-interactive session (for example a Vagrant WinRM session) can drive a
  real comparison against a locally installed 32-bit LabVIEW 2026 — the bitness
  the x64-only windows-container provider cannot exercise. The default
  host-native path (no toggle) is unchanged.
- Acceptance Criteria:
  - `buildWindowsHostNativeHeadlessCommandPlan(record, commandPlan, processPlatform, cliConnectTimeoutSeconds?)`
    returns a `powershell -NoProfile -EncodedCommand <script>` command plan only
    for the `labview-cli` engine when a PowerShell host is resolvable, and
    `undefined` otherwise (e.g. the `lvcompare` engine), leaving the caller's
    bare command plan unchanged.
  - The generated script prelaunches the configured LabVIEW `--headless`
    hidden, sets the `OpenAppReferenceTimeoutInSecond` and
    `AfterLaunchOpenAppReferenceTimeoutInSecond` LabVIEWCLI.ini tokens (to the
    explicit `cliConnectTimeoutSeconds` when supplied, else the host-native
    default), runs the original CLI executable and arguments verbatim, retries
    once on `-350000`/`-350051`/"failed to establish a connection", and emits a
    `[vi-history-suite-hostnative-meta]` provenance line distinct from the
    container `[vi-history-suite-container-meta]` line; it does not pin
    `$env:TEMP` (it uses the ambient temp directory, unlike the container path).
  - `prepareExecutionContext` wraps the bare host-native command plan with this
    headless plan only when `processPlatform === 'win32'`, the effective runtime
    platform is `win32`, and `LV_RTE_WIN_HOSTNATIVE_HEADLESS === '1'`; otherwise
    the bare command plan is used unchanged.
  - The shared launch script builder produces byte-identical output for the
    pre-existing windows-container provider (regression-guarded by the container
    execution-context tests).
- Agent Work Scope:
  - Factor the windows-container launch script into a shared builder and reuse
    it for the host-native headless path; keep the toggle opt-in and the default
    interactive host-native path untouched. Do not add a docker/container
    dependency to the host-native path. The Vagrant lane that exercises this is
    a local maintainer helper only and never a CI gate.
- Implementation References:
  - `src/reporting/comparisonReportRuntimeExecution.ts`
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `manual:vagrant-hostnative-x86-headless`
- Change Guidance:
  - Keep the headless launch technique aligned with the windows-container
    provider (prelaunch, ini connect-window tuning, single cold-launch retry);
    when the container defaults change, review the host-native defaults for
    parity. Never make the toggle default-on and never wire the Vagrant lane
    into `.github/workflows` (VHS-REQ-599).

### VHS-REQ-666: Mandatory Local Vagrant Release Attestation

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: CI And Developer Environment
- Statement: Kicking off a marketplace release shall require a fresh local
  Vagrant Windows/LabVIEW validation attestation for the exact release version.
  The maintainer runs the Vagrant lane locally and records a release-gating
  attestation into the committed runtime-validation ledger; the
  release-readiness check exposes an opt-in gate that fails closed unless that
  attestation matches the release version, and the marketplace-release workflow
  runs that gate before publishing. Enforcement reads the committed ledger, so
  hosted CI needs no hypervisor and the workflow YAML never names the Vagrant
  helper (VHS-REQ-599 alignment).
- Acceptance Criteria:
  - `scripts/checkReleaseReadiness.js --require-release-attestation` appends a
    gating `release-attestation` check that passes only when a `releaseGating`
    track in the runtime-validation ledger has `lastValidatedVersion` equal to
    the release version; an absent or stale gating track fails the check and, in
    `--strict` mode, exits nonzero.
  - Without `--require-release-attestation` the readiness verdict is unchanged
    (the three advisory checks plus the display-only runtime line), preserving
    the VHS-REQ-615.13 contract.
  - The marketplace-release workflow runs the attestation gate
    (`--strict --require-release-attestation`) before the publish step, reading
    the committed runtime-validation ledger, and the workflow YAML contains no
    Vagrant reference.
  - `npm run vagrant:validate:release` runs the Vagrant lane and, on a passing
    in-guest comparison, records the release-gating attestation into the ledger
    via `scripts/recordRuntimeValidation.js`.
  - Under `--require-release-attestation` the readiness gate also appends a
    CI-safe `box-manifest-integrity` check that fails closed unless the
    committed `vagrant/box-manifest.json` is present, matches the
    `vi-history-suite/vagrant-box-manifest@v1` schema, has a 64-hex `sha256`, a
    positive-integer `sizeBytes`, and a non-empty `recordedForVersion`. The
    check does not require `recordedForVersion` to equal the release version
    (the box is identified by its `sha256` and is regenerated only when
    rebuilt, while the release version bumps every release; attestation
    freshness is enforced separately by the `release-attestation` check). The
    check reads only the committed manifest (never the box
    artifact), so it needs no hypervisor in hosted CI; byte-level box hashing
    stays in `scripts/verifyVagrantBox.cjs --verify` as a maintainer-local step.
  - Under `--require-release-attestation` the readiness gate also appends a
    `box-provenance-binding` check that fails closed when a release-gating track
    records a structured `boxSha256` that does not equal the committed box
    manifest's `sha256`. A gating track with no recorded `boxSha256` soft-passes
    so pre-binding attestations are not forced to re-record;
    `scripts/recordRuntimeValidation.js --box-sha256` records the structured
    binding, and the Vagrant release/proof drivers pass the committed box
    manifest `sha256` automatically.
- Agent Work Scope:
  - Change the readiness gate, the release workflow gate step, the ledger
    release-gating track, and the maintainer/vagrant docs together; keep the
    gate enforced by reading the committed ledger and never invoke Vagrant from
    `.github/workflows`.
- Implementation References:
  - `scripts/checkReleaseReadiness.js`
  - `.github/workflows/marketplace-release.yml`
  - `docs/requirements/runtime-validation-ledger.json`
  - `vagrant/box-manifest.json`
  - `package.json`
  - `docs/vagrant.md`
  - `docs/maintainer-operations.md`
- Verification References:
  - `tests/unit/releaseReadinessScript.test.ts`
  - `tests/unit/marketplaceReleaseWorkflow.test.ts`
  - `tests/unit/packageManifest.test.ts`
  - `manual:vagrant-validate-release`
- Change Guidance:
  - Keep the mandatory attestation enforced through the committed ledger and the
    readiness gate; never satisfy it by naming or invoking Vagrant inside
    `.github/workflows`, and never make the gate default-on for local advisory
    readiness runs.

### VHS-REQ-667: Versioned Dev-Tools GitHub Release Channel

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: CI And Developer Environment
- Statement: The development toolset (scripts CLIs, maintainer drivers, the
  compiled MCP server, requirements documents, and agent-customization surfaces)
  shall be distributable as a versioned, content-addressed GitHub Release
  artifact independent of the marketplace release, so that maintainers and
  agents can pin and verify a known-good toolset bound to its requirements
  state. A committed toolset manifest defines exactly which files ship; a
  builder produces a deterministic content digest and a provenance manifest; a
  fail-closed verifier confirms a downloaded or in-tree toolset matches that
  manifest; and a release workflow publishes to GitHub Releases only when the
  content digest changes.
- Acceptance Criteria:
  - `docs/devtools-release.manifest.json` is the committed source of truth for
    the bundled toolset (include globs grouped by category plus exclude
    patterns) under schema `vi-history-suite/devtools-release@v1`.
  - `scripts/buildDevToolsRelease.js` resolves the manifest into a deterministic
    sorted file list, hashes each file, folds those into a single aggregate
    `contentDigest`, and emits a provenance manifest binding the toolset to its
    requirements state (requirements-manifest digest, per-file sha256, git
    commit, build version, channel); identical inputs yield an identical digest.
  - `scripts/buildDevToolsRelease.js --pack` produces a reproducible (POSIX
    ustar plus gzip) tarball using Node built-ins only, so identical inputs
    yield a byte-identical archive.
  - `scripts/verifyDevToolsRelease.js` fails closed unless an extracted toolset
    (`--manifest`/`--root`) or the in-tree toolset (`--verify-self`) matches the
    provenance manifest's per-file sha256 and aggregate content digest.
  - `.github/workflows/devtools-release.yml` builds and self-verifies the
    toolset, deduplicates on the content digest against the latest release of
    the channel, defaults `workflow_dispatch` to a dry run, maps `develop` to a
    prerelease channel and `main` to the stable channel, and names no Vagrant
    helper (VHS-REQ-599 alignment).
- Agent Work Scope:
  - Change the toolset manifest, the builder/verifier scripts, and the release
    workflow together; keep the builder and verifier pure/injectable with thin
    CLIs and keep the workflow content-digest deduplicated and dry-run-first.
- Implementation References:
  - `docs/devtools-release.manifest.json`
  - `scripts/buildDevToolsRelease.js`
  - `scripts/verifyDevToolsRelease.js`
  - `.github/workflows/devtools-release.yml`
  - `package.json`
- Verification References:
  - `tests/unit/buildDevToolsReleaseScript.test.ts`
  - `tests/unit/verifyDevToolsReleaseScript.test.ts`
  - `tests/unit/devToolsReleaseWorkflow.test.ts`
- Change Guidance:
  - Keep the content digest deterministic (sorted inputs, normalized archive
    metadata) and the release workflow dry-run-first; never publish on a no-op
    content digest, and never bundle a file not declared in the committed
    toolset manifest.

### VHS-REQ-668: Supply-Chain State Read-Model

- Status: Active
- Parent: VHS-SYS-REQ-013
- Area: CI And Developer Environment
- Statement: The repository shall provide a read-only aggregator that reports the
  provenance state of every shipped artifact bound to a committed digest in one
  schema-versioned packet, so maintainers and agents can see at a glance whether
  everything that ships is cryptographically bound and fresh for the current
  build. It reads existing ledgers and manifests only, mutates no source, and
  gates nothing by default.
- Acceptance Criteria:
  - `scripts/buildSupplyChainState.js` aggregates four provenance streams into a
    single `vi-history-suite/supply-chain-state@v1` packet: the Vagrant box
    manifest, the runtime-validation ledger, the requirements manifest, and the
    dev-tools toolset content digest; each source graceful-degrades to
    unavailable when absent.
  - Each artifact record reports availability, whether it gates a release, its
    digest, a tri-state freshness against the current build version, and a
    drift reason; the runtime record enumerates per-track validated-version
    freshness.
  - The packet rolls up a `status` of `attention` when any release-gating
    artifact is unavailable or stale, otherwise `fresh`; `--strict` exits
    nonzero on `attention` as an opt-in local signal and is not wired into any
    CI gate.
  - `npm run supply-chain:state` renders text by default, with `--json`,
    `--markdown`, and `--schema` output modes plus optional `--include-provenance`
    and a path-safe `--output`; the emitted packet is self-describing with a
    top-level `$schema` and `schemaVersion`, and Markdown table cells escape
    backslashes before pipes.
  - The release-readiness gate exposes an opt-in `--require-supply-chain-fresh`
    flag that promotes the read-model to a hard check, failing the verdict
    unless every artifact is fresh with zero attention and failing closed when
    the read-model is unavailable; the check is absent from the default advisory
    verdict.
- Agent Work Scope:
  - Keep the aggregator read-only and pure/injectable with a thin CLI; reuse the
    existing runtime-validation and dev-tools builders rather than reimplementing
    digest logic; never mutate a source ledger or manifest.
- Implementation References:
  - `scripts/buildSupplyChainState.js`
  - `scripts/checkReleaseReadiness.js`
  - `.github/workflows/marketplace-release.yml`
  - `.github/workflows/ci.yml`
  - `package.json`
- Verification References:
  - `tests/unit/supplyChainStateScript.test.ts`
  - `tests/unit/releaseReadinessScript.test.ts`
  - `tests/unit/marketplaceReleaseWorkflow.test.ts`
  - `tests/unit/branchGovernanceWorkflow.test.ts`
- Change Guidance:
  - Keep the read-model non-gating by default and its JSON packet
    schema-versioned; add new provenance streams as additional artifact records
    rather than changing the existing record shape.

### VHS-REQ-669: Serialized Local VI Server Acquisition

- Status: Active
- Parent: VHS-SYS-REQ-007
- Area: Comparison Reports
- Statement: A single host-native LabVIEW install exposes exactly one local VI
  Server endpoint (the derived `server.tcp.port`, default 3363). The extension
  shall serialize concurrent host-native LabVIEWCLI launches that would contend
  on the same local VI Server endpoint through a single in-process acquisition
  lock keyed by that endpoint, so overlapping host-native renders take turns
  instead of racing the one VI Server. The lock governs only local (host-native)
  acquisition; container and docker runs address their own container endpoint
  and never acquire a slot.
- Acceptance Criteria:
  - A shared serialization primitive
    (`createLocalViServerAcquisitionLock`) grants a per-key FIFO single-flight
    slot: `acquire(key)` resolves only after every earlier acquirer of the same
    key has released, and exposes `isBusy`/`waitingCount` for the endpoint; a
    process-wide `sharedLocalViServerAcquisitionLock` instance backs the
    execution paths.
  - `localViServerLockKey` derives a stable key from the provider and the
    resolved VI Server port (falling back to a `default` port token when the
    port is absent, zero, negative, or non-integer), so two launches that
    resolve to the same endpoint share a key and serialize while launches
    against different ports get different keys and run concurrently.
  - The host-native branch of `executeViPreview` acquires the slot for its
    derived local VI Server endpoint before launching LabVIEWCLI and holds it
    across the cold-launch retry loop; a container or docker preview run never
    acquires a slot.
  - The acquired slot is released after the launch completes for every outcome
    (rendered, failed, or thrown) via a `finally`, and the release function is
    idempotent so a double release never double-frees or hands a phantom slot to
    the next acquirer.
- Agent Work Scope:
  - Keep the lock a small, pure, injectable in-process primitive with no
    external I/O; inject the acquire seam into execution deps for deterministic
    tests; never serialize container/docker runs and never block distinct
    endpoints against each other.
- Implementation References:
  - `src/reporting/runtime/localViServerAcquisitionLock.ts`
  - `src/reporting/viPreview/viPreviewExecution.ts`
- Verification References:
  - `tests/unit/localViServerAcquisitionLock.test.ts`
  - `tests/unit/viPreviewExecution.test.ts`
- Change Guidance:
  - Keep the lock keyed by the local VI Server endpoint and container/docker
    runs exempt. The host-native comparison execution path
    (`comparisonReportRuntimeExecution.ts`) is the documented next adopter of
    the same shared lock; when wiring it, acquire the shared lock with the same
    `localViServerLockKey` derivation so preview and comparison launches share
    one queue per endpoint.
