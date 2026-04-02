# Research Alignment Matrix

## Authority Surface

- Primary source for unresolved workstreams:
  [next-round-research.md](./next-round-research.md)
- Primary source:
  [deep-research-report.cleaned.md](./deep-research-report.cleaned.md)
- Secondary source:
  [deep-research-report.md](./deep-research-report.md)
- Original artifact:
  [vi-history-suite-authoritative-research.pdf](./vi-history-suite-authoritative-research.pdf)

## Current Alignment

| Research surface | Current status | Evidence | Next governed move |
| --- | --- | --- | --- |
| Content detection by bytes `8..11` with `LVIN` / `LVCC` only | aligned | `src/domain/viMagicCore.ts`; `src/domain/viMagic.ts`; `VHS-REQ-001..003` | sustain |
| Menu gating through `resourcePath in labviewViHistory.eligiblePaths && isWorkspaceTrusted && gitOpenRepositoryCount >= 1` | aligned in this tranche | `package.json`; `src/indexing/viEligibilityIndexer.ts`; `VHS-REQ-004..005`; `VHS-REQ-013`; `VHS-REQ-082` | sustain |
| Explorer and `editor/title/context` command visibility | aligned in this tranche | `package.json`; `VHS-REQ-004`; `VHS-REQ-082` | sustain |
| Background eligibility indexing with bounded concurrency, cache, and debounce | aligned | `src/indexing/viEligibilityIndexer.ts`; `VHS-REQ-014..015`; `VHS-REQ-072..078` | sustain |
| Webview history panel with `Open at commit`, `Diff vs previous`, `Copy hash` | aligned | `src/ui/historyPanel.ts`; `src/commands/openViHistoryCommand.ts`; `VHS-REQ-016..018`; `VHS-REQ-027..040` | sustain |
| Verify both revision blobs are VIs before compare/report generation | aligned in this tranche | `src/reporting/comparisonReportPreflight.ts`; `VHS-REQ-127..129` | wire preflight into report-generation runtime path |
| Generate report with `{type}-report-{fullFilename}.html` | partial | `src/reporting/comparisonReportPlan.ts`; `src/reporting/comparisonReportExecutionPlan.ts`; `VHS-REQ-100`; `VHS-REQ-142..145` | invoke the governed execution plan through actual NI tooling and retain execution evidence |
| Store retained report packets under `context.storageUri` and surface them via `asWebviewUri` plus `localResourceRoots` | aligned in this tranche | `src/reporting/comparisonReportPacket.ts`; `src/reporting/comparisonReportAction.ts`; `VHS-REQ-134..141` | wire actual LabVIEW runtime execution into the stored packet path |
| LabVIEW 2026 Q1 32/64 runtime detection and selection | partial in this tranche | `src/reporting/comparisonRuntimeLocator.ts`; `package.json`; `VHS-REQ-094..096`; `VHS-REQ-138` | wire the locator into live NI execution and future Windows 64-bit container provider |
| Status-bar progress item plus richer percent/items/ETA progress UX | partial | `src/indexing/viEligibilityIndexer.ts` currently uses `window.withProgress` only | add governed progress tranche |
| Manifest trust declaration through `capabilities.untrustedWorkspaces` | aligned in this tranche | `package.json`; `VHS-REQ-084`; `tests/unit/packageManifest.test.ts` | sustain |
| Treat `TimelineProvider` as experimental only, not published product surface | aligned in docs | `docs/architecture/adr/ADR-0002-published-review-surface-webview.md`; `VHS-REQ-085` | sustain |
| Desktop/remote-host boundary and workspace-scoped report storage policy | aligned in docs | `docs/architecture/adr/ADR-0003-workspace-report-storage-and-desktop-boundary.md`; `VHS-REQ-092`; `VHS-REQ-097` | implement report tranche |
| Packaging/testing/CI/research refresh guidance | aligned as backlog | `VHS-REQ-098`; `docs/research/authoritative/next-research-prompt.md` | use for next research cycle |

## Recommended Order

1. Runtime wiring from the pure planner and runtime locator into actual NI report execution
2. Progress-surface uplift
3. Explicit architecture decision for proposed APIs and desktop-only scope
4. Packaging and release guidance aligned to the refreshed authoritative research
