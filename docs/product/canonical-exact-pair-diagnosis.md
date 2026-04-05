# Canonical Exact-Pair Diagnosis

## Purpose

`PROGRAM-0003` depends on targeted exact-pair diagnosis reruns to explain the
first invalid governed benchmark surfaces without contaminating retained
benchmark evidence.

This document defines the canonical argument contract for
`runHarnessReportSmoke` exact-pair diagnosis.

## Canonical Profiles

### Default Smoke

Use when you want the first available comparable pair without explicit runtime
overrides.

- no `--selected-hash`
- no `--base-hash`
- no explicit runtime path overrides

### Windows Host-Native `labview-cli` Exact Pair

Use when diagnosing an exact retained Windows blocker pair under host-native
`LabVIEWCLI`.

- `--selected-hash <40-char hash>`
- `--base-hash <40-char hash>`
- `--platform win32`
- `--engine labview-cli`
- `--prefer-bitness x86|x64`
- `--labview-cli-path <...\\LabVIEWCLI.exe>`
- `--labview-exe-path <...\\LabVIEW.exe>`

### Windows Host-Native `lvcompare` Exact Pair

Use when diagnosing the same exact retained pair under Windows `LVCompare`.

- `--selected-hash <40-char hash>`
- `--base-hash <40-char hash>`
- `--platform win32`
- `--engine lvcompare`
- `--prefer-bitness x86|x64`
- `--lvcompare-path <...\\LVCompare.exe>`
- `--labview-exe-path <...\\LabVIEW.exe>`

## Fail-Closed Rules

- `--selected-hash` and `--base-hash` must be supplied together.
- Both hashes must be full 40-character git hashes.
- Explicit runtime override paths require matching `--platform` and `--engine`.
- `--prefer-bitness` is only valid with `--platform win32`.
- `--engine labview-cli` does not allow `--lvcompare-path`.
- `--engine lvcompare` does not allow `--labview-cli-path`.
- Partial engine/path bundles are rejected.
- Explicit runtime paths must match their governed executable basenames:
  - `LabVIEWCLI.exe`
  - `LabVIEW.exe`
  - `LVCompare.exe`
- Windows `--prefer-bitness` must not contradict explicit
  `Program Files` / `Program Files (x86)` runtime paths.

## Retained Proof Surface

Canonical exact-pair diagnosis writes:

- `.cache/harness-reports/<HARNESS>/comparison-report-smoke.json`
- `.cache/harness-reports/<HARNESS>/comparison-report-smoke.md`
- `.cache/harness-reports/<HARNESS>/comparison-report-smoke.html`
- retained runtime stdout/stderr and process-observation artifacts
- retained selected `LabVIEW.ini` path and VI Server TCP port on native Windows
- retained exact-pair summaries that can be lifted into the comparable-prefix
  benchmark packet

## Ambient Environment Boundary

Ambient environment changes such as `LV_RTE_HEADLESS=1` can still be useful for
bounded diagnosis, but they are not a substitute for canonical argument validation.

Until a dedicated explicit CLI/profile surface exists for those environment
controls, ambient-environment experiments remain characterization evidence that
must be described explicitly in the control-plane docs when they materially
change the retained outcome.
