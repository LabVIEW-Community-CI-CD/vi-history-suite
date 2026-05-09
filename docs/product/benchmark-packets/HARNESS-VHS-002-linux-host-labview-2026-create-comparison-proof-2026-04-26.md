# HARNESS-VHS-002 Linux Host LabVIEW 2026 CreateComparisonReport Proof Packet

## Scope

- Proof date: `2026-04-26`
- Authority: GitLab `develop`
- Base authority commit at proof start:
  `78ab92ba5f417f69f37e4dc9976f3085a74f120f`
- Provider: `host`
- Runtime provider: `host-native`
- Engine: `labview-cli`
- Platform: Linux
- LabVIEW bundle: LabVIEW 2026 Community x64
- Operation: `CreateComparisonReport`
- Result: passed
- Traceability: `VHS-REQ-588`

This packet admits Linux host LabVIEW proof as a distinct evidence class. It
does not convert or satisfy the deferred Windows installed-user LabVIEW proof
claim.

## Installation Evidence

- Installer bundle:
  `/home/ghostshadow/Downloads/ni-labview-2026-community-26.1.1_linux`
- NI repo package: `ni-labview-2026-noble-community`
- Host OS: `Ubuntu 25.10`
- Kernel: `6.17.0-1017-oem`
- Installed runtime paths:
  - LabVIEW executable:
    `/usr/local/natinst/LabVIEW-2026-64/labview`
  - LabVIEW executable target: `labviewcommunity`
  - LabVIEW CLI: `/usr/local/bin/LabVIEWCLI`
  - Alternate LabVIEW CLI:
    `/usr/local/natinst/share/nilvcli/LabVIEWCLI`
  - LVCompare: `/usr/local/bin/LVCompare`

Installed packages retained in the packet JSON include
`ni-labview-2026-community 26.1.1.49170-0+f18`,
`labview-2026-community-exe 26.1.1.49170-0+f18`,
`labview-2026-rte 26.1.1.49170-0+f18`,
`ni-labview-command-line-interface 26.1.0.49328-0+f176`,
`ni-labview-vicompare 26.1.0.49387-0+f235`, `libglu1-mesa`,
and `patchelf`.

Two Ubuntu compatibility actions were required before host-native execution:

- install `libglu1-mesa`
- clear the executable-stack marking on
  `/usr/local/lib64/LabVIEW-2026-64/liblvrt.so.26.1.1`

The retained `readelf` result after the compatibility fix is `GNU_STACK RW`.
`dpkg --audit` and `apt-get check` were clean after installation.

## VIHS Runtime Validation

`vihs --validate` accepted the host runtime:

- Proof status: `ready`
- Implementation status: `implemented`
- Error code: `VIHS_OK`
- Selected settings: `host` / `2026` / `x64`
- Validation outcome: `ready`
- Runtime provider: `host-native`
- Runtime engine: `labview-cli`
- Runtime blocked reason: none

The Linux host-discovery fix is retained in
`src/reporting/comparisonRuntimeLocator.ts`: Linux LabVIEW executable version
parsing now accepts `/usr/local/natinst/LabVIEW-2026-64/labview` and
`labviewcommunity`, not only Windows `LabVIEW.exe` paths. Focused unit tests in
`tests/unit/comparisonRuntimeLocator.test.ts` retain the Linux scan-root
selection and requested-version filtering behavior.

## Canonical Fixture

- Repository: `https://github.com/ni/labview-icon-editor`
- VI path: `resource/plugins/lv_icon.vi`
- Old commit: `ab94f6c4b375062492036c63a6dab7ea8824748a`
- New commit: `8741bb08026c104100720c0ef48621e4ab7762fd`
- VI signature: `LVIN`

Both extracted fixture revisions were identified as LabVIEW virtual instrument
files before runtime execution.

## Host Compare Execution

Command shape:

```bash
LabVIEWCLI \
  -LogToConsole TRUE \
  -LogFilePath /tmp/vihs-linux-host-compare-zwuDTB/labviewcli-create-comparison.log \
  -OperationName CreateComparisonReport \
  -VI1 /tmp/vihs-linux-host-compare-zwuDTB/lv_icon-old.vi \
  -VI2 /tmp/vihs-linux-host-compare-zwuDTB/lv_icon-new.vi \
  -ReportType HTML \
  -ReportPath /tmp/vihs-linux-host-compare-zwuDTB/diff-report-lv_icon.vi.html \
  -LabVIEWPath /usr/local/natinst/LabVIEW-2026-64/labview
```

Execution result:

- Exit code: `0`
- Generated report: `diff-report-lv_icon.vi.html`
- Report size: `214412` bytes
- Report SHA-256:
  `637055a103b25ecc77e4e308a6d216fc7adab0e1741038502bb53f129e5eb864`
- Report asset directory: `diff-report-lv_icon.vi_files`
- Report asset directory size: about `4.2 MB`
- Report asset digest:
  `1d091f24e656d0aa3d2c32f4f96f6a43b14f0f5582029160bcf97f533363d932`
- Runtime log SHA-256:
  `d1a130c91a78a938f64ac8573683916a2dd5e1facfe01d8e86d543c7a38604ce`

Retained success log facts:

- `Using LabVIEW: "/usr/local/natinst/LabVIEW-2026-64/labview"`
- `LabVIEW launched successfully.`
- `Connection established with LabVIEW.`
- `Report can be found at /tmp/vihs-linux-host-compare-zwuDTB/diff-report-lv_icon.vi.html`
- `CreateComparisonReport operation succeeded.`

`CloseLabVIEW` completed after the proof run, and no LabVIEW or LabVIEWCLI
process remained.

## Boundary

- Linux host LabVIEW proof state:
  `admitted-local-maintainer-proof`
- Windows installed-user LabVIEW proof state:
  `community/deferred`
- Linux host proof may prove Windows installed-user LabVIEW behavior: no
- Public GitHub mutation: not performed
- VS Code Marketplace mutation: not performed

The already-retained canonical Docker fixture battery remains valid and
separate. This packet adds a host-native Linux proof lane for the same public
`lv_icon.vi` fixture, which is materially stronger than Docker daemon/provider
readiness but still not a substitute for real Windows installed-user LabVIEW
proof.

## Local Validation

- `npm run compile`
- `npm exec -- vitest run tests/unit/comparisonRuntimeLocator.test.ts tests/unit/localRuntimeSettingsCli.test.ts`
- `npm run test:design-contract`
- `dpkg --audit`
- `apt-get check`
