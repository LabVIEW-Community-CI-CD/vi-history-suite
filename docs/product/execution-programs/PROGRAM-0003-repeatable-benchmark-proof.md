# PROGRAM-0003: Repeatable Benchmark Proof

## Status

Closed on bounded post-release benchmark truth.

Closure is intentionally explicit:

- the accepted cross-OS comparable prefix remains `129` commits / `128` pairs
- the current governed Windows benchmark-image contract remains bounded at pair
  `129` as an accepted current-contract exception
- a fresh governed canonical-host Linux rerun on `2026-04-06` still failed at
  pair `135/138` as
  `labview-cli-connection-failed (linux-headless-recursive-load)` after one
  governed `CloseLabVIEW -Headless` recovery attempt exited `1`
- `TRANCHE-011` is now done; reopen this program only if the governed Windows
  or Linux benchmark contracts change enough to justify a new benchmark-proof
  closure decision

## Purpose

Define the governed benchmark-proof program that turns the current benchmark
scaffolding into repeatable comparative evidence for the deep
`HARNESS-VHS-002` / `resource/plugins/lv_icon.vi` target.

This program separates benchmark truth from public-release acceptance truth so
the remaining Sergio-owned host-machine UX gate can close without silently
owning all later benchmark work.

Open and retired benchmark-proof debt for this program is governed separately
through `docs/product/debt-ledger.json` under the debt-retirement contract.

## North Star

One governed comparative benchmark packet proves the same deep-history target
across three explicit proof surfaces:

- the canonical Windows host baseline
- the repeatable Windows benchmark image baseline
- the Linux benchmark image lane

The result must retain explicit comparability status instead of mixing partial
timings, human UX truth, and characterization-only runs into one blurred
control-plane claim.

## Authority And Trust Boundary

### Product And Queue Truth

- private GitLab source repo and control plane
- `docs/product/development-queue.json`
- [PROGRAM-0003](./PROGRAM-0003-repeatable-benchmark-proof.md)
- [ISSUE-0408](../issues/ISSUE-0408-repeatable-benchmark-proof.md)

### Benchmark Truth

- canonical Windows host baseline for the deep target
- published Windows benchmark image for repeatable Windows proof
- Linux benchmark image and retained diagnostics for comparative proof

### Explicit Boundaries

- benchmark truth does not close the public-release human UX gate
- the private GitHub experiment mirror remains benchmark evidence only
- the public GitHub facade repo remains public release/setup/support only
- hosted Windows benchmark execution remains not-yet-governed until local host
  proof exists

## Workstreams

1. retain the late Linux `135/138` blocker truth and promote the accepted
   cross-OS comparable prefix
2. prove the published Windows benchmark image locally on the canonical host
3. produce the governed comparative benchmark packet and normalize it into the
   control plane

