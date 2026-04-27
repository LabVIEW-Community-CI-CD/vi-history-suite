# HARNESS-VHS-002 Public Fixture Validate-Fixture Host Proof

Status: passed

Recorded at: `2026-04-26T23:57:24.536Z`

Package line: `1.3.12`

Command:

```bash
node out/tooling/localRuntimeSettingsCli.js validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out /tmp/vihs-fixture-host-proof --runtime-timeout-ms 240000
```

## Fixture

- Repository: `https://github.com/ni/labview-icon-editor`
- Harness: `HARNESS-VHS-002`
- VI: `resource/plugins/lv_icon.vi`
- Old commit: `ab94f6c4b375062492036c63a6dab7ea8824748a` (`2025-06-29`)
- New commit: `8741bb08026c104100720c0ef48621e4ab7762fd` (`2026-02-24`)

## Result

- Classification: `validation-success`
- Report status: `ready-for-runtime`
- Runtime execution: `succeeded`
- Runtime provider: `host-native`
- Runtime engine: `labview-cli`
- Runtime executable: `/usr/local/bin/LabVIEWCLI`
- LabVIEW path: `/usr/local/natinst/LabVIEW-2026-64/labview`
- Exit code: `0`
- Duration: `35320 ms`
- Runtime diagnostic reason: `linux-headless-recursive-load`
- Generated report: `diff-report-lv_icon.vi.html`
- Generated report size: `410373` bytes

## Regression Retained

The first live run generated the LabVIEW HTML report but the wrapper did not
return because Linux `LabVIEWCLI` can launch `labview --headless`, exit, and
leave stdout/stderr descriptors open through the LabVIEW child process.

The retained fix is in `src/reporting/comparisonReportRuntimeExecution.ts`: the
observed host runner now settles on child process exit and closes inherited
stdio handles. The regression test is
`tests/unit/comparisonReportRuntimeExecution.test.ts`.

## Boundary

- Linux host LabVIEW `2026` `x64`: admitted by this packet.
- Linux/Docker `2026` `x64`: admitted by the retained public Docker fixture
  battery and the same `vihs validate-fixture` route.
- Windows host LabVIEW: community/deferred.
- Windows Docker Desktop Windows containers: community/deferred.
