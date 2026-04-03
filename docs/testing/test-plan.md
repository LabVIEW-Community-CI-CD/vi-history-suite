# Test Plan

## Overview

- Release or baseline: `draft-baseline`
- Owner: sole author
- Scope: first governed extension baseline for content-detected VI history
  review

## Test Items

| Item | Type | Risk | Notes |
| --- | --- | --- | --- |
| VI magic detection | Unit | High | Product entry condition |
| Git output parsing | Unit | High | Eligibility correctness |
| Core history model against a temporary Git repo | Unit | High | Real Git semantics without VS Code host |
| History panel rendering | Unit | Medium | Primary review surface |
| Extension activation and command flow | Integration | High | VS Code runtime behavior |
| Harness smoke against cloned real repo | Smoke | High | Real history path |
| Repo entrypoint and research-status docs | Documentation review | Medium | Future-reader control plane |

## Entry Criteria

- requirements and traceability are current
- TypeScript compiles
- unit test fixtures are present

## Exit Criteria

- unit tests pass
- extension compiles cleanly
- local coverage is generated
- no blocking defect is left in the initial command or history flow

## Coverage Targets

| Metric | Target | Evidence |
| --- | --- | --- |
| Line | 80% | `coverage/cobertura-coverage.xml` |
| Branch | Project-defined by Vitest | `coverage/coverage-summary.json` |

## Initial Test Cases

- `TEST-UNIT-001`: detect `LVIN` and `LVCC`, reject short files, reject wrong
  offsets, and exercise strict-header mode
- `TEST-UNIT-002`: parse `git ls-files -z`, bounded commit-hash output, and
  history-entry output
- `TEST-UNIT-003`: prove cache-key and concurrency helpers behave deterministically
- `TEST-UNIT-004`: render a history panel with factual metadata and action hooks
- `TEST-INTEG-001`: activate extension, compute eligibility context, and open
  the history panel for an eligible file, then assert the rendered HTML retains
  stable semantic anchors plus factual eligibility, signature, path, and commit
  subjects, and then dispatch `copyHash`, `openCommit`, and `diffPrevious`
  through the real panel message handler; the same lane shall also prove the
  chronology packet, compare-base context, explicit selected-versus-base pairing,
  binary-review limitation note, reviewer-guidance block,
  confidence-and-scope packet, and panel-level copied review packet
- `TEST-INTEG-002`: validate non-file URI detection fallback behavior
- `TEST-UNIT-005`: build a temporary Git repo with a content-detected VI and
  assert the shared core history model returns eligible history
- `TEST-UNIT-006`: validate the local design-gate plan, assurance-summary
  parsing, weakest-coverage extraction with deterministic tie ordering, and
  retained report rendering helpers
- `TEST-UNIT-007`: validate explicit design-gate unavailable-reason rendering
  when coverage-focus facts cannot be retained
- `TEST-UNIT-008`: validate the shared design-gate runner executes ordered
  steps, retains reports, and derives the next focus from retained coverage
  facts
- `TEST-UNIT-009`: validate the shared design-gate runner retains a fail report
  when a gated step stops the sequence before completion
- `TEST-UNIT-010`: validate the CLI entrypoint delegates to the shared
  design-gate runner and throws on a failed retained report
- `TEST-UNIT-011`: validate `VI History` command entry handling for missing
  target, untrusted workspace, and ineligible-file conditions
- `TEST-UNIT-012`: validate `VI History` panel-action handling for missing Git
  URIs, missing previous revisions, hashless messages, and unsupported
  commands
- `TEST-UNIT-013`: validate harness smoke CLI argument parsing for defaults,
  explicit options, help, and invalid arguments
- `TEST-UNIT-014`: validate the reusable harness smoke CLI runner prints the
  deterministic retained success summary and forwards governed options
- `TEST-UNIT-015`: validate VI history service repository-root resolution for
  nested Git API roots and CLI fallback behavior
- `TEST-UNIT-016`: validate VI history service configuration forwarding and
  Git-URI translation behavior
- `TEST-UNIT-017`: validate the URI-based VI magic wrapper for file-path
  delegation, workspace-fs truncation, and fail-closed behavior
- `TEST-UNIT-018`: validate the built-in Git API resolver for missing
  extension, activation, missing `getAPI`, and activation-failure behavior
