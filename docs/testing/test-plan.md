# Test Plan

## Required Lightweight CI

Run these on pull requests and pushes to governed public branches:

```bash
npm ci
npm run check
npm run customization:audit
npm run traceability:audit
npm run docs:links
npm test
npm run package
npm run dod:gate
```

This hosted CI job remains the required public merge gate for `develop` and
`main`. The same required job also enforces branch governance: normal feature
work and Dependabot maintenance target `develop`, while only
`release/vX.Y.Z` and `hotfix/vX.Y.Z` branches target `main`.
The traceability audit is part of the required hosted gate so newly added
implementation, test, workflow, and documentation surfaces remain classified
before merge, and the customization audit runs before traceability so AGENTS and
workspace customization drift fails closed.
The required job also emits `customization-audit-report.json` and uploads it
through `Customization Audit Report / custom-audit` so CI triage can classify
runtime issues, AGENTS sync drift, frontmatter drift, applyTo drift, markdown
link drift, and command-reference drift.
The `Traceability Audit` and `DoD Gate / dod` steps also retain
`traceability-audit-report.txt` and `dod-gate-report.txt`, uploaded through
`Governance Gate Reports / governance-gates`, so CI triage can inspect gate
evidence even when a required gate fails.
The `Docs Link Check / lychee` step runs `npm run docs:links`
inside the same required job so committed Markdown and bundled documentation
local links are checked before tests and packaging.

## Coverage Evidence And Threshold Policy

`npm test` runs Vitest with coverage enabled. The required hosted CI job retains
the machine-readable coverage outputs from that run through the
`PR Coverage Gate / coverage` step:

- `coverage/cobertura-coverage.xml`
- `coverage/coverage-summary.json`

The enforced coverage thresholds in `vitest.config.ts` are evidence-backed
baseline regression floors: 60% statements, 50% branches, 65% functions, and
60% lines. These floors were ratcheted after the coverage-led assurance wave
measured 68.73% statements, 56.85% branches, 78.07% functions, and 68.74%
lines on merged `develop`; they are not a claim that the repository has
complete coverage. Raise the thresholds only in a PR that shows new coverage
evidence and updates this test plan with the new baseline.

## Coverage Traceability Map

Run `npm run coverage:map` after `npm test` to join
`coverage/coverage-summary.json`, `docs/requirements/traceability-inventory.csv`,
and `docs/requirements/rtm.csv`. The report highlights requirement-mapped files
below 50% coverage and zero-coverage supporting files tied to active
requirements so coverage-led assurance work starts with product-risk evidence
instead of percentage chasing. Use the report to seed follow-up coverage issues
and to justify future coverage threshold ratchets.

## Critical-Path Verification Evidence

