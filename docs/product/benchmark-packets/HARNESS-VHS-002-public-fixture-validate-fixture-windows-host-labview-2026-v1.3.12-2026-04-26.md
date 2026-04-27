# HARNESS-VHS-002 Windows Host LabVIEW 2026 Installed-User Proof

- Status: passed
- Recorded at: `2026-04-27T03:16:29.5042582Z`
- Package: Marketplace/public pre-release `1.3.12`
- Public release tag: `v1.3.12-public-validation-prerelease`
- Public main commit: `1853a4332eff40665e30db6e632febaa9821cf98`
- Authority develop before admission:
  `9264ab59197c23f730639bb4b3f19989022557fe`

## Machine

- Host: Ubuntu VirtualBox host
- VM: `sergiovelderrain`
- Guest OS: Microsoft Windows 11 Home `10.0.26200`
- Guest user: `sergiovelderrai\vboxuser`
- Guest Additions: `7.2.8`

## Installed-User Surface

- VS Code command:
  `C:\Users\vboxuser\AppData\Local\Programs\Microsoft VS Code\bin\code.cmd`
- Git: `git version 2.51.0.windows.1`
- LabVIEWCLI:
  `C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.exe`
- LabVIEW x64:
  `C:\Program Files\National Instruments\LabVIEW 2026\LabVIEW.exe`
- LabVIEW x86:
  `C:\Program Files (x86)\National Instruments\LabVIEW 2026\LabVIEW.exe`
- Extension install source: exact public GitHub pre-release VSIX
- VSIX SHA-256:
  `e0d72bc198756d0f3302779830fc4e187d4bc63818769ffedaedaffb23d4dc25`
- Install mode: isolated VS Code user-data and extensions roots, then generated
  `vihs.cmd` launcher

## Fixture

- Repository: `https://github.com/ni/labview-icon-editor`
- Harness: `HARNESS-VHS-002`
- VI: `resource/plugins/lv_icon.vi`
- Old commit: `ab94f6c4b375062492036c63a6dab7ea8824748a`
- New commit: `8741bb08026c104100720c0ef48621e4ab7762fd`

## Commands

| Step | Status | Exit | Duration |
| --- | --- | --- | --- |
| install exact VSIX | passed | 0 | 2.349s |
| configure host/2026/x64 | passed | 0 | 0.764s |
| validate host/2026/x64 | passed | 0 | 0.573s |
| validate fixture host/2026/x64 | passed | 0 | 90.278s |

## Result

- Runtime validation outcome: `ready`
- Runtime provider: `host-native`
- Runtime engine: `labview-cli`
- Runtime error code: `VIHS_OK`
- Runtime implementation status: `implemented`
- Fixture report status: `ready-for-runtime`
- Fixture runtime execution state: `succeeded`
- Fixture validation classification: `validation-success`
- Generated report exists: yes
- Generated report size: `146915` bytes
- CreateComparisonReport runtime duration: `62252ms`

The retained LabVIEWCLI stdout and diagnostic log both report:

```text
LabVIEW launched successfully.
Connection established with LabVIEW.
CreateComparisonReport operation succeeded.
```

## Admission Decision

This admits Windows host LabVIEW 2026 x64 installed-user proof for the canonical
public fixture. It does not admit Windows Docker Desktop / Windows-container
proof, which remains a separate community/deferred lane. Linux/Docker and Linux
host LabVIEW evidence remain separate retained lanes.

Public issue ledger:

- Host proof issue closed: `https://github.com/svelderrainruiz/vi-history-suite/issues/56`
- Remaining Windows Docker Desktop proof issue:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/65`
- Diagnostic note bug:
  `https://github.com/svelderrainruiz/vi-history-suite/issues/66`

## Reporting Follow-Up

The v1.3.12 retained runtime notes also included one stale success-before-failure
sentence even though the operation succeeded. The authority branch fixes that
diagnostic wording in `src/reporting/comparisonReportRuntimeExecution.ts` and
retains the regression test in `tests/unit/comparisonReportRuntimeExecution.test.ts`.
