# Contributing

This repository is source-available and intentionally restrictive. It is not an
open-source project.

## Public Development Loop

The public source facade is intended to be usable in a Docker-capable
devcontainer or Codespace:

```bash
npm ci
npm run compile
npm run test:design-contract
npm run public:host:bootstrap-linux
```

Then use `F5` in VS Code to launch the extension host.

If you want a governed public sample repository to test against, run:

```bash
npm run public:fixture:icon-editor
```

## Before You Contribute

Do not open pull requests containing code, documentation, or other copyrighted
material for inclusion unless the licensor has explicitly invited the
contribution and entered into a separate private written agreement with you.

By default:

- issue reports and discussion are fine
- proposed patches are not accepted
- opening a pull request does not, by itself, grant the licensor any rights
  beyond what is already provided by law and the repository license

## Scope

This public repo is for the public product surface:

- extension source
- public docs
- public workflows
- public devcontainer/Codespaces path

Internal GitLab control-plane material is intentionally maintained elsewhere.
