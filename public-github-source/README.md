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
- host Windows LabVIEW years `2020` through `2026` are selectable when they
  are installed locally
- `docker/windows` is supported for `2026` `x64` only
- Docker years before `2026` are unsupported
- `docker/linux` for `2026` and `host/linux` are not currently implemented
- blocked or unsupported paths fail closed with explicit next-step guidance

## Proof Status And Community Validation

Marketplace pre-release `1.3.10` is a community-validation preview. The
Linux/Docker preview lane is maintainer-validated. Windows/LabVIEW
installed-user combinations are selectable so users with those machines can
report evidence, but they remain proof-deferred until reproduced or retained
by the maintainer proof lane.

To join from the command line:

```bash
code --install-extension svelderrainruiz.vi-history-suite@prerelease
```

When a selectable Windows/LabVIEW path works or fails on your machine, include
provider, LabVIEW year, bitness, extension version, VS Code version, and
`vihs --validate` output in the issue report.

## Report A Problem Or Request Support

Use the public GitHub issue templates when install, `vihs`, validation, or
compare do not behave as expected:

- [Issue Chooser](https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose)
- [Marketplace Community Validation Report](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=community-validation-windows-labview.yml)
- [Bug Report](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=bug-report.yml)
- [LabVIEW Version Support Request](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=labview-version-support.yml)
- [Feature Request](https://github.com/svelderrainruiz/vi-history-suite/issues/new?template=feature-request.yml)

Useful issue facts:

- extension version and VS Code version
- whether the problem happened during install, `vihs`, `vihs --validate`, or compare
- provider, LabVIEW year, and bitness
- the current `vihs --validate` output
- exact reproduction steps and the current vs expected result

## Evaluate From Source

- [INSTALL.md](./INSTALL.md)
- [Fork Codespace Quickstart](https://github.com/svelderrainruiz/vi-history-suite/wiki/Fork-Codespace-Quickstart)
- [Review Public LabVIEW VI Changes](https://github.com/svelderrainruiz/vi-history-suite/wiki/Review-Public-LabVIEW-VI-Changes)
- [Refresh Codespace Repositories](https://github.com/svelderrainruiz/vi-history-suite/wiki/Refresh-Codespace-Repositories)

## Contribute

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [Issue Chooser](https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose)
