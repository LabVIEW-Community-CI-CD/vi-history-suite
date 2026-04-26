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

## Information-For-Users Coverage

- retained planning and style-governance controls
- retained audience and task
- retained topic architecture
- retained delivery profile
- retained navigation and search posture
- retained specialized-support posture
- retained accessibility baseline
- retained glossary discipline
- retained documentation change-control
- retained docs-quality gate
- retained release proof
- explicit `26514` claim boundary
- bounded document set
- selected process duties in `26514 §§5-6`
- selected product duties in `26514 §§7-9`
- Markdown-based repo documentation scope
- release-versioned evidence model
- Information planning and style governance
- Audience and task profile depth
- Topic architecture and section role mapping
- Delivery profile coverage
- Navigation and search posture
- FAQ and quick-reference governance
- Accessibility baseline
- Glossary discipline
- Documentation change control
- Documentation quality gate
- Release proof packet

Information-for-users review cases:

- `TEST-114 information-for-users navigation and claim-boundary review`
- `TEST-115 information plan and style-governance review`
- `TEST-116 audience and task profile review`
- `TEST-117 topic architecture review`
- `TEST-118 delivery-profile review`
- `TEST-119 navigation and search review`
- `TEST-120 specialized-support review`
- `TEST-121 accessibility baseline review`
- `TEST-122 documentation change-control review`
- `TEST-123 documentation quality gate review`
- `TEST-124 release-proof review`
- `TEST-125 glossary discipline review`

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
- `TEST-UNIT-059`: validate the VI History panel exposes a checkbox on every
  retained commit row, keeps compare generation/opening controls off the
  extension-user row-action surface, and routes compare selection through
  explicit compare preflight after two distinct checkbox selections
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
- `TEST-UNIT-063`: validate governed internal/runtime-proof override inputs
  still override auto-discovery, Windows registry/install-root discovery is
  retained, and runtime selection chooses the governed host-native engine
  deterministically
- `TEST-UNIT-064`: validate runtime discovery retains explicit Linux/macOS
  availability constraints and fallback behavior when CLI tooling is missing
- `TEST-UNIT-066`: validate the extension manifest does not expose
  `labviewCliPath`, `labviewExePath`, `bitness`, `executionMode`, or public
  image settings, while keeping the admitted installed-user runtime settings
  restricted in untrusted workspaces
- `TEST-DOC-001`: review the extension design summary and SRS to confirm
  rename following remains explicitly best effort rather than a guaranteed
  history-rewrite contract
- `TEST-STATIC-001`: inspect the package manifest and SRS to confirm the
  extension remains self-contained and does not take a runtime dependency on
  the external comparevi repositories
- `TEST-DOC-002`: review the product harness docs to confirm the first real
  history proof surface is the cloned `ni/labview-icon-editor` repository
- `TEST-DOC-003`: review architecture and product docs for the published
  WebviewPanel-only surface, desktop/remote-host boundary, and no-publish
  TimelineProvider policy
- `TEST-DOC-005`: review architecture for the Windows 64-bit runtime-provider
  boundary and the bounded expert isolated container execution path
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
- `TEST-UNIT-096`: validate the public governed proof CLI parses one
  subcommand surface, rejects unknown subcommands, and states that
  `runGovernedProof` is the one public governed proof entrypoint
- `TEST-UNIT-097`: validate the governed proof usage and runtime-selection
  contract states canonical `LabVIEWCLI CreateComparisonReport` with no public
  engine selector or public `LVCompare` override surface
- `TEST-UNIT-098`: validate the docs and design-control package fails closed
  when public proof documentation drifts away from the single-entrypoint
  canonical-engine contract
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
- `TEST-INTEG-009`: run the real extension-host repo-terminal admission path
  and prove `vihs` is available as a bare command in a supported repo-opened
  terminal session, can switch the persisted provider request between `host`
  and `docker` while writing LabVIEW version and bitness facts, and does so
  without hidden-path reconstruction, a mandatory prepare-first flow, manual
  shell-profile editing, or admin elevation; the explicit Windows proof lane
  is `npm run test:integration:windows`, which proves arbitrary-cwd invocation
  plus the default no-`--settings-file` target under a disposable
  `APPDATA\\Code\\User\\settings.json`, aligned to the active disposable
  Windows integration-host profile
- `TEST-UNIT-072`: prove the canonical comparison-report smoke runner selects a
  retained compare pair, persists report artifacts, and records runtime facts
- `TEST-UNIT-073`: prove the canonical comparison-report smoke CLI parses
  bounded proof-admission overrides and prints a deterministic success summary
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
- `TEST-UNIT-105`: prove the history panel omits `Open dashboard` from the
  extension-user surface even when the retained window is large enough, while
  the underlying command layer can still fail closed on stale dashboard
  messages
- `TEST-DOC-011`: review the repo entrypoints and research-control-plane docs
  for the correct current dashboard implementation maturity and pair-archive
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
  without a resolved governing image
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
  args, and appends governed `-LabVIEWPath` plus bare `-Headless`
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
- `TEST-SMOKE-001`: run `npm run proof:run -- dashboard-smoke -- --platform win32
  --bitness x64 --dashboard-commit-window 3` and retain
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
  separate decision-record path are described at the correct current
  implementation maturity rather than future-only modeling
- `TEST-DOC-018`: review the README, current-state, ship target, blocker
  ledger, and release procedure to prove the SemVer ship-control system is
  retained as the landed `v0.2.0` release record while the repo entrypoints
  also surface the active post-release program truthfully
- `TEST-UNIT-192`: prove the ship-control system keeps the ship target,
  development queue, package baseline, release-readiness matrix, blocker
  ledger, and repo entrypoints aligned across the closed `TRANCHE-009`
  ship record and the active `TRANCHE-010` post-release lane
- `TEST-UNIT-193`: prove the GitLab release lane fails closed on tag/package
  mismatch, packages `release-evidence/vi-history-suite-<version>.vsix`, and
  retains the release manifest plus checksum evidence paths
- `TEST-DOC-019`: review the ship target, readiness matrix, blocker ledger,
  current-state, README, and release procedure to prove the GitLab VSIX
  release lane is configured, the first tagged proof landed, and the retained
  ship record now points forward to the public-facade follow-on program
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
  `missing-retained-comparison-report` and a stable checkbox-flow hint when
  retained pair evidence is absent
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
- `TEST-UNIT-204`: prove the dashboard action retains pair-level ETA accuracy
  evidence for the current refresh session, persists the accuracy sidecar, and
  renders a bounded dashboard summary that excludes previously retained pairs;
  also prove the dashboard renders a not-yet-measurable note when only one
  current-session pair was prepared
- `TEST-UNIT-205`: prove blocked-runtime retained comparison packets and
  dashboard packet artifacts prefer direct local HTML rendering with injected
  base-path/CSP controls, while failing soft to the older iframe wrapper if the
  local HTML file cannot be read
- `TEST-UNIT-206`: prove the concentrated dashboard renders a chronology-first
  pair metadata ledger that recollects retained NI pair metadata before the
  detailed per-pair sections, including bounded no-metadata wording when a pair
  has no retained NI report metadata
- `TEST-UNIT-208`: prove the whole-window dashboard concentration sections
  retain chronology-aware `pair N` or `pairs N, M` references for retained NI
  metadata patterns so the reviewer can locate where each pattern appears in
  the adjacent-pair window
- `TEST-UNIT-209`: prove the extension-user history panel omits any `Create
  decision record` control while the retained decision-record backend continues
  to fail closed on missing scenario/storage conditions and persists separate
  decision-record artifacts when invoked through governed non-panel paths
- `TEST-UNIT-210`: prove the integration-host runtime tooling supports
  explicit `auto|windows|linux` host selection and fails closed with actionable
  bootstrap guidance when Linux VS Code runtime libraries are missing
- `TEST-UNIT-211`: prove the shared dashboard ETA characterization tooling
  derives estimates only from current-session prepared pairs, retains
  pair-level actual-versus-estimated samples, and records explicit unmeasured
  coverage when too few pairs were prepared
- `TEST-UNIT-212`: prove the canonical dashboard smoke lane retains pair-level
  preparation timing, writes `dashboard-pair-eta-accuracy.json`, and renders
  the retained ETA characterization summary in dashboard-smoke Markdown and
  HTML
- `TEST-UNIT-213`: prove the canonical dashboard smoke CLI prints a stable
  `Dashboard ETA accuracy:` summary line for retained, not-yet-measurable, and
  not-retained cases
- `TEST-UNIT-214`: prove the documentation-package gate exposes a stable
  compile -> docs-tests -> bundled-doc-drift -> links plan and that
  `--skip-links` removes only the link-check step
- `TEST-UNIT-215`: prove the docs-authoring Dockerfile, entrypoint,
  package-manifest scripts, workbench documentation, and GitLab publish lane
  remain aligned as one governed documentation-package surface
- `TEST-UNIT-216`: prove the extension-facing decision-record action reuses the
  last persisted reviewer name as the next reviewer default and retains stable
  cancellation outcomes when the review-question, outcome, confidence, or
  rationale prompts are dismissed
- `TEST-UNIT-217`: prove ship-control entrypoints and documentation workbench
  surfaces point future documentation work to the documentation coherence
  ledger and wiki seed plan
- `TEST-UNIT-207`: prove the fast-loop dev-host CLI parses stable arguments,
  prepares a reusable fixture workspace without requiring `Code.exe`, and
  builds a stable launch plan for either direct or staged extension mode
- `TEST-INTEG-004`: run the real extension-host lane with retained comparison
  packet and dashboard artifact opening, and prove the flow completes without
  the earlier retained-HTML resource-host failure warning becoming a test
  failure
- `TEST-INTEG-008`: run the real extension-host lane through
  `Create decision record` and prove the flow writes separate Markdown/JSON
  artifacts from retained dashboard evidence and opens the retained Markdown
  artifact
- `TEST-DOC-017`: review the fast-loop docs and manifest scripts to confirm the
  repo differentiates the default development-host inner loop from preview VSIX
  refresh
- `TEST-DOC-019`: review the fast-loop and ship-control docs to confirm the
  explicit Linux/Windows integration-host scripts and least-privilege Linux
  bootstrap command are discoverable without chat history
- `TEST-DOC-021`: review the documentation-package workbench docs to confirm
  README, current state, wiki-authority, release procedure, and ship-control
  surfaces all point future documentation/wiki work to the published
  docs-authoring workbench instead of ad hoc host setup
- `TEST-DOC-022`: review the documentation coherence ledger to confirm it names
  the audited authority stack, latest docs-gate and standards-review pass,
  resolved contradictions, residual risks, and next documentation moves
- `TEST-DOC-023`: review the wiki seed plan to confirm it maps incremental wiki
  pages to governed authority docs and excludes source, tests, shell
  transcripts, and chat history as primary inputs
- `TEST-DOC-024`: review README, current state, ship control, information-item,
  wiki-authority, documentation-workbench, and release-procedure surfaces to
  confirm they all point to the coherence ledger and wiki seed plan
- `TEST-DOC-025`: review the architecture overview and ADR packet to confirm
  `ADR-0012` and `ADR-0013` are committed, accepted, and referenced correctly
- `TEST-DOC-026`: review `docs/product/wiki-publication-ledger.md` to confirm
  each published wiki page retains its wiki path, publication date, wiki
  commit, and primary authority docs
- `TEST-DOC-027`: review README, current state, wiki-authority,
  documentation-workbench, release-procedure, and information-item surfaces to
  confirm they point to `docs/product/wiki-publication-ledger.md` once wiki
  publication begins
- `TEST-UNIT-218`: verify generated and retained comparison opening return
  stable cancelled outcomes before the comparison view opens
- `TEST-UNIT-219`: verify `Diff prev` uses retained-compare-specific
  cancellation wording when retained comparison opening is cancelled
- `TEST-UNIT-220`: verify dashboard opening returns a stable cancelled outcome
  with retained dashboard artifact paths when cancellation is requested before
  the dashboard view opens
- `TEST-UNIT-221`: verify the governed repo-jump CLI parses stable args,
  resolves current-repo, sibling-repo, and Codex-skill path strategies, and
  renders deterministic text and JSON output
- `TEST-UNIT-222`: verify the manifest and documentation entrypoints expose the
  governed cross-repo jump surface and its local CLI script
- `TEST-UNIT-223`: verify the packaged bundled-documentation manifest matches
  the machine-readable wiki publication ledger, retains generated page
  fragments for every published page, and renders local/external navigation
  hooks
- `TEST-UNIT-224`: verify the history panel routes `Open docs` through the
  bundled documentation action and records the selected packaged page facts
- `TEST-UNIT-225`: verify the package manifest exposes the bundled-docs script,
  documentation command, and activation path
- `TEST-UNIT-226`: verify the retained design-gate verifier fails closed for
  running retained reports and succeeds only for completed passing retained
  reports
- `TEST-UNIT-227`: verify the history panel disables optional compare,
  dashboard, decision-record, and documentation actions when the current build
  does not wire those surfaces
- `TEST-UNIT-228`: verify the history panel renders a stable installed
  action-surface availability packet for pair selection, retained compare
  opening, documentation, and any wired maintainer-only optional surfaces
