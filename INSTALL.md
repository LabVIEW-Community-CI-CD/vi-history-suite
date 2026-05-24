# Install

## Marketplace

Use the VS Code Extensions view, or run:

```bash
code --install-extension svelderrainruiz.vi-history-suite
```

The Marketplace identity stays stable even though the source repository moved
to the LabVIEW Community CI/CD GitHub organization.

## First Run

1. Open or restart VS Code after installing the extension.
2. Run `VI History: Prepare Local Runtime Settings CLI` from the Command Palette.
3. Open an integrated terminal and run `vihs`.
4. Choose the provider, LabVIEW year, and bitness for this machine.
5. Run `vihs --validate`.

## Source Evaluation

Use a devcontainer or Codespace when you want to inspect or test the source:

```bash
npm ci
npm run check
npm test
npm run package
```

Launch the extension development host with `F5`.

Useful source-evaluation helpers:

```bash
npm run public:host:bootstrap-linux
npm run public:fixture:icon-editor
npm run public:repo:clone -- --repo-url https://github.com/<owner>/<repo>.git
```

The generic clone helper intentionally accepts only public HTTPS GitHub or
GitLab repository URLs.

## Optional Vagrant

Vagrant is a local human tester, not a release requirement:

```bash
npm run vagrant:validate
cd vagrant
vagrant up
```

See [docs/vagrant.md](./docs/vagrant.md) before using it.
