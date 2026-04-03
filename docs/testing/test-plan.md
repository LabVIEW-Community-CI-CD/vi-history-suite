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
- `TEST-UNIT-059`: validate the VI History panel exposes stateful retained-pair
  actions so rows without retained evidence show `Generate compare`, rows with
  retained evidence show `Refresh compare`, and `Open compare` is enabled only
  when retained pair evidence exists
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
- `TEST-UNIT-101`: prove pair-archive retention copies packet, metadata,
  runtime artifacts, and report assets into a pair-scoped archive root
- `TEST-UNIT-102`: prove NI comparison-report HTML parsing collects compared VI
  paths, overview images, included attributes, and detailed information
- `TEST-UNIT-103`: prove the dashboard builder persists dashboard JSON and HTML,
  copies recollected overview images, and surfaces archived-versus-missing pair
  counts
- `TEST-UNIT-104`: prove the dedicated dashboard action fails closed on missing
  storage or insufficient commit windows and opens the concentrated dashboard
  panel otherwise
- `TEST-UNIT-105`: prove the history panel and command layer expose and handle
  the `Open dashboard` action only for commit windows with at least three
  retained commits
- `TEST-DOC-011`: review the repo entrypoints and research-control-plane docs
  for explicit dashboard partial-implementation status and pair-archive
  direction
- `TEST-DOC-012`: review the repo entrypoints and research-control-plane docs
  to prove consumed research rounds are deleted and no longer referenced as
  active authority surfaces
- `TEST-DOC-013`: review the next research prompt to prove it starts from the
  current dashboard/runtime baseline and does not restate the consumed
  unresolved-workstream round
- `TEST-UNIT-106`: prove the concentrated dashboard record and HTML surface
  provider provenance plus real VI Comparison Report metadata, including
  report title, generation time, compared VI paths, overview section/image
  counts, included attributes, and detailed-information sections/items
- `TEST-UNIT-107`: prove the dashboard action opens archived HTML artifacts in
  dedicated panels, opens archived JSON artifacts in the editor, and rejects
  artifact paths outside workspace-scoped extension storage
- `TEST-UNIT-108`: prove the Windows-container runtime wrapper injects
  governed container-local `TEMP`/`TMP`, tunes LabVIEW CLI timeouts to 180
  seconds, prelaunches LabVIEW headlessly, preserves overwrite semantics, and
  retains the nested PowerShell command surface that drives container
  execution
- `TEST-UNIT-109`: prove the Windows-container runtime executor copies a
  container-local CLI diagnostic log into governed workspace storage and
  retains the copied artifact path on a successful execution record
- `TEST-UNIT-110`: prove the dashboard packet retains explicit per-pair
  evidence states and explicit window-completeness facts across archived
  succeeded, archived failed, and missing pairs in one commit window while
  the dashboard HTML stays focused on concentrated comparison-report metadata
- `TEST-UNIT-111`: prove rebuilding the same dashboard window removes stale
  copied dashboard assets before regenerating from the current retained pair
  archives
- `TEST-UNIT-112`: prove the runtime-doctor summary is derived only from
  retained runtime-selection and runtime-execution facts and emits one bounded
  next action
- `TEST-UNIT-113`: prove the stored comparison-report packet HTML renders the
  retained runtime-doctor summary
- `TEST-UNIT-114`: prove the live comparison-report panel surfaces the runtime
  doctor summary alongside retained execution diagnostics
- `TEST-UNIT-115`: prove runtime selection retains structured provider-decision
  facts for selected and rejected providers across Windows container,
  host-native, and blocked-provider paths
- `TEST-UNIT-116`: prove stored packet and live comparison-report panel
  surfaces include provider-decision runtime-doctor lines when those retained
  facts are present
- `TEST-UNIT-117`: prove the comparison-report action returns
  `workspace-untrusted` and does not start preflight, runtime discovery,
  persistence, or panel creation when workspace trust is absent
- `TEST-UNIT-118`: prove the multi-report dashboard action returns
  `workspace-untrusted` and does not build or open the dashboard when
  workspace trust is absent
- `TEST-UNIT-119`: prove the history-panel command flow surfaces stable
  warnings and explicit `workspace-untrusted` action outcomes when report or
  dashboard actions are invoked after workspace trust is lost
