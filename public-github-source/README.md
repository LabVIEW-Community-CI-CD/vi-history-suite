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

## Public Development Path

This repo is expected to work in a Docker-capable devcontainer or Codespace.

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

It clones `ni/labview-icon-editor` into `.cache/public-fixtures/labview-icon-editor`
for public devcontainer/Codespaces evaluation without making that clone a
default startup dependency.

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

- retained exact-version releases: `v0.2.0`, `v1.0.0`
- current exact-version line: `v1.0.0`
- active development baseline: `1.0.0`
