# Quick Reference

## Document Control

- Product or service: vi-history-suite
- Applies to: vi-history-suite user-information baseline
- Last reviewed: 2026-07-13
- Primary audience: Returning users and maintainers who need a compact route list.
- Primary entry route: `README.md`

See also:

- `README.md`
- `docs/user-guide.md`
- `docs/faq.md`
- `docs/glossary.md`

## Key Routes

| Need | Route | Notes |
| --- | --- | --- |
| Start here | `README.md` | Project overview, install route, and main workflow entry. |
| Main user guide | `docs/user-guide.md` | Audience, tasks, and navigation for the governed user-information pack. |
| Short answers | `docs/faq.md` | Compact answers for repeated start, command, and fallback questions. |
| Shared terms | `docs/glossary.md` | Terms used across requirements, testing, release, and standards evidence. |
| Troubleshooting | `TROUBLESHOOTING.md` | Runtime, Git, LabVIEWCLI, Docker, and validation failure paths. |
| Support policy | `SUPPORT.md` | Support boundaries and escalation route. |

## Common Commands Or Checks

| Purpose | Command or route | Notes |
| --- | --- | --- |
| Search the local docs tree | `rg -n "<query>" README.md docs SUPPORT.md TROUBLESHOOTING.md` | Use when a route or term is unclear. |
| Run the main validation or check | `npm run check && npm test` | Baseline local validation for implementation changes. |
| Run requirement health | `npm run requirements:verify:strict` | Single-pane strict requirement health signal. |
| Run traceability audit | `npm run traceability:audit` | Required when docs, inventory, requirements, tests, or mappings change. |
| Run docs link check | `npm run docs:links` | Required when Markdown or bundled docs links change. |
| Open the release or change-control route | `docs/maintainer-operations.md` and `docs/cm/cm-plan.md` | Use for release, closeout, Marketplace, and standards evidence. |
## Extension Commands

Run these from the Command Palette (`Ctrl`/`Cmd`+`Shift`+`P`); all are under the
**VI History** category. See [docs/user-guide.md](user-guide.md) for guided use.

| Command | Command ID | What it does |
| --- | --- | --- |
| Review VI History | `labviewViHistory.open` | Open the history view for the selected `.vi`/`.ctl`/`.vit`. |
| Open VI History | `labviewViHistory.openViHistoryFromReport` | Open the history view from an open comparison report. |
| Open Documentation | `labviewViHistory.openDocumentation` | Open the bundled documentation. |
| Copy Review Details | `labviewViHistory.copyReviewPacket` | Copy a review packet for the current comparison. |
| Export Comparison Report (HTML) | `labviewViHistory.exportComparisonReport` | Save the current comparison as a standalone HTML report. |
| Set Up Comparison Runtime | `labviewViHistory.prepareLocalRuntimeSettingsCli` | Guided local comparison-runtime setup. |
| Runtime & Report Settings | `labviewViHistory.pickRuntimeProvider` | Pick the runtime provider, container image, and report options. |
| Detect Runtime Now | `labviewViHistory.detectRuntimeNow` | Re-detect the LabVIEW comparison runtime. |
| Show Runtime Summary | `labviewViHistory.showRuntimeSummary` | Show the detected runtime and its settings. |
| Reset First-Run Runtime Notice | `labviewViHistory.resetFirstRunNotice` | Show the first-run runtime notice again. |
| Install Pinned Dev-Tools Version | `labviewViHistory.installPinnedDevTools` | Install the dev-tools version pinned in settings (trusted workspace only). |
| Uninstall Dev-Tools Version | `labviewViHistory.uninstallDevTools` | Remove an installed dev-tools version. |
| Show Dev-Tools Status | `labviewViHistory.showDevToolsStatus` | Report the pinned/active dev-tools build and installed versions. |
| [Dev] Open mprr Timing Stopwatch | `labviewViHistory.dev.openTimingStopwatch` | Dev-only (Extension Development Host on Windows): launch the full-screen live mprr timing-stopwatch as a decodable ground-truth capture clock. Not registered in a packaged VSIX or on non-Windows dev hosts. |

