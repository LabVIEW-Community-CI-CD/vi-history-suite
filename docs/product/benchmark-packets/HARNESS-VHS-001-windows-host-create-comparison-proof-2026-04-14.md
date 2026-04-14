# HARNESS-VHS-001 Windows Host CreateComparisonReport Proof Packet

## Scope

- Proof date: `2026-04-14`
- Harness: `HARNESS-VHS-001`
- Provider: `host-native`
- Engine: `labview-cli`
- Operation: `CreateComparisonReport`
- Raw governed proof roots:
  - `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x64/`
  - `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x86/`

## Result

- `VHS-REQ-548` is satisfied through exact bounded blocker retention for both
  supported LabVIEW 2026 host bundles.
- The x64 and x86 host-native runs both reached `ready-for-runtime` and then
  failed the canonical `CreateComparisonReport` attempt with
  `runtimeFailureReason=command-timed-out`.
- The blocker is no longer only inferred from prerequisite gating. It is now
  retained directly for both supported bundles.

## Bundle Summary

| Bundle | Receipt | Generated At | LabVIEW.ini | Port | Failure | Banner Observation | Exit Observation | Generated Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| x64 | `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x64/comparison-report-smoke.json` | `2026-04-14T08:16:54.983Z` | `C:\Program Files\National Instruments\LabVIEW 2026\LabVIEW.ini` | `3363` | `command-timed-out` | `LabVIEWCLI.exe` was observed while `LabVIEW.exe` was not observed | no LabVIEW-related processes were observed at exit | no |
| x86 | `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x86/comparison-report-smoke.json` | `2026-04-14T08:19:25.288Z` | `C:\Program Files (x86)\National Instruments\LabVIEW 2026\LabVIEW.ini` | `3364` | `command-timed-out` | `LabVIEWCLI.exe` was observed while `LabVIEW.exe` was not observed | no LabVIEW-related processes were observed at exit | no |

## Canonical Command Shape

Both bundle receipts retain the canonical LabVIEW CLI report command shape:

- `-OperationName CreateComparisonReport`
- staged `-VI1` and `-VI2` inputs
- `-ReportType html`
- governed `-ReportPath`
- explicit `-LabVIEWPath`
- explicit `-PortNumber`
- `-c`
- `-o`

## Interpretation

- The retained x64 receipt proves the canonical host bundle still times out
  even when the run derives and passes `PortNumber 3363` from the x64
  `LabVIEW.ini`.
- The retained x86 receipt proves the canonical host bundle still times out
  even when the run derives and passes `PortNumber 3364` from the x86
  `LabVIEW.ini`.
- Both receipts observed `LabVIEWCLI.exe` at the banner snapshot but did not
  observe `LabVIEW.exe`, which keeps the active host blocker focused on direct
  report admission rather than on stale-exit contamination alone.

## Retained Artifacts

- x64 packet:
  - `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x64/comparison-report-smoke.json`
  - `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x64/comparison-report-smoke.md`
  - `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x64/runtime-stdout.txt`
  - `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x64/runtime-stderr.txt`
  - `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x64/runtime-process-observation.json`
- x86 packet:
  - `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x86/comparison-report-smoke.json`
  - `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x86/comparison-report-smoke.md`
  - `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x86/runtime-stdout.txt`
  - `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x86/runtime-stderr.txt`
  - `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x86/runtime-process-observation.json`