- `TEST-UNIT-229`: verify the dashboard action reports whether the current
  refresh is retained-complete, backfilling missing pair evidence, or
  concentrating retained archives only because pair refresh is unavailable, and
  that the rendered dashboard retains the same preparation summary
- `TEST-UNIT-230`: verify unsupported history-panel commands fail closed with
  stable build-capability guidance, and that `Diff prev` for content-detected
  LabVIEW VIs does not fall back to text diff when the current build lacks
  comparison-report support
- `TEST-UNIT-231`: verify stale bundled-documentation page requests from the
  history panel fall back to the packaged overview page when the bundle is
  available, and that missing bundled docs still fail closed with a stable
  warning
- `TEST-UNIT-232`: verify dashboard pair-preparation progress and the retained
  dashboard preparation summary distinguish refreshed generated-report,
  blocked, failed, and no-generated-report outcomes, with follow-up guidance
  when usable NI report evidence was not produced for every refreshed pair
- `TEST-UNIT-233`: verify compare opening falls back from an unreadable
  retained generated-report HTML file to the retained packet view and that the
  comparison panel status states which evidence surface was actually displayed
- `TEST-UNIT-234`: verify retained compare reopening fails closed with
  `invalid-retained-comparison-report` when the archived source record is
  corrupt, mismatched to the governed storage contract, or no longer points to
  a usable retained packet, and that `Diff prev` surfaces stable checkbox-flow
  rebuild guidance instead of raw archive errors
- `TEST-UNIT-235`: verify the design gate resolves a mounted-Windows
  `run_assurance.py` candidate into a repo-local mirror under
  `.cache/design-gate/assurance-skill/repo-standards-review/` before running
  standards assurance
- `TEST-UNIT-236`: verify a timed-out standards-assurance gate step exits with
  code `124`, retains a timeout message, and does not hang the design gate
- `TEST-UNIT-237`: verify the decision-record action honors cancellation after
  dashboard build and before decision-record persistence, returning stable
  cancellation stages while preserving any already-built dashboard artifact
  paths
- `TEST-UNIT-238`: verify cancellation after decision-record persistence and
  before Markdown open preserves both dashboard and decision-record artifact
  paths and that the history command surface uses stable preserved-artifact
  cancellation guidance
- `TEST-UNIT-239`: verify retained comparison reopening fails closed with
  `invalid-retained-comparison-report` when the archived `packetRecord` payload
  is present but lacks the render-critical contract required by the live panel
- `TEST-UNIT-240`: verify comparison-report generation preserves the current
  compare view yet records retained-archive unavailability when governed pair
  archive persistence fails or is unavailable
- `TEST-UNIT-241`: verify dashboard pair-preparation summaries count retained
  archive-unavailable refreshes separately from generated, blocked, failed, and
  no-generated-report outcomes
- `TEST-UNIT-242`: verify the history panel and copied review packet render a
  retained history-window summary that states the active mode, loaded-versus-total
  counts when known, and whether the retained window is full history or
  truncated by the automatic or capped ceiling
- `TEST-UNIT-243`: verify a dashboard refresh writes
  `dashboards/latest-dashboard-run.json` with stable artifact paths, summary
  facts, ETA metadata, and experiment metadata covering history-window policy,
  known total history count, truncation, timings, and progress events
- `TEST-UNIT-244`: verify the canonical dashboard smoke lane writes or updates
  the stable `dashboards/latest-dashboard-run.json` manifest for the newest
  retained smoke run without requiring hashed workspace-storage path discovery
- `TEST-UNIT-245`: verify the active post-release control-plane identities stay
  aligned across `development-queue.json`, README, current-state, `SHIP-0001`,
  `PROGRAM-0002`, and `ISSUE-0407`, while the landed ship record remains
  closed historical evidence under `TRANCHE-009` / `ISSUE-0406`
- `TEST-UNIT-246`: verify the repo-native docs gate fails closed when the
  active post-release tranche/issue/program identities or the retained open
  Gate C-D Windows-proof truth drift across `development-queue.json`,
  `current-state.md`, `PROGRAM-0002`, and `ISSUE-0407`
- `TEST-UNIT-247`: verify the history panel renders a deterministic in-IDE
  host-review submission surface only on the canonical Sergio-owned Windows 11
  host, with explicit placeholders, concise nine-way outcome/confidence
  guidance, visible submit-status feedback, and hidden-off-host capability
  truth
- `TEST-UNIT-248`: verify host-review submission persistence writes a
  per-submission JSON artifact plus `human-reviews/latest-human-review-submission.json`,
  uses the fixed canonical host-machine fingerprint, fails closed on any
  noncanonical machine, and keeps the fingerprint stable across VS Code
  version changes on the same machine
- `TEST-UNIT-249`: verify the history-panel command router accepts the
  deterministic host-review submission payload, routes it to retained review
  persistence, posts explicit success or blocked status back into the panel,
  and records submission/latest/canonical artifact paths in the last action
  summary
- `TEST-UNIT-250`: verify the package manifest exposes the governed
  `dashboard:latest`, `dashboard:latest:json`, `review:latest`, and
  `review:latest:json` local evidence-consumer scripts
- `TEST-UNIT-251`: verify `HARNESS-VHS-002` is retained as the canonical
  `lv_icon.vi` high-history benchmark harness against `ni/labview-icon-editor`
- `TEST-UNIT-252`: verify the governed Linux benchmark subcommand defaults to
  `HARNESS-VHS-001`, keeps `HARNESS-VHS-002` as the explicit deep-history
  harness, uses a governed nontrivial commit window by default, and writes
  stable benchmark summaries under
  `.cache/github-experiments/linux-dashboard-benchmark/`
- `TEST-UNIT-253`: verify the GitHub Linux benchmark workflow, derived
  benchmark Dockerfile, and runner script pin
  `nationalinstruments/labview:2026q1-linux`, publish a dedicated experiment
  image to GHCR, execute the benchmark headlessly through the published
  derived container, default hosted runs to `HARNESS-VHS-001`, and retain
  `HARNESS-VHS-002` as the explicit deep-history lane
- `TEST-UNIT-254`: verify the actual governed repo-jump map includes the
  `vi-history-suite-source-experiments` mirror with the actual GitHub remote,
  sibling-path strategy, and Linux benchmark entrypoints
- `TEST-UNIT-255`: verify the active post-release control-plane docs
  distinguish GitLab authority, the existing private GitHub experiment mirror,
  and the public GitHub facade without collapsing authority, experiment, or
  public-distribution roles
- `TEST-UNIT-256`: verify the canonical-host benchmark status loader and
  history-panel router expose the retained Windows baseline plus the retained
  host Linux benchmark launch/log/progress state inside VS Code, mirror active
  host Linux progress into a status-bar indicator and the same front-facing VS
  Code progress channel used by the Windows lane, including pair-preparation
  messages such as `Preparing dashboard pair ...`, keep the benchmark status
  surface reachable only through the canonical-host benchmark action, resolve
  the canonical `vi-history-suite` authority workspace even when the currently
  viewed VI lives in a different repo, stage the benchmark workspace without
  repo-local transient/test-runtime artifacts such as `.vscode-test`, default
  host runs to the current published benchmark image tag unless explicitly
  overridden, and fail closed when only a stale launch receipt remains and no
  live host Linux benchmark container exists
- `TEST-UNIT-257`: verify the packaged runtime-surface audit rejects ungoverned
  runtime npm dependencies, rejects missing payload for a governed runtime
  dependency such as `jsonc-parser`, rejects ungoverned packaged `node_modules`
  or transient/test artifacts such as `.cache` and `.vscode-test`, and allows
  the current governed runtime VSIX surface
- `TEST-UNIT-258`: verify the root manifest excludes packaging-only npm
  tooling from default `npm ci`, while the guarded package path still invokes
  the pinned `vsce` package on demand through the dedicated helper script
- `TEST-UNIT-259`: verify the repo-support policy normalizes canonical GitHub
  remotes across HTTPS and SSH forms, recognizes the deeper governed evidence
  family, classifies arbitrary trusted repos as generic repositories, and
  preserves canonical scenario matching across normalized upstream remote forms
- `TEST-UNIT-260`: verify the VI History panel and open command surface the
  repo-support classification, keep chronology/docs visible, and keep the
  checkbox-selected compare flow available on generic repositories while making
  deeper benchmark and maintainer host-review governance explicit
- `TEST-UNIT-317`: verify the current implemented checkbox workflow treats two
  distinct checkbox selections as the explicit compare-preflight entrypoint for
  the exact newer-selected and older-base pair, and that a retained window of
  only two commits is enough to use the current primary extension-user compare
  flow
- `TEST-UNIT-318`: verify generated-report and retained-packet compare views
  now lead with a white-background comparison-context block that surfaces the
  selected/base commit hash, date, author, and subject facts, while runtime
  diagnostics and process-observation details stay on retained runtime-evidence
  surfaces instead of being embedded in that compare header
- `TEST-UNIT-261`: verify the host and hosted Linux benchmark runners enforce
  a governed per-pair runtime execution budget and retain an explicit
  timeout/stall terminal outcome instead of hanging the whole benchmark
- `TEST-UNIT-262`: verify a Linux benchmark pair that times out or otherwise
  fails during runtime execution retains a machine-readable per-pair failure
  receipt with pair ids, provider/engine, image identity, and retained runtime
  artifact-path presence or absence
- `TEST-UNIT-263`: verify active Linux benchmark runtime execution emits
  bounded heartbeat progress updates that identify the current pair plus
  provider/engine, and that the host in-IDE progress surface mirrors those
  heartbeats instead of staying stuck on a coarse execution message
- `TEST-UNIT-264`: verify Linux benchmark runs always retain a terminal
  latest-summary artifact, including partial/failed runs, with processed pair
  counts, terminal pair index, terminal outcome classification, and
  comparability state versus the Windows baseline
- `TEST-UNIT-265`: verify the Windows benchmark subcommand defaults to
  `HARNESS-VHS-002`, writes stable summaries under
  `.cache/github-experiments/windows-dashboard-benchmark/`, and defaults the
  runtime tool paths to the documented NI Windows image paths unless
  explicitly overridden
- `TEST-UNIT-266`: verify the Windows benchmark-image workflow, Dockerfile,
  and runner script pin `nationalinstruments/labview:2026q1-windows`, publish
  a dedicated GHCR Windows benchmark image, target the deep
  `HARNESS-VHS-002` lane, truthfully mark hosted Windows benchmark
  execution as not-yet-governed, keep the benchmark workspace dependencies out
  of the live container-start path, use the explicit full-path Windows
  PowerShell runtime entrypoint instead of ambient PATH resolution for the
  image shell/default command, and register mounted harness clones under
  `C:\workspace\.cache\harnesses` as Git safe directories before benchmark
  execution
- `TEST-UNIT-267`: verify Linux comparison-report runtime-diagnostic capture
  treats native container paths such as `/tmp/lvtemporary_*.log` as
  host-readable from within the active benchmark container and retains the
  copied diagnostic artifact instead of defaulting to
  `runtime-diagnostic-log-unreadable`
- `TEST-UNIT-268`: verify comparison-report runtime execution clears reused
  working report outputs before each pair and discards a nonzero-exit HTML
  report when the file contents do not reference the current staged left/right
  revision filenames
- `TEST-UNIT-269`: verify the wiki workbench resolves topology from the
  governed repo-jump map, validates remotes/control files, and retains a stable
  `latest-workbench.json` manifest for doctor/discovery flows
- `TEST-UNIT-270`: verify wiki workbench stage/prep/sync commands fail closed
  on missing sibling wiki repos, control files, remotes, or authority docs
  instead of staging weak publication input
- `TEST-UNIT-271`: verify wiki workbench page staging and publication prep
  retain authority-doc copies, a current wiki copy when present, a draft wiki
  file, and a machine-readable publication-prep receipt under
  `.cache/wiki-workbench/`
- `TEST-UNIT-272`: verify the package manifest and docs gate expose local and
  Docker-first wiki-workbench command surfaces for doctor, plan, prepare, and
  bundled-doc sync
- `TEST-UNIT-273`: verify the wiki workbench recovers from an unwritable stale
  page staging or publication-prep directory by retaining the page under a
  writable timestamped recovery path while preserving truthful receipt paths
- `TEST-UNIT-274`: verify the package/docs/GitLab surfaces expose the
  published-image wiki workbench lane, including published-image local command
  surfaces, the `wiki_workbench_prepare_published` CI job, and retained
  `wiki-workbench-evidence/` artifact paths, including the no-op completion
  receipt path when the publication ledger already retains `nextPage = null`
- `TEST-UNIT-275`: verify the published-image local docs-workbench runner
  resolves GitLab registry credentials from supported environment variables and
  formats a stable fail-closed registry-access explanation when the published
  image cannot be pulled locally
- `TEST-UNIT-276`: verify the wiki coverage matrix lists every in-scope
  requirements-and-standards source plus every ADR file, that every row
  remains `complete` and `published`, that the live wiki page set matches the
  publication ledger, and that the publication ledger retains no `nextPage`
  target while the wiki is considered finished
