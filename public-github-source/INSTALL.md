# Install

## Installed Extension Start

If you installed `VI History Suite` from the VS Code Marketplace or from a
VSIX and want to use it locally, start here. You do not need to fork the repo
for this path.

Installed-user start pages:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki`
- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Install-And-Release`
- `https://github.com/svelderrainruiz/vi-history-suite/wiki/User-Workflow`
- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Comparison-Reports-And-Dashboard-Review`

## Public Runtime Contract

The public exact release and the maintained public candidate are intentionally
split:

- exact released `main` / Marketplace `1.2.2`: Docker-only and x64-only
- maintained public `develop` candidate: host-default Windows local
  `LabVIEWCLI` plus one bounded expert Docker provider selected through the
  published Windows PowerShell install/bootstrap surface and later `vihs`

Required surfaces:

- Visual Studio Code
- a trusted Git repository containing an eligible LabVIEW VI
- for the exact released Docker-only route: Docker Desktop or another
  Docker-compatible engine installed and running in the same session that
  launches VS Code
- for the maintained public candidate host route: one local Windows LabVIEW
  installation plus one matching `LabVIEWCLI` surface for the requested
  version and bitness

Not required:

- private GitLab access
- for the exact released Docker-only route: host LabVIEW and host LabVIEW CLI

## Runtime Selection

On the maintained public candidate line, installed compare begins from one
explicit provider request plus required LabVIEW facts:

- `irm https://gitlab.com/svelderrainruiz/vi-history-suite/-/raw/develop/scripts/install-vihs-extension.ps1 | iex`
- `vihs`
- `vihs --validate`

The candidate runtime rules are:

- host is the default provider on Windows local `LabVIEWCLI`
- Docker remains a bounded expert provider selected through the bootstrap or
  later `vihs`
- Docker `x86` is unsupported and fails closed with host-or-`x64` guidance
- if VS Code was already open when the CLI updated settings, reload or restart
  before trusting compare preflight

When Docker is selected, the extension still derives the governed image from
the current host and Docker daemon engine:

- Windows host + Linux engine: governed Linux image
- Windows host + Windows engine: governed Windows image
- Linux host: governed Linux image

If the selected governed image is missing locally, the extension pulls it on
first use before compare execution.

Before the first compare on a fresh machine, confirm the relevant runtime is
actually ready:

```bash
irm https://gitlab.com/svelderrainruiz/vi-history-suite/-/raw/develop/scripts/install-vihs-extension.ps1 | iex
vihs
vihs --validate
```

If you are using Docker, also confirm:

```bash
docker version
docker info --format '{{.OSType}}'
```

If those checks fail, install or start Docker before expecting image
acquisition to begin. If the candidate host route reports a blocked runtime,
correct provider, version, or bitness before expecting Compare to run.

## Installed User Flow

1. Install the extension from the VS Code Marketplace, from the exact released
   VSIX, or from a candidate build when you intentionally want the next line.
2. On the maintained public candidate, run the published Windows PowerShell
   bootstrap
   `irm https://gitlab.com/svelderrainruiz/vi-history-suite/-/raw/develop/scripts/install-vihs-extension.ps1 | iex`.
3. Keep or change provider, LabVIEW year, and bitness through that bootstrap
   or a later `vihs` run.
4. If VS Code was already open when the bootstrap or `vihs` changed settings,
   reload or restart the window only if the session still shows stale
   provider or runtime facts.
5. Run `vihs --validate`.
6. Open a trusted Git repository with an eligible LabVIEW VI.
7. Run `VI History`.
8. Select exactly two retained revisions with the commit checkboxes.
9. Review the explicit compare preflight section.
10. Choose `Compare` for that exact selected/base pair.
11. If Docker is selected and the governed image is not already present but
    Docker is ready, wait for first-use image acquisition.
12. Review the generated comparison report or the retained blocked/runtime
    facts.

Marketplace and exact-release users can stop after the installed-user flow
above. The rest of this page covers source evaluation and Codespaces work.

## Source Evaluation And Codespaces

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
4. Open the target Git repository there and use the explicit compare-preflight
   workflow.

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

This repo is the public source facade and source-evaluation surface.

It does not publish:

- private requirements and RTM artifacts
- benchmark-control packets
- maintainer-only human-review evidence
- internal GitLab control-plane docs
