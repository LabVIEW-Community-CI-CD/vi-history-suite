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
  - The export prefers the LabVIEW-generated graphics report and copies its
    sibling assets directory so relative image links keep resolving when the
    exported HTML is opened in an external browser.
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
  - `src/reporting/comparisonReportExport.ts`
  - `src/reporting/comparisonReportAction.ts`
  - `src/extension.ts`
- Verification References:
  - `tests/unit/comparisonReportExport.test.ts`
- Change Guidance:
  - Keep the export limited to copying retained comparison evidence to an
    accessible location; do not run comparison execution or mutate retained
    artifacts.

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

### VHS-REQ-156: Linux Host-Native Headless Comparison Invocation

- Status: Active
- Parent: VHS-SYS-REQ-007
- Area: Comparison Reports
- Statement: When the active runtime selection is host-native LabVIEW CLI on
  Linux, the comparison execution plan shall keep the invocation
  non-headless by default and only pass `-Headless` when the operator
  explicitly opts in via `LV_RTE_LINUX_HEADLESS=1`. Runtime classification
  shall recognize a broken `HeadlessManager` (LabVIEW logs `Failed to
  initialize headless LabVIEW.`) and the `(Hex 0x8) File permission error.`
  + `CreateComparisonReport operation failed.` stderr signature so operators
  receive an actionable, classified failure instead of an unbounded stall.
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
  - The workflow runs `npm test`.
  - The workflow retains `coverage/cobertura-coverage.xml` and
    `coverage/coverage-summary.json` as PR coverage evidence.
  - The workflow enforces the baseline global coverage thresholds declared in
    `vitest.config.ts`: 71% statements, 60% branches, 78% functions, and
    71% lines after the coverage-led assurance wave.
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
  - `scripts/generateCloseoutEvidence.js`
  - `.github/ISSUE_TEMPLATE/requirement_target.yml`
- Verification References:
  - `tests/unit/requirementsDocs.test.ts`
  - `tests/unit/traceabilityAuditScript.test.ts`
  - `tests/unit/closeoutEvidenceScript.test.ts`
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
  publish Marketplace releases only from exact release tags on `main`.
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

### VHS-REQ-612: Installed Runtime Settings CLI Preparation

- Status: Active
- Parent: VHS-SYS-REQ-004
- Area: Runtime Settings
- Statement: The extension shall expose installed runtime settings CLI
  preparation through `labviewViHistory.prepareLocalRuntimeSettingsCli` and
  shall additionally auto-materialize the local `vihs` launcher on every
  activation so users do not need to rerun the prepare command after install
  or upgrade. Preparation failures, including stale-launcher recovery, must
  surface actionable outcomes.
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
  - The initial coverage floor ratchet is statements 40%, branches 33%,
    functions 47%, and lines 40%.
  - The command fails closed with an actionable message when coverage evidence
    is absent.
- Agent Work Scope:
  - Change the coverage mapping command, coverage floor configuration,
    requirements mapping, and verification references together.
- Implementation References:
  - `scripts/mapCoverageToTraceability.js`
  - `package.json`
  - `vitest.config.ts`
  - `docs/testing/test-plan.md`
- Verification References:
  - `tests/unit/coverageMapScript.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `tests/unit/traceabilityAuditScript.test.ts`
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
    typecheck, full unit tests, package sanity, and targeted tests for the
    changed requirement or implementation surface.
  - Standards closeout evidence reports host or Docker runner results,
    standards toolchain provenance, Definition-of-Done status, and disqualified
    evidence sources when a gate would otherwise pass from generated or fixture
    content.
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
- Agent Work Scope:
  - Change requirements docs, RTM, ID index, test plan, and requirements
    coherence tests together.
- Implementation References:
  - `.github/workflows/marketplace-release.yml`
  - `.github/workflows/ci.yml`
  - `package.json`
  - `scripts/checkDefinitionOfDone.js`
  - `scripts/generateCloseoutEvidence.js`
  - `scripts/verifyMarketplaceListing.js`
  - `.github/pull_request_template.md`
  - `docs/maintainer-operations.md`
  - `docs/requirements/srs.md`
  - `docs/requirements/rtm.csv`
  - `docs/requirements/id-index.csv`
  - `docs/requirements/README.md`
  - `docs/testing/test-plan.md`
  - `docs/requirements/traceability-inventory.csv`
- Verification References:
  - `tests/unit/definitionOfDoneGate.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
  - `tests/unit/traceabilityAuditScript.test.ts`
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
  filesystem-only probe, and shall seed or repair the persisted
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
  the VS Code status bar and shall raise a one-time first-run notification
  when no comparison runtime is detected, with a focus-event re-detect that is
  throttled so users learn promptly when they install LabVIEW or Docker
  without paying repeated detection costs.
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
- Statement: The extension shall source the `VI History runtime` status bar
  label from the user's persisted runtime selection
  (`viHistorySuite.runtimeProvider`, `viHistorySuite.labviewVersion`,
  `viHistorySuite.labviewBitness`) when all three keys are populated and the
  combination is satisfiable on this host, fall back silently to the
  auto-detection recommendation otherwise, refresh the label immediately on
  `vscode.workspace.onDidChangeConfiguration` so a `vihs --provider …` CLI
  invocation or a manual `settings.json` edit is reflected without waiting
  for the focus-event throttle, and provide a status-bar-targeted
  `Pick Runtime Provider` quick-pick command that writes the same three
  settings keys to `ConfigurationTarget.Global` (or clears them).