- `TEST-UNIT-120`: prove the comparison-report action emits deterministic
  bounded progress stages across retained-pair resolution, preflight, runtime
  selection, persistence, execution, archival, and panel opening
- `TEST-UNIT-121`: prove the dashboard action emits deterministic bounded
  progress stages for commit-window preparation, pair-by-pair metadata
  concentration, retained-asset finalization, and dashboard opening
- `TEST-UNIT-122`: prove the history-panel command flow wraps comparison-report
  and dashboard actions in non-cancellable notification progress with stable
  titles
- `TEST-UNIT-123`: prove the comparison-report action returns `cancelled` with
  a stable stage and retained packet/report artifact paths when cancellation is
  observed after packet persistence
- `TEST-UNIT-124`: prove the dashboard action returns `cancelled` with a
  stable stage and retained dashboard artifact paths when cancellation is
  observed after dashboard build
- `TEST-UNIT-125`: prove the history-panel command flow surfaces stable
  informational messages and explicit `cancelled` action summaries when report
  or dashboard actions are cancelled after retaining partial evidence
- `TEST-UNIT-126`: prove malformed dashboard artifact messages, unsupported
  artifact kinds, and blank required fields are ignored without opening
  artifacts or surfacing warnings
- `TEST-UNIT-127`: prove the dashboard action rejects storage-root targets and
  kind/path mismatches with a stable warning while keeping governed retained
  artifact openings available
- `TEST-UNIT-128`: prove native Windows-host container report execution uses
  `powershell.exe`, governed native Windows report/staging paths, and no
  interop workspace root
- `TEST-UNIT-129`: prove the Windows-container provider rewrites `lvcompare`
  parity probes into container workspace paths and invokes them through the
  governed PowerShell wrapper from a non-Windows host
- `TEST-UNIT-130`: prove the comparison-report action preserves explicit empty
  observed-process arrays and renders them as `none` on the retained panel HTML
- `TEST-UNIT-131`: prove the Windows-container provider fails closed with
  `windows-container-image-unavailable` before command execution when selected
  without a configured image
- `TEST-UNIT-132`: prove container-reported NI diagnostic log paths only map
  into host-readable storage when they remain under the governed runtime root
- `TEST-UNIT-133`: prove NI diagnostic logs that report `LabVIEW launched
  successfully.` retain an explicit launch-success note without inventing a
  `LabVIEWPath` anomaly
- `TEST-UNIT-134`: prove runtime execution retains `observed LabVIEW-related
  processes: none` when a governed process snapshot is captured with zero
  matching LabVIEW-related processes
- `TEST-UNIT-135`: prove comparison-report cancellation after governed archive
  completion retains the `after-archive` stage plus preserved blocked-runtime
  packet evidence
- `TEST-UNIT-136`: prove the comparison-report panel renders retained non-empty
  exit observed process names exactly as a joined list
- `TEST-UNIT-137`: prove the default Windows-container image probe uses the
  correct Windows-versus-cross-host command path and returns `false` on probe
  failure instead of throwing
- `TEST-UNIT-138`: prove the Windows-container LabVIEW CLI arg rewrite ignores
  caller `-LabVIEWPath` and `-Headless`, drops `-c`, preserves other supported
  args, and appends governed `-LabVIEWPath` plus `-Headless true`
- `TEST-UNIT-139`: prove the Windows-container LVCompare arg rewrite fails
  closed without a full staged pair and otherwise preserves additional
  comparison flags while rewriting the staged pair and governed `-lvpath`
- `TEST-UNIT-140`: prove comparison-report cancellation after runtime
  selection returns the stable `after-runtime-selection` stage and avoids
  packet persistence
- `TEST-UNIT-141`: prove comparison-report cancellation after runtime
  execution returns the stable `after-runtime-execution` stage, preserves
  runtime-executed packet evidence, and avoids archive plus panel open
- `TEST-UNIT-142`: prove the history-panel command flow surfaces the stable
  dashboard storage warning and records `missing-dashboard-storage` when the
  dashboard action returns `missing-storage-uri`
- `TEST-UNIT-143`: prove the history-panel command flow surfaces the stable
  insufficient-commits informational message and records
  `insufficient-dashboard-commits` when the dashboard action returns
  `insufficient-commits`
- `TEST-UNIT-144`: prove runtime diagnostic-path mapping fails closed when no
  mapping exists or when the diagnostic path or governed runtime root cannot
  be normalized into comparable Windows paths
