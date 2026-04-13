# ISSUE-0408: Repeatable Benchmark Proof

## Goal

Turn the current Windows and Linux benchmark scaffolding into one governed,
repeatable benchmark-proof packet for the deep `HARNESS-VHS-002` /
`resource/plugins/lv_icon.vi` target.

This issue exists so benchmark truth has its own bounded closure path instead
of remaining mixed into the public-release acceptance program.

The current governed debt items for this issue are tracked in
`docs/product/debt-ledger.json` under the debt-retirement contract.

## Status

Closed on bounded post-release benchmark truth.

Closure basis:

- `TRANCHE-011` is now done on the accepted `129`-commit / `128`-pair
  comparable-prefix packet
- the current governed Windows benchmark-image contract remains bounded at pair
  `129` as an accepted current-contract exception
- a fresh governed canonical-host Linux rerun on `2026-04-06` still failed at
  pair `135/138` as
  `labview-cli-connection-failed (linux-headless-recursive-load)` after one
  governed `CloseLabVIEW -Headless` recovery attempt exited `1`

Current retained benchmark truth at closure:

- the deep Linux host benchmark now fails truthfully late at pair `135/138`
  with `labview-cli-connection-failed`
- the retained Linux summary now records
  `terminalPairDiagnosticReason=linux-headless-recursive-load`
- bounded fresh Linux container repros show the same pair does not complete
  under either `LabVIEWCLI` or `LVCompare`
- the runtime now attempts one governed `LabVIEWCLI CloseLabVIEW -Headless`
  session reset plus one retry when that recursive-load diagnosis is retained,
  and the latest full-window benchmark summary now proves that recovery attempt
  still exited `1` before the retry
- older retry experiments after timeout degraded into `-350000` connection
  failure instead of recovering the headless session
- a governed comparable-prefix packet now retains the accepted cross-OS
  `129`-commit / `128`-pair timing scope in
  `docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json`
- the authority repo now retains per-pair failure receipts, terminal partial
  summaries, native Linux diagnostic logs, supplemental headless artifacts, a
  surfaced terminal diagnostic reason, and stale-report guards for that lane
- the Windows benchmark image is now published and pullable at
  `ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main`
  after successful publication runs `23993316899`, `23993748337`, and
  `23994505706`
- the authority repo now retains `scripts/runHostWindowsBenchmarkImageProof.js`
  as the canonical-host proof surface for that image; it pulls the published
  GHCR tag, pre-seeds the mounted harness cache from the governed local
  `ni-labview-icon-editor` clone when available, normalizes Git safe-directory
  handling for those mounted clones, respects the active PowerShell execution
  policy instead of using `ExecutionPolicy Bypass`, defaults
  `HARNESS-VHS-002` to the retained `129`-commit comparable prefix unless
  overridden, keeps public proof execution on `runGovernedProof` with
  canonical `CreateComparisonReport`, treats any `LVCompare` evidence as
  retained internal parity-only diagnosis, labels Windows diagnosis progress
  as Windows rather than Linux, and writes launch/log/summary receipts under
  `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-proof`
- the latest local Windows benchmark-image proof now reaches pair `129/134`
  before failing truthfully with `command-exited-nonzero`; the retained
  summary and bounded comparable-prefix packet now retain
  `terminalPairDiagnosticReason=labview-cli-call-by-reference`, the retained
  diagnostic log shows the image established a LabVIEW connection and then hit
  `Error 66 / Call By Reference`, and the older retained canonical-host
  Windows-container proof for pair `129` shows the same connected-session
  diagnosis
- the active Windows image hardening now restores the governed Windows
  `-LabVIEWPath`, forces `LV_RTE_HEADLESS=1`, hardens `LabVIEWCLI.ini`
  startup timeouts, prelaunches headless LabVIEW before benchmark execution
  in line with NI's documented Windows-container guidance, and now attempts
  one governed `LabVIEWCLI CloseLabVIEW -Headless` session reset plus one
  retry for that connected-session `Call By Reference` seam
- retained internal `LVCompare` parity evidence now proves there is no clean
  immediate workaround there either: the published image times out on pair
  `1/129`, retains a failed partial summary under
  `windows-benchmark-image-proof-lvcompare`, and remains characterization-only
- the governed harness report-smoke diagnosis surface now also accepts an
  exact selected/base pair plus explicit runtime timeout, and the targeted
  exact-pair Windows internal `LVCompare` parity rerun on
  `6dd65df -> 3408654` times out after `120000ms` under
  `windows-benchmark-image-pair129-lvcompare`, so the pair-129 ceiling is not
  recoverable through a simple engine swap
- the same exact blocker pair `6dd65df -> 3408654` is now retained under both
  supported Windows engines: `windows-benchmark-image-pair129-labviewcli`
  records `command-exited-nonzero (labview-cli-call-by-reference)` after a
  connected-session retry attempt, `windows-benchmark-image-pair129-lvcompare`
  records `command-timed-out` after the bounded `120000ms` budget, and the
  comparable-prefix packet now carries both exact-pair receipts so future
  sessions do not have to rediscover them from AppData
