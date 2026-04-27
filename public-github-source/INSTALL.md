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

On a fresh Docker machine, the first successful Docker compare may pull
`nationalinstruments/labview:2026q1-linux`, about `1.4 GB`. `vihs --validate`
confirms Docker reachability and the selected runtime path; the compare
operation acquires the image when it is not cached yet.

## Compare A VI

1. Open a trusted Git repository that contains a `.vi`, `.ctl`, or `.vit` file.
2. Right-click the file in the Explorer and choose `VI History`, or use the `VI History` button in the editor title when the file is open.
3. Select exactly two revisions with the checkbox column.
4. Review the compare preflight.
5. Choose `Compare`.

## Runtime Notes

- Windows defaults to local `LabVIEWCLI`
- host Windows LabVIEW years `2020` through `2026` are selectable when they are installed locally
- host Linux LabVIEW `2026` `x64` is admitted when LabVIEW Community 2026 is
  installed and discoverable at `/usr/local/natinst/LabVIEW-2026-64/labview`
- `docker/windows` and `docker/linux` are governed today for `2026` `x64`
  only, but other selectable Docker years and bitnesses are accepted for
  validation reporting and may return a stable not-yet-implemented code
- blocked or unsupported paths fail closed with explicit next-step guidance

## Source Evaluation And Codespaces

Use this lane only when you want to inspect the source repo, run the extension
in a devcontainer or Codespace, or review another public Git repository with
the extension.

Fast path:

1. Open the repo or your fork on `develop` in a devcontainer or Codespace.
2. Let `npm ci` complete.
3. If you checked out a tag or switched branches inside an existing Codespace
   or devcontainer session, run `npm run compile` before `vihs --validate`,
   source evaluation, or extension-host testing. The container post-start step
   does not rerun automatically after a checkout.
4. Press `F5` to open the extension development host.
5. Open the target Git repository there and use the same compare-preflight workflow.

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

Canonical public Docker fixture:

```bash
git clone https://github.com/ni/labview-icon-editor.git ../labview-icon-editor
cd ../labview-icon-editor
git show ab94f6c4b375062492036c63a6dab7ea8824748a:resource/plugins/lv_icon.vi > /tmp/lv_icon-old.vi
git show 8741bb08026c104100720c0ef48621e4ab7762fd:resource/plugins/lv_icon.vi > /tmp/lv_icon-new.vi
```

Use `resource/plugins/lv_icon.vi` from those two commits for repeatable Docker
compare validation. Retained public evidence shows the positive historical
compare succeeded, the no-change control succeeded, and the missing-file
control blocked before Docker at `left-blob-read-failed`. Windows host LabVIEW
proof remains community/deferred.

Executable fixture validation:

```bash
vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out ./vihs-fixture-proof
```

On a Linux machine with LabVIEW Community 2026 installed, use `--provider host`
with the same command to generate the Linux host-native proof packet.

More source-evaluation help:

- [Fork Codespace Quickstart](Fork-Codespace-Quickstart)
- [Review Public LabVIEW VI Changes](Review-Public-LabVIEW-VI-Changes)
- [Refresh Codespace Repositories](Refresh-Codespace-Repositories)
