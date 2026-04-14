# VI History Suite

`vi-history-suite` is a Visual Studio Code extension for reviewing LabVIEW VI
history in Git repositories.

This public GitHub repo is the source-facing product surface for extension
users and public contributors.

## If You Installed VI History Suite

If you installed the extension from the VS Code Marketplace or from a VSIX,
start with the public user wiki instead of the branch/governance sections in
this repo.

Installed-user start pages:

- Home:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki`
- Install and release:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Install-And-Release`
- User workflow:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/User-Workflow`
- Comparison reports and dashboard review:
  `https://github.com/svelderrainruiz/vi-history-suite/wiki/Comparison-Reports-And-Dashboard-Review`

Maintained public candidate workflow on `develop`:

1. run `VI History: Prepare Local Runtime Settings CLI`
2. persist the provider, LabVIEW version, and LabVIEW bitness through
   `vihs-runtime-settings --provider <host|docker> --labview-version <major> --labview-bitness <x86|x64>`
3. if VS Code was already open when the CLI updated settings, reload or restart
   the window
4. run `VI History: Check Runtime Readiness`
5. open a trusted Git repo that contains an eligible LabVIEW VI
6. run `VI History`
7. select exactly two retained revisions with the commit checkboxes
8. review the explicit compare preflight section, then choose `Compare`
9. review the generated comparison report or the retained blocked/runtime facts

You do not need to fork this repo or choose a branch to use the installed
extension locally.

It is intentionally bounded:

- the exact released `main` line and Marketplace `1.2.2` install route remain
  Docker-only
- the maintained public candidate on `develop` opens host-default Windows
  local `LabVIEWCLI` plus one bounded expert Docker provider
- provider, LabVIEW version, and LabVIEW bitness stay explicit and user-set
  through the generated settings CLI
- Docker `x86` is unsupported and fails closed with host-or-`x64` guidance
- runtime readiness and compare preflight stay explicit before compare
- repo-agnostic exact selected/base compare remains the installed review flow
- devcontainer/Codespaces-capable development path remains available

This repo does not publish the internal GitLab control plane, benchmark
governance, or maintainer-only acceptance evidence.

## Public Product Shape

- Open a trusted Git repository containing an eligible LabVIEW VI.
- Run `VI History`.
- Use the commit checkboxes to select exactly two retained revisions.
- Review the explicit compare preflight section.
- Choose `Compare` for that exact selected/base pair.

The maintained public candidate on `develop` keeps the runtime contract
explicit:

- Windows defaults to local `LabVIEWCLI` when the persisted provider is absent.
- Docker is a bounded expert provider selected through the generated settings
  CLI instead of a panel-side picker.
- `viHistorySuite.labviewVersion` and `viHistorySuite.labviewBitness` are
  required across both provider classes.
- `VI History: Check Runtime Readiness` and `vihs-runtime-settings --validate`
  expose whether the current bundle is `ready`, `needs-image-acquisition`, or
  blocked.
- If Docker is selected, the extension derives the governed Windows or Linux
  image family from the current Docker engine and fails closed on unsupported
  `x86`.
- If VS Code was already open when the generated settings CLI changed the
  provider bundle, reload or restart before trusting compare preflight.

## Branch Use

- Branches matter only when you are evaluating or contributing to the source
  repo. Marketplace and installed-extension users do not need this branch
  model to use the product locally.
- If you are here to evaluate the next public candidate, use `develop`. Stay
  on `main` only if you want the latest exact released source.
- `main` keeps the exact released Docker-only installed-user contract.
- `develop` carries the maintained public candidate for the next host-default
  Windows local `LabVIEWCLI` line.
- `main` is the public default branch and tracks the latest exact released
  source line.
- `develop` is the public evaluation branch for the next governed candidate
  line.
- If you only want the latest released source or release-facing docs, stay on
  `main`; if you are following the first-time Codespaces or devcontainer
  evaluation flow, explicitly choose `develop`.
- Exact release numbers and retained version facts are listed later in
  `Current Version Line`.

## Fastest First Fork-Owner Run

If this is your first time using the public fork path, use this order:

1. Fork the repo and clear `Copy the main branch only` so your fork keeps
   `develop`. Your fork can still keep `main` as its default branch.
2. Create a Codespace from `develop` with `Codespace repository configuration`
   -> `New with options` and choose a `16-core` machine. Treat `16-core` as
   the supported first-time machine. If GitHub does not offer `16-core` on
   your account, choose the largest machine available and treat that as
   best-effort instead of equivalent support.
3. Wait for the browser message
   `Setting up remote connection: Building codespace` to finish.
4. Run `npm run public:fixture:icon-editor`.
5. Press `F5`, open `/workspaces/labview-icon-editor`, then right-click
   `resource/plugins/lv_icon.vi` and choose `VI History`.

