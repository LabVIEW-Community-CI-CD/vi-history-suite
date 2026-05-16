# VI History Suite

`vi-history-suite` is a Visual Studio Code extension for reviewing LabVIEW VI
history in Git repositories. It helps installed users pick two retained Git
revisions of a `.vi`, `.ctl`, or `.vit` file, review the compare preflight, and
generate a retained LabVIEW comparison report.

The Marketplace listing is intentionally installed-user first. It does not act
as the maintainer release-control dashboard, and selecting the installed
extension does not start GitHub authorization, Git indexing, LabVIEW, or
`LabVIEWCLI`.

## Overview

Use VI History Suite when you review LabVIEW file changes in a trusted Git
workspace and need a repeatable report for the exact two revisions under
review.

First-time setup:

1. Install from the VS Code Extensions view, run
   `code --install-extension svelderrainruiz.vi-history-suite`, or install the
   released VSIX when you intentionally need that exact package.
2. Run `VI History: Prepare Local Runtime Settings CLI` from the Command
   Palette.
3. Open an integrated terminal and run `vihs`.
4. Choose the provider, LabVIEW year, and bitness for this machine.
5. Run `vihs --validate`.
6. Open a trusted Git repository with an eligible LabVIEW file.
7. Open `VI History`, select exactly two revisions, review the compare
   preflight, and choose `Compare`.

The generated `vihs` command is explicit setup. It is not promised to appear
merely because VS Code started.

### Video Walkthroughs

These anchors are reserved for future videos. No video links or thumbnails are
published until the real video asset, thumbnail, and public target are ready
together.

<a id="video-install-and-prepare"></a>

#### Install And Prepare

Planned first-time walkthrough: install the extension, run
`VI History: Prepare Local Runtime Settings CLI`, and prepare the local `vihs`
command.

<a id="video-validate-runtime"></a>

#### Validate Runtime

Planned first-time walkthrough: run `vihs --validate`, read the selected
provider, LabVIEW year, bitness, runtime engine, and blocked-reason fields, and
fix the next action before comparing.

<a id="video-first-compare"></a>

#### First Compare

Planned first-time walkthrough: open a trusted Git repository, choose a tracked
VI, select exactly two revisions, review the compare preflight, and start
Compare.

<a id="video-read-report-evidence"></a>

#### Read The Report And Evidence

Planned first-time walkthrough: open the retained comparison report, review the
comparison context and evidence paths, and know what to include when asking for
support.

<a id="video-troubleshooting"></a>

#### Troubleshooting

Reserved follow-up walkthrough for runtime validation failures and support
requests after the first video set is recorded.

## Details

### Install

Use one of these installed-user surfaces:

- VS Code Extensions view
- `code --install-extension svelderrainruiz.vi-history-suite`
- exact released VSIX from the matching GitHub release when you need the
  retained exact build

Current stable installed-user line: `1.3.16`. Historical ship-control evidence
for `v0.2.0` is maintainer-only release history, not the current installed-user
release line.

Installed-user start pages:

