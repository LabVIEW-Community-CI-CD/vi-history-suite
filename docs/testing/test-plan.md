# Test Plan

## Required Lightweight CI

Run these on pull requests and pushes to `main`:

```bash
npm ci
npm run check
npm test
npm run package
```

This hosted CI job remains the required public merge gate.

## Devcontainer Human Check

Inside the devcontainer or Codespace:

1. Wait for `postCreateCommand` to finish.
2. Run `npm run check`.
3. Run `npm test`.
4. Press `F5` and confirm the extension host starts.
5. Open a trusted Git repository with a tracked LabVIEW file and open
   `VI History`.

## Maintainer Windows/LabVIEW Check

When the trusted self-hosted runner is available, manually dispatch the
Windows/LabVIEW maintainer workflow on `main` or an exact `v*` tag. It runs the
normal package checks plus the Windows extension-host integration path and
uploads the VSIX and environment summary as maintainer evidence.

This runner is not used for pull requests and is not a required release gate.

## Optional Vagrant Check

When isolated local validation is useful and Vagrant plus a compatible
Windows/LabVIEW box are already available:

```bash
npm run vagrant:validate
cd vagrant
vagrant up
```

Vagrant evidence is useful local confidence only. It is not required for a
release.