The repo-side proof entrypoint for workstream 2 is
`scripts/runHostWindowsBenchmarkImageProof.js`. Until the full Linux deep
window becomes comparable, that runner defaults the Windows image proof to the
retained `HARNESS-VHS-002` comparable-prefix packet rather than silently
claiming the blocked full window, and it pre-seeds the mounted harness cache
from the governed local `ni-labview-icon-editor` clone when that clone is
available on the canonical host while normalizing Git safe-directory handling
for those mounted clones before the image entrypoint runs and respecting the
active PowerShell execution policy instead of using `ExecutionPolicy Bypass`.
The active
Windows-image hardening also restores the governed Windows `-LabVIEWPath`,
forces `LV_RTE_HEADLESS=1`, hardens `LabVIEWCLI.ini` startup timeouts, and
prelaunches headless LabVIEW before benchmark execution so the published image
tracks NI's documented Windows-container startup posture instead of a bare
first-launch `LabVIEWCLI` invocation. Public proof execution now stays behind
`runGovernedProof` with canonical `CreateComparisonReport`; retained
`LVCompare` evidence remains internal parity-only diagnosis rather than a
public engine-selection surface. The latest retained local proof now
reaches pair `129/134` before retaining a connected-session `Error 66 / Call
By Reference` seam, and the runtime now attempts one governed
`LabVIEWCLI CloseLabVIEW -Headless` session reset plus one retry for that
seam before terminal failure is retained. The bounded comparable-prefix packet
and Windows benchmark summary now retain that seam explicitly as
`labview-cli-call-by-reference`, and the older retained canonical-host
Windows-container proof for pair `129` shows the same connected-session
diagnosis. Shared dashboard-smoke progress now labels Windows reruns as
Windows rather than Linux. Retained internal `LVCompare` parity evidence on
the published Windows image still times out immediately at pair `1/129`, so
that parity lane is not currently a viable Windows workaround for the pair-129
`labview-cli-call-by-reference` seam. The governed `runGovernedProof
report-smoke` surface now also accepts an exact selected/base hash pair plus
explicit runtime timeout, and the targeted exact-pair internal `LVCompare`
parity rerun on `6dd65df -> 3408654` likewise times out after `120000ms`,
which strengthens the conclusion that Windows pair `129` is not recoverable
through a simple engine swap. The same exact blocker pair
`6dd65df -> 3408654` is now retained under both supported internal engines:
`windows-benchmark-image-pair129-labviewcli` records
`command-exited-nonzero (labview-cli-call-by-reference)`,
`windows-benchmark-image-pair129-lvcompare` records `command-timed-out`, and
the comparable-prefix packet now retains both exact-pair receipts alongside
the accepted `129`-commit / `128`-pair timing scope.
Those exact-pair receipts are no longer admitted by proof-root naming alone:
the packet now searches both the live and archived `.prev-*` smoke receipts
under each exact-pair root, selects the latest receipt that still proves the
governed Windows benchmark-image surface through retained `C:\workspace\.cache`
clone/artifact paths and, when available, `C:\Users\ContainerAdministrator\...`
diagnostic-log sources, and records rejected latest reruns separately if they
no longer prove that surface.
Those retained `comparison-report-smoke` receipts now also persist
`executionSurfaceContext` plus `executionSurfaceMarkers` when those retained
markers prove that governed surface, so later packet refresh no longer depends
only on path inference.
The comparable-prefix packet now also derives an explicit blocker
characterization from those same exact-pair receipts, so the current Windows
ceiling is retained as `mixed-bitness-call-by-reference-seam` when the
`labview-cli` exact-pair evidence proves x86 `LabVIEWCLI.exe` against the x64
headless-reset `LabVIEW.exe` target.
The latest governed repo-local exact-pair rerun now retains that same
Windows-image surface explicitly too: the authority repo `.cache`
`comparison-report-smoke.json` now carries
`runtimeLabviewIniPath=C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.ini`
plus `runtimeLabviewTcpPort=3363`, and a direct probe of
`nationalinstruments/labview:2026q1-windows` shows that image exposes x64
`LabVIEW.exe`, x86 `LabVIEWCLI.exe`, x64 `LVCompare.exe`, and no coherent
same-bitness `labview-cli` bundle. The governed host proof runner now also
retains that image-contract summary as `latest-runtime-surface.json` under the
Windows benchmark-image proof root. So the active pair-129 ceiling is now
governed as a connected-session mixed-surface Windows image seam, not just a
missing retained argument or stale host contamination artifact.
That does not mean Windows x86 in containers is universally impossible.
Out-of-scope alternative provisioning may exist through slower NI Package
Manager plus ISO installation, but that is a different contract and does not
reopen the accepted ceiling for the current governed image recipe.
Recovery attempts are also now retained more truthfully: when Linux or Windows
invokes the governed `CloseLabVIEW -Headless` reset path, the packet keeps the
reset command, exit code, and dedicated `headless-session-reset-stdout.txt` /
`headless-session-reset-stderr.txt` artifacts rather than reducing that step
to free-form notes alone.
That exact-pair Windows `labview-cli` diagnosis is now visible without opening
raw hashed metadata: the derived `comparison-report-smoke.json` / `.md` /
`.html` surfaces retain `headlessSessionResetExitCode=1`, the reset
stdout/stderr artifact paths, and the comparable-prefix packet renders those
same recovery facts, including the retained `-350000` connection-failure stderr
from the failed `CloseLabVIEW -Headless` reset before the retry.
After clearing a stale non-headless host `LabVIEW.exe` session and forcing a
true host-native rerun with `--bitness x86`, the same exact pair failed
differently as a host-native `command-timed-out` run that observed
`LabVIEWCLI.exe` without `LabVIEW.exe` and retained only the x86 LabVIEW path
in the CLI log. That means stale host state mattered, but it was not the whole
story: native-host Windows proof remains sensitive to multiple installed
LabVIEW versions and VI Server session state in a way the image proof is not.
With `VHS-REQ-448`, that same native-host x86 exact-pair rerun now retains the
selected `LabVIEW.ini` path and explicit VI Server TCP port
(`runtimeLabviewIniPath=C:\Program Files (x86)\National Instruments\LabVIEW 2026\LabVIEW.ini`,
`runtimeLabviewTcpPort=3364`) and passes `-PortNumber 3364` explicitly, yet it
still times out after `120000ms` while only `LabVIEWCLI.exe` is observed. So
port drift is now a governed narrowed seam, but it is not sufficient by itself
to solve the Windows host blocker.
One more canonical host-native rerun under `LV_RTE_HEADLESS=1` now retains
bare `-Headless` in the governed `runtimeArgs`, but it still times out after
`120000ms` while only `LabVIEWCLI.exe` is observed and `LabVIEW.exe` never
appears. So explicit headless mode narrows the native-host Windows seam
further, but it still does not convert the host x86 proof into the connected
image-like failure shape.
To keep future exact-pair experiments from contaminating retained blocker
evidence, `VHS-REQ-449` now governs canonical diagnosis arguments:
`runGovernedProof report-smoke` rejects incomplete selected/base hash bundles,
incomplete canonical `CreateComparisonReport` override bundles, wrong
executable basenames, and Windows bitness/path contradictions before a
targeted rerun can start.