- `TEST-UNIT-277`: verify Linux comparison-report runtime execution retains
  supplemental headless artifacts such as `LVStatus.txt` and current
  `labview_*_headless_*_cur.txt` logs under governed report storage and
  classifies retained `Recursive load during LEIF load!` markers as
  `linux-headless-recursive-load`
- `TEST-UNIT-278`: verify failed Linux benchmark summaries and the host
  benchmark-status surface retain and surface the terminal diagnostic reason
  alongside the terminal failure reason
- `TEST-UNIT-279`: verify the comparable-prefix benchmark packet generator
  discovers the latest retained Windows host dashboard run plus the latest
  retained host Linux deep benchmark summary, derives the accepted comparable
  pair count, requires the same last comparable pair id on both dashboards,
  and writes tracked JSON and Markdown packet artifacts
- `TEST-UNIT-280`: verify the canonical-host Windows benchmark-image proof
  runner derives the default `HARNESS-VHS-002` dashboard commit window from
  the tracked comparable-prefix packet, injects that bounded window into the
  container env, prefers the governed local `ni-labview-icon-editor` working
  clone as the mounted harness seed source when available, normalizes Git
  safe-directory handling for those seeded mounted clones before invoking the
  image entrypoint, translates governed WSL proof roots to Windows mount
  paths, and fails closed on unsupported non-`/mnt/<drive>/...` proof roots
- `TEST-UNIT-281`: verify Windows runtime-process observation resolves
  `tasklist.exe` through the explicit `C:\Windows\System32` path on native
  Windows hosts instead of ambient PATH lookup, so process-observation capture
  remains available inside the Windows benchmark-image environment
- `TEST-UNIT-282`: verify the Windows `labview-cli` execution plan retains the
  governed `-LabVIEWPath` on host-native and Windows-container selections, and
  appends bare `-Headless` when the Windows benchmark-image lane enables
  `LV_RTE_HEADLESS=1` or the provider is `windows-container`
- `TEST-UNIT-283`: verify a Linux `labview-cli` recursive-load diagnosis
  triggers one governed `CloseLabVIEW -Headless` session reset, retries the
  pair once, and appends the recovery notes to the retained runtime
  diagnostics before the final outcome is written
- `TEST-UNIT-284`: verify a Windows headless `labview-cli` connected-session
  `Error 66 / Call By Reference` diagnosis triggers one governed
  `CloseLabVIEW -Headless` session reset, retries the pair once, and appends
  the recovery notes to the retained runtime diagnostics before the final
  outcome is written
- `TEST-UNIT-285`: verify failed Windows benchmark summaries retain the
  terminal diagnostic reason, and comparable-prefix packet generation falls
  back to the retained Windows pair-failure receipt so the bounded pair `129`
  blocker is rendered as `labview-cli-call-by-reference` instead of a generic
  `runtime-failed`
- `TEST-UNIT-286`: verify the governed canonical-host Windows benchmark-image
  proof runner stays on the canonical `CreateComparisonReport` contract, does
  not expose a public engine selector, and still retains the same proof-root
  launch/log/summary contract
- `TEST-UNIT-287`: verify shared dashboard-smoke progress messages label a
  failed Windows rerun as `Windows benchmark ...` rather than `Linux
  benchmark ...` while retaining the same partial-failure summary flow
- `TEST-UNIT-288`: verify harness report-smoke supports an exact
  `--selected-hash` / `--base-hash` pair with `--runtime-timeout-ms`,
  forwards those bounds into the runner, and rejects mismatched targeted
  bases instead of drifting to another compare pair
- `TEST-UNIT-289`: verify the comparable-prefix benchmark packet loader and
  markdown renderer retain governed Windows exact-pair diagnosis receipts for
  both `labview-cli` and `lvcompare`, including the `6dd65df -> 3408654`
  selected/base hashes, proof-root paths, and bounded failure outcomes
- `TEST-UNIT-290`: verify Linux and Windows headless recovery attempts retain
  `headless-session-reset-stdout.txt`, `headless-session-reset-stderr.txt`,
  the recovery exit code, and the governed `CloseLabVIEW` command facts on the
  resulting runtime execution record
- `TEST-UNIT-291`: verify exact selected/base harness report-smoke diagnosis
  surfaces retain the governed headless recovery executable, args, exit code,
  and stdout/stderr artifact paths in `comparison-report-smoke.json` / `.md` /
  `.html`, and that the comparable-prefix packet markdown surfaces those facts
  for the retained Windows blocker-pair diagnosis
- `TEST-UNIT-292`: verify native Windows `labview-cli` execution derives the
  selected `LabVIEW.ini` TCP port, appends `-PortNumber` to the governed
  `CreateComparisonReport` and `CloseLabVIEW` command lines, and surfaces the
  retained `LabVIEW.ini` path plus TCP port through the packet, smoke JSON,
  and exact-pair comparable-prefix diagnostics
- `TEST-UNIT-293`: verify `runGovernedProof report-smoke` rejects
  non-canonical exact-pair diagnosis argument bundles, including partial
  selected/base hashes, incomplete canonical runtime bundles, Windows
  bitness/path contradictions, and wrong executable basenames for explicit
  proof-admission runtime paths
- `TEST-UNIT-294`: verify canonical Windows exact-pair proof fails closed when
  explicit Windows proof-admission runtime paths are missing on the canonical
  host, when stale `LabVIEW.exe` / `LabVIEWCLI.exe` / `LVCompare.exe`
  processes are already running, or when the selected `LabVIEW.ini`-derived
  VI Server port already has a listener before launch
- `TEST-UNIT-295`: verify the shared PROGRAM-0003 CLI admission layer rejects
  contradictory explicit proof-admission override bundles across exact-pair
  smoke, dashboard smoke, decision-record, and Windows/Linux benchmark
  entrypoints
- `TEST-UNIT-296`: verify canonical Windows explicit proof-admission override
  bundles reject Windows path bundles only when they contradict the selected
  runtime bitness, while the canonical x86 `LabVIEWCLI.exe` plus x64
  `LabVIEW.exe` bundle still passes admission control for governed host x64
  proof
- `TEST-UNIT-297`: verify the debt-retirement contract package remains
  machine-checkable: the contract/taxonomy/ledger docs stay discoverable in
  the authority control plane, and the machine-readable debt ledger keeps
  well-formed retired/open items with explicit owner, evidence, next-gate,
  exit-criteria, and retirement-commit semantics
- `TEST-DOC-035`: review README, current-state, and ADR-0016 and confirm the
  canonical-host benchmark status surface is documented as the maintainer-facing
  in-IDE visibility and launch surface for the host Linux benchmark lane,
  including the canonical-authority-workspace selection, pair-preparation
  visibility in the live VS Code progress surface, active status-bar indicator,
  published-image defaulting, and stale-launch-receipt fail-closed behavior
- `TEST-DOC-036`: review README, current-state, release procedure, and
  ADR-0015 and confirm the packaged VSIX surface is documented as a compile-
  and-audit guarded surface that fails closed on ungoverned runtime
  `node_modules`, missing governed dependency payloads, `.cache`, or
  `.vscode-test` leakage while keeping packaging-only toolchain dependencies
  out of the default compile/test/benchmark install surface
- `TEST-DOC-037`: review README, current-state, and ADR-0016 and confirm the
  canonical host Linux benchmark lane and the private GitHub experiment lane
  are governed to stay aligned on the same authority-repo commit and published
  benchmark-image contract before evidence is compared, while the GitHub-
  hosted workflow stays on the shallower canonical harness and the canonical
  host retains ownership of the deep `lv_icon.vi` benchmark
- `TEST-DOC-038`: review README, current-state, and ADR-0017 and confirm the
  product is documented as repo-agnostic for the checkbox-selected compare
  workflow, while the deeper benchmark, scenario, and host-review lanes remain
  separately governed
- `TEST-DOC-039`: review README, current-state, and ADR-0016 and confirm the
  Linux benchmark lane is documented as enforcing bounded per-pair runtime
  timeouts, per-pair failure receipts, runtime heartbeat progress, and terminal
  partial-summary retention for failed or timed-out runs, while remaining
  characterization-only when a retained run exposes a real runtime dependency
  blocker instead of a completed comparable benchmark
- `TEST-DOC-040`: review README, current-state, harness docs, and ADR-0018 and
  confirm the Windows benchmark image is documented as a repeatable deep
  `HARNESS-VHS-002` baseline distinct from Sergio's canonical Windows host UX
  lane, and that hosted Windows benchmark execution remains explicitly
  not-yet-governed
- `TEST-DOC-041`: review README, current-state, documentation-workbench,
  wiki-authority, wiki-seed-plan, program-repo-jump, and ADR-0019 and confirm
  the repo documents a governed wiki workbench that resolves authority/wiki
  topology from the repo-jump map, retains `.cache/wiki-workbench/` manifests
  and publication-prep receipts, fails closed on ledger/topology drift, and
  exposes both local and Docker-first wiki command surfaces
- `TEST-DOC-042`: review README, current-state, documentation-workbench,
  wiki-authority, wiki-seed-plan, wiki publication ledger, wiki coverage
  matrix, and ADR-0019 and confirm the wiki stop rule is a zero-gap completion
  invariant rather than “good progress,” that every in-scope requirements-and-
  standards source plus every ADR is covered by the matrix, and that the
  accepted ADR aggregation rule is documented explicitly
- `TEST-DOC-043`: review README, current-state, PROGRAM-0003, and ISSUE-0408
  and confirm the active Linux benchmark blocker is documented as a retained
  headless-runtime seam on pair `135/138`, that supplemental headless
  artifacts and terminal diagnostic reasons are governed explicitly, and that
  the lane remains characterization-only until a truthful comparative result
  exists
- `TEST-DOC-044`: review README, current-state, harnesses, PROGRAM-0003,
  ISSUE-0408, and ADR-0020 and confirm the accepted cross-OS benchmark truth
  is the retained `129`-commit / `128`-pair comparable-prefix packet derived
  from the first invalid governed surface, while the full Linux `138`-pair
  window remains blocked later at pair `135` and the Windows benchmark-image
  surface remains explicit bounded-blocked at pair `129`
- `TEST-DOC-045`: review README, current-state, PROGRAM-0003, and ISSUE-0408
  and confirm the repo documents `scripts/runHostWindowsBenchmarkImageProof.js`
  as the governed canonical-host Windows benchmark-image proof surface, that
  it defaults `HARNESS-VHS-002` to the retained comparable-prefix window until
  the full Linux window becomes comparable, that it pre-seeds the mounted
  harness cache from the governed local `ni-labview-icon-editor` clone when
  available, and that it retains `latest-launch.json`, `run-*.log`, and the
  mounted `latest-summary.json` under
  `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-proof`
- `TEST-DOC-046`: review README, current-state, PROGRAM-0003, and ISSUE-0408
  and confirm the Windows benchmark-image lane is documented as passing the
  governed `-LabVIEWPath`, forcing `LV_RTE_HEADLESS=1`, hardening
  `LabVIEWCLI.ini` startup timeouts, and prelaunching headless LabVIEW before
  benchmark execution so NI's documented `-350000` startup seam is mitigated
- `TEST-DOC-047`: review README, current-state, PROGRAM-0003, and ISSUE-0408
  and confirm the Linux benchmark lane documents one governed
  `CloseLabVIEW -Headless` recovery attempt plus one retry for retained
  `linux-headless-recursive-load` failures, while keeping the accepted
  comparable-prefix timing scope unchanged until a fresh full-window rerun
  proves a broader result
- `TEST-DOC-048`: review README, current-state, PROGRAM-0003, and ISSUE-0408
  and confirm the Windows benchmark-image lane documents the latest retained
  pair `129/134` connected-session `Error 66 / Call By Reference` seam plus
  one governed `CloseLabVIEW -Headless` recovery attempt and one retry before
  terminal failure is retained
- `TEST-DOC-049`: review current-state, PROGRAM-0003, ISSUE-0408, and the
  comparable-prefix benchmark packet and confirm the bounded Windows pair
  `129` blocker is documented explicitly as
  `labview-cli-call-by-reference`, including receipt-backed retention when
  older benchmark summaries predate terminal diagnostic-reason support
- `TEST-DOC-050`: review current-state, PROGRAM-0003, and ISSUE-0408 and
  confirm the governed canonical-host Windows benchmark-image proof runner is
  documented as staying on canonical `CreateComparisonReport` without a public
  engine selector while preserving the comparable-prefix default and the same
  proof-root receipt contract
- `TEST-DOC-051`: review current-state, PROGRAM-0003, and ISSUE-0408 and
  confirm any retained Windows `LVCompare` diagnosis rerun is documented as
  internal parity evidence only, not as a public proof surface, Linux event,
  or viable Windows fallback
- `TEST-DOC-052`: review current-state, PROGRAM-0003, and ISSUE-0408 and
  confirm the governed `runGovernedProof report-smoke` exact selected/base
  hash surface retains bounded diagnosis outcomes rather than open-ended hangs