| Requirement | Test Evidence | Code Path | Test Path | Coverage / Rationale |
| --- | --- | --- | --- | --- |
| VHS-REQ-597 | TEST-597 | .github/workflows/ci.yml; vitest.config.ts | tests/unit/branchGovernanceWorkflow.test.ts; tests/unit/requirementsDocs.test.ts | Hosted CI retains coverage artifacts, enforces evidence-backed baseline thresholds at 60% statements, 50% branches, 65% functions, and 60% lines, and runs `DoD Gate / dod` (`npm run dod:gate`) after packaging. |
| VHS-REQ-016 | TEST-016 | src/commands/openViHistoryCommand.ts | tests/unit/openViHistoryCommand.test.ts | User-facing command stops cover missing URI, trust gate, ineligible file guidance, history-load failures, documentation routing, and explicit cancellation stages. |
| VHS-REQ-017 | TEST-017 | src/services/viHistoryModel.ts; src/ui/historyPanel.ts | tests/unit/viHistoryModel.test.ts; tests/unit/historyPanelRendering.test.ts | History model facts cover repository/path/signature/history-window decisions and previous-hash links before rendering. |
| VHS-REQ-039 | TEST-039 | src/commands/openViHistoryCommand.ts; src/ui/historyPanelTracker.ts | tests/unit/openViHistoryCommand.test.ts; tests/unit/historyPanelTracker.test.ts | Review packet and hash copy routes are verified through clipboard and panel action summaries. |
| VHS-REQ-133 | TEST-133 | src/ui/historyPanel.ts; src/commands/openViHistoryCommand.ts; src/reporting/comparisonReportPreflight.ts; src/reporting/comparisonReportAction.ts | tests/unit/explicitComparePairWorkflow.test.ts; tests/unit/openViHistoryCommand.test.ts; tests/unit/comparisonReportPreflight.test.ts; tests/unit/comparisonReportAction.test.ts | Explicit selected/base ordering is verified from panel selection through preflight and comparison action orchestration. |
| VHS-REQ-147 | TEST-147 | src/reporting/comparisonReportRuntimeExecution.ts; src/reporting/comparisonReportPlan.ts | tests/unit/comparisonReportRuntimeExecution.test.ts | Runtime execution stages deterministic inputs from historical blobs and preserves canonical names across container report output. |
| VHS-REQ-148 | TEST-148 | src/reporting/comparisonReportRuntimeExecution.ts; src/reporting/comparisonReportPacket.ts; src/reporting/comparisonReportExecutionPlan.ts; src/reporting/comparisonReportAction.ts | tests/unit/comparisonReportRuntimeExecution.test.ts; tests/unit/comparisonReportPacket.test.ts; tests/unit/comparisonReportAction.test.ts | Retained execution evidence covers failed runtime attempts, stale output rejection, archive creation, and packet fallback display. |
| VHS-REQ-155 | TEST-155 | src/reporting/comparisonRuntimeLocator.ts; src/reporting/comparisonRuntimeDoctor.ts; src/reporting/comparisonReportAction.ts; src/reporting/comparisonReportPacket.ts | tests/unit/comparisonRuntimeLocator.test.ts; tests/unit/comparisonRuntimeDoctor.test.ts; tests/unit/comparisonReportAction.test.ts; tests/unit/comparisonReportPacket.test.ts; tests/unit/comparisonReportRuntimeExecution.test.ts | Runtime discovery diagnostics cover host/container provider decisions and user-facing blocked-runtime summaries. |
| VHS-REQ-604 | TEST-604 | src/indexing/viEligibilityIndexer.ts | tests/unit/viEligibilityIndexer.test.ts | Persistent cache reuse and fail-closed cache handling are covered directly. |
| VHS-REQ-606 | TEST-606 | src/indexing/viEligibilityIndexer.ts; src/commands/openViHistoryCommand.ts | tests/unit/openViHistoryCommand.test.ts; tests/unit/viEligibilityIndexer.test.ts | Indexing diagnostics expose explicit states, refresh reasons, cache facts, and separation from runtime diagnostics. |
| VHS-REQ-610 | TEST-610 | src/dashboard/comparisonReportArchive.ts; src/dashboard/dashboardLatestRun.ts; src/dashboard/multiReportDashboard.ts; src/dashboard/multiReportDashboardAction.ts; src/dashboard/retainedDashboardEvidence.ts; src/review/humanReviewSubmission.ts; src/scenarios/decisionRecord.ts; src/scenarios/reviewScenarioRegistry.ts; src/support/repositorySupportPolicy.ts | tests/unit/comparisonReportArchive.test.ts; tests/unit/dashboardLatestRun.test.ts; tests/unit/multiReportDashboard.test.ts; tests/unit/multiReportDashboardAction.test.ts; tests/unit/retainedDashboardEvidence.test.ts; tests/unit/humanReviewSubmission.test.ts; tests/unit/reviewDecisionRecord.test.ts; tests/unit/reviewScenarioSupportPolicy.test.ts | Dashboard retained-evidence archive, latest-run, aggregate rendering, action routing, proof seeding, review submission boundaries, decision records, scenario contracts, and support-tier rules have focused unit coverage. |
| VHS-REQ-611 | TEST-611 | src/docs/bundledDocumentation.ts; src/docs/bundledDocumentationAction.ts | tests/unit/bundledDocumentation.test.ts; tests/unit/bundledDocumentationAction.test.ts | Installed documentation manifest/page loading and command routing are covered directly. |
| VHS-REQ-612 | TEST-612 | src/tooling/localRuntimeSettingsCli.ts; src/extension.ts | tests/unit/localRuntimeSettingsCli.test.ts; tests/unit/packageManifest.test.ts; tests/unit/extensionActivationLazySideEffects.test.ts; tests/integration/suite/extensionHost.test.ts | Installed runtime settings CLI command exposure, argument parsing, launcher materialization, idempotent settings refresh, malformed-config errors, validation proof output, terminal output, and missing global-storage handling are verified without changing runtime selection behavior. |
| VHS-REQ-613 | TEST-613 | scripts/mapCoverageToTraceability.js; vitest.config.ts | tests/unit/coverageMapScript.test.ts; tests/unit/requirementsDocs.test.ts | Coverage map links retained coverage evidence to RTM/inventory risk and protects evidence-backed threshold ratchets. |
| VHS-REQ-614 | TEST-614 | tests/unit/vscodeTestHarness.ts | tests/unit/vscodeTestHarness.test.ts; tests/unit/requirementsDocs.test.ts | Shared VS Code fakes support coverage-led command, webview, storage, filesystem, clipboard, progress, output, and runtime CLI tests. |
| VHS-REQ-615 | TEST-615 | package.json; .github/workflows/ci.yml; .github/workflows/marketplace-release.yml; scripts/checkDefinitionOfDone.js; scripts/auditCustomizationGovernance.js; scripts/generateCloseoutEvidence.js; scripts/verifyMarketplaceListing.js; .github/pull_request_template.md; docs/maintainer-operations.md; docs/requirements/srs.md; docs/requirements/rtm.csv; docs/requirements/id-index.csv; docs/requirements/README.md; docs/testing/test-plan.md; docs/requirements/traceability-inventory.csv | tests/unit/definitionOfDoneGate.test.ts; tests/unit/customizationGovernanceAuditScript.test.ts; tests/unit/requirementsDocs.test.ts; tests/unit/traceabilityAuditScript.test.ts | Definition-of-Done operating contract covers issue quality, PR evidence, hosted CI order, local gates, standards provenance, closeout evidence, traceability drift prevention, release evidence, and hosted `DoD Gate / dod` enforcement in `.github/workflows/ci.yml`. |
| VHS-REQ-616 | TEST-616 | src/extension.ts; src/tooling/runtimeAutoDetect.ts; src/tooling/runtimeSettingsSeed.ts | tests/unit/runtimeAutoDetect.test.ts; tests/unit/runtimeSettingsSeed.test.ts; tests/unit/extensionActivationLazySideEffects.test.ts; tests/unit/requirementsDocs.test.ts | Activation runs the filesystem-only runtime detector and seeds or repairs `viHistorySuite.runtimeProvider`/`labviewVersion`/`labviewBitness` so fresh installs and upgrades arrive with a working comparison provider; preserves satisfiable persisted values; reports `no-runtime-detected` without writing when nothing is found. |
| VHS-REQ-617 | TEST-617 | src/extension.ts; src/ui/runtimeAvailabilityNotice.ts; src/commands/runtimeCommands.ts | tests/unit/runtimeAvailabilityNotice.test.ts; tests/unit/runtimeCommands.test.ts; tests/unit/requirementsDocs.test.ts | Status bar item reflects detection outcome, first-run information notice fires once via globalState `vihs.firstRunNoRuntimeNoticeShown`, and `onDidChangeWindowState` re-detect is throttled by `RUNTIME_RE_DETECT_THROTTLE_MS`. Three trust-gated VS Code commands expose runtime state: `Detect Runtime Now` bypasses the throttle, `Reset First-Run Runtime Notice` requires modal confirmation to clear the globalState flag, and `Show Runtime Summary` writes a structured report to the `VI History: Runtime` output channel with a clipboard Copy action. |
| VHS-REQ-620 | TEST-620 | src/extension.ts; src/ui/runtimeAvailabilityNotice.ts; src/commands/pickRuntimeProviderCommand.ts; src/commands/runtimeCommands.ts | tests/unit/runtimeAvailabilityNotice.test.ts; tests/unit/runtimeAvailabilityWatcher.test.ts; tests/unit/pickRuntimeProviderCommand.test.ts; tests/unit/runtimeCommands.test.ts; tests/unit/requirementsDocs.test.ts | Status bar label is sourced from the persisted runtime selection when `viHistorySuite.runtimeProvider`/`labviewVersion`/`labviewBitness` are populated and the combination is satisfiable per `isPersistedSelectionSatisfiable`, otherwise the auto-detection recommendation is used (silent fallback). The watcher subscribes to `onDidChangeConfiguration` filtered to `viHistorySuite` and re-renders from the cached detection without re-probing, so a `vihs --provider …` CLI invocation or manual settings.json edit updates the label immediately. The `Pick Runtime Provider` quick-pick is built from the cached detection (host installations + Docker if `cliAvailable` + Clear option) and writes selections to `ConfigurationTarget.Global`. The `Show Runtime Summary` report appends a `Drift:` line with three states: `none`, `selection differs from recommendation`, and `selection unsatisfiable on this host; falling back to recommendation`. |

