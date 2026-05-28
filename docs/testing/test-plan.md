# Test Plan

## Required Lightweight CI

Run these on pull requests and pushes to governed public branches:

```bash
npm ci
npm run check
npm run traceability:audit
npm test
npm run package
```

This hosted CI job remains the required public merge gate for `develop` and
`main`. The same required job also enforces branch governance: normal feature
work and Dependabot maintenance target `develop`, while only
`release/vX.Y.Z` and `hotfix/vX.Y.Z` branches target `main`.
The traceability audit is part of the required hosted gate so newly added
implementation, test, workflow, and documentation surfaces remain classified
before merge.

## Diagnostic Test VSIX Check

When a reporter needs to retest a fix before Marketplace publication, manually
dispatch the `Package Test VSIX` workflow from `main`, `release/vX.Y.Z`, or an
exact `vX.Y.Z` tag. It runs the lightweight package checks and uploads
`vi-history-suite-*.vsix` as a short-lived Actions artifact.

Set `publish_prerelease` only when a public `test-vsix-latest` prerelease asset
is needed for reporter download. This is diagnostic reporter support only, not
Marketplace publication and not a required release gate.

## Devcontainer Human Check

Inside the devcontainer or Codespace:

1. Wait for `postCreateCommand` and `postStartCommand` to finish.
2. Run `npm run check`.
3. Run `npm test`.
4. Select the `Run VI History Suite` launch configuration and press `F5`.
5. Confirm an Extension Development Host window opens after compile/preLaunch
   completes.
6. Open a trusted Git repository with a tracked LabVIEW file and open
   `VI History`.

If this first-run path fails or a step is unclear, record the environment,
command, and first blocked step in the onboarding tracker:

https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/12

## Maintainer Windows/LabVIEW Check

When the trusted self-hosted runner is available, manually dispatch the
Windows/LabVIEW maintainer workflow on `main`, `release/vX.Y.Z`, or an exact
`vX.Y.Z` tag. It runs the normal package checks plus the Windows extension-host
integration path and uploads the VSIX and environment summary as maintainer
evidence.

This runner is not used for pull requests and is not a required release gate.

## Marketplace Release Check

Marketplace publication is tag-only. Create an exact `vX.Y.Z` tag on the
merged `main` commit after release evidence is complete. The `Marketplace
Release` workflow verifies the tag, package version, `origin/main`
reachability, lightweight package checks, pinned VSIX publication, and live
Marketplace listing evidence.

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
