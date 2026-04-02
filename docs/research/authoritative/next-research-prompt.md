# Next Research Prompt

Use this prompt with the same research-producing LLM to generate the next
authoritative research packet for `vi-history-suite`.

```md
Produce a new authoritative deep-research report for the `vi-history-suite`
repository.

Important constraints:

- Output clean Markdown only.
- Do not emit hidden citation tokens like `citeturn...`.
- Preserve tables and code blocks correctly.
- Separate source-backed statements from assumptions explicitly.
- Include a final “Direct Source List” section with plain URLs.
- Prefer official sources first, then clearly-labeled secondary sources only
  when official documentation is incomplete.
- Use the current date at generation time and state it explicitly.

Context:

- Product: a VS Code desktop/remote-host extension for reviewing Git-backed
  LabVIEW VI history by content detection.
- Existing authoritative baseline already covers:
  - magic-byte detection at bytes 8..11 for `LVIN` / `LVCC`
  - menu gating with
    `resourcePath in labviewViHistory.eligiblePaths && isWorkspaceTrusted && gitOpenRepositoryCount >= 1`
  - Explorer and `editor/title/context` menu entry points
  - webview-based history viewer with open/diff/copy actions
  - Git-backed tracked-file eligibility and clone-on-demand real-history harness
- The repo has already consumed that baseline and now needs research only on
  unresolved areas.

Focus only on these unresolved workstreams:

1. Comparison report generation
- Exact authoritative guidance for LabVIEW CLI `CreateComparisonReport`
  capabilities, inputs, outputs, and limitations.
- Exact authoritative guidance for `LVCompare.exe` command-line behavior,
  especially HTML generation and same-name file limitations.
- Whether `CreateComparisonReport` or `LVCompare.exe` is the better primary
  engine for a VS Code extension that compares two Git revisions of the same VI.
- Required preflight checks before invoking either tool.

2. Workspace storage and webview report integration
- Best authoritative guidance for storing generated HTML reports and metadata
  under `context.storageUri`.
- Exact `asWebviewUri`, `localResourceRoots`, and CSP patterns for exposing
  generated HTML reports inside a webview safely.
- Facts for showing report links only when output exists.

3. LabVIEW 2026 Q1 runtime/tool detection
- Windows authoritative facts for locating LabVIEW 2026 Q1 32-bit and 64-bit
  installations, LabVIEW CLI, and LVCompare-related tooling.
- Whether registry probing, install-root scanning, or both are authoritative.
- macOS and Linux authoritative facts for install roots, edition/platform
  constraints, and whether compare/report generation is realistically supported.
- Bitness-selection guidance when both 32-bit and 64-bit are installed.

4. Progress UX and trust gating
- Best authoritative guidance for:
  - `window.withProgress` with percent/items/ETA
  - discreet status bar progress items
  - webview progress for long-running operations
- Exact manifest guidance for `capabilities.untrustedWorkspaces` and restricted
  configurations for extensions that invoke external tooling.

5. Packaging, testing, and CI
- Current authoritative guidance for:
  - `vsce package`
  - local VSIX installation
  - Marketplace publish prerequisites
  - `@vscode/test-electron`
  - extension CI guidance

Required output structure:

1. Executive summary
2. Repo-state assumptions you are making
3. Decision matrix for unresolved workstreams
4. Implementation guidance by workstream
5. Risks, ambiguities, and explicit assumptions
6. Acceptance criteria for each workstream
7. Direct Source List (plain URLs)

Do not spend space re-explaining already-consumed solved areas unless needed as
short context. Concentrate on the unresolved workstreams above.
```