- `TEST-DOC-053`: review current-state, harnesses, PROGRAM-0003, ISSUE-0408,
  `comparison-report-smoke`, and the comparable-prefix packet and confirm the
  exact Windows blocker pair `6dd65df -> 3408654` is documented as failing
  under both `labview-cli` and `lvcompare`, with the packet retaining both
  exact-pair diagnosis receipts only when their smoke reports still prove the
  Windows benchmark-image execution surface through explicit
  execution-surface context or retained container-context markers such as
  `C:\workspace\.cache` proof paths and, when available,
  `ContainerAdministrator` diagnostic-log sources, and with the packet
  characterizing the retained Windows ceiling explicitly when the exact-pair
  evidence proves the mixed-bitness `x86 LabVIEWCLI.exe` versus `x64`
  `LabVIEW.exe` call-by-reference seam
- `TEST-DOC-054`: review current-state, PROGRAM-0003, and ISSUE-0408 and
  confirm the governed `CloseLabVIEW -Headless` recovery posture is documented
  as retaining dedicated reset stdout/stderr artifacts and exit-code facts in
  the comparison-report packet, not only free-form retry notes
- `TEST-DOC-055`: review current-state, harnesses, PROGRAM-0003, ISSUE-0408,
  and the comparable-prefix packet and confirm the exact Windows blocker-pair
  diagnosis now documents the derived `comparison-report-smoke` surfaces plus
  packet-rendered recovery exit code and reset artifact paths, including the
  failed Windows `CloseLabVIEW -Headless` reset that retained `-350000`
  connection-failure stderr before the retry
- `TEST-DOC-056`: review current-state, harnesses, PROGRAM-0003, and
  ISSUE-0408 and confirm native Windows exact-pair diagnosis now documents the
  retained `LabVIEW.ini` path and explicit VI Server TCP port derivation, and
  that the fresh host-native x86 rerun still times out with only
  `LabVIEWCLI.exe` observed even after passing `-PortNumber 3364`, so port
  drift is represented as a narrowed seam rather than as the full explanation
- `TEST-DOC-057`: review current-state, harnesses, PROGRAM-0003, ISSUE-0408,
  and ADR-0021 and confirm canonical exact-pair diagnosis arguments are
  documented as fail-closed on incomplete selected/base hashes, incomplete
  canonical runtime bundles, or contradictory Windows bitness/proof-admission
  runtime paths, rather than allowing ambiguous experiment launches to proceed
- `TEST-DOC-058`: review current-state, harnesses, canonical exact-pair
  diagnosis guidance, PROGRAM-0003, ISSUE-0408, and ADR-0021 and confirm the
  canonical Windows proof surface is documented as requiring existing explicit
  Windows proof-admission runtime paths plus a clean host runtime surface
  before launch, including no stale LabVIEW-related processes and no
  preexisting listener on the selected `LabVIEW.ini` VI Server port
- `TEST-DOC-059`: review current-state, harnesses, canonical exact-pair
  diagnosis guidance, PROGRAM-0003, ISSUE-0408, and ADR-0022 and confirm the
  PROGRAM-0003 proof-admission contract for explicit proof-admission override
  inputs is documented as shared across dashboard-smoke, decision-record,
  exact-pair smoke, and the Windows/Linux benchmark CLIs rather than living
  in one diagnosis entrypoint
- `TEST-DOC-060`: review current-state, harnesses, canonical exact-pair
  diagnosis guidance, PROGRAM-0003, ISSUE-0408, and ADR-0022 and confirm
  explicit Windows proof-admission override bundles are documented as invalid
  when they mix x86 and x64 paths, even when `--bitness` is omitted
- `TEST-DOC-061`: review README, current-state, documentation workbench,
  wiki-authority map, debt-retirement contract, debt taxonomy, and ADR-0023
  and confirm the repo documents one no-silent-debt contract instead of
  leaving technical/documentation debt governance implicit
- `TEST-DOC-062`: review the debt ledger Markdown/JSON pair and confirm the
  current debt picture retains both retired and open debt items with explicit
  owner tranche/issue/program mapping, authoritative sources, repo evidence,
  next gate, exit criteria, and retirement commit where applicable
- `TEST-DOC-063`: review the wiki coverage matrix, wiki publication ledger,
  debt wiki pages, and bundled-doc manifest and confirm the published reader
  surfaces represent the debt-retirement contract and debt ledger rather than
  hiding those control-plane surfaces in authority docs only
- `TEST-UNIT-298`: verify PROGRAM-0003 benchmark-proof subcommands validate the
  effective proof-admission bundle after CLI/env/default synthesis, reject
  non-canonical env-derived explicit Windows bundles, and keep default
  Windows benchmark runtime settings undefined when no explicit override is
  requested
- `TEST-UNIT-299`: verify the authority package keeps the exact released
  Docker-only image-settings baseline explicit while the active branch
  manifest/settings surface exposes `viHistorySuite.labviewVersion` and
  `viHistorySuite.labviewBitness`, omits `executionMode` and public image
  settings, treats Docker as a generated-CLI-selected expert provider, and
  keeps older execution-mode-only runtime doctor summaries readable as legacy
  provider-request evidence
- `TEST-DOC-064`: review current-state, PROGRAM-0003, ISSUE-0408, canonical
  exact-pair diagnosis guidance, ADR-0024, and the debt ledger and confirm the
  repo documents effective proof-admission bundle validation rather than a
  raw CLI-only rule, including the removal of hidden explicit Windows defaults
- `TEST-DOC-065`: review README, current-state, extension-execution-policy,
  ADR-0025, ADR-0038, PROGRAM-0005, ISSUE-0410, ISSUE-0412, and the debt
  ledger and confirm the current released Docker-only installed contract
  remains explicit while `ADR-0038` and the active control plane now promote
  the host-default local-`LabVIEWCLI` plus expert-Docker replacement
  direction without mis-stating the released Docker-first behavior as the
  active installed-user contract
- `TEST-UNIT-300`: verify the execution-policy control-plane package keeps
  the no-bypass rule, the historical Docker-only execution-request-validation
  baseline, and the active host-default local-`LabVIEWCLI` plus expert-Docker
  replacement direction aligned across authority docs and runtime-settings
  ingestion after the manifest removed `viHistorySuite.executionMode`
- `TEST-UNIT-301`: verify the Windows benchmark summary fails closed when any
  retained pair is `runtimeExecutionState=not-available`, retains the blocked
  reason as terminal benchmark truth, snapshots immutable per-run
  `dashboard-smoke` artifacts beside the timestamped summary, and lets
  comparable-prefix packet selection prefer the latest eligible timestamped
  proof within one proof root
- `TEST-DOC-067`: review extension-execution-policy, ADR-0025, ADR-0026,
  ADR-0038, PROGRAM-0005, ISSUE-0410, ISSUE-0412, current-state, and the debt
  ledger and confirm the authority package now keeps canonical Docker-only
  request validation explicit as historical implemented truth for the released
  line while `ADR-0038` governs the active host-default local-`LabVIEWCLI`
  plus expert-Docker transition without claiming it is already shipped
- `TEST-DOC-069`: review README, current-state, harnesses, PROGRAM-0003, and
  ISSUE-0408 and confirm contaminated Windows benchmark-image reruns are
  documented as fail-closed `not-available` benchmark truth with immutable
  per-run `dashboard-smoke` snapshots rather than as completed comparable
  proof
- `TEST-UNIT-302`: verify the canonical-host Windows benchmark-image proof
  runner retains a machine-readable runtime-surface summary for the current
  governed image contract, and the comparable-prefix packet consumes that
  summary so future sessions can tell whether the current image contract
  exposes a coherent same-bitness `labview-cli` bundle
- `TEST-UNIT-303`: verify the active post-release sustainment-rules package
  keeps the Markdown and JSON sustainment contract aligned with
  `TRANCHE-012` / `ISSUE-0409` / `PROGRAM-0004`, preserves explicit
  event-driven release-refresh rules, preserves explicit benchmark
  refresh/non-trigger/reopen rules for the accepted current contract, and
  preserves the required authority/wiki/bundled-doc upkeep steps plus the
  no-execution-policy-bypass rule
- `TEST-UNIT-304`: verify host-review submission fails closed when the review
  target is OneDrive-backed, writes no retained review artifact in that case,
  and gives mode-appropriate guidance to rerun from the deterministic local
  fixture workspace or another non-synced local path
- `TEST-UNIT-305`: verify the governed Windows benchmark-image Dockerfile and
  canonical-host proof runner no longer include `ExecutionPolicy Bypass` while
  still using the explicit full-path Windows PowerShell runtime surface
- `TEST-UNIT-306`: verify `Open dashboard` requests headless retained pair
  refresh on host-native Windows and emits periodic keepalive progress with
  elapsed time plus the latest retained pair step while a refresh remains
  in flight
- `TEST-UNIT-307`: verify `Open dashboard` can seed matching governed retained
  pair evidence from governed proof manifests into the active workspace archive
  contract and then concentrate that retained set without launching local pair
  refresh
- `TEST-UNIT-308`: verify the history-panel host-review draft persists the
  selected outcome, confidence, and Review Note across tab switches or webview
  rerenders and clears that retained draft only after a successful host-review
  submission result
- `TEST-UNIT-309`: verify bundled installed-user docs are a curated
  extension-user subset of the published wiki set, strip authority-link
  preambles plus private GitLab and SRS/RTM references from the shipped HTML,
  keep only developer-relevant installed-user sections, and keep navigation
  only across the bundled page set
- `TEST-UNIT-310`: verify concentrated dashboard overview images render in
  grouped rows and order `Block Diagram Overview` ahead of
  `Front Panel Overview` when both exist for one pair
- `TEST-UNIT-311`: verify the documentation continuous-integration runner
  exposes stable umbrella, public-user, and internal-authority step plans,
  injects bundle-drift reporting into the bundled-doc check, retains the
  dedicated `docs_continuous_integration`,
  `docs_public_continuous_integration`, and
  `docs_internal_continuous_integration` evidence contracts rather than only a
  boolean gate, and proves the governed `npm run package` path refreshes
  bundled installed-user docs before VSIX packaging
- `TEST-UNIT-312`: verify the governed Windows host proof cleanup hook inspects
  and clears pre-run and post-run `LabVIEW.exe`, `LabVIEWCLI.exe`, and
  `LVCompare.exe` contamination, and fails closed when the host surface cannot
  be returned to a clean state
- `TEST-UNIT-313`: verify `runGovernedProof` exposes the governed
  `host-operation-matrix` subcommand, prints that subcommand in usage, and
  dispatches only that handler when selected
- `TEST-UNIT-314`: verify the governed Windows host operation-matrix runner
  inventories installed LabVIEWCLI operations, writes JSON plus Markdown
  evidence under `.cache/governed-proof/windows-host-operation-matrix/`,
  keeps `CreateComparisonReport` gated, and surfaces post-run contamination as
  a failed case even when cleanup later succeeds, while the host CLI execution
  path itself uses the retained foreground PowerShell runner instead of the
  earlier background sidecar wrapper
- `TEST-UNIT-315`: verify the shared Windows host runtime-surface helper
  parses observed `LabVIEW.exe` / `LabVIEWCLI.exe` / `LVCompare.exe` process
  facts deterministically, uses bounded PID-tree plus image-name forced
  cleanup, and fails closed when cleanup PowerShell returns an error
- `TEST-SMOKE-003`: inventory the installed LabVIEWCLI operation set from
  `C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\Operations`,
  add the repo-supplied `PrintToSingleFileHtml` additional operation from the
  canonical local `labview-ci-cd/actions/VICompareTooling` source when
  present, fail closed when that source is absent, and retain one governed
  LabVIEW 2026 host operation matrix that separates x86 and x64 `LabVIEW.exe`
  surfaces, distinguishes cold CLI attach from warm headless-prelaunched
  LabVIEW attach, and retains that session-state split before any new
  `CreateComparisonReport` diagnosis is attempted
- `TEST-SMOKE-004`: prove `CloseLabVIEW` on the LabVIEW 2026 x86 host surface,
  including operation discovery/help behavior and clean post-run contamination
  state
- `TEST-SMOKE-005`: prove `CloseLabVIEW` on the LabVIEW 2026 x64 host surface,
  including operation discovery/help behavior and clean post-run contamination
  state
- `TEST-SMOKE-006`: prove `ExecuteBuildSpec` on the LabVIEW 2026 x86 host
  surface, at minimum through operation discovery/help and contamination
  outcome, before any compare-report claim is widened
- `TEST-SMOKE-007`: prove `ExecuteBuildSpec` on the LabVIEW 2026 x64 host
  surface, at minimum through operation discovery/help and contamination
  outcome, before any compare-report claim is widened
- `TEST-SMOKE-008`: prove `MassCompile` on the LabVIEW 2026 x86 host surface
  using a governed sample directory, retaining contamination outcome before and
  after the run
- `TEST-SMOKE-009`: prove `MassCompile` on the LabVIEW 2026 x64 host surface
  using a governed sample directory, retaining contamination outcome before and
  after the run
- `TEST-SMOKE-010`: prove `RunUnitTests` on the LabVIEW 2026 x86 host surface,
  at minimum through operation discovery/help and contamination outcome, and
  widen to fixture-backed execution only when a governed unit-test asset is
  available
- `TEST-SMOKE-011`: prove `RunUnitTests` on the LabVIEW 2026 x64 host surface,
  at minimum through operation discovery/help and contamination outcome, and
  widen to fixture-backed execution only when a governed unit-test asset is
  available