## Diagnostic Test VSIX Check

When a reporter needs to retest a fix before Marketplace publication, manually
dispatch the `Package Test VSIX` workflow from `main`, `release/vX.Y.Z`, or an
exact `vX.Y.Z` tag. It runs the lightweight package checks and uploads
`vi-history-suite-*.vsix` as a short-lived Actions artifact.

Set `publish_prerelease` only when a public immutable prerelease asset is needed
for reporter download. The workflow creates a unique
`diagnostic-test-vsix-<run-id>-<run-attempt>` prerelease and does not edit,
clobber, or reuse an existing GitHub Release. This is diagnostic reporter
support only, not Marketplace publication and not a required release gate.

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

[Onboarding tracker issue #12](https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/12)

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
reachability, lightweight package checks, pinned VSIX publication, bounded live
Marketplace listing retry, and retained Marketplace listing evidence.
Release evidence names required validation surfaces (traceability audit,
docs-link check, tests, package, Marketplace listing, and closeout
expectation) and retains:

- `release-evidence/marketplace-show.json`
- `release-evidence/marketplace-listing-verification.json`
- `release-evidence/release-evidence-contract.json`
- `coverage/**`
- `vi-history-suite-*.vsix`

## Closeout Evidence Check

Umbrella issue closeout requires generated evidence:

```powershell
npm run closeout:evidence -- --kind standards --issue <issue-number> --run-gates --save-dir assurance-closeout-evidence
```

The closeout command runs `npm run traceability:audit`, `npm run docs:links`,
`npm run dod:gate`, `npm run check`, `npm test`, and `npm run package` when
`--run-gates` is set. It always runs standards evidence and standards toolchain
provenance. It tries host Python first in `auto` mode and falls back to the
published GitLab registry workbench image when host preflight is unavailable.
When `--save-dir` is provided, closeout evidence writes a machine-readable
`closeout-summary.json` artifact with gate status, standards status, provenance
status, and closure-decision state.
Remote provenance and registry operations run with bounded timeout windows and
one transient-network retry; auth-denied and credential-helper failures remain
fail-closed and non-retryable.
Docker mode inspects the selected image, pulls the published default when
missing, and reports the selected image plus pull/auth status in closeout
evidence; local images are used only through an explicit `--standards-image`
override. Provenance evidence verifies GitLab source authority, the private
GitHub mirror, `v0.2.19`, the local non-authoritative skill cache, and registry
image access. The DoD parser reports explicit `PASS`, `N/A`, or `FAIL` and only
lets scanner-visible evidence in `.github/workflows/ci.yml` promote DoD to
`PASS`; generated `assurance-*-evidence` outputs and unit-test fixtures are
disqualified sources. A summary is not closable until local gates, mandatory
standards evidence, standards provenance, and Definition-of-Done evidence are
clean or tied to a blocking follow-up issue.

## PR Evidence Contract

Requirement-scoped pull requests must keep a lightweight evidence surface and
name the linked issue with `Refs #...` unless the PR actually completes the
closeout contract. PR evidence must include the target requirement, validation commands,
and traceability/RTM impact; it must also include an out-of-scope statement and
closeout readiness. Keep local gates explicit (including `npm run dod:gate`) plus
hosted CI and standards provenance or closeout status. If optional/authenticated
evidence is blocked, note the blocker and the follow-up issue.

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
