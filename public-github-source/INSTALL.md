# Install

## Install The Extension

Use one of these install surfaces:

- install from the VS Code Extensions view
- run `code --install-extension svelderrainruiz.vi-history-suite`
- install the released VSIX when you intentionally need that exact package

Installed-user start pages:

- [Home](https://github.com/svelderrainruiz/vi-history-suite/wiki)
- [Install And Release](https://github.com/svelderrainruiz/vi-history-suite/wiki/Install-And-Release)
- [User Workflow](https://github.com/svelderrainruiz/vi-history-suite/wiki/User-Workflow)
- [Comparison Reports And Dashboard Review](https://github.com/svelderrainruiz/vi-history-suite/wiki/Comparison-Reports-And-Dashboard-Review)

## First-Time Setup

1. Open or restart VS Code once after installation.
2. Open an integrated terminal and run `vihs`.
3. If `vihs` is not available yet, run `VI History: Prepare Local Runtime Settings CLI` from the Command Palette, then run `vihs` again.
4. Choose the runtime you want to use, then confirm the LabVIEW year and bitness.
5. Run `vihs --validate`.

If you are using Docker, also confirm:

```bash
docker version
docker info --format '{{.OSType}}'
```

If those checks fail, correct provider, version, bitness, or Docker readiness
before expecting Compare to run.

## Compare A VI

1. Open a trusted Git repository that contains a `.vi`, `.ctl`, or `.vit` file.
2. Right-click the file in the Explorer and choose `VI History`, or use the `VI History` button in the editor title when the file is open.
3. Select exactly two revisions with the checkbox column.
4. Review the compare preflight.
5. Choose `Compare`.

## Runtime Notes

- Windows defaults to local `LabVIEWCLI`
- host Windows LabVIEW years `2020` through `2026` are selectable when they are installed locally
- `docker/windows` and `docker/linux` are governed today for `2026` `x64`
  only, but other selectable Docker years and bitnesses are accepted for
  validation reporting and may return a stable not-yet-implemented code
- `host/linux` is selectable for validation reporting and is expected to return
  a stable unsupported or missing-runtime code until implemented
- blocked or unsupported paths fail closed with explicit next-step guidance

## Source Evaluation And Codespaces

Use this lane only when you want to inspect the source repo, run the extension
in a devcontainer or Codespace, or review another public Git repository with
the extension.

Fast path:

1. Open the repo or your fork on `develop` in a devcontainer or Codespace.
2. Let `npm ci` complete.
3. Press `F5` to open the extension development host.
4. Open the target Git repository there and use the same compare-preflight workflow.

Useful commands:

```bash
npm run public:host:bootstrap-linux
npm run public:fixture:icon-editor
npm run public:repo:clone
```

If you prefer a non-interactive public-repo clone command, use:

```bash
npm run public:repo:clone -- --repo-url https://github.com/<owner>/<repo>.git
```

That generic bootstrap is intentionally limited to public
`https://github.com/...` and `https://gitlab.com/...` repository URLs.

More source-evaluation help:

- [Fork Codespace Quickstart](Fork-Codespace-Quickstart)
- [Review Public LabVIEW VI Changes](Review-Public-LabVIEW-VI-Changes)
- [Refresh Codespace Repositories](Refresh-Codespace-Repositories)
