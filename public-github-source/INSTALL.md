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

GitHub still opens the public repo on `main` by default. That is expected:
`main` is the latest exact released line, while `develop` is the explicit
evaluation branch for the next candidate.

Treat the public wiki pages as the canonical first-time procedures. This page
keeps the public install and evaluation paths summarized.

Fast path:

1. Open your fork in a Codespace or devcontainer on `develop`.
2. Let browser VS Code finish `Setting up remote connection: Building codespace`.
3. Press `F5` to open the extension development host.
4. Open the target Git repository there and use the checkbox-selected compare
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

If you want a generic public GitHub or GitLab repo instead, run:

```bash
npm run public:repo:clone
```

Paste the repo URL when prompted. If you press `Esc`, the prompt stops and you
can fall back to the canonical sample helper:

```bash
npm run public:fixture:icon-editor
```

If you prefer a non-interactive command, use this template:

```bash
npm run public:repo:clone -- --repo-url https://github.com/<owner>/<repo>.git
```

Supported repo URLs are public `https://github.com/...` and
`https://gitlab.com/...` only.

Examples:

```bash
npm run public:repo:clone -- --repo-url https://gitlab.com/hampel-soft/open-source/hse-logger.git
```

```bash
npm run public:repo:clone -- --repo-url https://github.com/crossrulz/SerialPortNuggets.git
```

If you need a specific branch, add `--branch <branch-name>`. Otherwise omit
`--branch` and let the command resolve the remote default branch automatically,
so the same command works for public repos that use `main`, `master`, or
another default branch.

If you want the full fork-owner walkthrough for the canonical public sample VI,
use the public wiki page:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Fork-Codespace-Quickstart`

That page is the easiest first path for LabVIEW users because it now spells
out:

- deselect `Copy the main branch only` when creating the fork
- `Codespaces` `...` -> `New with options`
- the `develop` branch selection
- that `16-core` is the supported first-time machine, with the largest
  available fallback treated as best-effort
- the browser message `Setting up remote connection: Building codespace`
- the expected port `6010` forwarding dialog
- the exact `Open Folder...` path for `lv_icon.vi`
- the exact helper command to clone `ni/labview-icon-editor`
- that the page is first-time-only, with refresh steps kept separate
- that the intended dry-run review starts from a brand new fork and a brand
  new Codespace

For refresh-only steps after the first successful Codespace setup, use:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Refresh-Codespace-Repositories`

If you want the reference manual for reviewing the changes of a LabVIEW VI
between two commits on any public GitHub or GitLab repo, use:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Review-Public-LabVIEW-VI-Changes`

That page is first-time-only, assumes a brand new fork plus a brand new
Codespace, tells the user to use the exact folder path printed by the clone
command, and includes documented example VIs for both the public GitLab
`hse-logger` repo and the public GitHub `SerialPortNuggets` repo.

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
