# HARNESS-VHS-002 Public Fixture Validate-Fixture Docker Proof

Status: passed

Recorded at: `2026-04-27T00:05:10.106Z`

Package line: `1.3.12`

Command:

```bash
node out/tooling/localRuntimeSettingsCli.js validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out /tmp/vihs-fixture-docker-proof --runtime-timeout-ms 240000
```

## Fixture

- Repository: `https://github.com/ni/labview-icon-editor`
- Harness: `HARNESS-VHS-002`
- VI: `resource/plugins/lv_icon.vi`
- Old commit: `ab94f6c4b375062492036c63a6dab7ea8824748a` (`2025-06-29`)
- New commit: `8741bb08026c104100720c0ef48621e4ab7762fd` (`2026-02-24`)
- Container image: `nationalinstruments/labview:2026q1-linux`

## Result

- Classification: `validation-success`
- Report status: `ready-for-runtime`
- Runtime execution: `succeeded`
- Runtime provider: `linux-container`
- Runtime engine: `labview-cli`
- Runtime executable: `docker`
- Exit code: `0`
- Duration: `220938 ms`
- Runtime diagnostic reason: `linux-headless-recursive-load`
- Generated report: `diff-report-lv_icon.vi.html`
- Generated report size: `403891` bytes

## Boundary

- Linux/Docker `2026` `x64`: admitted by this packet.
- Linux host LabVIEW `2026` `x64`: admitted by the retained host
  `validate-fixture` proof packet.
- Windows host LabVIEW: community/deferred.
- Windows Docker Desktop Windows containers: community/deferred.