- `TEST-SMOKE-012`: prove `RunVI` on the LabVIEW 2026 x86 host surface with a
  governed sample VI and retained contamination outcome
- `TEST-SMOKE-013`: prove `RunVI` on the LabVIEW 2026 x64 host surface with a
  governed sample VI and retained contamination outcome
- `TEST-SMOKE-014`: prove `RunVIAnalyzer` on the LabVIEW 2026 x86 host surface
  using the governed `linuxContainerDemo/Test-VIs/*.viancfg` fixture when the
  toolkit is present, otherwise retain a blocked prerequisite outcome and clean
  contamination state
- `TEST-SMOKE-015`: prove `RunVIAnalyzer` on the LabVIEW 2026 x64 host surface
  using the governed `linuxContainerDemo/Test-VIs/*.viancfg` fixture when the
  toolkit is present, otherwise retain a blocked prerequisite outcome and clean
  contamination state
- `TEST-SMOKE-016`: prove the repo-supplied `PrintToSingleFileHtml` additional
  operation on the LabVIEW 2026 x86 host surface using the local canonical
  `labview-ci-cd/actions/VICompareTooling/PrintToSingleFileHtml` payload and
  retain contamination outcome before and after the run
- `TEST-SMOKE-017`: prove the repo-supplied `PrintToSingleFileHtml` additional
  operation on the LabVIEW 2026 x64 host surface using the local canonical
  `labview-ci-cd/actions/VICompareTooling/PrintToSingleFileHtml` payload and
  retain contamination outcome before and after the run
- `TEST-SMOKE-018`: prove `CreateComparisonReport` on the LabVIEW 2026 x86
  host surface only after `TEST-SMOKE-004..017` are complete and the host
  surface remains clean before the run
- `TEST-SMOKE-019`: prove `CreateComparisonReport` on the LabVIEW 2026 x64
  host surface only after `TEST-SMOKE-004..017` are complete and the host
  surface remains clean before the run
- `TEST-UNIT-319`: validate the public Gate D preflight operator surface
  parses explicit public-repo, public-wiki, fixture, image, and cold-pull
  preparation flags; exposes `public:gate-d:preflight` and
  `public:gate-d:prepare-cold-pull`; and retains a readable Markdown packet
  shape for the recorded public-product acceptance preflight
- `TEST-UNIT-320`: verify the next-line governance package keeps the
  post-release SemVer decision framework, the governed `GitFlow` branch model, the
  lane-specific CI and `design:gate` posture, the public-default-branch
  decision that keeps GitHub `main` stable for casual readers while `develop`
  remains the explicit evaluation branch, and the `v1.0.5` exact / `v1.0.6`
  develop-candidate state aligned across sustainment rules, README,
  current-state, release procedure, public-release candidate, and ADR-0030
- `TEST-UNIT-321`: verify the sustainment governance package keeps an explicit
  finding-to-requirement discipline so governed findings either update SRS,
  RTM, and the test plan in the same slice or retain an explicit
  `no-requirement-impact` rationale
- `TEST-UNIT-322`: verify the sustainment governance package keeps an explicit
  finding-to-ADR discipline so governed findings either update the ADR package
  in the same slice or retain an explicit `no-adr-impact` rationale
- `TEST-UNIT-323`: verify `openViHistoryCommand` fails closed when a
  comparison-progress or result update races with disposal of the history
  panel webview, preserving command completion instead of throwing
  `Webview is disposed`
- `TEST-UNIT-324`: verify the governed public GitHub admission matrix keeps an
  explicit source-preview plus Linux/Windows installed-user responsibility
  matrix, bounded `develop`/`main`/`release/*`/`hotfix/*` push and
  pull-request admission, no `feature/*` push lane, and per-workflow/per-ref
  concurrency
- `TEST-DOC-074`: review current-state, SRS, and RTM and confirm the
  dashboard contract now states that host-native Windows pair refresh is
  explicitly headless and that long-running pair refresh emits keepalive
  progress instead of looking stalled at the current pair boundary
- `TEST-DOC-075`: review current-state, PROGRAM-0002, ISSUE-0407, SRS, and
  RTM and confirm the host-review dashboard contract now says governed retained
  dashboard evidence is seeded before any local refresh, while Gate D remains
  open until the updated installed bundle is rerun by Sergio Velderrain
- `TEST-DOC-076`: review current-state, PROGRAM-0002, ISSUE-0407,
  documentation-workbench, SRS, and RTM and confirm the remaining Gate D
  repo-owned fixes now include Review Note draft persistence, two-row overview
  images with block-diagram-first ordering, and a curated bundled installed-user
  guide with no private GitLab or SRS/RTM exposure, while the human gate still
  remains open pending a rerun on the updated installed bundle
- `TEST-DOC-084`: review README, release-procedure, current-state,
  PROGRAM-0002, ISSUE-0407, and SRS and confirm the public-product Gate D lane
  now retains one preflight packet surface that records published public
  commits, canonical fixture path, Docker Linux engine facts, and governed
  Linux image absence before the human cold-pull rerun begins
- `TEST-DOC-085`: review README, current-state, release-procedure,
  PROGRAM-0004, ISSUE-0409, ADR-0030, SRS, RTM, and the test plan and confirm
  the next-line control plane now retains explicit `major`/`minor`/`patch`
  choice criteria, a governed `GitFlow` branch topology, the explicit
  rule that public GitHub `main` stays the default branch while `release/*`
  remains the release-candidate branch family and `develop` remains the
  evaluation branch, and lane-specific CI plus `design:gate` obligations for
  `feature/*`, `develop`, `release/*`, `hotfix/*`, and `main`, including
  `feature/*` branches cut from `develop` and merged back into `develop`,
  release/hotfix merge-backs into `develop`, and push validation on
  `release/*` and `hotfix/*`
- `TEST-DOC-086`: review PROGRAM-0004, ISSUE-0409, sustainment rules, SRS,
  RTM, and the test plan and confirm the repo now retains a continuous
  finding-to-requirement discipline that forces governed findings to either
  update SRS/RTM/test-plan coverage in the same slice or record an explicit
  `no-requirement-impact` rationale
- `TEST-DOC-087`: review PROGRAM-0004, ISSUE-0409, sustainment rules, ADR-0031,
  SRS, RTM, and the test plan and confirm the repo now retains a continuous
  finding-to-ADR discipline that forces governed findings to either update the
  ADR package in the same slice or record an explicit `no-adr-impact`
  rationale
- `TEST-DOC-088`: review the public release-candidate/control-plane docs, SRS,
  RTM, and test plan and confirm the disposed-history-panel progress finding is
  classified for requirement impact and retains an explicit `no-adr-impact`
  rationale in the same slice
- `TEST-DOC-089`: review PROGRAM-0004, ISSUE-0409, sustainment rules,
  ADR-0032, SRS, RTM, and the test plan and confirm the public GitHub workflow
  pair has explicit owned responsibilities, bounded triggers, and churn
  control instead of relying on raw YAML alone
- `TEST-DOC-077`: review documentation-workbench, current-state, SRS, and RTM
  and confirm the documentation continuous-integration contract now retains
  docs-integration evidence, bundle-drift checks, wiki doctor/plan facts, and
  explicit installed-user execution-policy truth checks for Docker-only
  compare execution, engine-aware Windows/Linux image selection,
  Docker-required hard stops without host fallback, and front-facing
  provider/progress guidance, while the governed package path refreshes
  bundled installed-user docs before VSIX creation
- `TEST-DOC-078`: review current-state, PROGRAM-0003, ISSUE-0408, SRS, RTM,
  and the test plan and confirm the repo now retains a LabVIEW 2026-only
  Windows host operation matrix that runs the x64 tranche first and gates the
  x86 tranche until x64 completes cleanly, enumerates the installed
  LabVIEWCLI operations plus the repo-supplied `PrintToSingleFileHtml`
  additional operation from the `aphill93/linuxContainerDemo` `demo` branch,
  and keeps `CreateComparisonReport` gated until the other operation cases are
  completed
- `TEST-DOC-079`: review current-state, PROGRAM-0003, ISSUE-0408, SRS, RTM,
  and the test plan and confirm the governed host matrix now requires pre-run
  and post-run contamination inspection for `LabVIEW.exe`, `LabVIEWCLI.exe`,
  and `LVCompare.exe`, and treats leftover hot runtime state from even
  operation-help probes as diagnostic evidence rather than silent repair
- `TEST-DOC-080`: review current-state, PROGRAM-0003, ISSUE-0408, SRS, RTM,
  and the test plan and confirm the governed host matrix now distinguishes
  cold CLI attach from warm headless-prelaunched LabVIEW attach, and that the
  retained PROGRAM-0003 host proof now narrows the stale
  `linux-headless-recursive-load` label into an explicit host cold-attach /
  warm-attach seam instead of leaving it Linux-only by default
- `TEST-DOC-081`: review current-state, PROGRAM-0003, ISSUE-0408, SRS, RTM,
  and the test plan and confirm the governed host-matrix receipts now retain
  readable stdout/stderr plus an explicit observation-window-expired note when
  LabVIEWCLI prints startup/help output but does not self-exit within the
  bounded diagnostic window, while the governed host runner now uses the
  retained foreground PowerShell execution path instead of the older
  background sidecar wrapper
- `TEST-DOC-082`: review README, current-state, SRS, RTM, the test plan, and
  the bundled installed-user workflow and confirm the shipped extension-user
  compare flow is checkbox-only, works with a two-commit retained window, keeps
  the oldest retained row selectable as the older/base side of the pair, and
  does not reintroduce dashboard or decision-record as extension-user steps
- `TEST-DOC-083`: review current-state, PROGRAM-0002, ISSUE-0407, SRS, RTM,
  the test plan, and the bundled comparison-report guidance and confirm the
  canonical compare-presentation retirement is landed repo-side: embedded
  compare views now lead with white-background selected/base commit context,
  commit/date/author/subject facts are foregrounded ahead of diagnostics, and
  runtime-diagnostic/process-observation detail remains retained on packet or
  runtime evidence surfaces while Gate D stays open only for the deterministic
  canonical rerun
- `TEST-DOC-070`: review current-state, harnesses, PROGRAM-0003, ISSUE-0408,
  and the comparable-prefix packet and confirm the repo documents the current
  Windows pair-129 ceiling as an accepted current-contract exception backed by
  retained runtime-surface proof, while keeping slower NI Package Manager plus
  ISO x86 provisioning explicitly out of scope for the current governed image
  contract
- `TEST-DOC-071`: review README, current-state, SHIP-0001, PROGRAM-0004,
  ISSUE-0409, and the post-release sustainment-rules package and confirm the
  active sustainment lane now retains one explicit release-refresh,
  benchmark-refresh, operator-upkeep, and reopen-boundary contract while
  `PROGRAM-0002` remains open only on the human gate and execution-policy
  bypass remains explicitly prohibited
- `TEST-DOC-072`: review Install-And-Release, Development-Queue, Current-State,
  Requirements-And-Verification, the wiki coverage/publication ledgers, and
  bundled docs and confirm the sustainment-rules package is represented on the
  published reader surfaces rather than remaining authority-only chronology
- `TEST-DOC-073`: review README, current-state, PROGRAM-0002, ISSUE-0407,
  PROGRAM-0003, ISSUE-0408, and the sustainment-rules package and confirm the
  host-machine human gate now requires a deterministic local non-OneDrive
  workspace while the governed Windows benchmark-image helper surfaces respect
  the active PowerShell execution policy instead of using
  `ExecutionPolicy Bypass`
- `TEST-DOC-028`: review the cross-repo jump map and confirm it records the
  governed authority repo, private experiment mirror, wiki, and
  assurance-skill repos with authority roles, expected remotes, and primary
  entrypoints
- `TEST-DOC-029`: review the documentation package and confirm README,
  current-state, architecture, workbench, and coherence surfaces point future
  sessions to the governed cross-repo jump surface
- `TEST-DOC-030`: review the Markdown and JSON wiki publication ledgers plus
  the bundled-documentation resources to confirm the published wiki set and the
  packaged docs set agree
- `TEST-DOC-031`: review README, current-state, release, workbench, and
  architecture surfaces to confirm bundled user documentation is documented as
  a packaged extension surface and not only as repo-hosted wiki content
- `TEST-DOC-032`: review README, current-state, and release-procedure surfaces
  to confirm future sessions may only treat retained design-gate evidence as
  complete after `npm run design:gate:assert-complete` succeeds, unless they
  already waited on the live `npm run design:gate` process
- `TEST-DOC-033`: review README, current-state, SRS/RTM/test-plan, and
  ADR-0007/ADR-0008 to confirm the deterministic in-IDE host-review
  submission surface and canonical Windows 11 host-machine proof boundary are
  governed explicitly and remain separate from the concentrated dashboard
  evidence packet
- `TEST-DOC-034`: review README, current-state, program-repo-jump,
  PROGRAM-0002, ISSUE-0407, and ADR-0016 to confirm GitLab remains authority,
  the private GitHub experiment mirror is non-authoritative, and the public
  GitHub facade remains release/setup/support only
