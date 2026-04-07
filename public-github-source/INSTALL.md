# Install

## Public Runtime Contract

The installed extension compare workflow is Docker-only and x64-only.

Required surfaces:

- Visual Studio Code
- Docker Desktop or another Docker-compatible engine available to VS Code
- a trusted Git repository containing an eligible LabVIEW VI

Not required:

- host LabVIEW
- host LabVIEW CLI
- private GitLab access

## Runtime Selection

The extension selects the governed image from the current host and Docker
daemon engine:

- Windows host + Linux engine: governed Linux image
- Windows host + Windows engine: governed Windows image
- Linux host: governed Linux image

If the selected governed image is missing locally, the extension pulls it on
first use before compare execution.

## Installed User Flow

1. Install the VSIX from a governed release.
2. Open a trusted Git repository with an eligible LabVIEW VI.
3. Run `VI History`.
4. Select one commit checkbox.
5. Select a second distinct commit checkbox.
6. Wait for first-use image acquisition if the selected governed image is not
   already present.
7. Review the generated comparison report.

## Public Development And Evaluation

The public repo is intended to support devcontainer/Codespaces evaluation on
the `develop` branch.

Fast path:

1. Open your fork in a Codespace or devcontainer on `develop`.
2. Let browser VS Code finish `Setting up remote connection: Building codespace`.
3. If a `Vitest not found` popup appears, close it and continue. VI History
   does not require you to install anything extra for the public fork flow.
4. Press `F5` to open the extension development host.
5. Open the target Git repository there and use the checkbox-selected compare
   flow.

If the Linux VS Code host dependencies need to be refreshed manually, run:

```bash
npm run public:host:bootstrap-linux
```

If you want a governed public sample repository for that flow, run:

```bash
npm run public:fixture:icon-editor
```

This clones `ni/labview-icon-editor` into a visible sibling folder named
`labview-icon-editor`. In a GitHub Codespace created from this repo, the exact
folder path is `/workspaces/labview-icon-editor`.

If you want the full fork-owner walkthrough for the canonical public sample VI,
use the public wiki page:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Fork-Codespace-Quickstart`

That page is the easiest first path for LabVIEW users because it now spells
out:

- `Code` -> `Codespaces` -> `New with options`
- the `develop` branch selection
- `16-core` machine selection
- the browser message `Setting up remote connection: Building codespace`
- the exact `Open Folder...` path for `lv_icon.vi`
- the exact helper command to clone `ni/labview-icon-editor`
- what to do if a `Vitest not found` popup appears

If you want the separate manual-clone walkthrough for `ni/actor-framework`, use:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Manual-Actor-Framework-Clone`

The public Linux cold-pull smoke lane is:

```bash
npm run public:smoke:linux
```

## Current Public Boundary

This repo is the public source facade.

It does not publish:

- private requirements and RTM artifacts
- benchmark-control packets
- maintainer-only human-review evidence
- internal GitLab control-plane docs
