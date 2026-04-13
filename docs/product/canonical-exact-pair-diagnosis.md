# Canonical Exact-Pair Diagnosis

## Purpose

`PROGRAM-0003` depends on targeted exact-pair diagnosis reruns to explain the
first invalid governed benchmark surfaces without contaminating retained
benchmark evidence.

This document defines the exact-pair-specific admission contract for
`runGovernedProof report-smoke`.

The `--execution-mode` flags named here are bounded exact-pair diagnosis inputs
for governed proof reruns. They are not installed-user extension settings, not
panel/provider UX, and not public evidence that the active extension contract
still exposes `executionMode`.

The wider shared runtime-override admission control for the public
governed-proof surface and its `PROGRAM-0003` subcommands is governed
separately in `ADR-0022`. Exact-pair diagnosis
inherits that shared layer, inherits the effective runtime bundle validation
rule from `ADR-0024`, and then adds the selected/base pair contract below.

## Canonical Profiles

### Default Smoke

Use when you want the first available comparable pair without explicit runtime
overrides.

- no `--selected-hash`
- no `--base-hash`
- no explicit runtime path overrides

### Windows Host-Native Exact Pair

Use when diagnosing an exact retained Windows blocker pair under host-native
canonical `CreateComparisonReport` execution.

- `--selected-hash <40-char hash>`
- `--base-hash <40-char hash>`
- `--platform win32`
- `--execution-mode host-only`
- `--bitness x86|x64`
- `--labview-cli-path <...\\LabVIEWCLI.exe>`
- `--labview-exe-path <...\\LabVIEW.exe>`

Current canonical-host fact:

- the current canonical Windows machine exposes only the x86
  `LabVIEWCLI.exe` install path
- x64 `LabVIEW.exe` and `LVCompare.exe` exist locally, but an x64
  host-native `LabVIEWCLI.exe` path is not currently installed
- the governed host bundle is therefore the canonical x86 `LabVIEWCLI.exe`
  plus the selected x86 or x64 LabVIEW 2026 runtime surface rather than a
  same-bitness CLI requirement

### Windows Docker-Only Exact Pair

Use when diagnosing an exact retained Windows pair through the governed
Windows container provider rather than the host-native surface.

- `--selected-hash <40-char hash>`
- `--base-hash <40-char hash>`
- `--platform win32`
- `--execution-mode docker-only`

## Fail-Closed Rules

- `--selected-hash` and `--base-hash` must be supplied together.
- Both hashes must be full 40-character git hashes.
- Shared `PROGRAM-0003` runtime-override validation still applies here:
  - explicit runtime override paths require matching `--platform` and
    canonical `CreateComparisonReport` path bundles
  - CLI arguments, environment variables, and subcommand-local defaults are
    validated as one effective runtime bundle before execution begins
  - the same admission layer now governs `runGovernedProof` subcommands for
    `dashboard-smoke`, `decision-record`, `report-smoke`, `benchmark-linux`,
    and `benchmark-windows`
- `--bitness` is only valid with `--platform win32`.
- Explicit canonical runtime path bundles require both:
  - `--labview-cli-path`
  - `--labview-exe-path`
- Explicit runtime paths must match their governed executable basenames:
  - `LabVIEWCLI.exe`
  - `LabVIEW.exe`
- On the canonical Windows host, explicit runtime override paths must exist
  before the harness runs.
- Explicit Windows runtime override paths must resolve to one coherent x86 or
  x64 bundle even when `--bitness` is omitted.
- Windows `--bitness` must not contradict explicit
  `Program Files` / `Program Files (x86)` runtime paths.
- Canonical Windows host-native diagnosis requires a clean host runtime
  surface before launch:
  - no already-running `LabVIEW.exe`
  - no already-running `LabVIEWCLI.exe`
  - no already-running `LVCompare.exe`
  - no preexisting listener on the selected `LabVIEW.ini`-derived VI Server
    TCP port

## Retained Proof Surface

Canonical exact-pair diagnosis writes:

- `.cache/harness-reports/<HARNESS>/comparison-report-smoke.json`
- `.cache/harness-reports/<HARNESS>/comparison-report-smoke.md`
- `.cache/harness-reports/<HARNESS>/comparison-report-smoke.html`
- retained runtime stdout/stderr and process-observation artifacts
- retained selected `LabVIEW.ini` path and VI Server TCP port on native Windows
- retained fail-closed blocked-runtime evidence when canonical Windows preflight
  detects stale LabVIEW processes or a preexisting governed VI Server listener
- retained exact-pair summaries that can be lifted into the comparable-prefix
  benchmark packet

## Ambient Environment Boundary

Ambient environment changes such as `LV_RTE_HEADLESS=1` can still be useful for
bounded diagnosis, but they are not a substitute for canonical experiment
admission control.

Until a dedicated explicit CLI/profile surface exists for those environment
controls, ambient-environment experiments remain characterization evidence that
must be described explicitly in the control-plane docs when they materially
change the retained outcome.

## Public Boundary

This document governs one public proof surface only:

- `npm run proof:run -- report-smoke ...`

It does not publish a public engine selector or a public `LVCompare` override.
It also does not reopen `executionMode` as installed-user product doctrine;
that flag remains a bounded proof-surface admission input for exact-pair
diagnosis only.
Any retained `LVCompare` receipts remain internal parity evidence carried by
benchmark packets and control-plane docs, not by the public operator CLI
contract.
