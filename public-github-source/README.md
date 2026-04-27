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
- host Windows LabVIEW years `2020` through `2026` are selectable when they
  are installed locally
- `docker/windows` and `docker/linux` variants are selectable for community
  validation; the governed Docker runtime implementation is currently `2026`
  `x64`
- other provider/year/bitness combinations are accepted for validation
  reporting and return stable `VIHS_E_*` error codes when they are blocked or
  not yet implemented
- blocked, missing, or not-yet-implemented paths fail closed with explicit
  next-step guidance and can write a GitHub-ready proof packet

## Proof Status And Community Validation

Marketplace pre-release `1.3.13` is the public validation lane. The extension
intentionally exposes all intended provider/year/bitness variants so the
runtime and error-reporting layer can be exercised on real user machines.

Proof-status matrix:

| Variant | Status | Evidence path |
| --- | --- | --- |
| Linux/Docker `2026` `x64` | admitted | `vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof` |
| Linux host LabVIEW `2026` `x64` | admitted when LabVIEW 2026 Community is installed on Linux | `vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof` |
| Windows host LabVIEW `2026` `x64` | admitted when LabVIEW 2026 x64 is installed on Windows | `vihs validate-fixture --provider host --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof` |
| Windows Docker Desktop Windows containers | community/deferred through public issue #65 | `vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof --runtime-timeout-ms 300000` after Docker Desktop is switched to Windows containers |
| Unsupported or missing provider/year/bitness variants | selectable/reportable | expected to fail closed with an actionable `VIHS_E_*` code or a feature-not-implemented report |

To join from the command line:

```bash
code --install-extension svelderrainruiz.vi-history-suite@prerelease
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