- `TEST-UNIT-019`: validate the eligibility indexer helper surface for cache
  keys, normalized context keys, configuration, and bounded concurrency
- `TEST-UNIT-020`: validate the eligibility indexer refresh path for untrusted
  clearing, cache reuse, HEAD invalidation, repo/file fail-closed behavior, and
  dynamic repository-state listener handling
- `TEST-UNIT-021`: validate design-gate runner unavailable-reason handling for
  coverage summaries with no governed `src/` entries, and retained report
  persistence through recursive cache-directory creation
- `TEST-UNIT-022`: validate spawned design-gate step execution retains stdout,
  stderr, and duration while streaming both channels to the active sinks
- `TEST-UNIT-023`: validate spawned design-gate step execution fails closed on
  process errors and `close(null)` termination
- `TEST-UNIT-024`: validate the extension manifest uses the authoritative
  `labviewViHistory` command id, eligibility context key, and menu `when`
  clause for both Explorer and editor title context menus
- `TEST-UNIT-025`: validate the extension manifest retains the authoritative
  Git extension dependency, activation events, and limited untrusted-workspace
  capability declaration
- `TEST-INTEG-003`: validate indexing progress retains percent, processed/total,
  and ETA through notification progress and a status-bar surface
- `TEST-INTEG-004`: validate report-generation progress appears in the webview
  review surface and completes or fails with retained status
- `TEST-UNIT-026`: validate report-generation preflight verifies both revision
  blobs as VIs, preserves the `{type}-report-{fullFilename}.html` naming
  contract, and writes distinct same-name temporary filenames
- `TEST-INTEG-005`: validate report artifacts and metadata are stored under
  `context.storageUri`, and report links only appear when HTML output exists
- `TEST-INTEG-006`: validate runtime discovery honors explicit user tool-path
  overrides before Windows/macOS/Linux auto-detection
- `TEST-UNIT-027`: validate the pure comparison-report planning module for
  exact `{type}-report-{fullFilename}.html` naming, deterministic workspace
  storage layout, and narrow local-root planning
- `TEST-UNIT-028`: validate the pure comparison-report planning module for
  same-name staged revision filenames plus primary `CreateComparisonReport`
  and fallback `LVCompare` command plans
- `TEST-UNIT-029`: validate the canonical harness clone helper reuses an
  existing clone and performs clone-on-demand when `.git` is absent
- `TEST-UNIT-030`: validate the core harness smoke runner writes retained JSON,
  Markdown, and HTML artifacts from shared history-model facts and fails closed
  when the target file is not tracked
- `TEST-UNIT-031`: validate `VI History` successful command flow for active
  editor fallback, panel creation, copied review packet, copied commit hash,
  opened Git revision, and diff-against-previous execution
- `TEST-UNIT-032`: validate the design-gate CLI default repo-root resolution
  and stable failure-message rendering for Error and non-Error failures
- `TEST-UNIT-033`: validate the history-panel tracker retains opened-panel
  summaries, action summaries, dispatcher behavior, and clear/reset semantics
- `TEST-UNIT-034`: validate the core history model auto-discovers the Git root
  from a tracked filesystem path and preserves default non-strict VI detection
  for offset-8 `LVIN`/`LVCC` content
- `TEST-UNIT-035`: validate the core history model default history load returns
  the full available commit chain and leaves the oldest commit without a
  `previousHash`
- `TEST-UNIT-036`: validate the design-gate runner default filesystem-backed
  coverage read and retained report persistence without injected file helpers
- `TEST-UNIT-037`: validate the design-gate spawned-step executor preserves the
  first settled result and ignores later `error` or `close` events
- `TEST-UNIT-038`: validate the canonical harness registry rejects unknown
  harness identifiers with a stable fail-closed error
- `TEST-UNIT-039`: validate the design-gate CLI script-mode helper applies the
  retained main exit code to `process.exitCode` without forcing an immediate
  process exit
- `TEST-UNIT-040`: validate the harness-smoke CLI script-mode helper applies
  retained success or failure to `process.exitCode` and writes a stable stderr
  line on failure without forcing an immediate process exit
- `TEST-UNIT-041`: validate the Git CLI helper layer against a real temporary
  Git repository for trimmed `HEAD`, repository-root discovery, and tracked-file
  enumeration
- `TEST-UNIT-042`: validate the Git CLI helper layer against a real temporary
  Git repository for bounded commit hashes and structured history entries on a
  tracked file
