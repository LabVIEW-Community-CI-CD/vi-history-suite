# Research Alignment Matrix

## Authority Surface

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
| Verify both revision blobs are VIs before compare/report generation | missing | authoritative research only; no implementing code yet | add governed report-generation tranche |
| Generate report with `{type}-report-{fullFilename}.html` | missing | authoritative research only; no implementing code yet | add governed report-generation tranche |
| Store generated reports under `context.storageUri` and surface via `asWebviewUri` plus `localResourceRoots` | missing | authoritative research only; no implementing code yet | add governed report-generation tranche |
| LabVIEW 2026 Q1 32/64 runtime detection and selection | missing | settings placeholders only in `package.json` | add governed runtime-detection tranche |
| Status-bar progress item plus richer percent/items/ETA progress UX | partial | `src/indexing/viEligibilityIndexer.ts` currently uses `window.withProgress` only | add governed progress tranche |
| Treat `TimelineProvider` as experimental only, not published product surface | partial | current product uses webview only, but no explicit ADR/policy yet | capture as architecture decision |

## Recommended Order

1. Report-generation governance:
   - blob verification
   - filename contract
   - storage and webview linking
2. LabVIEW 2026 Q1 runtime/tool selection
3. Progress-surface uplift
4. Explicit architecture decision for proposed APIs and desktop-only scope