- those exact-pair receipts are now admitted by retained execution-surface
  truth rather than proof-root naming alone: the packet searches the live and
  archived `.prev-*` smoke receipts under each exact-pair root, selects the
  latest receipt that still proves the governed Windows benchmark-image
  surface through retained `C:\workspace\.cache` clone/artifact paths and,
  when available, `C:\Users\ContainerAdministrator\...` diagnostic-log
  sources, and records rejected latest reruns separately if they no longer
  prove that surface
- those same exact-pair `comparison-report-smoke` receipts now also retain
  `executionSurfaceContext` plus `executionSurfaceMarkers` when those retained
  markers prove the governed Windows benchmark-image surface, so later packet
  refresh no longer depends only on path archaeology
- the comparable-prefix packet now also derives an explicit blocker
  characterization from those same exact-pair receipts, so the retained
  Windows ceiling is carried as `mixed-bitness-call-by-reference-seam` when
  the `labview-cli` receipt proves x86 `LabVIEWCLI.exe` against the x64
  headless-reset `LabVIEW.exe` target
- a fresh governed repo-local exact-pair rerun now retains that same
  Windows-image surface explicitly: the authority repo `.cache`
  `comparison-report-smoke.json` now carries
  `runtimeLabviewIniPath=C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.ini`
  plus `runtimeLabviewTcpPort=3363`, and a direct probe of
  `nationalinstruments/labview:2026q1-windows` plus the retained
  `latest-runtime-surface.json` summary now confirm that the current governed
  image contract exposes x64 `LabVIEW.exe`, x86 `LabVIEWCLI.exe`, x64
  `LVCompare.exe`, and no coherent same-bitness `labview-cli` bundle, which
  strengthens the pair-129 ceiling from a generic Windows-call-by-reference
  symptom into an accepted bounded exception for the current governed image
  contract
- the governed `CloseLabVIEW -Headless` recovery posture now also retains
  dedicated `headless-session-reset-stdout.txt` and
  `headless-session-reset-stderr.txt` artifacts plus the reset exit code in
  the comparison-report packet, so the next Linux or Windows blocker rerun can
  inspect the reset attempt itself instead of only a retry note
- the exact Windows blocker-pair `comparison-report-smoke.json` / `.md` /
  `.html` surfaces now retain those same recovery facts too, and the retained
  Windows `labview-cli` exact-pair rerun proves the failed reset itself exited
  `1` with `-350000` connection-failure stderr before the retry
- after clearing a stale non-headless host `LabVIEW.exe` session and forcing a
  true host-native rerun with `--bitness x86`, the same exact pair
  failed differently as `provider=host-native` plus `command-timed-out`,
  observed `LabVIEWCLI.exe` without `LabVIEW.exe`, and retained only the x86
  LabVIEW path in the CLI log, so native-host Windows proof remains sensitive
  to multiple installed LabVIEW versions and VI Server session state
- with `VHS-REQ-448`, that same host-native x86 rerun now retains
  `runtimeLabviewIniPath=C:\Program Files (x86)\National Instruments\LabVIEW 2026\LabVIEW.ini`
  plus `runtimeLabviewTcpPort=3364` and passes `-PortNumber 3364` explicitly,
  yet it still times out after `120000ms` while observing only
  `LabVIEWCLI.exe`, so explicit port derivation narrowed the seam but did not
  close the Windows host blocker
- one more canonical host-native rerun under `LV_RTE_HEADLESS=1` now also
  retains bare `-Headless` in the governed runtime args, but it still times
  out after `120000ms` while only `LabVIEWCLI.exe` is observed and
  `LabVIEW.exe` never appears, so explicit headless mode is not the missing
  native-host Windows ingredient either
- `VHS-REQ-449` now governs canonical exact-pair diagnosis arguments, so
  incomplete selected/base hash bundles, incomplete canonical
  `CreateComparisonReport` override bundles, wrong executable basenames, and
  Windows bitness/path contradictions are rejected before they can contaminate
  retained benchmark blocker evidence
- `VHS-REQ-450` now governs canonical Windows host proof hygiene too: explicit
  Windows runtime override paths must exist before a targeted rerun starts,
  host-native Windows comparison execution now blocks before launch when stale
  `LabVIEW.exe` / `LabVIEWCLI.exe` / `LVCompare.exe` sessions or a
  preexisting listener on the selected `LabVIEW.ini`-derived VI Server port
  would contaminate the rerun, and the current canonical machine is now
  documented as exposing only the x86 `LabVIEWCLI.exe` path locally even
  though both x86 and x64 `LabVIEW.exe` / `LVCompare.exe` paths exist
- `VHS-REQ-451` now governs shared PROGRAM-0003 admission control: the one
  public `runGovernedProof` surface and its `dashboard-smoke`,
  `decision-record`, `report-smoke`, `benchmark-linux`, and
  `benchmark-windows` subcommands now share one canonical proof-admission
  validation layer for explicit runtime override bundles, so contradictory
  explicit runtime bundles are rejected before they can contaminate retained
  benchmark blocker evidence
