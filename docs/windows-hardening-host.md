# Windows Hardening Host — Provisioning Checklist (VHS-REQ-713)

This is the reproducible provisioning procedure for the **real Windows hardening
host** that validates the `vi-history-suite` comparison runtime across the full
LabVIEW version × bitness grid (2020/2025/2026 × x86/x64) **and** both Docker
container modes (Linux and Windows containers). It closes the gap left by the
single Vagrant x86/2026 track (which stays a separate machine — see
[docs/vagrant.md](./vagrant.md) — and is **not** replaced by this host). It
supersedes the closed **#1316** (Windows host-native + windows-container +
bitness matrix).

> This host uses **Docker**; Docker and Vagrant/VirtualBox contend for the
> hypervisor, so this host does **not** run the Vagrant release-attestation box
> (VHS-REQ-666). Docker Desktop **switches** between Linux and Windows container
> modes (they are switchable, never concurrent).

## Content digest

The machine-readable provisioning descriptor is the fenced block delimited by
`provisioning-descriptor:begin` / `:end` below. Its content digest binds this
checklist to an exact host shape, mirroring the Vagrant box attestation pattern
(`vagrant/box-manifest.json`).

- Descriptor schema: `vi-history-suite/windows-hardening-host@v1`
- Descriptor SHA-256: `424f0dc9d383c842f9356ffdeb33bf3a4c8577394395aeb4896727c43cc1768b`

Recompute the digest after editing the descriptor block (from the repo root):

```powershell
node -e "const fs=require('fs');const t=fs.readFileSync('docs/windows-hardening-host.md','utf8');const m=t.match(/provisioning-descriptor:begin -->\r?\n([\s\S]*?)\r?\n<!-- provisioning-descriptor:end/);const b=m[1].replace(/\r\n/g,'\n');console.log(require('crypto').createHash('sha256').update(b,'utf8').digest('hex'));"
```

## Part A — Provision the environment

### A1. Docker Desktop (both container modes)

1. Install Docker Desktop for Windows.
2. Enable **Linux containers** (WSL2 backend) and confirm **Windows containers**
   mode works (tray → *Switch to Windows containers*). Prefer **Hyper-V
   isolation** for Windows containers; Windows-container process isolation needs
   a matching host build (Windows Server 2022 / `ltsc2022`-compatible base).
3. Verify the daemon-mode probe the product itself uses (VHS-REQ-649/650):
   `docker info --format "{{.OSType}}"` returns `linux` in Linux mode and
   `windows` after switching.
4. Pull-test each mode:
   - Linux mode: `docker pull nationalinstruments/labview:2026q1-linux`
   - Windows mode: `docker pull nationalinstruments/labview:2026q1-windows`
   - Also `2025q3-linux` / `2025q3-windows`.
   - **LabVIEW 2020 has no container image** (NI tags are year-quarter, e.g.
     `2025q3`, `2026q1`); 2020 is **host-native only**.

### A2. Host-native LabVIEW grid (six installs)

