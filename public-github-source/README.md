# VI History Suite

`vi-history-suite` is a Visual Studio Code extension for reviewing LabVIEW VI
history in Git repositories.

This public GitHub repo is the source-facing product surface for extension
users and public contributors.

It is intentionally bounded:

- Docker-only compare execution
- x64 container surfaces only
- repo-agnostic two-commit checkbox-selected compare flow
- devcontainer/Codespaces-capable development path
- no host-LabVIEW runtime competition in the installed-extension workflow

This repo does not publish the internal GitLab control plane, benchmark
governance, or maintainer-only acceptance evidence.

## Public Product Shape

- Open a trusted Git repository containing an eligible LabVIEW VI.
- Run `VI History`.
- Select one commit checkbox.
- Select a second distinct commit checkbox.
- The second checkbox selection triggers compare generation automatically.

The compare surface is Docker-only:

- Windows hosts use the governed image that matches the current Docker daemon
  engine.
- Linux hosts use the governed Linux image.
- Missing governed images are pulled on first use with visible progress.
- If Docker is unavailable or the selected image cannot be acquired, the
  extension fails closed instead of probing host LabVIEW.

## Branch Use

- `main` is the public default branch and tracks the latest exact released
  source line.
- `develop` is the public evaluation branch for the next governed candidate
  line.
- If you only want the latest released source or release-facing docs, stay on
  `main`.
- If you are following the first-time Codespaces or devcontainer evaluation
  flow, explicitly choose `develop`.

## Fastest First Fork-Owner Run

If this is your first time using the public fork path, use this order:

1. Fork the repo and clear `Copy the main branch only` so your fork keeps
   `develop`. Your fork can still keep `main` as its default branch.
2. Create a Codespace from `develop` with `Codespace repository configuration`
   -> `New with options` and choose a `16-core` machine when GitHub offers it.
3. Wait for the browser message
   `Setting up remote connection: Building codespace` to finish.
4. Run `npm run public:fixture:icon-editor`.
5. Press `F5`, open `/workspaces/labview-icon-editor`, then right-click
   `resource/plugins/lv_icon.vi` and choose `VI History`.

The full first-time walkthrough is on the public wiki:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Fork-Codespace-Quickstart`

## Public Development Path

This repo is expected to work in a Docker-capable devcontainer or Codespace.

GitHub opens this public repo on `main` by default. That is expected because
`main` is the latest exact released source line. Use `develop` only when you
are following the public evaluation path for the next governed candidate.

## Public Devcontainer And Codespaces

The public GitHub facade is expected to support evaluation inside Codespaces or
a local devcontainer.

- A Linux-hosted development session uses the governed Linux container image.
- No host LabVIEW installation is required for the installed extension path.

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

For the separate manual-clone walkthrough for `ni/actor-framework`, use:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Manual-Actor-Framework-Clone`

For refresh-only steps after the first successful Codespace setup, use:

- `https://github.com/svelderrainruiz/vi-history-suite/wiki/Refresh-Codespace-Repositories`

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

- retained exact-version releases: `v0.2.0`, `v1.0.0`, `v1.0.1`, `v1.0.2`, `v1.0.3`, `v1.0.4`, `v1.0.5`
- burned exact release line: `v1.0.2`
- current exact released line: `v1.0.5`
- current published package line on `main`: `1.0.5`
- current develop package line on `develop`: `1.0.6`
- active exact release candidate line on `develop`: `v1.0.6`
- public GitHub default branch: `main`
- public Codespaces evaluation branch: `develop`
