# Research Alignment Matrix

This is the human-readable status matrix for how the committed repo aligns to
the authoritative research stack. For a machine-friendly entrypoint, start with
[research-implementation-index.json](./research-implementation-index.json).

## Authority Surface

- Primary source:
  [deep-research-report.cleaned.md](./deep-research-report.cleaned.md)
- Secondary source:
  [deep-research-report.md](./deep-research-report.md)
- Original artifact:
  [vi-history-suite-authoritative-research.pdf](./vi-history-suite-authoritative-research.pdf)
- There is no active unresolved research-round artifact checked into the repo.
- Next research intake prompt:
  [next-research-prompt.md](./next-research-prompt.md)

## Current Alignment

| Research surface | Current status | Evidence | Next governed move |
| --- | --- | --- | --- |
| Content detection by bytes `8..11` with `LVIN` / `LVCC` only | aligned | `src/domain/viMagicCore.ts`; `src/domain/viMagic.ts`; `VHS-REQ-001..003` | sustain |
| Menu gating through `resourcePath in labviewViHistory.eligiblePaths && isWorkspaceTrusted && gitOpenRepositoryCount >= 1` | aligned in this tranche | `package.json`; `src/indexing/viEligibilityIndexer.ts`; `VHS-REQ-004..005`; `VHS-REQ-013`; `VHS-REQ-082` | sustain |
| Explorer and `editor/title/context` command visibility | aligned in this tranche | `package.json`; `VHS-REQ-004`; `VHS-REQ-082` | sustain |
| Background eligibility indexing with bounded concurrency, cache, and debounce | aligned | `src/indexing/viEligibilityIndexer.ts`; `VHS-REQ-014..015`; `VHS-REQ-072..078` | sustain |
| Webview history panel with `Open at commit`, `Diff vs previous`, `Copy hash` | aligned | `src/ui/historyPanel.ts`; `src/commands/openViHistoryCommand.ts`; `VHS-REQ-016..018`; `VHS-REQ-027..040` | sustain |
| Verify both revision blobs are VIs before compare/report generation | aligned in this tranche | `src/reporting/comparisonReportPreflight.ts`; `VHS-REQ-127..129` | wire preflight into report-generation runtime path |
| Generate report with `{type}-report-{fullFilename}.html` | aligned with live NI proof | `src/reporting/comparisonReportPlan.ts`; `src/reporting/comparisonReportExecutionPlan.ts`; `src/reporting/comparisonReportRuntimeExecution.ts`; `src/harness/harnessReportSmoke.ts`; `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.json`; `VHS-REQ-100`; `VHS-REQ-142..163`; `VHS-REQ-217..220` | sustain the live proof while improving runtime-doctor UX and dashboard concentration |
| Canonical comparison-report smoke supports governed parity probing between `labview-cli` and `lvcompare` | aligned in this tranche | `src/cli/runHarnessReportSmoke.ts`; `src/harness/harnessReportSmoke.ts`; `src/reporting/comparisonReportRuntimeExecution.ts`; `docs/product/harnesses.md`; `VHS-REQ-193..199` | retain process-spawn and process-exit truth for `lvcompare` parity probes and classify the raw-engine gap against the current `labview-cli` runtime seam |
| Store retained report packets under `context.storageUri` and surface them via `asWebviewUri` plus `localResourceRoots` | aligned in this tranche | `src/reporting/comparisonReportPacket.ts`; `src/reporting/comparisonReportAction.ts`; `VHS-REQ-134..141`; `VHS-REQ-150..151`; `VHS-REQ-161..162` | sustain the packet artifact while improving the live execution and developer-facing summary surface |
| LabVIEW 2026 Q1 32/64 runtime detection and selection | aligned with live provider selection | `src/reporting/comparisonRuntimeLocator.ts`; `src/reporting/comparisonReportRuntimeExecution.ts`; `package.json`; `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.json`; `VHS-REQ-094..096`; `VHS-REQ-138`; `VHS-REQ-146`; `VHS-REQ-217..220`; `VHS-REQ-243..248`; `docs/architecture/adr/ADR-0006-windows64-container-isolation-for-extension-users.md` | sustain the preferred x64 container path and keep provider probing plus runtime-diagnostic evidence explicit on mapped logs, launch confirmation, and zero-process observations |
| First-class developer dashboard concentrating multiple VI Comparison Reports across at least three commits | aligned with live dashboard proof and whole-window metadata concentration | `src/dashboard/comparisonReportArchive.ts`; `src/dashboard/niComparisonReportParser.ts`; `src/dashboard/multiReportDashboard.ts`; `src/dashboard/multiReportDashboardAction.ts`; `src/harness/harnessDashboardSmoke.ts`; `src/cli/runHarnessDashboardSmoke.ts`; `src/ui/historyPanel.ts`; `src/commands/openViHistoryCommand.ts`; `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.json`; `docs/architecture/adr/ADR-0009-dashboard-pair-archive-and-concentration-packet.md`; `VHS-REQ-200..215`; `VHS-REQ-295..304` | sustain the live dashboard smoke lane while extending runtime-doctor UX and review-scenario decision support |
| Review-scenario registry and separate human decision records for dashboard-driven VI review | partially aligned with canonical scenario flow | `src/scenarios/reviewScenarioRegistry.ts`; `src/scenarios/decisionRecord.ts`; `src/harness/harnessDecisionRecord.ts`; `src/cli/runHarnessDecisionRecord.ts`; `docs/product/review-scenarios.md`; `docs/product/decision-record-template.md`; `VHS-REQ-307..312` | extend the retained scenario flow into extension UX and activate additional scenario shapes beyond the canonical baseline |
| Consumed research-round retirement and future research prompt | aligned in this tranche | `README.md`; `docs/product/current-state.md`; `docs/research/authoritative/research-implementation-index.json`; `docs/research/authoritative/research-infrastructure.md`; `docs/research/authoritative/next-research-prompt.md`; `VHS-REQ-209..211` | sustain |
| Status-bar progress item plus richer percent/items/ETA progress UX | partial | `src/indexing/viEligibilityIndexer.ts` currently uses `window.withProgress` only | add governed progress tranche |
| Manifest trust declaration through `capabilities.untrustedWorkspaces` | aligned in this tranche | `package.json`; `VHS-REQ-084`; `tests/unit/packageManifest.test.ts` | sustain |
| Treat `TimelineProvider` as experimental only, not published product surface | aligned in docs | `docs/architecture/adr/ADR-0002-published-review-surface-webview.md`; `VHS-REQ-085` | sustain |
| Desktop/remote-host boundary and workspace-scoped report storage policy | aligned with successful runtime proof | `docs/architecture/adr/ADR-0003-workspace-report-storage-and-desktop-boundary.md`; `src/reporting/comparisonReportRuntimeExecution.ts`; `src/harness/harnessReportSmoke.ts`; `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.html`; `VHS-REQ-092`; `VHS-REQ-097`; `VHS-REQ-157..163`; `VHS-REQ-217..220` | sustain |
| Packaging/testing/CI/research refresh guidance | aligned as backlog | `VHS-REQ-098`; `docs/research/authoritative/next-research-prompt.md` | use for next research cycle |

## Recommended Order

1. Progress-surface uplift
2. Runtime-doctor guidance and provider troubleshooting
3. Review-scenario registry and human decision records
4. Future research refresh
