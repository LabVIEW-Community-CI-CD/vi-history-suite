# Software Requirements Specification

## Document Control

- System: `vi-history-suite`
- Version: `v0.1.0-draft`
- Owner: sole author
- Status: draft baseline

## Scope

- Purpose: deliver a governed VS Code extension baseline for content-detected VI
  history review in Git repositories.
- In scope: content detection, eligibility indexing, history panel, local CI,
  and repo-native governance artifacts.
- Out of scope: NI report generation in the first baseline, VS Code for Web,
  and external runtime dependencies on other VI-history repos.

## Requirements

| ID | Requirement | Rationale | Fit Criterion | Verification |
| --- | --- | --- | --- | --- |
| VHS-REQ-001 | The extension shall detect candidate LabVIEW VIs by reading bytes 8..11 and accepting `LVIN` or `LVCC`. | The product is content-based, not extension-based. | Positive and negative fixtures classify correctly. | Unit test |
| VHS-REQ-002 | The extension shall not rely on filename or file extension for VI detection. | The research paper forbids extension-based gating. | Files without `.vi` are still eligible when bytes match. | Unit and integration tests |
| VHS-REQ-003 | The extension shall support an optional stricter mode that also checks the leading `RSRC` header bytes. | The paper recommends stricter-mode mitigation against false positives. | Strict mode rejects a buffer with only offset-8 magic. | Unit test |
| VHS-REQ-004 | The extension shall contribute an Explorer context-menu command named `VI History`. | This is the primary user entry point. | The extension manifest declares the command and menu contribution. | Static inspection and integration test |
| VHS-REQ-005 | The `VI History` command shall only be visible when the selected resource is inside an opened Git repository. | History review is meaningful only in Git context. | Menu contribution uses Git-aware visibility gating. | Manifest inspection |
| VHS-REQ-006 | The `VI History` command shall only be visible for tracked files that satisfy VI detection and have at least two modifying commits. | The history panel should only appear when history exists. | Eligibility context excludes files with fewer than two commits. | Unit and integration tests |
| VHS-REQ-007 | The extension shall enumerate tracked files using `git ls-files -z` or a functionally equivalent Git API-backed result. | NUL-safe tracked enumeration is the recommended baseline. | Indexer parses tracked files robustly, including paths with spaces. | Unit test |
| VHS-REQ-008 | The extension shall determine minimum eligibility history with a bounded query equivalent to `git log -n 2 --format=%H --follow -- <path>`. | The product only needs two commits to establish useful history. | Eligibility queries read at most two hashes per file. | Code review and unit test |
| VHS-REQ-009 | The extension shall treat rename-following as best effort and scope it to single-file history queries. | `--follow` is single-file and imperfect. | Documentation and code reflect best-effort rename tracking. | Documentation review |
| VHS-REQ-010 | The extension shall use partial local file reads for `file` URIs during VI detection. | Minimal I/O keeps indexing lightweight. | The local detection path reads only the bytes needed for signature checks. | Unit test and code review |
| VHS-REQ-011 | The extension shall fall back to `workspace.fs.readFile` for non-`file` URI schemes. | Remote and virtual workspaces may not expose local paths. | Detection succeeds or fails cleanly on non-file scheme stubs. | Unit test |
| VHS-REQ-012 | The extension shall gate scanning and external process execution on workspace trust. | Workspace trust is the correct safety boundary for this extension type. | Untrusted workspaces set an empty eligibility context. | Integration test and code review |
| VHS-REQ-013 | The extension shall maintain dynamic menu visibility through `setContext` object membership. | This is the documented VS Code pattern for dynamic menus. | The context key `viHistorySuite.eligiblePaths` is populated with eligible resource paths. | Code review |
| VHS-REQ-014 | The extension shall cache eligibility results by repository root, relative path, and `HEAD`. | Re-indexing every file on every event is wasteful. | Cache keys include repo root, file path, and HEAD. | Code review |
| VHS-REQ-015 | The extension shall bound indexing concurrency through configuration. | Large repositories require controlled background work. | The indexer respects `viHistorySuite.maxIndexedConcurrency`. | Unit test |
| VHS-REQ-016 | The extension shall open a webview history panel for the selected file. | The first review surface is a WebviewPanel. | Command execution opens a panel with file and commit metadata. | Integration test |
| VHS-REQ-017 | The history panel shall show repository name, relative path, VI signature, and commit facts. | The panel is intended for factual developer review. | Rendered HTML includes those data fields. | Unit test |
| VHS-REQ-018 | The history panel shall expose actions to open a revision, diff against the previous revision, and copy a commit hash. | These are the core review actions in the design paper. | Rendered HTML and command handlers support those actions. | Unit and integration tests |
| VHS-REQ-019 | The repo shall remain self-contained and shall not depend on `comparevi-history` or `compare-vi-cli-action`. | The new product should iterate locally without upstream churn. | No package or source dependency references those repos. | Static inspection |
| VHS-REQ-020 | The repo shall define the first real-history harness against a cloned external Git repository rather than vendored history. | Real Git history must stay external to this repo. | `HARNESS-VHS-001` is documented against `ni/labview-icon-editor`. | Documentation review |

## Assumptions

- VS Code desktop with Node extension host is the first target runtime.
- Git is available for CLI-backed history operations.
- Report generation will be added after the local history workflow is stable.

## Constraints

- public repository with restrictive source-available licensing
- sole-author maintenance model
- no external contribution intake by default