- `TEST-UNIT-145`: prove governed command-option extraction ignores blank
  option values and only returns nonblank overrides for runtime diagnosis
- `TEST-UNIT-146`: prove Windows-path normalization returns `undefined` for
  blank inputs while preserving valid Windows and `/mnt/<drive>/...` path
  normalization behavior
- `TEST-UNIT-147`: prove the Windows-container LabVIEW CLI script builder
  emits `$labviewPath = $null` for blank governed LabVIEW paths and emits the
  quoted explicit path only for nonblank input
- `TEST-UNIT-148`: prove the design gate persists running retained reports
  with the pending next step after each successful stage before the final
  complete report is written
- `TEST-UNIT-149`: prove the retained design-gate JSON and Markdown surfaces
  expose explicit completion-state and pending-step facts
- `TEST-UNIT-150`: prove the comparison-report plan builder maps every
  governed report format to the exact LabVIEW CLI `-ReportType` token
- `TEST-UNIT-151`: prove the comparison-report plan builder trims a nonblank
  description into `-description` and omits `-c` plus `-o` when those options
  are explicitly disabled
- `TEST-UNIT-152`: prove the Windows-container command planner fails closed
  when no governed engine is selected or when the selected engine cannot be
  rewritten into a container command
- `TEST-UNIT-153`: prove Windows-container execution derives the container
  temp directory from the normalized Windows host report directory
- `TEST-UNIT-154`: prove Windows-container execution-context preparation fails
  closed with `windows-interop-root-unavailable` when a non-Windows host lacks
  the required interop workspace root
- `TEST-UNIT-155`: prove Windows-container execution-context preparation fails
  closed with `windows-path-normalization-failed` when the selected host
  report directory cannot be normalized into governed Windows form
- `TEST-UNIT-156`: prove the dashboard action returns the stable
  `before-dashboard-build` cancellation stage without building the dashboard
  or opening a panel
- `TEST-UNIT-157`: prove retained concentrated overview-image assets render in
  the dashboard HTML through webview-safe asset URIs
- `TEST-UNIT-158`: prove the comparison-report action returns the stable
  `before-preflight` cancellation stage after revision-pair resolution while
  skipping preflight and panel creation
- `TEST-UNIT-159`: prove the comparison-report action returns the stable
  `after-preflight` cancellation stage after revision validation while
  skipping runtime selection and panel creation
- `TEST-UNIT-160`: prove the comparison-report action returns the stable
  `before-revision-pair-resolution` cancellation stage when the request is
  already cancelled before any retained-pair lookup begins
- `TEST-UNIT-161`: prove the comparison-report archive subsystem stamps
  archived source records with a governed ISO-8601 UTC timestamp when no
  explicit archive clock override is provided
- `TEST-UNIT-162`: prove the comparison-report archive planner fails closed
  with `storageRoot must be non-empty` when the retained archive storage root
  is blank after trimming
- `TEST-UNIT-163`: prove the comparison-report archive planner defaults the
  runtime diagnostic-log and process-observation archive filenames from the
  governed artifact plan when explicit overrides are absent
- `TEST-UNIT-164`: prove the comparison-report archive writer skips missing
  runtime artifacts while still writing the pair-scoped source record and other
  existing copied artifacts
- `TEST-UNIT-165`: prove a requested runtime-engine override that already
  matches the retained runtime engine is treated as a no-op and preserves the
  original runtime-selection object
- `TEST-UNIT-166`: prove the canonical comparison-report smoke runner fails
  closed with `requested-labview-cli-not-available` when `labview-cli` is
  requested but no governed LabVIEW CLI executable is available
- `TEST-UNIT-167`: prove the Windows interop command planner preserves
  additional `lvcompare` flags after rewriting the staged pair and governed
  `-lvpath`, and fails closed on unsupported runtime-engine tokens
- `TEST-UNIT-168`: prove the Windows interop `lvcompare` command planner fails
  closed when staged VI paths or the governed `-lvpath` cannot be normalized
  into Windows interop form
- `TEST-UNIT-169`: prove the Windows interop command planner rewrites governed
  `labview-cli` path-bearing args into Windows-native form and fails closed
  when an `lvcompare` interop command has fewer than two staged VI args
