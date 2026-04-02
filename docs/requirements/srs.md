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
| VHS-REQ-021 | The repo shall provide a clone-on-demand canonical harness smoke command for `HARNESS-VHS-001`. | The first live path should be runnable locally without manual repo setup. | `npm run harness:smoke` produces a factual harness report. | Smoke test |
| VHS-REQ-022 | The canonical harness smoke command shall reuse the same core history-model logic as the extension runtime. | The smoke path should validate product logic, not a parallel implementation. | Shared core modules are used by both the extension wrapper and harness smoke runner. | Static inspection and unit test |
| VHS-REQ-023 | The canonical harness smoke command shall write factual JSON, Markdown, and HTML reports under an ignored cache path. | Local review needs retained evidence without polluting tracked source. | Smoke outputs are written under `.cache/harness-reports/`. | Smoke test |
| VHS-REQ-024 | The repo shall include a real-Git unit test for the core history model using a temporary local repository. | Core history behavior should be verified without requiring VS Code runtime. | Tests create a local Git repo, commit a VI fixture twice, and assert eligibility/history. | Unit test |
| VHS-REQ-025 | The repo shall provide a VS Code extension-host integration test runner for the actual `VI History` command flow. | The extension should prove behavior in a real extension host, not only through unit tests. | `npm run test:integration` executes extension-host tests successfully. | Integration test |
| VHS-REQ-026 | The extension-host integration runner shall provision a temporary Git workspace containing both eligible and ineligible content-detected files. | Command gating must be proven against real workspace state. | The integration fixture workspace includes one two-commit VI candidate and one ineligible file, and tests assert different outcomes. | Integration test |
| VHS-REQ-027 | The history panel HTML shall expose stable semantic anchors for status, repository metadata, commit rows, and review-action controls. | Developer-facing review surfaces need deterministic structure for verification and future UX evolution. | Rendered HTML includes stable `data-testid` hooks for the status block, metadata fields, commit rows, and action controls. | Unit and integration tests |
| VHS-REQ-028 | The extension-host integration lane shall verify that the rendered history panel HTML includes factual eligibility, signature, path, and commit-subject content for an eligible file. | Opening a panel is not enough; the surfaced report must be proven to contain the expected review facts. | The real extension-host suite asserts the opened panel HTML contains the eligible file path, signature, eligibility state, and both retained commit subjects. | Integration test |
| VHS-REQ-029 | The extension-host integration lane shall verify `copyHash`, `openCommit`, and `diffPrevious` behavior through the real panel message handler. | Core review actions must be proven on the same action path used by the webview surface. | The real extension-host suite dispatches those three actions through the captured panel handler and asserts clipboard or Git/diff outcomes. | Integration test |
| VHS-REQ-030 | The test API shall retain factual summaries of the last panel action outcome for review-action verification. | Integration evidence should report what action was handled without depending on incidental UI state alone. | The exported extension test API returns the last action summary and action count after dispatched panel actions. | Integration test |
| VHS-REQ-031 | The history panel shall include a chronology packet that states retained revision count plus newest and oldest retained commit summaries. | Developers need immediate chronology cues without parsing the full table first. | Rendered HTML includes anchored chronology fields for order, retained revision count, newest commit summary, and oldest commit summary. | Unit and integration tests |
| VHS-REQ-032 | The history table shall show explicit compare-base context for each retained commit row. | Commit-to-commit review should not require inferring which prior revision a diff action targets. | Each rendered commit row includes a compare-base field showing the previous retained hash or an oldest-revision marker. | Unit and integration tests |
| VHS-REQ-033 | The history panel shall state factual binary-review limitations for Git-backed LabVIEW VI revisions. | The review surface should explain what the panel proves and what still depends on external tooling. | Rendered HTML includes a retained note that VI revisions are binary artifacts and that open/diff actions delegate to VS Code handlers and installed tooling. | Unit and integration tests |
| VHS-REQ-034 | The history table shall retain an explicit selected-versus-base pairing for rows that can diff against a previous retained revision. | Reviewers should not have to infer which revision pair a `Diff prev` action will use. | Rendered HTML includes a pairing element that states the selected retained hash and the retained base hash for diffable rows. | Unit and integration tests |
| VHS-REQ-035 | The history panel shall retain reviewer guidance for using chronology facts, compare pairs, and binary-review actions safely. | The review surface should help developers understand how to use the packet without overclaiming what the panel itself proves. | Rendered HTML includes a guidance block with retained steps covering chronology review, compare-pair interpretation, and binary-review escalation. | Unit and integration tests |
| VHS-REQ-036 | The history panel shall retain a confidence-and-scope packet with stable anchors. | Reviewers need an explicit place to judge what the current surface proves and where its boundaries are. | Rendered HTML includes a retained confidence-and-scope block with stable verification hooks. | Unit and integration tests |
| VHS-REQ-037 | The confidence-and-scope packet shall state the direct local evidence basis and the review scope included in this surface. | Confidence claims should be grounded in concrete evidence sources, not vague sentiment. | Rendered HTML states that the packet is based on local Git history, tracked-file status, and content-detected VI signature checks, and that it directly covers chronology, path provenance, retained hashes, and command routing. | Unit and integration tests |
| VHS-REQ-038 | The confidence-and-scope packet shall state which review questions remain outside scope without external binary comparison tooling. | The panel should fail closed on binary semantic and cosmetic claims it cannot prove by itself. | Rendered HTML states that binary semantic differences, visual/cosmetic change detection, and NI comparison-report output require external comparison tooling. | Unit and integration tests |

## Assumptions

- VS Code desktop with Node extension host is the first target runtime.
- Git is available for CLI-backed history operations.
- Report generation will be added after the local history workflow is stable.

## Constraints

- public repository with restrictive source-available licensing
- sole-author maintenance model
- no external contribution intake by default