- `TEST-UNIT-325`: read `hosted-ci-governance.json`, `hosted-ci-governance.md`,
  ADR-0033, sustainment rules, the GitHub experiment workflow files, and the
  entrypoint docs and confirm the hosted automation matrix distinguishes
  GitLab pipeline-success admission, public GitHub named required checks, and
  characterization-only benchmark workflows
- `TEST-UNIT-326`: read `.gitlab-ci.yml`, `hosted-ci-governance.json`,
  sustainment rules, and the entrypoint docs and confirm
  `package_extension_preview` is admitted on `develop`, `release/*`,
  `hotfix/*`, `main`, and exact tags while short-lived feature work relies on
  merge-request admission instead of a generic preview push lane
- `TEST-UNIT-327`: read `docs/cm/cm-plan.md`, sustainment rules, release
  procedure, current-state, README, and the hosted automation matrix and
  confirm they all agree that `develop` is the integration branch, `main` is
  the protected exact-release line, and `release/*` / `hotfix/*` are the
  governed short-lived promotion lanes
- `TEST-UNIT-328`: verify `promotePublicGithubSource` honors
  `VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT` when no explicit `--target-root` is
  supplied and fails closed on dirty target repos before comparison or write
  treats a stale side checkout as governed public-source drift
- `TEST-UNIT-329`: verify `assertGovernedBranchBaseline` fails closed when
  `develop` does not yet contain exact `main`, passes when the branch baseline
  is correct, and that `npm run design:gate` keeps that branch-baseline check
  first in the governed gate order
- `TEST-UNIT-330`: verify `preparePublicRepoClone` parses supported public
  GitHub and GitLab HTTPS repo URLs without a provider selector, derives a
  visible repo-sibling target path, and keeps the canonical icon-editor helper
  path separate
- `TEST-UNIT-331`: verify the generic public bootstrap command honors an
  explicit branch, resolves remote default branch truth when the branch is
  omitted, and fails closed on dirty or mismatched existing clone targets
- `TEST-UNIT-332`: review the `1.2.0` public bootstrap governance package and
  prove the canonical helper path remains separate from the generic public-repo
  path while the exact tag stays blocked on Sergio wiki-procedure review from a
  brand new fork and a brand new Codespace
- `TEST-UNIT-333`: verify the `1.2.0` public release-candidate package retains
  an explicit ordered state progression from local authority-green through
  published public source/wiki heads to `review-ready`, and fails closed so
  local green proof alone does not reopen the expert-agent review gate
- `TEST-UNIT-334`: verify release governance retains dirty public-source/wiki
  publication handling that preserves unrelated dirt, patches overlapping
  candidate files narrowly, and pauses only on direct unresolved conflicts
  instead of stopping candidate publication merely because the worktree is
  dirty
- `TEST-UNIT-335`: verify comparison-report preflight and runtime staging
  resolve selected/base historical VI paths per revision when a compared VI
  moved or was renamed between the two retained commits, so moved-VI pairs do
  not fail with stale current-path blob reads when follow history can still
  resolve both sides
- `TEST-UNIT-336`: verify the Marketplace governance package retains the live
  publisher/item identity, records Marketplace publication separately from
  GitHub/GitLab release evidence, and requires Marketplace publication before
  exact closeout is considered complete
- `TEST-UNIT-337`: verify the packaged homepage and the primary public entry
  docs are installed-user first and keep source-evaluation/fork/Codespaces
  procedures explicit but secondary
- `TEST-UNIT-338`: verify exact release closeout remains incomplete until the
  exact released `main` line has been back-merged into `develop` through the
  protected path and the resulting `develop` pipeline is green
- `TEST-UNIT-339`: verify runtime-doctor next actions and installed-user docs
  treat missing Docker CLI or a stopped Docker daemon as first-run
  prerequisite failures with install/start/retry guidance instead of implying
  image acquisition is always the first step
- `TEST-UNIT-340`: verify the active public release-candidate package retains
  the `vi-history-suite-expert-agent-reviewer` skill identity, the exact
  published public repo/wiki heads under review, the latest retained verdict,
  and the blocking no-findings rule before `tag-eligible`
- `TEST-UNIT-341`: verify the installed-user manifest/settings contract
  exposes `viHistorySuite.labviewVersion` and
  `viHistorySuite.labviewBitness`, keeps host as the default installed-user
  direction, avoids general Docker/image-family settings on the public
  installed-user surface, and reads the installed-user runtime facts through
  the host-local runtime-settings surface
- `TEST-UNIT-342`: verify Windows runtime preflight requires version and
  bitness, resolves exactly one local LabVIEW + `LabVIEWCLI` installation, and
  fails closed when the requested runtime is missing, ambiguous, or
  incompatible
- `TEST-UNIT-343`: verify selecting the second commit no longer auto-runs
  compare, and the compare preflight renders selected/base commit plus LabVIEW
  version, bitness, and provider before the explicit `Compare` action
- `TEST-UNIT-344`: verify missing, unresolved, or unsupported provider/runtime
  selection blocks compare in the panel and emits a VS Code warning
  notification
- `TEST-UNIT-345`: verify the governed `vihs` surface resolves as a bare
  command in supported admitted Windows PowerShell sessions, including VS Code
  integrated terminals and standalone PowerShell windows reached through
  governed user-scope admission, writes provider plus
  `viHistorySuite.labviewVersion` and `viHistorySuite.labviewBitness`, and
  stays inside user-owned installation doctrine without hidden-path
  reconstruction, a mandatory prepare-first flow, manual shell-profile
  editing, admin elevation, machine-wide install doctrine, or a prebuilt
  VSIX-shipped CLI payload; real current-host execution remains traced
  separately by `TEST-INTEG-009`, and the CLI plus the settings-driven
  compare-preflight/runtime-doctor surfaces warn users to reload or restart
  the window only when an already-running session still shows stale provider or
  runtime facts
- `TEST-UNIT-346`: verify the installed compare contract defaults to host and
  admits Docker only as a bounded expert provider persisted and rechecked
  through the admitted `vihs` terminal settings surface
- `TEST-UNIT-347`: verify Docker preflight derives the governed image family
  from the current engine and fails closed on unsupported Docker `x86` with
  host/`x64` corrective guidance
- `TEST-UNIT-348`: verify compare preflight shows provider as read-only text
  and retains an explicit CLI update hint when provider/runtime settings need
  correction
- `TEST-349` / `TEST-UNIT-349`: verify installed compare preflight admits `ready` only
  after the governing runtime-selection layer confirms the active
  provider/version/bitness bundle, and that settings-only fallback cannot
  surface a publishable runtime-backed ready state
- `TEST-UNIT-350`: verify the `vihs` settings surface, compare-preflight
  surface, and runtime-doctor surface retain conditional stale-result
  guidance while live uptake of CLI-written settings into an already-running
  VS Code session is still only partially proven, and that retained
  persisted-versus-live probe packet plus local packet/history/policy-gate
  evidence remains explicit for that boundary, while the repo-owned
  `npm run proof:runtime-settings-live-session` wrapper snapshots the current
  packet/history/policy bundle into one reviewable receipt directory
- `TEST-UNIT-351`: verify the `vihs` settings surface accepts governed VS Code
  settings targets with JSONC comments or trailing commas, names the effective
  settings target in update or validation output, preserves unrelated settings
  content, rejects unsupported workspace-target widening, and rewrites only
  provider/version/bitness facts
- `TEST-UNIT-352`: verify the bare `vihs` terminal entrypoint either executes
  through the governed runtime contract, including the Windows standard VS
  Code runtime path when global `node.exe` is absent from PATH, or fails closed
  with one actionable missing-or-stale runtime dependency message that
  restores the admitted terminal surface without hidden-path reconstruction
- `TEST-UNIT-353`: verify `vihs` with no arguments seeds missing settings to
  `host/windows/2026/x64`, reads back the current provider/platform/version/bitness
  bundle, prints exact copyable next commands, and, on interactive TTY
  surfaces, admits Enter-through confirmation or guided selection of supported
  provider/platform/version/bitness values, including `docker/linux` `2026`
  `x64` on Linux Docker Desktop/Docker Engine hosts, while failing closed with
  explicit unsupported, host-mismatched, or not-yet-implemented path guidance
- `TEST-UNIT-354`: verify the `vihs` surface exposes `vihs --validate` as one
  governed validation action that reports persisted provider/version/bitness
  truth plus runtime-validation outcome, and that the no-argument interactive
  confirmation flow invokes that same bounded validation after persisting
  settings without reopening path-picking or a panel-side provider picker
- `TEST-UNIT-355`: verify Windows host runtime validation accepts the
  governed mixed-bitness x64 host bundle when the canonical host resolves
  `C:\Program Files\National Instruments\LabVIEW 2026\LabVIEW.exe` together
  with the installed x86
  `C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.exe`
  instead of failing closed with `labview-cli-not-found-for-bitness`
- `TEST-INTEG-010`: prove the bare `vihs` terminal entrypoint runtime
  dependency contract on the supported host surface, including the Windows
  standard VS Code runtime path before any global Node fallback, and retain the
  actionable failure mode that restores the admitted terminal surface when the
  governed runtime dependency is unavailable or stale
- `TEST-INTEG-011`: prove the governed `vihs` validation action reports the
  persisted provider/version/bitness bundle and the bounded runtime-validation
  outcome from a real extension-host session; the explicit Windows lane shall
  prove that a persisted `docker` / `2026` / `x64` bundle validates as `ready`
  with `windows-container` plus `labview-cli` when Docker Desktop and the
  governed Windows image are available
- `TEST-INTEG-012`: prove the explicit Windows x64 host lane reports a
  persisted `host` / `2026` / `x64` bundle as `ready` on the canonical host
  when the admitted local runtime shape is x64 `LabVIEW.exe` plus the
  canonical installed x86 `LabVIEWCLI.exe`
- `TEST-SMOKE-020`: prove the canonical Windows host-operation matrix closes
  the remaining LabVIEW 2026 x64 release prerequisite-operation seams or
  retains one exact bounded blocker receipt per unresolved x64 seam, while any
  retained x86 lane output stays explicit non-release characterization only
- `TEST-SMOKE-021`: prove `CreateComparisonReport` admission on the supported
  LabVIEW 2026 x64 host bundle, or retain the exact bounded blocker receipt
  when that bundle remains non-admissible after prerequisite closeout; the
  retained x64 bundle shall treat the installed x86 `LabVIEWCLI.exe` plus x64
  `LabVIEW.exe` host shape as the first private-release proof surface, and the
  retained x64 success receipt shall keep the direct `CreateComparisonReport`
  command-line proof, the derived VI Server port (`3363`), the bounded
  `300000ms` runtime budget, the banner observation that `LabVIEWCLI.exe` was
  seen while `LabVIEW.exe` was absent, the exit observation that
  `LabVIEW.exe` was observed, and the final generated-report outcome
- `TEST-SMOKE-022`: if a Windows x86 host-bundle rerun is retained, preserve
  the exact bounded `CreateComparisonReport` characterization receipt without
  treating that rerun as part of current release admission; the retained x86
  receipt shall keep the direct `CreateComparisonReport` command-line proof,
  the derived VI Server port (`3364`), the banner observation that
  `LabVIEWCLI.exe` was seen while `LabVIEW.exe` was absent, and the final
  `command-timed-out` outcome
- `TEST-DOC-106`: review current-state, `PROGRAM-0005`, `ISSUE-0412`, the
  SRS, RTM, test plan, command reference, FAQ, and `ISSUE-0414` roadmap and
  confirm the retained live-session conditional stale-result guidance plus
  supporting probe, packet/history/policy gates, and repo-owned proof-receipt
  surface remain explicit until direct active-session uptake is end-to-end
  proven
- `TEST-DOC-107`: review the manifest, terminal-entrypoint surface, SRS, RTM,
  and the test plan and confirm the bare `vihs` contract plus its copyable
  command and interactive-discovery posture remain explicit instead of relying
  on chat-memory doctrine
- `TEST-DOC-108`: review current-state, the host-operation matrix docs, the
  tracked host `CreateComparisonReport` packet, the SRS, RTM, and the test
  plan and confirm the remaining LabVIEW 2026 prerequisite-operation seams
  plus the direct x64/x86 `CreateComparisonReport` blocker receipts are
  retained as explicit host-proof gates instead of informal notes
- `TEST-DOC-109`: review README, current-state, `PROGRAM-0005`, `ISSUE-0412`,
  the branch handoff packet, the runtime-provider public-acceptance gate
  packet, the release procedure, the SRS, RTM, and the test plan and confirm
  bundled/public installed-user surfaces remain on the exact released
  Docker-only baseline until the host-default provider contract clears the
  explicit governed public-acceptance gate
- `TEST-DOC-110`: review current-state, `PROGRAM-0005`, `ISSUE-0412`, the
  command reference, the FAQ, the SRS, the RTM, and the test plan and confirm
  the active governed claim is Linux/Docker validated preview, while Windows x64
  installed-user proof is deferred until a real Windows/LabVIEW host proves the
  native host LabVIEW bundle and Docker Desktop Windows-container execution; WSL
  remains historical context rather than installed-user proof
- `TEST-UNIT-356`: verify the governed Windows private-release acceptance
  script keeps the canonical `HARNESS-VHS-002` `lv_icon.vi` selected/base pair,
  retains separate host and Windows-container command plans, and emits the
  machine-readable runner manifest under `windows-private-release-evidence/`