- `TEST-UNIT-170`: prove the Windows interop `labview-cli` command planner
  fails closed when the governed `-ReportPath` or `-LabVIEWPath` cannot be
  normalized into Windows interop form
- `TEST-UNIT-171`: prove the Windows interop `labview-cli` command planner
  fails closed when the governed staged `-VI1` or `-VI2` paths cannot be
  normalized into Windows interop form
- `TEST-UNIT-172`: prove the default runtime executor routes
  `windows-container` through raw command execution and routes non-container
  providers through observation-enabled command execution
- `TEST-UNIT-173`: prove the concentrated dashboard retains
  `archived-no-generated-report` when an archived pair has no generated report
  and was neither blocked nor failed
- `TEST-UNIT-174`: prove the concentrated dashboard default build path stamps
  `generatedAt` with a governed ISO-8601 UTC timestamp when no clock override
  is provided
- `TEST-UNIT-175`: prove the concentrated dashboard retains
  `archived-blocked` and blocked-pair summary facts when an archived pair was
  blocked before or during runtime execution
- `TEST-UNIT-176`: prove the concentrated dashboard skips copying a parsed
  overview image when the retained source image asset is missing on disk while
  preserving the entry's parsed overview metadata counts
- `TEST-UNIT-177`: prove the history-panel command flow retains
  `unsupported-command` when `openDashboard` is dispatched but no dashboard
  action is wired
- `TEST-UNIT-178`: prove comparison-report packet HTML omits the
  `comparison-report-runtime-doctor` section when no retained runtime-doctor
  summary lines are present
- `TEST-UNIT-179`: prove the concentrated dashboard HTML renders labeled NI
  report metadata fields plus selected/base chronology wording for retained
  adjacent pairs
- `TEST-UNIT-180`: prove the dashboard action webview renders the concentrated
  metadata-first review lens and labeled NI metadata surface
- `TEST-UNIT-181`: prove the canonical dashboard smoke runner retains a factual
  dashboard-smoke artifact set with a bounded three-commit window, pair
  summaries, and concentrated dashboard summary counts
- `TEST-UNIT-182`: prove the dashboard smoke CLI parses bounded runtime and
  commit-window overrides, writes a stable success summary, and supports help
  plus process-style exit codes
- `TEST-INTEG-007`: run the real extension-host dashboard flow, retain the
  opened dashboard panel HTML/path summary, and prove `packet-html` and
  `metadata-json` artifact-open behavior through the real dashboard message
  handler
- `TEST-INTEG-008`: run the real extension-host dashboard flow twice and prove
  repeated `openDashboard` requests reopen the dashboard as a refresh action
  with incremented dashboard-open tracking
- `TEST-UNIT-183`: prove dashboard panel tracking retains a separate dashboard
  panel summary, dashboard artifact action summary, dashboard message
  dispatcher, and clear behavior without overwriting the history-panel tracker
- `TEST-UNIT-184`: prove the concentrated dashboard retains and renders
  whole-window overview-caption, included-attribute, and detailed-information
  heading concentration summaries across multiple metadata-backed pairs
- `TEST-UNIT-185`: prove the dashboard panel webview renders the whole-window
  metadata concentration sections before per-pair review details
- `TEST-UNIT-186`: prove the eligibility indexer refresh lane is cancellable and
  preserves the previous eligible-path snapshot when cancellation is requested
  mid-refresh
- `TEST-UNIT-187`: prove the eligibility indexer fails closed and clears the
  eligible-path context when workspace trust is lost during an in-flight
  refresh
- `TEST-UNIT-188`: prove the review-scenario registry exposes the active
  canonical scenario and validates commit-window plus comparison-pair contracts
- `TEST-UNIT-189`: prove decision-record persistence writes separate
  `decision-record.json` and `decision-record.md` artifacts rather than
  mutating the dashboard packet
- `TEST-UNIT-190`: prove canonical harness decision-record generation uses
  dashboard smoke evidence and fails closed when the scenario contract is not
  satisfied
- `TEST-UNIT-191`: prove the harness decision-record CLI parses reviewer and
  outcome fields, prints help, and formats retained decision/dashboard paths
- `TEST-SMOKE-001`: run `npm run harness:dashboard:smoke -- --platform win32
  --prefer-bitness auto --dashboard-commit-window 3` and retain
  `dashboard-smoke.json`, `dashboard-smoke.md`, and `dashboard-smoke.html`
  under `.cache/harness-reports/HARNESS-VHS-001/`
