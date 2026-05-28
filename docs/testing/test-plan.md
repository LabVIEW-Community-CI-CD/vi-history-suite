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

## Coverage Evidence And Threshold Policy

`npm test` runs Vitest with coverage enabled. The required hosted CI job retains
the machine-readable coverage outputs from that run through the
`PR Coverage Gate / coverage` step:

- `coverage/cobertura-coverage.xml`
- `coverage/coverage-summary.json`

The enforced coverage thresholds in `vitest.config.ts` are baseline regression
floors: 39% statements, 32% branches, 45% functions, and 39% lines. These
floors preserve the current tested baseline; they are not a claim that the
repository has complete coverage. Raise the thresholds only in a PR that shows
new coverage evidence and updates this test plan with the new baseline.

## Critical-Path Verification Evidence

| Requirement | Test Evidence | Code Path | Test Path | Coverage / Rationale |
| --- | --- | --- | --- | --- |
| VHS-REQ-597 | TEST-597 | .github/workflows/ci.yml; vitest.config.ts | tests/unit/branchGovernanceWorkflow.test.ts; tests/unit/requirementsDocs.test.ts | Hosted CI retains coverage artifacts and enforces baseline thresholds. |
| VHS-REQ-604 | TEST-604 | src/indexing/viEligibilityIndexer.ts | tests/unit/viEligibilityIndexer.test.ts | Persistent cache reuse and fail-closed cache handling are covered directly. |
| VHS-REQ-610 | TEST-610 | src/dashboard/comparisonReportArchive.ts; src/dashboard/dashboardLatestRun.ts | tests/unit/comparisonReportArchive.test.ts; tests/unit/dashboardLatestRun.test.ts | Dashboard retained-evidence archive and latest-run behavior have focused unit coverage. |
| VHS-REQ-611 | TEST-611 | src/docs/bundledDocumentation.ts; src/docs/bundledDocumentationAction.ts | tests/unit/bundledDocumentation.test.ts; tests/unit/bundledDocumentationAction.test.ts | Installed documentation manifest/page loading and command routing are covered directly. |
| VHS-REQ-612 | TEST-612 | src/tooling/localRuntimeSettingsCli.ts; src/extension.ts | tests/unit/packageManifest.test.ts; tests/unit/extensionActivationLazySideEffects.test.ts; tests/integration/suite/extensionHost.test.ts | Installed runtime settings CLI command exposure is verified without changing runtime selection behavior. |

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
