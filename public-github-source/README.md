# VI History Suite

`vi-history-suite` is a Visual Studio Code extension for reviewing LabVIEW VI
history in Git repositories.

The packaged Marketplace listing is intentionally installed-user first and
version-agnostic. Use the Marketplace version history or the Extensions view
when you need the exact published version number.

## Install The Extension

Use one of these install surfaces:

- install from the VS Code Extensions view
- run `code --install-extension svelderrainruiz.vi-history-suite`
- install the released VSIX when you intentionally need that exact package

First-time setup:

1. Open or restart VS Code once after installation.
2. Open an integrated terminal and run `vihs`.
3. If `vihs` is not available yet, run `VI History: Prepare Local Runtime Settings CLI` from the Command Palette, then run `vihs` again.
4. Choose the runtime you want to use, then confirm the LabVIEW year and bitness.
5. Run `vihs --validate`.

## Compare A VI

1. Open a trusted Git repository that contains a `.vi`, `.ctl`, or `.vit` file.
2. Right-click the file in the Explorer and choose `VI History`, or use the `VI History` button in the editor title when the file is open.
3. Select exactly two revisions with the checkbox column.
4. Review the compare preflight.
5. Choose `Compare`.

Installed-user help:

- [Home](https://github.com/svelderrainruiz/vi-history-suite/wiki)
- [Install And Release](https://github.com/svelderrainruiz/vi-history-suite/wiki/Install-And-Release)
- [User Workflow](https://github.com/svelderrainruiz/vi-history-suite/wiki/User-Workflow)
- [Comparison Reports And Dashboard Review](https://github.com/svelderrainruiz/vi-history-suite/wiki/Comparison-Reports-And-Dashboard-Review)
- [Support](./SUPPORT.md)

## Supported Today

- Windows defaults to local `LabVIEWCLI`
- run `vihs --validate` before the first compare on a fresh machine
- right-click a `.vi`, `.ctl`, or `.vit` file in the Explorer, or use the
  editor-title `VI History` action, to start a comparison
- if Docker is selected, install or start Docker Desktop or Docker before the
  first compare
- the first Docker compare on a fresh machine may pull
  `nationalinstruments/labview:2026q1-linux`, about `1.4 GB`
- host LabVIEW `2025`, `2026`, and newer local versions are selectable when
  they are installed locally; LabVIEW `2024` and older cannot create the VI
  Comparison Report that VI History Suite uses
- LabVIEW `2025` and newer can open older LabVIEW VIs without migrating the
  source file before generating the comparison report
- `docker/windows` and `docker/linux` variants are selectable for community
  validation; the governed Docker runtime implementation is currently `2026`
  `x64`
- other provider/year/bitness combinations are accepted for validation
  reporting and return stable `VIHS_E_*` error codes when they are blocked or
  not yet implemented
- blocked, missing, or not-yet-implemented paths fail closed with explicit
  next-step guidance and can write a GitHub-ready proof packet

### Installed-user LabVIEW support matrix

| Runtime provider | LabVIEW target | VI Comparison Report generation | Bitness guidance |
| --- | --- | --- | --- |
| Windows local host (`provider=host`) | `2025`, `2026`, and newer/manual local paths | supported | local installs can be `x86` (32-bit) or `x64` (64-bit), and both are selectable when installed |
| Windows local host (`provider=host`) | `2024` and older | unsupported for this workflow | use LabVIEW `2025`/`2026` or newer to generate reports |
| Linux local host (`provider=host`) | admitted `2026` `x64` today; newer/manual local `x64` paths are selectable for validation | conditionally supported (requires an admitted local runtime bundle) | Linux host behavior in this workflow is `x64` only |
| Docker (`provider=docker`) | governed `2026` image family today; other selectable bundles are validation/reporting paths | conditionally supported (admitted bundles run; blocked bundles fail closed with `VIHS_E_*` guidance) | container images are `x64` only on Linux and Windows Docker engines |

LabVIEW `2025` and `2026` can open older VI source for comparison in this
workflow without requiring migration of the source files before report
generation.

For setup and troubleshooting details without overloading extension UI text, use
the installed-user guides: [First-run guide](./FIRST-RUN.md) and
[Troubleshooting guide](./TROUBLESHOOTING.md).

## Proof Status And Community Validation

The Marketplace stable release is the current installed-user release line. The extension
intentionally exposes all intended provider/year/bitness variants so the
runtime and error-reporting layer can be exercised on real user machines.

Proof-status matrix:

| Variant | Status | Evidence path |
| --- | --- | --- |
| Linux/Docker `2026` `x64` | admitted | `vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof` |
| Linux host LabVIEW `2026` `x64` | admitted when LabVIEW 2026 Community is installed on Linux | `vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof` |
| Windows host LabVIEW `2026` `x86` | admitted on the governed Windows Community/golden-VM lane | `vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x86 --proof-out .\vihs-fixture-proof` |
| Windows host LabVIEW `2026` `x64` | selectable when LabVIEW 2026 x64 is manually installed on Windows | `vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof` |
| Windows Docker Desktop Windows containers | community/deferred through public issue #65 | `vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof --runtime-timeout-ms 300000` after Docker Desktop is switched to Windows containers |
| Unsupported or missing provider/year/bitness variants | selectable/reportable | expected to fail closed with an actionable `VIHS_E_*` code or a feature-not-implemented report |

### Windows host-native LabVIEW `2026` `x64` proof handoff (`blocked-local-windows`)

This handoff is documentation-only for cloud agents. Admit Windows host-native
`x64` proof only from retained evidence captured on a real Windows host with
LabVIEW `2026` `x64` installed; do not claim this proof from Vagrant `x86` or
cloud-only execution.

Required host state:

- Windows host session (outside the Vagrant/golden-VM `x86` lane)
- LabVIEW `2026` `x64` installed with matching `LabVIEWCLI` `x64`
- VI History Suite installed and `vihs` available
- no stale LabVIEW/LabVIEWCLI/LVCompare process or governed VI Server listener
  conflict before running proof commands

Run and retain:

```powershell
vihs --validate --proof-out .\vihs-validate-proof-x64
vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof-x64
```

The canonical fixture command above runs `HARNESS-VHS-002` against
`resource/plugins/lv_icon.vi`. Retain at minimum:

- `.\vihs-fixture-proof-x64\vihs-fixture-validation-proof.json`
- `.\vihs-fixture-proof-x64\vihs-fixture-validation-issue.md`
- `.\vihs-fixture-proof-x64\reports\HARNESS-VHS-002\comparison-report-smoke.json`
- `.\vihs-fixture-proof-x64\reports\HARNESS-VHS-002\comparison-report-smoke.md`
- `.\vihs-fixture-proof-x64\reports\HARNESS-VHS-002\comparison-report-smoke.html`

Required facts in retained evidence:

- `fixture.harnessId=HARNESS-VHS-002` and `fixture.viPath=resource/plugins/lv_icon.vi`
- selected variant shows `provider=host`, `labviewVersion=2026`, `labviewBitness=x64`
- runtime facts include `runtimeProvider=host-native` and `runtimeEngine=labview-cli`
- admitted success retains `generatedReportExists=true`

Failure classification for this handoff:

| Failure class | Expected signal(s) |
| --- | --- |
| Missing LabVIEW `2026` `x64` runtime | `runtimeBlockedReason=labview-exe-not-found` or `runtimeBlockedReason=labview-cli-not-found-for-bitness`; `vihs --validate` typically reports `runtimeErrorCode=VIHS_E_LABVIEW_NOT_FOUND` or `runtimeErrorCode=VIHS_E_LABVIEW_CLI_BITNESS_NOT_FOUND`. |
| VI Server/session readiness issue | `runtimeBlockedReason=windows-host-runtime-surface-contaminated` or `runtimeFailureReason=labview-cli-connection-failed`; `vihs --validate` may report `runtimeErrorCode=VIHS_E_RUNTIME_SURFACE_CONTAMINATED`. |
| LabVIEWCLI execution error | `validationClassification=validation-failure` with a `runtimeFailureReason` beginning with `labview-cli-` (for example timeout, non-zero exit, or call-by-reference failure). |

This handoff does not replace Windows Docker Desktop Windows-container proof
tracked by [public issue #65](https://github.com/svelderrainruiz/vi-history-suite/issues/65).
That proof still requires retained
evidence from a real Windows host running Docker Desktop in Windows-container
mode.

To join from the command line:

```bash
code --install-extension svelderrainruiz.vi-history-suite
```

When a selectable Windows/LabVIEW path works or fails on your machine, include
provider, LabVIEW year, bitness, extension version, VS Code version, and
`vihs --validate` output in the issue report. To generate a ready-to-file
validation packet:

```bash
vihs --validate --proof-out ./vihs-proof
```

To exercise the canonical public fixture and write a compare proof packet:

```bash
vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof
```

On Windows Docker Desktop, switch Docker Desktop to Windows containers first
and confirm `docker info --format "{{.OSType}} {{.OperatingSystem}}"` reports
`windows`. Then run:

```powershell
vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof --runtime-timeout-ms 300000
```

### Canonical Public Docker Fixture

The retained public Docker fixture for validation is
`https://github.com/ni/labview-icon-editor` using
`resource/plugins/lv_icon.vi`.

- old commit:
  `ab94f6c4b375062492036c63a6dab7ea8824748a`
- new commit:
  `8741bb08026c104100720c0ef48621e4ab7762fd`
- positive Docker compare: succeeded and generated
  `diff-report-lv_icon.vi.html`
- no-change Docker compare: succeeded
- missing-file control: blocked before Docker at `left-blob-read-failed`

This proves the Linux/Docker `2026` `x64` public fixture path. Linux host
LabVIEW `2026` `x64` is separately admitted on the maintainer Ubuntu machine
when LabVIEW Community 2026 is installed. Windows host LabVIEW `2026` `x64`
is now separately admitted from a Windows 11 VirtualBox installed-user proof.
Windows Docker Desktop Windows-container proof remains community/deferred until
public issue #65 receives an admissible packet from a real Windows host with
Docker Desktop OSType `windows`.

## Report A Problem Or Request Support

Use the public GitHub issue templates when install, `vihs`, validation, or
compare do not behave as expected:

- [Issue Chooser](https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose)
- [Marketplace Community Validation Report](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=community-validation-windows-labview.yml)
- [Windows Docker Desktop Validation](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=windows-docker-desktop-validation.yml)
- [Validation Success](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=validation-success.yml)
- [Validation Failure](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=validation-failure.yml)
- [Feature Not Implemented](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=feature-not-implemented.yml)
- [Bug Report](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=bug-report.yml)
- [LabVIEW Version Support Request](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=labview-version-support.yml)
- [Feature Request](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=feature-request.yml)

Useful issue facts:

- extension version and VS Code version
- whether the problem happened during install, `vihs`, `vihs --validate`, or compare
- provider, LabVIEW year, and bitness
- the current `vihs --validate` output and `runtimeErrorCode`
- the `vihs-validation-proof.json` packet when generated
- exact reproduction steps and the current vs expected result

## Evaluate From Source

- [INSTALL.md](./INSTALL.md)
- [Fork Codespace Quickstart](https://github.com/svelderrainruiz/vi-history-suite/wiki/Fork-Codespace-Quickstart)
- [Review Public LabVIEW VI Changes](https://github.com/svelderrainruiz/vi-history-suite/wiki/Review-Public-LabVIEW-VI-Changes)
- [Refresh Codespace Repositories](https://github.com/svelderrainruiz/vi-history-suite/wiki/Refresh-Codespace-Repositories)

## Contribute

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [Issue Chooser](https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose)