- `TEST-UNIT-043`: validate the Git CLI helper layer falls back to bare `git`
  when no Windows candidate exists and rejects Git subprocess failures
- `TEST-UNIT-044`: validate the filesystem VI-probe helper returns only the
  bytes actually read, bounded to the minimum detection-header length
- `TEST-UNIT-045`: validate the filesystem VI-signature detector fails closed
  to `undefined` when the probe read cannot be completed
- `TEST-UNIT-046`: validate the eligibility indexer debounces workspace-triggered
  refreshes, tolerates missing Git API startup, and ignores duplicate or
  state-less repository listener registrations
- `TEST-UNIT-047`: validate the eligibility indexer helper layer ignores empty
  context-key values, adds lowercase Windows path variants, and stops cleanly
  when concurrent workers outnumber queued items
- `TEST-UNIT-048`: validate the comparison-report staging planner falls back to
  deterministic `left-` and `right-` staged filenames when revision identifiers
  are omitted or blank
- `TEST-UNIT-049`: validate the comparison-report planning helpers fail closed
  on empty required storage roots, filenames, and VI/report paths
- `TEST-UNIT-050`: validate the history panel and copied review packet render
  an explicit `No retained commits` fallback when the retained commit list is
  empty
- `TEST-UNIT-051`: validate the design-gate runner retains the explicit
  coverage-focus unavailable reason and omits `nextFocus` when no governed
  source coverage entries are available
- `TEST-UNIT-052`: validate the spawned design-gate step runner derives
  duration from the default wall clock when no injected time source is
  supplied
- `TEST-UNIT-053`: validate the harness-smoke runner stamps generated reports
  from the default ISO timestamp path when no injected clock is supplied
- `TEST-UNIT-054`: validate the comparison-report subsystem derives revision
  blob Git specifiers as `<revision>:<normalized/relative/path>`
- `TEST-UNIT-055`: validate the comparison-report preflight reports `ready`
  only when both selected revision blobs are content-detected VIs
- `TEST-UNIT-056`: validate the comparison-report preflight fails closed with
  explicit side-specific blocked reasons when a selected blob is unreadable or
  not a VI
- `TEST-UNIT-057`: validate the design gate suppresses line-coverage
  `nextFocus` and promotes the first governed development tranche when source
  coverage is saturated at 100%
- `TEST-UNIT-058`: validate the design gate retains an explicit unavailable
  reason when the governed development queue cannot yield an active or queued
  tranche
- `TEST-UNIT-059`: validate the VI History panel exposes `Generate report`
  only for revisions that have a retained base revision
- `TEST-UNIT-060`: validate the comparison-report action fails closed when
  workspace-scoped storage is unavailable and the command surfaces the stable
  warning
- `TEST-UNIT-061`: validate the retained comparison-report packet writes the
  governed report HTML, metadata, staged revision plan, runtime-not-run state,
  and preflight facts
- `TEST-UNIT-062`: validate the comparison-report action opens a dedicated
  report panel with `asWebviewUri` plus narrow `localResourceRoots`
- `TEST-UNIT-067`: validate the comparison-report action resolves runtime
  selection before packet persistence and records the retained runtime summary
- `TEST-UNIT-068`: validate the stored comparison-report packet distinguishes
  `blocked-runtime` from `blocked-preflight` and renders runtime-selection
  facts in HTML plus metadata
- `TEST-UNIT-069`: validate the pure comparison-report execution planner maps
  ready packets to exact LabVIEW CLI or LVCompare command lines and fails
  closed on blocked or incomplete runtime state
- `TEST-UNIT-070`: validate the governed comparison-report storage contract
  keeps the retained packet artifact separate from the reserved NI-generated
  `diff-report-*.html` output path
- `TEST-UNIT-071`: validate the host-native comparison-report execution runner
  stages revision blobs, runs the governed command, retains stdout/stderr
  artifacts, and records explicit failure reasons
- `TEST-UNIT-063`: validate explicit runtime settings override auto-discovery,
  Windows registry/install-root discovery is retained, and runtime selection
  chooses the governed host-native engine deterministically
- `TEST-UNIT-064`: validate runtime discovery retains explicit Linux/macOS
  availability constraints and fallback behavior when CLI tooling is missing
- `TEST-UNIT-066`: validate the extension manifest exposes `labviewCliPath`
  and keeps all external runtime settings restricted in untrusted workspaces