- `TEST-DOC-111`: review `.gitlab-ci.yml`, hosted governance, sustainment,
  current-state, the private-release packet, the runner-lane contract, the
  SRS, the RTM, and the test plan and confirm preview packaging now depends on
  `ubuntu_docker_runner_admission`, Linux assurance, and extension tests, while
  the tagged Windows shell-runner acceptance lane is retained as deferred proof
  behind `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`
- `TEST-UNIT-357`: verify the hosted CI governance package, `.gitlab-ci.yml`,
  README, current-state, and the release procedure retain the published
  `repo-standards-review` assurance-workbench lane, its
  `assurance_release_gate` job name, the published image reference, and the
  preview/exact packaging dependency on that lane
- `TEST-DOC-112`: review `.gitlab-ci.yml`, hosted governance, README,
  current-state, the release procedure, the SRS, the RTM, and the test plan
  and confirm the published assurance-workbench `release-gate` lane is now a
  required GitLab governance check that blocks preview and exact packaging
- `TEST-UNIT-358`: verify `scripts/runAssuranceAudit.js` stages the governed
  `repo` and `authority-docs` targets, excludes transient or non-authority
  paths, and builds the expected local-skill command plan
- `TEST-UNIT-359`: verify `.gitlab-ci.yml`, the Linux assurance runner-lane
  contract, the hosted-governance package, and `package.json` retain the
  separate self-hosted Linux assurance lane plus the required
  `assurance:*` command surface
- `TEST-UNIT-360`: verify preview and exact packaging now depend on
  `assurance_release_gate`, `assurance_26514_authority`,
  `assurance_requirements_quality`, and
  `assurance_external_user_information`, while `assurance_audit_packet`
  remains advisory only
- `TEST-UNIT-361`: verify the contradiction-guard test family keeps the
  assurance baseline split, exact released versus active candidate scope
  split, requirements-to-user-doc semantics, and authority-doc metadata
  coherence explicit
- `TEST-UNIT-362`: verify the repo-owned runner host asset pack retains the
  Windows apply/bootstrap scripts, the Linux apply/helper scripts, and the
  Linux assurance `systemd` unit, and that the lane docs, hosted governance,
  the private-release packet, and the wider control plane point to those exact
  asset paths plus repo-owned fail-closed host apply/update behavior, bounded
  post-reset Windows-to-WSL Linux-helper recovery, and the admitted Linux
  `concurrent = 2` plus `request_concurrency = 2` contract
- `TEST-UNIT-363`: verify the repo-owned Windows bootstrap clears stale
  `LabVIEW`, `LabVIEWCLI`, and `LVCompare` before cold runner admission, uses
  bounded PID-tree plus image-name forced descendant termination, and fails
  closed when contamination remains
- `TEST-UNIT-364`: verify the Windows private-release acceptance wrapper
    preserves the first failed host proof transcript, runs the repo-owned
    Windows proof runtime recovery script, retains
    `proof-runtime-recovery.txt`, waits `5000` ms, retries the host-native
    proof once when the shared Windows cleanup seam fails before proof
    execution, and still fails closed when that recovery step plus retry is
    not eligible or cannot restore a clean host surface
- `TEST-UNIT-365`: verify the repo-owned runner drift-assert surfaces keep the
  admitted Windows and Linux assertion commands explicit, keep the combined
  wrapper and `npm run gitlab:runner:assert` package surface explicit, and
  fail closed when the Windows assertion is requested from a non-Windows host
  or when the admitted Linux `concurrent = 2` plus `request_concurrency = 2`
  contract or live enabled/active service state drifts
- `TEST-UNIT-366`: verify the Windows proof runtime recovery rehearsal surface
  fails closed unless the admitted Windows host starts clean, seeds one
  headless LabVIEW contamination, runs the repo-owned recovery script,
  retains the rehearsal receipt plus `proof-runtime-recovery.txt`, and proves
  the post-recovery runtime surface is clean again
- `TEST-UNIT-367`: verify the published Windows PowerShell install bootstrap
  runs the Marketplace install for `svelderrainruiz.vi-history-suite`,
  materializes the admitted `vihs` launchers, derives platform from the
  current host, prompts only for provider/LabVIEW year/bitness when
  interactive, and on non-interactive surfaces seeds or retains the governed
  default `host/windows/2026/x64` bundle plus exact follow-up `vihs` commands
  without claiming raw `code --install-extension` interactivity
- `TEST-UNIT-368`: verify the governed runner startup/doctor substrate writes
  machine-readable Windows and Linux startup receipts, exposes repo-owned
  lane-local doctor scripts plus the combined `npm run gitlab:runner:doctor`
  wrapper, and can fail closed on drift without mutating healthy hosts
- `TEST-UNIT-369`: verify GitLab retains one fail-fast
  `ubuntu_docker_runner_admission` lane in the `admission` stage that retains
  `governed-runner-admission-evidence/` for the active Linux/Docker preview
  claim, and keeps `governed_runner_admission` as a deferred Windows/LabVIEW
  doctor lane behind `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`
- `TEST-UNIT-370`: verify the public GitHub exact-release transaction
  controller inspects authority exact main/tag state, live public GitHub
  main/tag/release/assets, the repo immutable-release policy, the current
  draft-release publishability facts including by-id draft readback, and live
  VS Code Marketplace version, writes JSON plus Markdown receipts, and fails
  closed when the transaction remains incomplete or contradictory
- `TEST-UNIT-371`: verify the public GitHub exact-release transaction
  controller freezes later SemVer openings and classifies the current exact
  line as repair-in-place first whenever public GitHub `main`, the exact tag,
  or a draft release already exist for that same exact line
- `TEST-UNIT-372`: verify the authority release-control package retains the
  current exact line, `main` and `develop` package lines, the active
  hardening feature branch, the live public GitHub source head and tag, the
  current draft-release id when present, the last published GitHub release
  baseline, the retained Marketplace version, and the transaction-assessment
  package script and receipt path
- `TEST-UNIT-373`: verify the software-factory orchestrator assessment surface
  classifies authority/staging/production/recovery boundaries, writes
  receipt-backed factory state, and does not admit any production mutation in
  this non-production slice
- `TEST-UNIT-374`: verify the software-factory orchestrator assessment surface
  retains the trust model, environment baseline, rehearsal policy, incident
  classes, recovery rules, approval model, the frozen no-bump posture, and
  exact `v1.3.6` as the sole production recovery case
- `TEST-UNIT-375`: verify the non-production `software:factory:rehearse`
  surface reuses the retained exact-transaction facts, writes a rehearsal
  receipt, and proves the frozen `v1.3.6` in-place repair candidate remains
  readable by id with manifest-backed exact assets
- `TEST-UNIT-376`: verify the non-production `software:factory:repair`
  surface writes the deferred in-place `v1.3.6` repair contract, retains the
  deferred write actions, and still enforces a no-write boundary before any
  later mutating production phase is admitted
- `TEST-UNIT-377`: verify the guarded non-mutating
  `software:factory:publish` surface writes the exact `v1.3.6`
  publish-contract receipt, retains the manifest-backed publish preconditions
  plus the deferred GitHub draft-release write action, and still enforces a
  no-write boundary
- `TEST-UNIT-378`: verify the guarded non-mutating
  `software:factory:verify` surface writes the exact `v1.3.6`
  verify-contract receipt, retains the expected public GitHub release and
  VS Code Marketplace verification facts, and keeps verification claims
  blocked until those production surfaces actually close
- `TEST-UNIT-379`: verify the non-mutating
  `vscode:marketplace:prepare` surface verifies the published public GitHub
  exact release for the current authority tag, exact VSIX/checksum evidence, current Marketplace
  version, local Marketplace PAT locator, and pinned `vsce` command shape,
  writes JSON plus Markdown receipts, and performs no Marketplace mutation
- `TEST-UNIT-380`: verify the release-publication state resolver derives the
  selected authority tag, package version, Marketplace item, current
  Marketplace version, and versioned next-action strings without hardcoded
  release ids or current-version literals.
- `TEST-UNIT-381`: verify the public GitHub exact-release publisher requires
  explicit `--tag`, creates a draft for an absent release, uploads the VSIX and
  checksum from GitLab authority evidence, verifies both assets by release id,
  and only then publishes the draft.
- `TEST-UNIT-382`: verify a published immutable GitHub release with missing,
  zero-size, mismatched, or checksum-invalid assets is classified as
  `published-immutable-release-assets-incomplete` and blocks Marketplace
  publication.
- `TEST-UNIT-383`: verify the non-mutating
  `vscode:marketplace:install-proof` surface installs the selected authority
  VSIX into isolated VS Code user-data/extensions roots on Windows, verifies
  the exact VSIX SHA-256 against the authority manifest, and retains passing
  bare `vihs` plus `vihs --validate` receipt evidence without ambient Node on
  PATH.
- `TEST-UNIT-384`: verify the Marketplace prep surface requires the retained
  Windows exact-VSIX install proof before a future mutating Marketplace act is
  admitted, while exact lines that are already published may remain in
  retained-publication state.
- `TEST-UNIT-385`: verify the Marketplace community-validation preview prep
  surface writes a non-mutating receipt, retains Linux/Docker preview
  evidence, discloses deferred Windows/LabVIEW installed-user proof, keeps
  Windows/LabVIEW selections user-selectable with proof-status disclosure,
  blocks reuse of the current Marketplace version, and retains pinned
  `vsce --pre-release` package and publish command shapes.
- `TEST-UNIT-386`: verify the Linux Docker provider lane script writes JSON
  plus Markdown evidence, validates Docker OSType `linux`, persists
  `docker` / `2026` / `x64` through `vihs`, proves
  `runtimeProvider=linux-container` with `runtimeEngine=labview-cli`, and
  records Windows installed-user LabVIEW proof as community/deferred evidence.
- `TEST-UNIT-387`: verify the Linux Docker provider-lane release-control
  packet retains develop pipeline `2480195741`, job `14091891709`, provider
  runtime facts, preview VSIX SHA-256, release-publication state anchoring,
  and the no-mutation public GitHub/Marketplace boundary while Windows
  installed-user LabVIEW proof remains community/deferred.
- `TEST-UNIT-388`: verify the exact-release readiness assessment retains the
  current `develop` commit and pipeline, passed Linux/Docker preview evidence,
  blocked exact-release verdict, deferred Windows installed-user LabVIEW proof,
  preview VSIX SHA-256, release-publication state anchoring, and public
  GitHub/Marketplace no-mutation boundary.
- `TEST-DOC-113`: review `.gitlab-ci.yml`, `linux-assurance-runner-lane.md`,
  hosted governance, current-state, README, and the release procedure and
  confirm the Linux assurance lane is separate from the Windows proof lane,
  authenticates locally, pulls the latest external image, and owns the
  blocking plus advisory assurance jobs truthfully
- `TEST-DOC-114`: review README, current-state, the release procedure, FAQ,
  command reference, SRS, RTM, and the contradiction-guard tests and confirm
  the repo keeps the `:main` versus `v0.2.18` baseline split, the exact
  released `v1.2.2` versus active `v1.3.0` scope split, the requirements/user-
  doc semantics, and authority-doc metadata coherence explicit
- `TEST-DOC-115`: review the runner-lane contracts, hosted governance,
  private-release packet, information-item map, README, current-state,
  release procedure, SRS, RTM, and the new asset-pack test and confirm the
  governed runner host asset pack and repo-owned apply surfaces are versioned,
  recoverable without untracked machine-only startup files, and explicit about
  fail-closed host apply/update behavior, bounded reboot-time Windows-to-WSL
  Linux assurance recovery, and the retained Linux dual-concurrency contract
- `TEST-DOC-116`: review the runner-lane contract, hosted governance,
  private-release packet, README, current-state, release procedure, SRS, RTM,
  and the test plan and confirm the Windows proof lane retains cold-admission
  stale-runtime cleanup plus fail-closed startup semantics after restart or
  logon
- `TEST-DOC-117`: review the Windows runner-lane contract, hosted governance,
    private-release packet, README, current-state, release procedure, sustainment
    rules, SRS, RTM, and the test plan and confirm the bounded host-native
    contamination-recovery retry is explicit: `proof-run-pre-recovery.txt` is
    retained, `recover-windows-proof-runtime-surface.ps1` is invoked,
    `proof-runtime-recovery.txt` is retained, the retry waits `5000` ms, only
    one retry is admitted, and the lane still fails closed if that recovery
    step plus retry cannot restore a clean host surface
- `TEST-DOC-118`: review the runner-lane contracts, hosted governance,
  private-release packet, README, current-state, release procedure, sustainment
  package, SRS, RTM, and the test plan and confirm the repo-owned live
  drift-assert surfaces and the combined wrapper are explicit about exact
  scheduled-task/bootstrap state, installed helper/service/bootstrap hash
  matching, Linux `concurrent = 2` plus `request_concurrency = 2`, enabled and
  active Linux service state, and live runner/service process checks
