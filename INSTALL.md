# Install

## Route Boundary

- The exact released public line remains `v1.2.2`.
- The active `develop` candidate is a Windows x64 private-release route.
- Source evaluation, Codespaces, and Linux public smoke remain separate from
  the active private-release path.

## Active `develop` Windows x64 Private-Release Candidate

Use this route when you are validating the current `1.3.0` candidate on a real
Windows machine before any exact/public release work.

Required surfaces:

- Visual Studio Code on native Windows
- a trusted Git repository containing an eligible LabVIEW VI
- the governed Windows PowerShell install/bootstrap command
- installed LabVIEW selected through the runtime-settings CLI for the host lane
- Docker Desktop in Windows-container mode only when using the bounded expert
  Docker lane

Not required:

- WSL for the supported Windows x64 path
- Linux public smoke lanes
- private GitLab access

Private-release candidate flow:

1. In Windows PowerShell, run
   `irm https://gitlab.com/svelderrainruiz/vi-history-suite/-/raw/develop/scripts/install-vihs-extension.ps1 | iex`.
2. Let the bootstrap install the Marketplace extension, materialize the
   admitted `vihs` command, and keep or change provider/year/bitness in the
   same PowerShell session.
3. Run `vihs --validate`.
4. If you selected Docker, confirm Docker Desktop is already in
   Windows-container mode before trusting Compare.
5. Reload or restart the VS Code window only if the already-running session
   still shows stale provider or runtime facts after the bootstrap or a later
   `vihs` update.
6. Open the trusted repo, run `VI History`, select the commit pair, review the
   explicit compare preflight, and choose `Compare`.

The active private-release claim on `develop` is Windows x64 only. Linux and
Codespaces remain source-evaluation or internal proof surfaces, not the
supported installed-user route for this candidate.

## Exact Released Public Runtime Contract

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

This route remains useful for source evaluation, but it is not part of the
active Windows x64 private-release contract above.

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