- `TEST-DOC-003`: review architecture and product docs for the published
  WebviewPanel-only surface, desktop/remote-host boundary, and no-publish
  TimelineProvider policy
- `TEST-DOC-005`: review architecture for the Windows 64-bit runtime-provider
  boundary and the future isolated container execution path
- `TEST-DOC-006`: review architecture for the dedicated extension-user Windows
  64-bit `labview2026q1` container isolation policy and confirm it remains
  separate from host-native 32-bit execution
- `TEST-DOC-004`: review packaging and release guidance for `vsce package`,
  VSIX installation, and Marketplace publishing prerequisites
- `TEST-SMOKE-001`: run the canonical harness smoke and retain JSON, Markdown,
  and HTML reports under `.cache/harness-reports/`
- `TEST-SMOKE-002`: run the canonical comparison-report smoke and retain JSON,
  Markdown, and HTML report-execution evidence for the latest comparable pair
  under `.cache/harness-reports/`
- `TEST-DOC-007`: review the committed repo entrypoint stack and confirm
  `README.md`, `docs/product/current-state.md`, and
  `docs/research/authoritative/research-implementation-index.json` point to the
  authoritative research stack, the research-alignment matrix, the active
  development queue, and the committed implementation-status surfaces
- `TEST-DOC-008`: review the forward-looking program docs and confirm the
  research infrastructure, development queue, dashboard epic, and dashboard ADR
  define a first-class multi-report developer dashboard for one VI across at
  least three commits
- `TEST-DOC-009`: review the decision-support docs and confirm the scenario
  registry plus decision-record template model one canonical VI review scenario
  with at least three commits, at least two comparison pairs, and a separate
  human decision outcome
- `TEST-DOC-010`: review the dashboard direction docs and confirm the dashboard
  is modeled as concentration-first for high-volume open-source review, with
  drill-down preserved to raw packet and raw comparison-report artifacts
- `TEST-UNIT-096`: validate the canonical comparison-report smoke CLI parses
  `--engine labview-cli|lvcompare`, rejects unsupported engine values, and
  forwards the override into the smoke runner
- `TEST-UNIT-097`: validate the canonical comparison-report smoke runner
  applies governed runtime-engine overrides and fails closed with explicit
  blocked reasons when the requested engine is unavailable
- `TEST-UNIT-098`: validate the canonical comparison-report smoke runner
  persists the effective runtime engine and explicit override notes into the
  retained packet path when an engine override is requested
- `TEST-UNIT-099`: validate the runtime executor clears stale diagnostic-log
  artifacts on runs without a current diagnostic log and classifies the
  `lvcompare` exit-0/no-report lane with a dedicated failure reason
- `TEST-UNIT-100`: validate the direct runtime-command observation runner
  captures `process-spawn` plus `process-exit` snapshots for `lvcompare` parity
  probes and fails closed when spawn-time observation capture errors
- `TEST-INTEG-001`: run a real VS Code extension host against a temporary Git
  workspace and prove eligible versus ineligible command flow behavior
- `TEST-INTEG-002`: run the real extension-host report action and retain the
  stored comparison-report packet artifact plus action summary under workspace
  storage, while only reading the governed report file when execution retained
  `reportExists: true`
- `TEST-INTEG-003`: run the real extension-host report action and retain a
  truthful runtime-selection summary that justifies either `ready-for-runtime`
  or `blocked-runtime` on the active host
- `TEST-UNIT-072`: prove the canonical comparison-report smoke runner selects a
  retained compare pair, persists report artifacts, and records runtime facts
- `TEST-UNIT-073`: prove the canonical comparison-report smoke CLI parses
  runtime-selection overrides and prints a deterministic success summary
- `TEST-UNIT-074`: prove the runtime locator retains actionable missing-runtime
  and missing-tool notes for blocked report generation
- `TEST-UNIT-075`: prove the runtime executor normalizes win32 interop paths,
  mirrors staged/runtime output into a Windows-accessible workspace, and fails
  closed when the interop root is unavailable
- `TEST-UNIT-076`: prove the canonical comparison-report smoke runner forwards a
  Windows interop workspace for win32 proof runs from non-Windows hosts
- `TEST-UNIT-077`: prove the runtime executor captures the LabVIEW CLI
  diagnostic log, retains the source and artifact paths, and classifies the
  retained `-LabVIEWPath` ignored / last-used-LabVIEW message
