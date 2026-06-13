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

## Requirements

- Visual Studio Code 1.90 or newer.
- A trusted Git repository containing the tracked `.vi`, `.ctl`, or `.vit` file
  you want to review, with at least two retained revisions to compare.
- A LabVIEW comparison runtime, either:
  - **Host-native** LabVIEW 2025 or newer with the LabVIEW CLI installed
    (Windows defaults to this provider), or
  - **Docker**, using an NI LabVIEW container image that you select and
    validate.

The extension reads runtime state only — it never installs LabVIEW, Docker, or
any runtime for you.

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

For first-time installed-user feedback, use the onboarding tracker:

https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/12

Include the install surface, extension version, VS Code version, first command
or action attempted, and any Marketplace/source/support link that felt stale or
unclear.

## Use

1. Open a trusted Git repository that contains the tracked `.vi`, `.ctl`, or
   `.vit` file you want to review.
2. Right-click that file and choose `VI History`, or use the editor title
   action. The extension evaluates the selected file directly instead of
   scanning every VI in the repository first.
3. Select exactly two retained revisions with the checkbox column.
4. Review the compare preflight.
5. Choose `Compare`.

Windows defaults to local `LabVIEWCLI` when the provider has not been chosen.
Docker remains available for users who intentionally select and validate it.

## Runtime providers and safety checks

Before launching a comparison, VI History runs a compare preflight that checks
both selected revisions and the resolved runtime, then reports a clear,
actionable status instead of failing midway. When the runtime cannot safely
produce a correct report, the compare is blocked up front with guidance rather
than silently running against the wrong environment. Detected conditions
include:

- A running LabVIEW whose **bitness** differs from the selected bitness
  (LabVIEW cannot start a second instance at a different bitness).
- A running LabVIEW whose **version (year)** differs from the selected
  `viHistorySuite.labviewVersion` at the same bitness — so a compare never
  attaches to the wrong already-running LabVIEW on a multi-install host.
- A selected Docker **container image** that targets a platform the active
  Docker engine cannot launch, surfaced at the status bar and the panel
  preflight with a one-click **Pick Image Version** fix.
- **VI Server (TCP)** disabled in the selected LabVIEW, which would otherwise
  block the LabVIEW CLI from connecting.

Each block offers a next action (for example **Pick Runtime Provider** or
**Pick Image Version**) so the runtime can be aligned without leaving the
panel.

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

Source-evaluation feedback should identify whether the path was Codespaces,
Dev Containers in VS Code, or a local clone, and should include the first
command that failed or the first instruction that was unclear.

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
