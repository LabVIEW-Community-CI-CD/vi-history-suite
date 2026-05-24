# VI History Suite

VI History Suite is a Visual Studio Code extension for reviewing LabVIEW VI
history in Git repositories. It helps you pick two retained revisions of a
`.vi`, `.ctl`, or `.vit` file, review the compare preflight, and generate a
LabVIEW comparison report.

The active public source home is:

https://github.com/LabVIEW-Community-CI-CD/vi-history-suite

The published Marketplace extension ID remains:

```bash
svelderrainruiz.vi-history-suite
```

## Install

Install from the VS Code Extensions view, or run:

```bash
code --install-extension svelderrainruiz.vi-history-suite
```

Then run `VI History: Prepare Local Runtime Settings CLI` from the Command
Palette and validate the local runtime:

```bash
vihs
vihs --validate
```

## Use

1. Open a trusted Git repository that contains a tracked `.vi`, `.ctl`, or
   `.vit` file.
2. Right-click the file and choose `VI History`, or use the editor title action.
3. Select exactly two retained revisions with the checkbox column.
4. Review the compare preflight.
5. Choose `Compare`.

Windows defaults to local `LabVIEWCLI` when the provider has not been chosen.
Docker remains available for users who intentionally select and validate it.

## Source Evaluation

The normal source-evaluation path is a devcontainer or Codespace:

```bash
npm run check
npm test
npm run package
```

After `postStartCommand` completes (runs `npm run compile`), select the
`Run VI History Suite` launch configuration from the Run and Debug view and
press `F5`. A successful first launch opens an Extension Development Host
window after the compile/preLaunch step completes.

Optional fixture helpers:

```bash
npm run public:fixture:icon-editor
npm run public:repo:clone -- --repo-url https://github.com/<owner>/<repo>.git
```

Vagrant is retained only as an optional local helper for humans who already have
a Windows/LabVIEW box. It is not a release gate. See [docs/vagrant.md](./docs/vagrant.md).

## Contribute

This repository is licensed under BSD0 / `0BSD`. Pull requests are welcome under
the same license. See [CONTRIBUTING.md](./CONTRIBUTING.md).

For help, use [SUPPORT.md](./SUPPORT.md). For vulnerability reporting, use
[SECURITY.md](./SECURITY.md).