## Extension Settings

Settings live under `viHistorySuite.*` (Settings UI: search "VI History").

### Runtime

| Setting | Type (default) | Purpose |
| --- | --- | --- |
| `viHistorySuite.runtimeProvider` | `host` \| `docker` (auto-detected) | Where comparisons run: installed LabVIEW (Host) or an NI container (Docker). Auto-selected from the detected runtime on first run, then persisted. |
| `viHistorySuite.semantics.provider` | `labview` \| `lvkit` (`labview`) | Which backend the agent MCP semantic tools use: LabVIEW (needs LabVIEW/Docker) or the LabVIEW-free lvkit VI parser (`uv tool install lvkit`). Preview and comparison report always use LabVIEW/Docker. |
| `viHistorySuite.labviewVersion` | string | Which LabVIEW year to use (for example `2026`). |
| `viHistorySuite.labviewBitness` | `x86` \| `x64` | 32-bit or 64-bit LabVIEW to match your install. |
| `viHistorySuite.labviewExePath` | string | Optional explicit path to the LabVIEW program. |
| `viHistorySuite.labviewCliPath` | string | Optional explicit path to the LabVIEW CLI. |
| `viHistorySuite.container.imageVersion` | string | Which LabVIEW Docker image to use for Docker comparisons. |
| `viHistorySuite.runtime.cliConnectTimeoutSeconds` | integer (`180`) | How long to wait for LabVIEW to start before a comparison gives up. |

### History and reports

| Setting | Type (default) | Purpose |
| --- | --- | --- |
| `viHistorySuite.historyWindowMode` | `auto` \| `capped` (`auto`) | Whether to show the full history or cap it. |
| `viHistorySuite.maxHistoryEntries` | number (`100`) | Most past versions to show when capped. |
| `viHistorySuite.strictRsrcHeader` | boolean | Require a strict resource header when reading history. |
| `viHistorySuite.comparison.worktreeSnapshotRetentionLimit` | integer (`5`) | Uncommitted comparison snapshots to keep per VI. |
| `viHistorySuite.report.ignoreViAttributes` | boolean (`false`) | Leave VI attribute changes out of the report. |
| `viHistorySuite.report.ignoreFrontPanel` | boolean (`false`) | Leave all front-panel changes out of the report. |
| `viHistorySuite.report.ignoreFrontPanelObjectPosition` | boolean (`false`) | Leave front-panel move/resize-only changes out of the report. |
| `viHistorySuite.report.ignoreBlockDiagram` | boolean (`false`) | Leave all block-diagram changes out of the report. |
| `viHistorySuite.report.ignoreBlockDiagramCosmetic` | boolean (`false`) | Ignore cosmetic block-diagram changes (moves/resizes). |

### Preview

| Setting | Type (default) | Purpose |
| --- | --- | --- |
| `viHistorySuite.preview.enabled` | boolean (`false`) | Turn on VI Preview (Docker runtime): render VIs as read-only pictures and cache the workspace. |
| `viHistorySuite.preview.blockDiagramInteractive` | boolean (`false`) | Show the block diagram as an interactive, pannable/zoomable view with a case stepper. |
| `viHistorySuite.preview.backgroundWarming` | `docker-only` \| `always` \| `off` (`docker-only`) | Whether to pre-render the rest of the workspace in the background. |
| `viHistorySuite.preview.warmOnChange` | boolean (`true`) | On Docker, cache a VI as soon as you change it on disk. |
| `viHistorySuite.preview.allowHostNativeRender` | boolean (`false`) | Allow Host LabVIEW to render previews directly (for a Docker-less LabVIEW environment). |

### Dev-tools (advanced)

| Setting | Type (default) | Purpose |
| --- | --- | --- |
| `viHistorySuite.devTools.version` | string (`bundled`) | Which dev-tools build the MCP server runs: `bundled`, or a pinned `devtools-vX.Y.Z` release. |
| `viHistorySuite.devTools.checkForUpdates` | boolean (`false`) | Opt in to a notice when a newer stable dev-tools version is available. |