`VHS-REQ-450` now governs the canonical Windows host runtime surface too:
explicit Windows proof-admission runtime paths must exist before the rerun
starts, and host-native Windows comparison execution now fails closed when
preflight detects stale `LabVIEW.exe` / `LabVIEWCLI.exe` / `LVCompare.exe`
sessions or a preexisting listener on the selected `LabVIEW.ini`-derived VI
Server port.
That same proof tightening also makes the current host capability explicit:
only the x86 `LabVIEWCLI.exe` path exists locally on the canonical machine,
while both x86 and x64 LabVIEW 2026 runtime paths exist. The governed host
bundle is therefore the canonical x86 CLI plus the selected x86 or x64
`LabVIEW.exe` surface rather than a same-bitness CLI requirement.

`VHS-REQ-451` lifts canonical proof-admission validation for explicit
proof-admission override bundles into a shared PROGRAM-0003 admission layer
rather than keeping it trapped inside
`runGovernedProof report-smoke` alone. The one public `runGovernedProof`
surface and its `dashboard-smoke`, `decision-record`, `report-smoke`,
`benchmark-linux`, and `benchmark-windows` subcommands now reject
contradictory proof-admission bundles before they can generate retained
evidence.

`VHS-REQ-452` tightens that shared admission layer further on Windows:
explicit Windows proof-admission runtime paths now fail closed only when they
contradict the selected runtime bitness. The canonical x86 `LabVIEWCLI.exe`
plus x64 `LabVIEW.exe` bundle is admitted when that x64 LabVIEW 2026 surface
is the selected governed host runtime.

While refreshed benchmark images republish, the next governed PROGRAM-0003
move is now explicit too: run the retained `runGovernedProof
host-operation-matrix` lane against the canonical Windows host, inventory the
installed LabVIEWCLI operations from
`C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\Operations`,
exercise the LabVIEW 2026 x64 host tranche first and gate the x86 tranche
until that x64 tranche completes cleanly in the same governed run, retain
pre-run and post-run contamination truth on every case, use the
local canonical `labview-ci-cd/actions/VICompareTooling` tree for the
`PrintToSingleFileHtml` additional operation while still allowing approved
sample fixtures for the fixture-backed operations,
and keep `CreateComparisonReport` gated until those simpler host operations
have been exercised first.
Fresh canonical-host evidence on `2026-04-14` now retains the next blocker
more strictly than the older `2026-04-06` warm-headless ledger. The governed
host-operation matrix still runs `LabVIEWCLI` through the retained foreground
PowerShell path, but the fresh cold-only receipt at
`.cache/governed-proof/windows-host-operation-matrix/2026-04-14T07-59-35-969Z/host-operation-matrix.json`
proves that every x64 cold prerequisite case now leaves `LabVIEWCLI.exe` hot
long enough to retain `post-run-runtime-surface-contaminated`, even though the
runner cleans the host surface again afterward. That means the x64 tranche no
longer completes cleanly under cold attach, and the same governed run
correctly gates the x86 tranche as `x64-tranche-did-not-complete-cleanly`.
So the active canonical-host seam is now the x64 cold-attach contamination
path; the older warm-headless x64 success and x86 `CloseLabVIEW` /
`RunUnitTests` seams remain useful historical evidence, but they are not the
newest admission truth. The host-operation matrix therefore still keeps
`CreateComparisonReport` gated behind the fresh x64 cold-host blocker instead
of reopening report admission prematurely.
Fresh direct canonical-host report proof on that same date now retains the
bundle-specific blocker more explicitly in the tracked packet
`docs/product/benchmark-packets/HARNESS-VHS-001-windows-host-create-comparison-proof-2026-04-14.md`
plus the raw governed roots
`.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x64/`
and `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x86/`.
Both supported host bundles reached canonical `CreateComparisonReport`
execution, derived explicit VI Server ports (`3363` for x64 and `3364` for
x86), observed only `LabVIEWCLI.exe` at the retained banner snapshot, retained
no LabVIEW-related processes at exit, and still timed out after `120000ms`
without a generated report. So `VHS-REQ-548` is now satisfied as exact bounded
blocker retention for both supported bundles, not only as prerequisite gating.

