# Extension Design Summary

This summary is informational only. The authoritative research stack lives
under `docs/research/authoritative/`, with
`deep-research-report.cleaned.md` as the primary reading surface.

This repository baseline is anchored to the user-provided research paper:

- `Building a VS Code "VI History" Extension for Content-Detected LabVIEW VIs in Git Repos`

## Decisive Findings

- The extension must detect LabVIEW VIs by content, not by filename or file
  extension.
- The content signature check is `LVIN` or `LVCC` at byte offset `8`
  (0-based), with an optional stricter `RSRC\r\n` header check.
- The `VI History` context-menu command should be visible only when the
  selected file:
  - is inside an opened Git repository
  - is a content-detected VI
  - has at least two modifying commits
- Dynamic menu visibility should use the authoritative `when` clause backed by
  `setContext` object membership:
  - `resourcePath in labviewViHistory.eligiblePaths && isWorkspaceTrusted && gitOpenRepositoryCount >= 1`
- The command should be contributed through both:
  - `explorer/context`
  - `editor/title/context`
- Eligibility indexing should enumerate tracked files and use bounded history
  checks:
  - `git ls-files -z`
  - `git log -n 2 --format=%H --follow -- <path>`
- The recommended review surface is a `WebviewPanel` with commit facts and
  actions for:
  - open at commit
  - diff versus previous
  - copy hash
  - later report generation
- Workspace trust must gate file scanning and external process execution.
- Report generation remains a future implementation tranche and should prefer
  LabVIEW CLI `CreateComparisonReport` when introduced.
- The first real harness should use cloned Git history from
  `ni/labview-icon-editor`, not vendored copies.

## Product Consequences

- The first implementation baseline can be useful without NI toolchain
  integration if it already delivers:
  - content detection
  - Git-backed eligibility
  - a factual local history panel
- The repo should remain self-contained and should not depend on
  `comparevi-history` or `compare-vi-cli-action`.
- The first governed baseline should be TypeScript-first because the product is
  a VS Code extension that runs in the Node extension host.
