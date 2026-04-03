# Research Alignment Matrix

This is the human-readable status matrix for how the committed repo aligns to
the authoritative research stack. For a machine-friendly entrypoint, start with
[research-implementation-index.json](./research-implementation-index.json).

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
| Generate report with `{type}-report-{fullFilename}.html` | partial in this tranche | `src/reporting/comparisonReportPlan.ts`; `src/reporting/comparisonReportExecutionPlan.ts`; `src/reporting/comparisonReportRuntimeExecution.ts`; `src/harness/harnessReportSmoke.ts`; `VHS-REQ-100`; `VHS-REQ-142..163` | run the canonical comparison-report smoke on the active host and retain successful HTML output evidence when tooling is available |
| Canonical comparison-report smoke supports governed parity probing between `labview-cli` and `lvcompare` | aligned in this tranche | `src/cli/runHarnessReportSmoke.ts`; `src/harness/harnessReportSmoke.ts`; `docs/product/harnesses.md`; `VHS-REQ-193..195` | run the first governed `lvcompare` parity smoke and classify the gap against the current `labview-cli` runtime seam |
| Store retained report packets under `context.storageUri` and surface them via `asWebviewUri` plus `localResourceRoots` | aligned in this tranche | `src/reporting/comparisonReportPacket.ts`; `src/reporting/comparisonReportAction.ts`; `VHS-REQ-134..141`; `VHS-REQ-150..151`; `VHS-REQ-161..162` | sustain the packet artifact while improving the live execution and developer-facing summary surface |
| LabVIEW 2026 Q1 32/64 runtime detection and selection | partial in this tranche | `src/reporting/comparisonRuntimeLocator.ts`; `package.json`; `VHS-REQ-094..096`; `VHS-REQ-138`; `VHS-REQ-146`; `docs/architecture/adr/ADR-0006-windows64-container-isolation-for-extension-users.md` | wire the locator into live NI execution and future Windows 64-bit container provider, keeping containerized x64 isolation as the preferred extension-user path |
| First-class developer dashboard concentrating multiple VI Comparison Reports across at least three commits | modeled in this tranche | `docs/research/authoritative/research-infrastructure.md`; `docs/product/epics/EPIC-0004-multi-report-developer-dashboard.md`; `docs/architecture/adr/ADR-0007-multi-report-review-dashboard.md`; `docs/architecture/adr/ADR-0008-concentration-first-dashboard-for-high-volume-review.md`; `docs/product/development-queue.json` | define the retained dashboard packet and implement the first concentration-first commit-window review surface once pairwise report proof is stable |
| Review-scenario registry and separate human decision records for dashboard-driven VI review | modeled in this tranche | `docs/product/review-scenarios.md`; `docs/product/decision-record-template.md`; `docs/research/authoritative/research-infrastructure.md`; `docs/product/development-queue.json` | implement the first canonical scenario packet and one high-volume review scenario after the dashboard packet exists |
| Status-bar progress item plus richer percent/items/ETA progress UX | partial | `src/indexing/viEligibilityIndexer.ts` currently uses `window.withProgress` only | add governed progress tranche |
| Manifest trust declaration through `capabilities.untrustedWorkspaces` | aligned in this tranche | `package.json`; `VHS-REQ-084`; `tests/unit/packageManifest.test.ts` | sustain |
| Treat `TimelineProvider` as experimental only, not published product surface | aligned in docs | `docs/architecture/adr/ADR-0002-published-review-surface-webview.md`; `VHS-REQ-085` | sustain |
| Desktop/remote-host boundary and workspace-scoped report storage policy | aligned in docs and partial in runtime proof | `docs/architecture/adr/ADR-0003-workspace-report-storage-and-desktop-boundary.md`; `src/reporting/comparisonReportRuntimeExecution.ts`; `src/harness/harnessReportSmoke.ts`; `VHS-REQ-092`; `VHS-REQ-097`; `VHS-REQ-157..163` | retain a successful canonical Windows-host smoke packet proving the interop bridge on this machine |
| Packaging/testing/CI/research refresh guidance | aligned as backlog | `VHS-REQ-098`; `docs/research/authoritative/next-research-prompt.md` | use for next research cycle |

## Recommended Order

1. Runtime wiring from the pure planner and runtime locator into actual NI report execution
2. Progress-surface uplift
3. Multi-report developer dashboard for commit-window review across at least three commits
4. Review-scenario registry and human decision records
5. Packaging and release guidance aligned to the refreshed authoritative research