Install each LabVIEW with its **LabVIEW CLI** and a **distinct VI Server port**
(`server.tcp.port` in that install's `LabVIEW.ini`) so port-admission and
multi-install selection are exercised (the matrix self-derives the expected port
from each install's `LabVIEW.ini`):

| Version | x86 (32-bit) | x64 (64-bit) |
|---|---|---|
| 2020 | `C:\Program Files (x86)\National Instruments\LabVIEW 2020` | `C:\Program Files\National Instruments\LabVIEW 2020` |
| 2025 | `C:\Program Files (x86)\National Instruments\LabVIEW 2025` | `C:\Program Files\National Instruments\LabVIEW 2025` |
| 2026 | `C:\Program Files (x86)\National Instruments\LabVIEW 2026` | `C:\Program Files\National Instruments\LabVIEW 2026` |

Prefer **LabVIEW Community** (free; same features as Professional) wherever
licensing allows. If a cell genuinely does not exist (NI dropped 32-bit for a
year), record it **N/A** in the evidence — that is not a gap.

> **Known runtime finding (2020 host-native compare):** comparison reports are
> currently gated to LabVIEW **2025 or newer**
> (`MINIMUM_COMPARISON_REPORT_LABVIEW_YEAR` in
> [src/reporting/runtime/labviewVersionSelection.ts](../src/reporting/runtime/labviewVersionSelection.ts)).
> A host-native **2020** *comparison* is therefore rejected end-to-end today.
> The runtime-conflict matrix still exercises 2020 as a **selected** version, but
> real-hardware validation (#2338/#2340) confirmed the minimum-year gate fires
> **first, across every family**: selecting 2020 in a `bitness`, `version`,
> `match`, or `port` row is blocked as
> `labview-version-unsupported-for-comparison-report` before any bitness/version
> conflict or admit/port check is reached. So every selected-2020 row asserts the
> unsupported reason (and is not a bitness/version conflict or admit/port
> validation); only supported-selected (2025/2026) rows assert those. Lowering
> the minimum to admit a real 2020 `CreateComparisonReport` is a product change
> that must be validated on this
> host before it ships, not assumed.

### A3. Repo + fixture setup

```powershell
git clone https://github.com/LabVIEW-Community-CI-CD/vi-history-suite C:\repos\vi-history-suite
cd C:\repos\vi-history-suite
git checkout develop
npm ci
npm run compile
git clone https://github.com/ni/labview-icon-editor C:\repos\ni\labview-icon-editor
```

## Part B — Run the validation matrix

All drivers run **from the repo root after `npm run compile`** (they load
`.\out`). Evidence lands under `win-validation\` (gitignored). Fixture:
`resource/plugins/lv_icon.vi`, base `5376833`, selected `fc09736`.

### B1. Host-native compare — the present cells

Use [scripts/windows-compare-driver.cjs](../scripts/windows-compare-driver.cjs)
once per cell (env-var contract in its header). Example (host-native x64 2026):

```powershell
$env:WIN_REPO_ROOT='C:\repos\ni\labview-icon-editor'
$env:WIN_VI_PATH='resource/plugins/lv_icon.vi'
$env:WIN_BASE='5376833'; $env:WIN_SELECTED='fc09736'
$env:WIN_PROVIDER='host'; $env:WIN_LV_VERSION='2026'; $env:WIN_LV_BITNESS='x64'
$env:WIN_LABEL='WB-host-2026-x64'
node scripts/windows-compare-driver.cjs
```

Repeat for `WIN_LV_VERSION` in {2025, 2026} × `WIN_LV_BITNESS` in {x86, x64}.
Expect `runtimeState=succeeded`, `reportExists=true`. For 2020 see the runtime
finding above.

### B2. Docker container compare — Linux and Windows

```powershell
# Linux mode
$env:WIN_PROVIDER='docker'; $env:WIN_LV_BITNESS='x64'
$env:WIN_CONTAINER_IMAGE='nationalinstruments/labview:2026q1-linux'
$env:WIN_LABEL='WC-linux-2026'; node scripts/windows-compare-driver.cjs
# Switch Docker to Windows containers, then:
$env:WIN_CONTAINER_IMAGE='nationalinstruments/labview:2026q1-windows'
$env:WIN_LABEL='WC-windows-2026'; node scripts/windows-compare-driver.cjs
```

Also do `2025q3-linux` / `2025q3-windows`. `docker` requires **x64** (there is
no x86 container).

### B3. Runtime-conflict matrix (no VS Code needed)

The matrix driver
[scripts/runWindowsRuntimeMatrix.js](../scripts/runWindowsRuntimeMatrix.js) is a
**30-row scenario manifest** (VHS-REQ-713) across four families:

| Family | Rows | Host vs Selected | Expected `runtimeBlockedReason` |
|---|---|---|---|
| `bitness` | 6 | same year, opposite bitness | `windows-host-bitness-conflict` (supported selected year) |
| `version` | 12 | same bitness, different year (both directions) | `windows-host-version-conflict` (supported selected year) |
| `match` | 6 | host == selected, enforced default VI Server port | `none` (supported selected year) |
| `port` | 6 | host == selected, enforced non-default port derived from the selected ini | `none` (supported selected year) |

> **Selected-year floor (#2338/#2340):** the comparison-report minimum-year gate
> fires before any family's conflict/admit check, so **any** row whose *selected*
> year is below 2025 (every selected-2020 row, across all four families) is
> reclassified to expect `labview-version-unsupported-for-comparison-report` and
> is not treated as a conflict or admit/port validation. Confirmed on real
> hardware for `bitness`/`version`/`match`/`port` 2020 rows.

```powershell
# Full grid (30 rows):
node scripts/runWindowsRuntimeMatrix.js --scenario all
# Lighter CI tier (curated subset: every cell in at least one conflict + one admit):
node scripts/runWindowsRuntimeMatrix.js --scenario light
# A single cell or a legacy alias still works:
node scripts/runWindowsRuntimeMatrix.js --scenario bitness-2026-x64x86
node scripts/runWindowsRuntimeMatrix.js --scenario steady-A
```

Legacy ids `steady-A`/`steady-B`/`version-A`/`version-B`/`port-A` resolve to
their canonical manifest row so existing prompts and dispatch keep working. The
harness launches/stops the correct Host install per row and asserts the expected
blocked reason from a real `vihs --validate --proof-out` proof.

Because a `match` row and the `port` row for the same year/bitness share one
install's `LabVIEW.ini`, the helper **arranges the requested port mode per
scenario** — it backs up that ini, then for `match` **removes** `server.tcp.port`
(so LabVIEW falls back to the documented default) and for `port` **writes** a
deterministic non-default `server.tcp.port` before launch, then restores the
original ini in a `finally` block — so both admit directions are satisfiable
without leaving the operator's configuration changed.

## Part C — Record evidence in the ledger

Record **only genuine passing runs** — never fabricate ledger evidence. For each
validated host-native cell and each validated Windows-container image, record a
track into [docs/requirements/runtime-validation-ledger.json](./requirements/runtime-validation-ledger.json):

```powershell
npm run runtime:validation:record -- --track winhost-2026-x64 --version <build-version> --commit <sha> --evidence "issue:#2335"
```

Proposed track ids (all `platform: windows`, `linuxExecutable: false`):

- Host-native: `winhost-2020-x86` … `winhost-2026-x64` (`provider: host-native`).
- Windows container: `windows-container-2025q3`, `windows-container-2026q1`
  (mirror the existing `linux-container-*` track shape).

These Windows tracks are `linuxExecutable: false`, so the risk ledger's
Linux-executable runtime-fidelity dimension does not surface them; they document
real-hardware coverage without being release-gating (only the Vagrant
`releaseGating: true` track gates a marketplace release — VHS-REQ-666).

## Validation results (this host, 2026-07-23)

Recorded from genuine `CreateComparisonReport` runs on this hardening host
(fixture `lv_icon.vi`, `5376833..fc09736`), landed as ledger tracks:

| Cell | Result | Ledger track |
|---|---|---|
| host-native 2026 x64 | `runtimeState=succeeded`, `reportExists=true` | `winhost-2026-x64` |
| host-native 2026 x86 (32-bit) | `runtimeState=succeeded`, `reportExists=true` | `winhost-2026-x86` |
| windows-container `2026q1patch2-windows` | `runtimeState=succeeded`, `reportExists=true` | `windows-container-2026q1patch2` |
| host-native 2020 x64/x86 | **blocked** `labview-version-unsupported-for-comparison-report` (2025-minimum gate) | N/A — documented finding |
| host-native 2025 x64/x86 | `labview-exe-not-found` (folders present, no `LabVIEW.exe`) | N/A — not a full install on this host |

Observed real conflict-detection behavior: selecting **x86** while an **x64**
LabVIEW is still running returned `windows-host-bitness-conflict`
(`hostRuntimeConflictDetected=true`), so LabVIEW must be closed between
opposite-bitness cells — exactly what the runtime-conflict matrix harness does
per scenario.

<!-- provisioning-descriptor:begin -->
```json
{
  "schema": "vi-history-suite/windows-hardening-host@v1",
  "supersedes": 1316,
  "issue": 2335,
  "requirement": "VHS-REQ-713",
  "docker": {
    "linuxContainers": {
      "backend": "wsl2",
      "osTypeProbe": "linux",
      "images": [
        "nationalinstruments/labview:2026q1-linux",
        "nationalinstruments/labview:2025q3-linux"
      ]
    },
    "windowsContainers": {
      "isolation": "hyperv",
      "osTypeProbe": "windows",
      "hostBuild": "ltsc2022",
      "images": [
        "nationalinstruments/labview:2026q1patch2-windows",
        "nationalinstruments/labview:2026q1patch1-windows",
        "nationalinstruments/labview:2026q1-windows",
        "nationalinstruments/labview:2025q3-windows"
      ]
    }
  },
  "hostNativeGrid": [
    { "version": "2020", "bitness": "x86", "root": "C:\\Program Files (x86)\\National Instruments\\LabVIEW 2020", "note": "compare gated by MINIMUM_COMPARISON_REPORT_LABVIEW_YEAR=2025; convert-path selected only" },
    { "version": "2020", "bitness": "x64", "root": "C:\\Program Files\\National Instruments\\LabVIEW 2020", "note": "compare gated by MINIMUM_COMPARISON_REPORT_LABVIEW_YEAR=2025; convert-path selected only" },
    { "version": "2025", "bitness": "x86", "root": "C:\\Program Files (x86)\\National Instruments\\LabVIEW 2025" },
    { "version": "2025", "bitness": "x64", "root": "C:\\Program Files\\National Instruments\\LabVIEW 2025" },
    { "version": "2026", "bitness": "x86", "root": "C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026" },
    { "version": "2026", "bitness": "x64", "root": "C:\\Program Files\\National Instruments\\LabVIEW 2026" }
  ],
  "fixture": {
    "repo": "https://github.com/ni/labview-icon-editor",
    "vi": "resource/plugins/lv_icon.vi",
    "base": "5376833",
    "selected": "fc09736"
  },
  "matrix": {
    "driver": "scripts/runWindowsRuntimeMatrix.js",
    "canonicalRows": 30,
    "families": { "bitness": 6, "version": 12, "match": 6, "port": 6 },
    "legacyAliases": {
      "steady-A": "bitness-2026-x64x86",
      "steady-B": "bitness-2026-x86x64",
      "version-A": "version-2025-2026-x64",
      "version-B": "version-2026-2025-x64",
      "port-A": "port-2026-x64"
    }
  },
  "ledgerTracks": {
    "hostNative": ["winhost-2020-x86", "winhost-2020-x64", "winhost-2025-x86", "winhost-2025-x64", "winhost-2026-x86", "winhost-2026-x64"],
    "windowsContainer": ["windows-container-2025q3", "windows-container-2026q1", "windows-container-2026q1patch2"]
  }
}
```
<!-- provisioning-descriptor:end -->

## Part E — perfmon → TDMS → mprr replay (the mprr-grounded core)

This host is the only place the **Windows-native** half of the mprr dual-source
pipeline runs on real hardware. The maintainer driver
[scripts/windows-perfmon-mprr-driver.cjs](../scripts/windows-perfmon-mprr-driver.cjs)
(inventory-exempt `.cjs`) drives the shipped `out/reporting/mirror/` +
`out/reporting/syncDiagnostics/` modules verbatim and writes evidence to
`win-validation/mprr/` (gitignored):

```powershell
npm run compile
node scripts/windows-perfmon-mprr-driver.cjs
# Env: VIHS_MPRR_SKIP_CHROME=1 (skip E5), VIHS_MPRR_SKIP_DOCKER=1 (skip E6),
# VIHS_MPRR_LV_VERSION / VIHS_MPRR_LV_BITNESS, VIHS_MPRR_CONTAINER_IMAGE, VIHS_MPRR_CHROME.
```

| Stage | Proof |
|---|---|
| E1 | Real Windows-native perfmon PDH-CSV captured **around** a real host-native compare (cold, system counters) + a resident capture proving the `\Process(LabVIEW)` channels resolve. |
| E2 | `first-run-perfmon@v1` artifact + `perfmon-tdms-model@v1` channel model (`resource-samples` + `run-cycles` groups). |
| E3 | `buildPerfmonMprrSync` maps each sample to the mprr stopwatch/frame timebase with a bit-exact 40-bit machine strip; `authoritative` only when the E5 calibration is `calibrated`. |
| E4 | `DeterministicRollingBlockRing` admission **fails closed** on an undersized budget, then a **byte-identical** TDMS/artifact round-trip; `analyzePerfmonSessionPattern` over the cold + resident captures. |
| E5 | mprr calibration (8 fiducials ≤ 60 colour distance) + stopwatch accuracy (12 fps) proven via **real Chrome headless** captures decoded by the driver's built-in PNG decoder. |
| E6 | Docker Windows-container + Windows-native perfmon TDMS models **reconcile** on the shared resource channels (dual-source parity). |

> **Elevation note:** the capture uses `logman`, whose data collectors require
> elevated privileges. The driver specifically **requires an Administrator
> session and fails closed** (`assertElevated()` checks the Administrator role)
> when run unelevated — it does not accept a non-admin Performance Log Users
> session. It starts the
> collector while LabVIEW is closed so the trace spans the LabVIEW closed-to-open
> transition (logman binds `\Process(LabVIEW)` dynamically), and derives a
> single-`-c` logman argv from the shipped plan for logman builds that reject
> repeated `-c`, retaining the shipped plan + capture script per capture as
> evidence of the elevated-actor orchestration.

The portable pipeline-composition contract is guarded (no hardware) by
[tests/unit/windowsPerfmonMprrPipeline.test.ts](../tests/unit/windowsPerfmonMprrPipeline.test.ts)
(VHS-REQ-713.5); the real Windows-native run is recorded as the
`winhost-perfmon-mprr-2026-x64` ledger track.

## TDMS structure & decoding (VHS-REQ-713.5–.7)

The capture pairs a **12fps screen stream** with a **1Hz perfmon stream** and
projects them into a deterministic, TDMS-bound channel model so a consumer (a
real NI TDMS writer, an agent, or an offline analyzer) can decode both on one
timebase. There are three schemas; each is a pure function of its inputs, so the
same capture always yields the same model.

### 1. Perfmon channel model — `vi-history-suite/perfmon-tdms-model@v1`

Produced by `buildPerfmonTdmsModel` (from a `first-run-perfmon@v1` artifact).
TDMS layout: file properties + groups → channels, where each channel is a named
numeric column with `unit`, `description`, and NI waveform properties
(`wf_increment` = sample interval seconds, `wf_start_offset`, `wf_samples`).

| Group | Channels (unit) | Notes |
|---|---|---|
| `resource-samples` | `time_s` (s), `cpu_total_pct` (%), `mem_avail_mb` (MB), `disk_total_pct` (%), optional `labview_cpu_pct` (%), `labview_working_set_mb` (MB) | one row per perfmon sample (1 Hz); LabVIEW channels present only when a `\Process(LabVIEW)` counter resolved. `null` = TDMS no-value. |
| `run-cycles` | `cycle_index`, `duration_ms` (ms) | present only when the artifact carries per-cycle timing. |

### 2. Timing-correlation model — `vi-history-suite/timing-correlation@v1`

Produced by `buildTimingCorrelationModel`
([src/reporting/mirror/timingCorrelationModel.ts](../src/reporting/mirror/timingCorrelationModel.ts)).
It binds the two streams on a per-second grid. Top-level fields: `schema`,
`schemaVersion`, `fps`, `sampleIntervalSec`, `seconds[]`, `signature`.

Each `seconds[]` entry (one per 1 Hz perfmon second):

| Field | Unit | Meaning |
|---|---|---|
| `secondIndex` | — | 0-based perfmon second |
| `framesInSecond` | — | well-formed screen frames that fell in this second (≈ `fps`, e.g. 12) |
| `observedStopwatchCs` | centiseconds | decoded on-screen stopwatch reading at the start of this second (ground truth), or `null` |
| `observedDeltaCs` | centiseconds | `observedStopwatchCs` minus the previous second's (≈ 100 at 12fps/1Hz), or `null` |
| `cpuTotalPct` / `memAvailMb` / `diskTotalPct` / `diskWriteBytesPerSec` | % / MB / % / B·s⁻¹ | the paired perfmon sample for this second |

The per-run `signature` summary folds it: `perfmonSampleCount`, `frameCount`,
`wellFormedFrameCount`, `effectiveFps`, `stopwatchClassification`,
`medianFramesPerSecond`, `medianObservedDeltaCs`, `meanObservedDeltaCs`,
`meanCpuPct`, `peakCpuPct`, `meanMemAvailMb`, `meanDiskWriteBytesPerSec`,
`meanDiskTotalPct`.

### 3. Cross-run signature — `vi-history-suite/timing-correlation-signature@v1`

Produced by `buildTimingCorrelationSignature`
([src/reporting/mirror/timingCorrelationSignature.ts](../src/reporting/mirror/timingCorrelationSignature.ts))
from ≥2 per-run `signature` summaries. Fields: `runCount`, `tolerance`,
`acrossRuns` (each metric an `AcrossRunStat` `{ values, mean, min, max, stddev,
cov }`), `signatureVector` (`{ effectiveFps, framesPerSecond,
stopwatchDeltaCsPerSecond, meanCpuPct, meanDiskWriteBytesPerSec }`), and
`verdict`. `verdict.timingDeterministic` is `true` only when every run is
stopwatch-`authoritative` and `effectiveFps` (default band 11.5–12.5, spread
≤ 0.3), `medianFramesPerSecond` (11–13), and `medianObservedDeltaCs` (98–102)
hold across all runs. Resource metrics are reported but do not gate the verdict.

### On-disk TDMS the maintainer driver writes — `vi-history-suite/timing-correlation-tdms@v1`

The capture driver serializes a file-shaped model (`runTag`, `fps`,
`sampleIntervalSec`, `durationSec`, `signature`, `groups[]`) mirroring a real
`.tdms` file → group → channel hierarchy:

| Group | Channels |
|---|---|
| `resource-samples` | `time_s`, `cpu_total_pct`, `mem_avail_mb`, `disk_total_pct`, `disk_write_bytes_per_sec` (one per 1 Hz sample) |
| `screen-frames` | `frame_index`, `decoded_centiseconds`, `well_formed` (0/1) (one per 12fps frame) |
| `correlation` | `second_index`, `frames_in_second`, `observed_stopwatch_cs`, `observed_delta_cs`, `cpu_total_pct`, `disk_write_bytes_per_sec` (one per second) |

### How to decode

1. **Screen clock (ground truth).** Each `screen-frames` frame carries a decoded
   mprr machine strip. The strip spans the **top 7 %–16 % of the frame, full
   width**, as **40 cells**: an 8-bit `10100101` preamble, a 24-bit centiseconds
   payload, and an 8-bit XOR checksum of the three payload bytes. Bit `1` = black
   (lower luminance), `0` = white. Sample a luminance row through the strip band,
   segment into 40 cells, threshold at the min/max midpoint, and read the bits
   (`decodeMprrStripImage`). `decoded_centiseconds × 10 ms` = elapsed since the
   stopwatch started — a monotonic real-time clock independent of the capture.
2. **Frame → perfmon-second binding.** Frame `j` belongs to perfmon second
   `floor(j / fps)` (both samplers start together), so second `s` owns frames
   `[s·fps, (s+1)·fps)`. This is deterministic and needs no wall-clock alignment.
3. **Correlation check.** Within each second, `observed_stopwatch_cs` is the first
   well-formed decoded reading; `observed_delta_cs` ≈ 100 confirms the on-screen
   clock advanced exactly one second while the perfmon sampler advanced one
   sample — i.e. the 12fps screen stream and the 1 Hz perfmon stream are
   deterministically correlated. Read the paired resource channels at the same
   `secondIndex` to attribute CPU/disk to a screen-time window.
4. **Determinism across runs.** Feed each run's `signature` to
   `buildTimingCorrelationSignature` and read `verdict.timingDeterministic` plus
   the `signatureVector` (validated on this host: `effectiveFps 12`,
   `framesPerSecond 12`, `stopwatchDeltaCsPerSecond 100`, stddev 0 across 3×60 s
   runs).

## References

- [AGENTS.md](../AGENTS.md) — agent operating guide, gates, board.
- [.github/prompts/windows-maintainer-validation.prompt.md](../.github/prompts/windows-maintainer-validation.prompt.md) — Windows maintainer validation runbook.
- [scripts/windows-compare-driver.cjs](../scripts/windows-compare-driver.cjs) — host-native/container compare driver.
- [scripts/runWindowsRuntimeMatrix.js](../scripts/runWindowsRuntimeMatrix.js) — the runtime-conflict matrix harness.
- [docs/requirements/runtime-validation-ledger.json](./requirements/runtime-validation-ledger.json) — the evidence ledger.
- [scripts/recordRuntimeValidation.js](../scripts/recordRuntimeValidation.js) — records a track's validation.
- [docs/vagrant.md](./vagrant.md) — the separate Vagrant release-attestation host.