The full first-time walkthrough is on the public wiki:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Fork-Codespace-Quickstart`

That first-time walkthrough is the canonical step-by-step path for a brand new
fork and a brand new Codespace. This README keeps only the short summary.

## Public Development Path

This repo is expected to work in a Docker-capable devcontainer or Codespace.

GitHub opens this public repo on `main` by default. That is expected because
`main` is the latest exact released source line. Use `develop` when you are
following the public evaluation path that will lead into the next governed
candidate line.

## Public Devcontainer And Codespaces

The public GitHub facade is expected to support evaluation inside Codespaces or
a local devcontainer.

- A Linux-hosted development session uses the governed Linux container image.
- The exact released installed extension path on `main` does not require host
  LabVIEW.
- The maintained public candidate on `develop` is where Windows local
  `LabVIEWCLI` evaluation becomes relevant.

Typical public fast loop:

```bash
npm ci
npm run compile
npm run test:design-contract
```

Then press `F5` in VS Code to launch the extension host.

The public devcontainer/Codespaces surface bootstraps the Linux VS Code host
dependencies automatically during creation. If you need to rerun that bootstrap
manually, use:

```bash
npm run public:host:bootstrap-linux
```

Codespaces/devcontainers also run `npm ci` on create and `npm run compile` on
start. Only rerun `npm run compile` manually if the setup was interrupted or
you are troubleshooting a stale development host.

The public Linux cold-pull smoke surface is:

```bash
npm run public:smoke:linux
```

The optional public tester-fixture helper is:

```bash
npm run public:fixture:icon-editor
```

It clones `ni/labview-icon-editor` into a repo-sibling `labview-icon-editor`
folder. In a GitHub Codespace created from this repo, that path is
`/workspaces/labview-icon-editor`.

For the step-by-step fork-owner walkthrough that ends at
`resource/plugins/lv_icon.vi`, use the public wiki page:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Fork-Codespace-Quickstart`

That page is the easier first fork-owner path because the repo ships a helper
for `ni/labview-icon-editor` and now includes:

- fork guidance to keep the `develop` branch
- `Codespaces` `...` -> `New with options`
- `develop` + `16-core` Codespace setup
- the browser message `Setting up remote connection: Building codespace`
- the port `6010` forwarding dialog explanation
- the exact `Open Folder...` path for `lv_icon.vi`

For refresh-only steps after the first successful Codespace setup, use:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Refresh-Codespace-Repositories`

## Reference Manual For Any Public Repo

If you want to review the changes of a LabVIEW VI between two commits on a
public GitHub or public GitLab repo instead of the helper-backed
`ni/labview-icon-editor` path, use the public wiki reference manual:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Review-Public-LabVIEW-VI-Changes`

In a brand-new Codespace, start with the interactive command:

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

If you want a specific branch instead of the repo's default branch, add
`--branch <branch-name>`. Otherwise omit `--branch` and let the command use the
repo's remote default branch:

```bash
npm run public:repo:clone -- --repo-url https://github.com/crossrulz/SerialPortNuggets.git --branch <branch-name>
```

When `--branch` is omitted, the command resolves the remote default branch.
That means it works whether the public target repo uses `main`, `master`, or a
different default branch, and it keeps the first-time path simpler.

The clone target stays visible instead of hidden:

- `hse-logger` becomes `/workspaces/hse-logger`
- `SerialPortNuggets` becomes `/workspaces/SerialPortNuggets`

Use the exact path printed by the command when you later choose
`File` -> `Open Folder...` in the extension development host.

The reference manual keeps the generic public-repo path separate from the
canonical helper-backed `lv_icon.vi` quickstart, and it assumes a brand new
fork and a brand new Codespace. It also includes the documented example VIs:

- [Hampel Software Engineering](https://hampel-soft.com/) `hse-logger`:
  `Examples/Logging with Helper-VIs.vi`
- `crossrulz/SerialPortNuggets`:
  `ASCII/Terminals/ASCII Command-Response.vi`

The guarded package path is:

```bash
npm run package -- --out /tmp/vi-history-suite-public-preview.vsix
```

## Start Here

- [Install](INSTALL.md)
- [Support](SUPPORT.md)
- [Contributing](CONTRIBUTING.md)
- Public GitHub wiki: `https://github.com/svelderrainruiz/vi-history-suite/wiki`

## Current Version Line

- retained exact-version releases: `v0.2.0`, `v1.0.0`, `v1.0.1`, `v1.0.2`, `v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.0.6`, `v1.1.0`, `v1.2.0`, `v1.2.1`, `v1.2.2`
- burned exact release line: `v1.0.2`
- current exact released line: `v1.2.2`
- current published package line on `main`: `1.2.2`
- current develop package line on `develop`: `1.3.0`
- active public candidate line on `develop`: `v1.3.0`
- no newer `release/*` branch is active yet
- public GitHub default branch: `main`
- public Codespaces evaluation branch: `develop`
