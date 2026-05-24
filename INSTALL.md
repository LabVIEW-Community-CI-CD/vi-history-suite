# Install

## Marketplace

Use the VS Code Extensions view, or run:

```bash
code --install-extension svelderrainruiz.vi-history-suite
```

The Marketplace identity stays stable even though the source repository moved
to the LabVIEW Community CI/CD GitHub organization.

If the Marketplace listing, install command, or source/support links disagree,
record the mismatch in the first-time onboarding tracker:

https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/12

## First Run

1. Open or restart VS Code after installing the extension.
2. Run `VI History: Prepare Local Runtime Settings CLI` from the Command Palette.
3. Open an integrated terminal and run `vihs`.
4. Choose the provider, LabVIEW year, and bitness for this machine.
5. Run `vihs --validate`.

## Source Evaluation

Use a devcontainer or Codespace when you want to inspect or test the source:

```bash
npm run check
npm test
npm run package
```

After `postStartCommand` completes (runs `npm run compile`), select the
`Run VI History Suite` launch configuration from the Run and Debug view and
press `F5`. A successful first launch opens an Extension Development Host
window after the compile/preLaunch step completes.

Useful source-evaluation helpers:

```bash
npm run public:host:bootstrap-linux
npm run public:fixture:icon-editor
npm run public:repo:clone -- --repo-url https://github.com/<owner>/<repo>.git
```

The generic clone helper intentionally accepts only public HTTPS GitHub or
GitLab repository URLs.

For source-evaluation feedback, include whether you used Codespaces, Dev
Containers in VS Code, or a local clone; the first command that failed; and
whether the `Run VI History Suite` launch opened an Extension Development Host.

## Optional Vagrant

Vagrant is a local human tester, not a release requirement:

```bash
npm run vagrant:validate
cd vagrant
vagrant up
```

See [docs/vagrant.md](./docs/vagrant.md) before using it.