- [Home](https://github.com/svelderrainruiz/vi-history-suite/wiki)
- [Install And Release](https://github.com/svelderrainruiz/vi-history-suite/wiki/Install-And-Release)
- [User Workflow](https://github.com/svelderrainruiz/vi-history-suite/wiki/User-Workflow)
- [Comparison Reports And Dashboard Review](https://github.com/svelderrainruiz/vi-history-suite/wiki/Comparison-Reports-And-Dashboard-Review)
- [First-run guide](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/FIRST-RUN.md)
- [Troubleshooting guide](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/TROUBLESHOOTING.md)

### Prepare The CLI

Run `VI History: Prepare Local Runtime Settings CLI` before expecting `vihs` to
resolve in a terminal. Then run:

```bash
vihs
vihs --validate
```

The prepare command materializes the local `vihs` launcher and admits it to
supported terminals. The validation command reports the persisted provider,
LabVIEW year, bitness, runtime engine, and any `VIHS_E_*` blocked reason.

### Compare A VI

1. Open a trusted Git repository that contains a `.vi`, `.ctl`, or `.vit` file.
2. Right-click the file in the Explorer and choose `VI History`, or use the
   `VI History` button in the editor title when the file is open.
3. Select exactly two revisions with the checkbox column.
4. Review the compare preflight.
5. Choose `Compare`.

Git repository inspection and VI eligibility indexing are lazy. They start when
you open `VI History` or request an explicit refresh path, not when VS Code
starts and not when you open documentation.

### Installed-User LabVIEW Support Matrix

| Runtime path | Status | User action |
| --- | --- | --- |
| Windows host LabVIEW `2026` `x86` | admitted on the governed Windows Community/golden-VM lane | prepare `vihs`, select `host`, `2026`, `x86`, then run `vihs --validate` |
| Windows host LabVIEW `2026` `x64` | selectable when that bitness is manually installed | select `x64` only after installing the matching LabVIEW bitness |
| Linux host LabVIEW `2026` `x64` | admitted when LabVIEW Community 2026 is installed and discoverable | select `host`, `2026`, `x64`, then validate |
| Linux/Docker `2026` `x64` | admitted for the canonical public fixture lane | start Docker before validation and first compare |
| Windows Docker Desktop Windows containers | community/deferred | switch Docker Desktop to Windows containers and report proof through the validation template |
| Unsupported or missing provider/year/bitness variants | selectable for diagnosis | expect a fail-closed `VIHS_E_*` code with next-step guidance |

Windows defaults to local `LabVIEWCLI`. Host LabVIEW `2025`, `2026`, and newer
local versions are selectable when installed locally. LabVIEW `2024` and older
cannot create the VI Comparison Report that VI History Suite uses; use LabVIEW
`2025` or newer even when the VI being reviewed was saved by an older LabVIEW
version. Docker remains a bounded expert Docker path for users who intentionally
select it and validate the local Docker runtime first.

### FAQ And Command Reference

- [FAQ](./docs/information-for-users/faq.md)
- [Command Reference](./docs/information-for-users/command-reference.md)
- [Information For Users Plan](./docs/information-for-users/plan.md)
- [Audience And Task Model](./docs/information-for-users/audience-and-task-model.md)
- [Navigation And Search](./docs/information-for-users/navigation-and-search.md)
- [Delivery Profile](./docs/information-for-users/delivery-profile.md)
- [Style Guide](./docs/information-for-users/style-guide.md)
- [Glossary](./docs/information-for-users/glossary.md)

### Report A Problem Or Request Support

Use the public GitHub issue templates:

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
- whether the problem happened during install, prepare, `vihs`,
  `vihs --validate`, or compare
- provider, LabVIEW year, and bitness
- the current `vihs --validate` output and `runtimeErrorCode`
- the `vihs-validation-proof.json` packet when generated
- exact reproduction steps and the current vs expected result

### Source Evaluation

Use these routes when you want to inspect the source repo, run the extension in
a devcontainer or Codespace, or review another public Git repository with the
extension:

- [INSTALL.md](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/INSTALL.md)
- [Fork Codespace Quickstart](https://github.com/svelderrainruiz/vi-history-suite/wiki/Fork-Codespace-Quickstart)
- [Review Public LabVIEW VI Changes](https://github.com/svelderrainruiz/vi-history-suite/wiki/Review-Public-LabVIEW-VI-Changes)
- [Refresh Codespace Repositories](https://github.com/svelderrainruiz/vi-history-suite/wiki/Refresh-Codespace-Repositories)

Canonical public Docker fixture:

- repository: `https://github.com/ni/labview-icon-editor`
- VI: `resource/plugins/lv_icon.vi`
- old commit: `ab94f6c4b375062492036c63a6dab7ea8824748a`
- new commit: `8741bb08026c104100720c0ef48621e4ab7762fd`
- Docker image: `nationalinstruments/labview:2026q1-linux`, about `1.4 GB`
- retained battery: positive historical compare succeeded, no-change compare
  succeeded, and missing-file control blocked before Docker at
  `left-blob-read-failed`
- Windows note: Windows host LabVIEW paths are separate from this Linux/Docker
  fixture, and Windows Docker Desktop Windows-container proof remains
  community/deferred

### Contribute

- [CONTRIBUTING.md](https://github.com/svelderrainruiz/vi-history-suite/blob/HEAD/CONTRIBUTING.md)
- [Issue Chooser](https://github.com/svelderrainruiz/vi-history-suite/issues/new/choose)

### Maintainers

Maintainer release-control, authority routes, and publication facts are retained
outside the Marketplace Details flow:

- [Maintainer Control Plane Index](./docs/product/maintainer-control-plane-index.md)