- `TEST-UNIT-078`: prove the packet and smoke artifact surfaces render the
  retained NI diagnostic reason, diagnostic log path, and explanatory notes
- `TEST-UNIT-079`: prove the comparison-report action returns retained runtime
  diagnostics and renders a panel summary with actionable blocked, failure, and
  diagnosis facts
- `TEST-UNIT-080`: prove the history-panel command path retains comparison
  runtime diagnostics in the panel action tracker when report generation
  returns a classified NI runtime diagnosis
- `TEST-UNIT-081`: prove the runtime executor distinguishes ignored
  `-LabVIEWPath` diagnostics that still match the intended LabVIEW executable
  from diagnostics that diverge to a different installed LabVIEW
- `TEST-UNIT-082`: prove the runtime executor classifies a log-only LabVIEW CLI
  nonzero exit with no generated report and empty stderr as a dedicated
  failure reason with a retained explanatory note
- `TEST-UNIT-083`: prove the runtime executor retains an explicit note when the
  captured LabVIEW CLI diagnostic log never reports successful LabVIEW launch
  before exit
- `TEST-UNIT-084`: prove the canonical comparison-report smoke artifacts expose
  retained runtime stdout and stderr artifact paths when report execution is
  attempted
- `TEST-UNIT-085`: prove the runtime executor persists a governed
  runtime-process-observation artifact and packet execution facts when a
  Windows report run captures LabVIEW-related process observations, and prove
  the Windows tasklist parser/observer retains only the governed LabVIEW
  runtime process facts
- `TEST-UNIT-086`: prove the retained comparison-report packet,
  comparison-report panel, and canonical comparison-report smoke render the
  process-observation artifact path, observed process names, and explicit
  yes/no facts for observed `LabVIEW.exe`, `LabVIEWCLI.exe`, and
  `LVCompare.exe`
- `TEST-UNIT-087`: prove the retained comparison-report packet,
  comparison-report panel, canonical comparison-report smoke, and runtime
  execution metadata render the process-observation `capturedAt` timestamp and
  trigger so the observed-process facts stay explicitly scoped to the retained
  snapshot
- `TEST-UNIT-088`: prove the direct runtime-command observation runner starts
  observation when the LabVIEW CLI diagnostic-log banner appears on stdout,
  retains a second governed `process-exit` snapshot when the command closes,
  and fails closed if the observed command closes without an exit code
- `TEST-UNIT-089`: prove the runtime executor derives snapshot-scoped
  diagnostic notes from retained process observations, including explicit
  absence notes when `LabVIEW.exe` or `LVCompare.exe` were not observed at the
  retained snapshot
- `TEST-UNIT-090`: prove the runtime executor classifies the retained
  banner-snapshot-without-LabVIEW case into a dedicated failure reason rather
  than the generic log-only LabVIEW CLI nonzero bucket
- `TEST-UNIT-091`: prove the runtime executor classifies the no-LabVIEW-through-exit
  case into a stricter dedicated failure reason when both retained snapshots
  show `LabVIEWCLI.exe` without `LabVIEW.exe`
- `TEST-UNIT-092`: prove the retained packet, comparison-report panel/action
  result, and canonical smoke artifacts surface the retained `process-exit`
  snapshot facts directly when that governed exit snapshot exists
- `TEST-UNIT-093`: prove `openViHistoryCommand` propagates retained
  comparison-report runtime diagnostics plus banner and exit snapshot facts
  into the last recorded panel action summary
- `TEST-UNIT-094`: prove the direct runtime-command observation runner fails
  closed when `process-exit` snapshot capture errors after a retained
  `cli-log-banner` snapshot
- `TEST-UNIT-095`: prove the comparison-report panel/action surface, canonical
  smoke artifacts, and active-panel action summary surface the retained runtime
  executable, runtime argument string, and diagnostic-log source path
- `TEST-GATE-001`: run `npm run design:gate` and retain the latest design-gate
  report artifacts under `.cache/design-gate/`
- `TEST-GATE-002`: run `npm run design:gate` and retain weakest-source
  coverage focus plus a deterministic next-focus cue in the latest design-gate
  report

## Reporting

- CI artifacts: `coverage/`
- Test report location: Vitest console output plus coverage summary
- Defect tracking link: GitLab issues in this repository