`ADR-0024` plus `VHS-REQ-457..458` now tighten that PROGRAM-0003
proof-admission layer one step further: governed proof subcommands validate
the effective proof-admission bundle after CLI arguments, environment
variables, and subcommand-local defaults have been resolved, and the Windows
benchmark CLI no longer injects hidden explicit Windows executable defaults
when no explicit override was requested.

`VHS-REQ-476` closes a separate Windows benchmark-proof contamination seam that
the latest canonical-host rerun exposed. With stale non-headless host
`LabVIEW.exe` plus a preexisting governed VI Server listener still open, the
Windows benchmark image left every prepared pair at
`runtimeExecutionState=not-available` and initially looked completed because
the summary only counted generated and failed pairs. The Windows benchmark
summary now fails closed on any retained `not-available` pair, surfaces the
blocked reason such as `windows-host-runtime-surface-contaminated`, marks the
run `characterization-only`, snapshots immutable per-run `dashboard-smoke`
artifacts beside the timestamped run summary, and keeps future
comparable-prefix packet derivation on the latest eligible proof instead of
trusting only mutable `latest-summary.json` and `dashboard-smoke.json`.

Current retained Linux full-window blocker at closure:

- a fresh governed canonical-host rerun on `2026-04-06` still failed at pair
  `135/138` under the proper host/AppData path
- the retained Linux summary now records
  `terminalPairFailureReason=labview-cli-connection-failed`
- the retained Linux summary and pair-failure receipt still classify the late
  blocker as `linux-headless-recursive-load`
- the retained diagnostic notes now also state that LabVIEW CLI launched or
  reused a headless LabVIEW session before the required VI Server connection
  failed
- one governed `LabVIEWCLI CloseLabVIEW -Headless` session reset was attempted
  and exited `1` before the retry
- bounded fresh Linux container repros and prior manual pair-135 diagnostics
  still support the same late full-window blocker
- a governed comparable-prefix packet now retains the accepted cross-OS
  `129`-commit / `128`-pair scope in
  `docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json`

## Queue Mapping

- `TRANCHE-011`
  - `ISSUE-0408`

## Exit Gates

### Gate A: Linux Deep Benchmark Completion

- either:
  - the deep Linux `HARNESS-VHS-002` benchmark completes `138/138`
  - or the retained comparable-prefix packet remains the accepted cross-OS
    benchmark scope with an explicit full-window blocker rationale
- Linux retains terminal summary, pair receipts, and native diagnostics
- Linux retains supplemental headless artifacts and terminal diagnostic
  reasons when a pair fails or times out
- the accepted comparable scope is explicit:
  - full window when Linux completes
  - bounded prefix when the retained NI Linux blocker remains open

### Gate B: Windows Benchmark-Image Proof

- the published Windows benchmark image is pullable by contract
- the image runs locally on the canonical Windows host with Windows containers
- the host proof is launched through the governed runner at
  `scripts/runHostWindowsBenchmarkImageProof.js`, which retains launch/log
  receipts, the mounted benchmark summary, and the current-contract
  `latest-runtime-surface.json` under the canonical AppData proof root
- one retained deep `HARNESS-VHS-002` summary exists from the image lane
- the retained runtime-surface summary proves whether the current governed
  image contract exposes a coherent same-bitness `labview-cli` bundle

### Gate C: Comparative Benchmark Packet

- one governed comparison exists across:
  - Windows host baseline
  - Windows benchmark-image baseline
  - Linux benchmark-image result
- the packet states whether the three surfaces are comparable, partially
  comparable, or characterization-only

### Gate D: Control-Plane Normalization

- `current-state`, `README`, `harnesses`, queue docs, requirements, RTM, and
  test plan reflect the accepted benchmark truth
- future sessions can discover the benchmark result without chat history

## Delivery Rules

Every slice in this program must move together:

- retained benchmark evidence
- benchmark control-plane docs
- requirements and traceability when benchmark behavior changes
- image/workflow contracts
- result-consumer tooling
- design-gate evidence

No timing claim is allowed to outrun its retained evidence.

## First Implementation Slice

Start with [ISSUE-0408 Repeatable Benchmark Proof](../issues/ISSUE-0408-repeatable-benchmark-proof.md).

That slice should:

- finish the late Linux failure diagnosis with retained evidence
- retain and normalize the bounded `129`-commit / `128`-pair comparable prefix
- hold the published Windows benchmark image as an accepted bounded current-contract
  ceiling at pair `129` unless the governed image contract itself changes
- stop short of claiming final comparability until both image lanes retain
  truthful terminal summaries

## Success Condition

This program is complete when `vi-history-suite` can point to one governed
comparative benchmark packet for the accepted `lv_icon.vi` timing scope, with
retained evidence from the Windows host, Windows benchmark image, and Linux
benchmark image, and with the comparability outcome normalized into the repo
control plane.