- Acceptance Criteria:
  - `selectActiveRuntime(detection, persisted)` honors a persisted selection
    only when `runtimeProvider`, `labviewVersion`, and `labviewBitness` are
    all populated and the combination is satisfiable per
    `isPersistedSelectionSatisfiable`; otherwise it returns the
    auto-detection recommendation. There is no `mismatch` snapshot kind —
    unsatisfiable persisted selections cause a silent fallback.
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
  - The `Pick Runtime Provider` command builds quick-pick items from the
    cached detection: one entry per detected host LabVIEW installation,
    one entry for Docker when `cliAvailable` is true, plus a Clear option
    that removes the three persisted keys. The handler refuses execution
    in untrusted workspaces with a warning, surfaces a clear warning when
    detection has not completed or no runtimes are detected, and writes
    selections to `ConfigurationTarget.Global`.
  - The `Show Runtime Summary` report appends a `Drift:` line that reads
    `none` when no persisted selection is set or it matches the
    recommendation, `selection differs from recommendation: persisted=…,
    recommendation=…` when persisted is satisfiable but diverges, and
    `selection unsatisfiable on this host; falling back to recommendation`
    when the persisted combination cannot be served on this host.
- Agent Work Scope:
  - Keep the persisted-selection arbitration in
    `src/ui/runtimeAvailabilityNotice.ts::selectActiveRuntime` reusing
    `isPersistedSelectionSatisfiable` from
    `src/tooling/runtimeSettingsSeed.ts`. The quick-pick handler lives in
    `src/commands/pickRuntimeProviderCommand.ts` and exports pure helpers
    (`buildPickRuntimeProviderItems`, `applyPickRuntimeProviderSelection`)
    so the routing logic is unit testable without a window. Drift
    classification lives in
    `src/commands/runtimeCommands.ts::buildDriftSummaryLine`.
- Implementation References:
  - `src/extension.ts`
  - `src/ui/runtimeAvailabilityNotice.ts`
  - `src/commands/pickRuntimeProviderCommand.ts`
  - `src/commands/runtimeCommands.ts`
- Verification References:
  - `tests/unit/runtimeAvailabilityNotice.test.ts`
  - `tests/unit/runtimeAvailabilityWatcher.test.ts`
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
  - The VS Code comparison-report command shows a warning toast with a
    `Pick Runtime Provider` action button whenever the action result
    carries `blockedReason='windows-host-bitness-conflict'` or
    `runtimeFailureReason='labview-host-bitness-conflict'`; selecting
    the action invokes `labviewViHistory.pickRuntimeProvider`.
- Agent Work Scope:
  - Keep bitness inference path-based (no PE-header probe) and resolve the
    executable through `Get-Process -Id <pid>` so the diagnostic does not
    depend on additional probes. Reuse the existing
    `observeWindowsProcesses` injection seam, the
    `hostRuntimeConflictDetected` / `allowExistingWindowsHostRuntime`
    flow, and the doctor blocked-reason switch. Do not introduce a
    separate auto-correction path — VHS-REQ-621 surfaces the conflict
    and hands off to VHS-REQ-620's quick-pick.
- Implementation References:
  - `src/reporting/comparisonReportRuntimeExecution.ts`
  - `src/reporting/comparisonRuntimeLocator.ts`
  - `src/reporting/comparisonRuntimeDoctor.ts`
  - `src/commands/openViHistoryCommand.ts`
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/comparisonRuntimeDoctor.test.ts`
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
    `runRuntimeMatrix(deps)` module entry whose `spawnSync`,
    `getCimProcesses`, `closeLabview`, `now`, and `cwd` collaborators
    are injectable for deterministic unit tests; the default CLI
    binding refuses to run on non-Windows hosts unless
    `VIHS_FAKE_WINDOWS=1` is set for tests.
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
    enforces the trusted-ref allow-list (`main`, `release/v*`,
    `v*.*.*` tags, and the `chore/phase6-windows-runtime-matrix-*`
    branch for the introduction PR), and uploads the matrix evidence
    plus captured proofs as a build artifact.
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
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the assertion key on `runtimeBlockedReason` string equality
    so the harness stays decoupled from the CLI error-code mapping. If
    a future requirement tightens that mapping (dedicated
    `VIHS_E_WINDOWS_HOST_BITNESS_CONFLICT` code), extend the harness
    to also assert on `runtimeErrorCode` in addition to the
    blocked-reason string — never replace the string assertion.

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
- Verification References:
  - `tests/unit/comparisonReportRuntimeExecution.test.ts`
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
  - `src/reporting/comparisonRuntimeDoctor.ts`
- Verification References:
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
  before selecting revisions that VI Server must be turned on instead of
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
    registry names a `LabVIEW.exe` that exists on disk AND the shared Windows
    LabVIEW CLI exists on disk, and never throws (a failed registry query
    yields false). It performs no container or process probes.
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
  the selected URI on demand and shall not wait for or require a repository-wide
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
  - `src/commands/openViHistoryCommand.ts`
  - `src/services/viHistoryModel.ts`
  - `src/services/viHistoryService.ts`
  - `src/git/gitCli.ts`
  - `package.json`
- Verification References:
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