- `TEST-DOC-014`: review the queue, epic, ADR, and current-state surfaces to
  prove the future-facing dashboard research was normalized into governed repo
  control-plane artifacts and the incoming research artifact was deleted
- `TEST-DOC-015`: review the repo entrypoints, architecture, alignment matrix,
  and queue to prove Windows 64-bit isolated container execution is no longer
  described as future-only once the canonical NI smoke lane succeeds
- `TEST-DOC-016`: review the repo entrypoints and research-control-plane docs
  to prove live dashboard smoke and extension-host dashboard proof are
  described as implemented evidence instead of future-only dashboard intent
- `TEST-DOC-017`: review the repo entrypoints, issue tracking, and research
  alignment/index surfaces to prove the canonical review-scenario registry and
  separate decision-record path are described as partially implemented
  evidence rather than future-only modeling
- `TEST-DOC-018`: review the README, current-state, ship target, blocker
  ledger, and release procedure to prove the SemVer ship-control system is the
  primary direction surface for the remaining release work
- `TEST-UNIT-192`: prove the ship-control system keeps the ship target,
  development queue, package baseline, release-readiness matrix, blocker
  ledger, and repo entrypoints aligned around one active `TRANCHE-009` ship
  lane
- `TEST-UNIT-193`: prove the GitLab release lane fails closed on tag/package
  mismatch, packages `release-evidence/vi-history-suite-<version>.vsix`, and
  retains the release manifest plus checksum evidence paths
- `TEST-DOC-019`: review the ship target, readiness matrix, blocker ledger,
  current-state, README, and release procedure to prove the GitLab VSIX
  release lane is configured and the remaining blocker is first tagged proof
- `TEST-UNIT-194`: prove the GitLab `main` pipeline retains a preview VSIX
  artifact and preview manifest, and keeps that preview lane distinct from the
  formal tagged release artifact lane
- `TEST-DOC-020`: review README, current-state, release procedure, readiness
  matrix, and blocker ledger to prove preview VSIX delivery is described as an
  install surface but not as the final SemVer release proof
- `TEST-UNIT-195`: prove the eligibility indexer progress message keeps
  repository-scoped processed/total counts truthful across multi-repository
  refreshes
- `TEST-UNIT-196`: prove the live comparison-report panel frames the retained
  NI-generated HTML report directly inside the webview when one exists, while
  blocked or no-report cases still open the governed packet artifact
- `TEST-UNIT-197`: prove the eligibility indexer ignores Git repositories and
  repository-state listeners that are outside the current workspace scope
- `TEST-UNIT-198`: prove the eligibility indexer coalesces refresh requests
  that arrive while a refresh is already running into one follow-up pass
- `TEST-UNIT-199`: prove `diffPrevious` opens retained comparison-report
  evidence for content-detected VI items when retained pair evidence exists,
  instead of invoking VS Code text diff on binary content
- `TEST-UNIT-200`: prove `diffPrevious` fails closed with
  `missing-retained-comparison-report` and a stable `Generate compare` hint
  when retained pair evidence is absent
- `TEST-UNIT-201`: prove the concentrated dashboard retains compared-path and
  detail-item whole-window concentration summaries derived from retained NI
  comparison-report metadata
- `TEST-UNIT-202`: prove the dashboard action backfills missing or stale
  adjacent-pair comparison evidence before concentrating dashboard metadata,
  and once at least one pair completes, prove the next pair progress message
  includes a bounded minutes-and-seconds estimate derived from completed pair
  durations in the current dashboard refresh session
- `TEST-UNIT-203`: prove the dashboard action returns the stable
  `during-dashboard-pair-generation` cancellation stage when pair-evidence
  backfill is cancelled before dashboard build
- `TEST-GATE-001`: run `npm run design:gate` and retain the latest design-gate
  report artifacts under `.cache/design-gate/`
- `TEST-GATE-002`: run `npm run design:gate` and retain weakest-source
  coverage focus plus a deterministic next-focus cue in the latest design-gate
  report

## Reporting

- CI artifacts: `coverage/`
- Test report location: Vitest console output plus coverage summary
- Defect tracking link: GitLab issues in this repository