- `TEST-DOC-119`: review the Windows runner-lane contract, hosted governance,
  private-release packet, README, current-state, release procedure, sustainment
  package, SRS, RTM, and the test plan and confirm the repo-owned Windows
  proof runtime recovery rehearsal surface is explicit: it uses
  `runWindowsProofRuntimeRecoveryRehearsal.js`, is admitted through
  `npm run gitlab:runner:windows:recovery:rehearse`, seeds one headless
  LabVIEW contamination, and refreshes
  `.cache/windows-proof-runtime-recovery-rehearsal/latest.json`
- `TEST-DOC-120`: review the SRS, RTM, test plan, README, INSTALL, command
  reference, FAQ, and `scripts/install-vihs-extension.ps1` and confirm the
  governed interactive install surface is the published Windows PowerShell
  bootstrap rather than raw `code --install-extension` alone, with exact
  follow-up `vihs` commands and Windows-host-derived platform posture kept
  explicit
- `TEST-DOC-121`: review the runner-lane contracts, hosted governance,
  private-release packet, information-item map, current-state, release
  procedure, SRS, RTM, and test plan and confirm the governed runner package
  now retains startup receipts plus repo-owned doctor surfaces for both lanes
  without relying on ad hoc post-reset shell history
- `TEST-DOC-122`: review `.gitlab-ci.yml`, hosted governance, sustainment
  rules, the runner-lane contracts, current-state, release procedure, SRS,
  RTM, and test plan and confirm `ubuntu_docker_runner_admission` runs first as
  the fail-fast Linux/Docker preview admission gate before later docs,
  assurance, test, package, and release stages queue, while
  `governed_runner_admission` remains deferred Windows/LabVIEW proof
- `TEST-DOC-123`: review README, current-state, release procedure, the
  sustainment package, the public-release candidate package, SRS, RTM, and
  the test plan and confirm the public GitHub exact-release transaction
  assessment surface is explicit, receipt-backed, retains the non-mutating
  draft-publishability probe plus the immutable-release publishability probe,
  and stays fail-closed while the current exact public transaction remains
  incomplete
- `TEST-DOC-124`: review the sustainment package, current-state, release
  procedure, public-release candidate package, SRS, RTM, and the test plan
  and confirm the no-bump repair rule freezes later SemVer openings whenever
  the current exact line already retains public GitHub `main`, the exact tag,
  or a draft release record
- `TEST-DOC-125`: review README, current-state, hosted governance, the public
  source publication ledger, the public-release candidate package, SRS, RTM,
  and the test plan and confirm the control plane retains the current exact
  line, `main` and `develop` package lines, active hardening feature branch,
  live public GitHub source head and tag, draft-release id when present, last
  published GitHub release baseline, retained Marketplace version, the
  transaction-assessment package script and receipt path, and the current
  non-mutating draft-publishability plus publishability-probe results
- `TEST-DOC-126`: review the architecture overview, current-state, release
  procedure, post-release sustainment rules, public-release candidate package,
  SRS, RTM, and the test plan and confirm the repo now retains a
  software-factory governance contract with explicit authority/staging/
  production/recovery boundaries plus the admitted non-production `assess`,
  `rehearse`, and `repair` phases
- `TEST-DOC-127`: review README, current-state, release procedure, the
  sustainment package, the public-release candidate package, the information
  item map, SRS, RTM, and the test plan and confirm exact `v1.3.6` remains
  the sole frozen production recovery case, the active software-factory branch
  plus the assess/rehearse/repair scripts and receipt paths are explicit, and
  GitHub release / Marketplace mutation remain forbidden in this slice
- `TEST-DOC-128`: review README, current-state, release procedure, the
  sustainment package, the public-release candidate package, SRS, RTM, and
  the test plan and confirm the repo now retains one non-production
  `software:factory:rehearse` surface plus receipt path that reuses the exact
  transaction receipt and proves the retained `v1.3.6` in-place repair
  candidate is still readable by id and still carries the manifest-backed
  exact assets
- `TEST-DOC-129`: review README, current-state, release procedure, the
  sustainment package, the public-release candidate package, the information
  item map, SRS, RTM, and the test plan and confirm the repo now retains one
  non-production `software:factory:repair` surface plus receipt path that
  records the deferred in-place `v1.3.6` repair contract, deferred write
  actions, and the no-write boundary before later mutating production phases
- `TEST-DOC-130`: review README, current-state, release procedure, the
  sustainment package, the public-release candidate package, the information
  item map, SRS, RTM, and the test plan and confirm the repo now retains one
  guarded non-mutating `software:factory:publish` surface plus receipt path
  that records the exact `v1.3.6` publish preconditions, deferred GitHub
  draft-release write action, and continued no-write boundary
- `TEST-DOC-131`: review README, current-state, release procedure, the
  sustainment package, the public-release candidate package, the information
  item map, SRS, RTM, and the test plan and confirm the repo now retains one
  guarded non-mutating `software:factory:verify` surface plus receipt path
  that records the exact `v1.3.6` GitHub-release and Marketplace verification
  expectations while verification claims remain blocked
- `TEST-DOC-132`: review README, current-state, release procedure, the
  Marketplace publication ledger, the sustainment package, the public-release
  candidate package, SRS, RTM, and the test plan and confirm the repo now
  retains one non-mutating `vscode:marketplace:prepare` surface plus receipt
  path that proves the current public GitHub exact release is closed,
  validates the exact VSIX/checksum evidence and PAT locator without secret
  retention, retains the pinned `vsce` publish command shape, and keeps
  Marketplace publication pending explicit production approval
- `TEST-DOC-133`: review `release-publication-state.{md,json}`, the
  information-item map, release-control docs, SRS, RTM, and test plan and
  confirm GitLab authority, public GitHub distribution, Marketplace
  distribution, incident classification, and next admitted action are retained
  as one parameterized state model.
- `TEST-DOC-134`: review ADR-0039, release procedure, sustainment rules, SRS,
  RTM, and the transaction controller and confirm future public GitHub exact
  releases use the asset-first draft/create/upload/verify/publish sequence
  sourced from GitLab authority artifacts.
- `TEST-DOC-135`: review release-control docs, SRS, RTM, and the test plan and
  confirm public GitHub `v1.3.8` release `312768592` is retained as
  externally blocked because it is published, immutable, and has zero assets,
  while the later exact `v1.3.9` GitHub and VS Code Marketplace publication
  acts are retained as closed.
- `TEST-DOC-136`: review release-publication state, release procedure,
  Marketplace ledger, current-state, ADR-0036, SRS, RTM, and the test plan and
  confirm the repo retains one governed Windows exact-VSIX install proof
  package script plus receipt path for the current exact line.
- `TEST-DOC-137`: review release-control docs, the Marketplace ledger,
  sustainment rules, public-release candidate package, SRS, RTM, and the test
  plan and confirm future Marketplace publication is blocked until the
  retained Windows exact-VSIX install proof passes, while already-published
  exact lines may remain in retained-publication state.
- `TEST-DOC-138`: review README, current-state, release-publication state, the
  Marketplace publication ledger, release procedure, SRS, RTM, and the
  community-preview prep receipt and confirm the Marketplace
  community-validation preview path is preparation-only, uses
  `vsce --pre-release`, discloses deferred Windows proof, keeps selectable
  Windows/LabVIEW features tied to proof-status surfaces, requires a distinct
  higher Marketplace version, and leaves public GitHub plus Marketplace
  untouched until the user says `publish it now`.
- `TEST-DOC-139`: review `.gitlab-ci.yml`, hosted governance,
  release-publication state, current-state, README, INSTALL, command
  reference, FAQ, SRS, RTM, and the test plan and confirm the develop package
  path now requires the governed Linux Docker Desktop/Docker Engine provider
  lane while Windows installed-user LabVIEW proof remains community/deferred.
- `TEST-DOC-140`: review the Linux Docker provider-lane release-control
  packet, release-publication state, current-state, information-item map, SRS,
  RTM, and the test plan and confirm the current retained develop preview
  evidence is anchored to pipeline `2480195741`, does not track the moving
  live `develop` head, and did not mutate public GitHub or Marketplace.
- `TEST-DOC-141`: review the exact-release readiness assessment,
  release-publication state, current-state, information-item map, SRS, RTM,
  and the test plan and confirm the current `develop` line is marked
  Linux/Docker preview-valid but blocked for exact-release promotion while
  Windows installed-user LabVIEW proof remains community/deferred and public
  GitHub/Marketplace exact mutation is not admitted.
- `TEST-DOC-090`: review hosted governance, sustainment, README, current-state,
  release procedure, and ADR-0033 and confirm the retained hosted automation
  matrix explains which hosted checks are exact-release gates and which are
  characterization-only experiment lanes
- `TEST-DOC-091`: review `.gitlab-ci.yml`, hosted governance, sustainment, and
  release docs and confirm authority preview packaging now follows the
  documented branch lanes instead of behaving like a `main`-only lane
- `TEST-DOC-092`: review the CM plan plus the release-governance docs and
  confirm the branch model no longer contradicts itself across retained
  surfaces
- `TEST-DOC-093`: review ADR-0028, sustainment, current-state, README, and
  release procedure and confirm the public-source promotion/check surface now
  binds the intended local checkout through `--target-root` or
  `VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT` and refuses dirty target repos instead
  of treating stale side-worktree drift as governed publication truth
- `TEST-DOC-094`: review sustainment, hosted governance, release procedure,
  current-state, README, SRS, RTM, and the test plan and confirm the repo now
  retains a fail-closed branch-baseline assertion surface that runs first in
  `npm run design:gate` before a new candidate line continues
- `TEST-DOC-095`: review README, current-state, the public release-candidate
  package, ADR-0034, SRS, RTM, and the test plan and confirm the repo now
  retains one generic public GitHub/GitLab bootstrap command that resolves the
  actual remote default branch instead of relying on `main` versus `master`
  heuristics
- `TEST-DOC-096`: review README, current-state, ISSUE-0411, PROGRAM-0006, the
  public release-candidate package, ADR-0034, SRS, RTM, and the test plan and
  confirm the canonical helper path remains separate from the generic
  public-repo path while exact `v1.2.0` tagging is blocked on Sergio
  wiki-procedure review from a brand new fork and a brand new Codespace
- `TEST-DOC-097`: review sustainment, release procedure, current-state, the
  public release-candidate package, ISSUE-0411, PROGRAM-0006, ADR-0035, SRS,
  RTM, and the test plan and confirm the repo now retains an explicit
  `review-ready` boundary that requires published public `develop` and public
  wiki candidate heads before the expert-agent review gate starts
- `TEST-DOC-098`: review sustainment, release procedure, ADR-0035, SRS, RTM,
  and the test plan and confirm governed public source/wiki publication now
  treats dirty worktrees as controlled patch targets instead of as a generic
  reason to stop candidate publication
- `TEST-DOC-099`: review the Marketplace publication ledger, release
  procedure, sustainment package, current-state, and ADR-0036 and confirm the
  repo now retains exact Marketplace publication truth, the pinned `vsce`
  publish path, the PAT scope rule, the manual portal fallback, and the
  no-secret-retention rule
- `TEST-DOC-100`: review the Marketplace-linked homepage plus the primary
  public entry docs and confirm they now lead with installed-user local-workflow
  guidance while keeping source-evaluation procedures explicitly secondary
- `TEST-DOC-101`: review ADR-0030, sustainment, hosted governance, release
  procedure, current-state, SRS, RTM, and the test plan and confirm exact
  release closeout now remains incomplete until the protected back-merge into
  `develop` is merged and the resulting `develop` pipeline is green
- `TEST-DOC-102`: review the installed-user README, public-source install
  surfaces, public wiki user pages, execution-policy docs, and runtime-doctor
  package and confirm first-run missing-Docker states now tell users to
  install or start Docker and verify it before image acquisition is expected
- `TEST-DOC-103`: review sustainment, release procedure, current-state, the
  public release-candidate package, ADR-0037, SRS, RTM, and the test plan and
  confirm exact tagging and Marketplace publication now remain blocked until
  the retained `vi-history-suite-expert-agent-reviewer` gate against the exact
  published public candidate heads returns no findings
- `TEST-DOC-104`: review README, current-state, ship control, development
  queue, extension-execution-policy, PROGRAM-0005, ISSUE-0410, and ISSUE-0412
  and confirm the control plane now keeps the current released Docker-only
  installed contract explicit while promoting `TRANCHE-016` /
  `ISSUE-0412` as the active direction
- `TEST-DOC-105`: review SRS, RTM, and the test plan and confirm the active
  develop-line installed-user replacement contract is explicit and truthfully
  traced around required LabVIEW version + bitness settings, host-default
  local `LabVIEWCLI`, bounded expert Docker admission through the bare `vihs`
  surface, explicit compare preflight, panel + warning fail-closed behavior,
  and the Windows exact-runtime-selection fail-closed behavior retained under
  `VHS-REQ-532`
- `TEST-GATE-001`: run `npm run design:gate` and retain the latest design-gate
  report artifacts under `.cache/design-gate/`
- `TEST-GATE-002`: run `npm run design:gate` and retain weakest-source
  coverage focus plus a deterministic next-focus cue in the latest design-gate
  report

## Reporting

- CI artifacts: `coverage/`
- Test report location: Vitest console output plus coverage summary
- Defect tracking link: GitLab issues in this repository