- `VHS-REQ-452` now governs canonical Windows bundle coherence too: explicit
  Windows runtime override bundles now fail closed only when they contradict
  the selected runtime bitness, while the canonical x86 `LabVIEWCLI.exe`
  plus x64 `LabVIEW.exe` bundle is admitted when that x64 LabVIEW 2026
  surface is the selected governed host runtime
- `VHS-REQ-457..458` now govern the effective proof-admission bundle too:
  governed proof subcommands validate the effective runtime bundle after CLI
  arguments, environment variables, and subcommand-local defaults are
  resolved, and the Windows benchmark path no longer injects hidden explicit
  Windows executable defaults when no explicit override was requested
- `VHS-REQ-476` now governs contaminated Windows benchmark-image reruns too:
  a fresh canonical-host proof attempt that started with stale non-headless
  host `LabVIEW.exe` plus a preexisting governed VI Server listener exposed a
  false-green seam where every prepared pair remained
  `runtimeExecutionState=not-available` even though the retained summary still
  looked completed; the Windows benchmark summary now fails closed on any
  retained `not-available` pair, surfaces the blocked reason such as
  `windows-host-runtime-surface-contaminated`, marks the run
  `characterization-only`, snapshots immutable per-run `dashboard-smoke`
  artifacts beside the timestamped run summary, and keeps future
  comparable-prefix packet derivation on the latest eligible proof instead of
  trusting only mutable `latest-summary.json` and `dashboard-smoke.json`
- out-of-scope alternative Windows x86 provisioning may exist through slower
  NI Package Manager plus ISO installation, but that is a different contract
  and does not reopen the accepted current-contract pair-129 ceiling
- while refreshed benchmark images republish, the active follow-on proof move
  is now retained explicitly too: `runGovernedProof host-operation-matrix`
  inventories the installed Windows LabVIEWCLI operations from
  `C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\Operations`,
  runs the LabVIEW 2026 x64 tranche first and gates the x86 tranche until the
  x64 tranche completes cleanly in the same governed run, retains pre-run and
  post-run contamination truth for every case, uses the local
  canonical `labview-ci-cd/actions/VICompareTooling` tree for the
  `PrintToSingleFileHtml` additional operation while still allowing approved
  sample fixtures for the fixture-backed operations,
  and keeps `CreateComparisonReport` gated until the simpler host operations
  are exercised first
- that follow-on host lane now also retains a materially narrower seam than
  the old Linux-only wording implied: the host-operation matrix now uses the
  retained foreground PowerShell `LabVIEWCLI` path instead of the older
  background sidecar wrapper, the fresh warm-headless x64-then-x86 ledger proves
  `ExecuteBuildSpec`, `MassCompile`, `RunVI`, `RunVIAnalyzer`, and
  `PrintToSingleFileHtml` succeed cleanly on both admitted LabVIEW 2026 host
  surfaces, x64 `CloseLabVIEW -Headless` now succeeds too, x86
  `CloseLabVIEW -Headless` still leaves both `LabVIEW.exe` and
  `LabVIEWCLI.exe` hot until diagnostic cleanup, and `RunUnitTests` on both
  bitness surfaces exits `1` with `-350053` missing/bad operation files; so
  the retained canonical-host blocker is now bounded as an x86
  `CloseLabVIEW` session-close seam plus a cross-bitness `RunUnitTests`
  operation-admission failure rather than a broad cold/warm attach stall

## Scope

- deep Linux benchmark failure closure
- local proof of the published Windows benchmark image
- comparative benchmark packet for the Windows host, Windows image, and Linux
  image lanes
- control-plane normalization of the accepted benchmark result

## Non-Goals

- closing the public-release human UX gate
- changing the public facade repo scope
- treating private GitHub experiment results as product authority
- feature expansion unrelated to benchmark proof

## Dependencies

- canonical Windows host baseline evidence
- published Linux and Windows benchmark images
- retained benchmark consumers and failure receipts
- `PROGRAM-0003` and `TRANCHE-011`

## Acceptance Criteria

- Linux either completes the deep `138/138` benchmark truthfully or the repo
  retains the accepted bounded `129`-commit / `128`-pair comparable prefix
  plus the explicit full-window blocker rationale
- the published Windows benchmark image is proven locally on the canonical host
- one comparative benchmark packet exists with explicit comparability outcome
- `current-state`, `README`, queue docs, and benchmark docs reflect the result

## Required Evidence

- retained Linux terminal summary and diagnostics
- retained Windows benchmark-image terminal summary
- retained Windows benchmark-image runtime-surface summary
- retained comparative benchmark packet
- updated control-plane docs and design-gate pass

## Final Closure Slice

- consume the retained Linux pair `135/138` failure evidence
- preserve the Linux headless-runtime blocker as governed benchmark truth
- retain and normalize the accepted `129`-commit / `128`-pair comparable prefix
- hold the current governed Windows benchmark image contract at its accepted
  pair-129 ceiling unless the contract itself changes
- stop short of claiming full comparability until both image lanes have
  truthful terminal summaries, and close the issue once the bounded Linux
  blocker is explicit instead of implied
