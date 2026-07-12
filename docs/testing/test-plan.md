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
A parallel `Windows Unit Tests` job runs `npm ci`, `npm run check`, and
`npm test` on `windows-latest` so platform-specific unit regressions (for
example path-separator assumptions in staging tests) fail closed in CI. It
intentionally omits packaging, governance gates, and coverage upload, which
remain in the required Ubuntu `Build, Test, Package` job, and it does not
exercise the heavier Windows/LabVIEW integration path, which stays
maintainer-dispatch.
A parallel `Integration Host (Linux)` job runs the LabVIEW-free VS Code
extension-host suite through `npm run test:integration:linux` on
`ubuntu-24.04` (the entrypoint auto-wraps in `xvfb-run`). It exercises
activation, eligibility indexing, command registration, panel render, and the
runtime-settings CLI against a real downloaded VS Code, putting a behavioral
floor under the command/activation layer (notably
`src/commands/openViHistoryCommand.ts`). The suite uses synthetic VI fixtures
and self-skips LabVIEW-path assertions, so it needs no LabVIEW, Docker, or real
compare; the heavier real-runtime compare path stays maintainer-dispatch. This
leg is behavioral coverage and does not contribute to the vitest coverage
number, which is collected only in the required `Build, Test, Package` job.
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
local links are checked before tests and packaging. Generated validation,
cache, coverage, package, release-evidence, and Vagrant evidence directories
are excluded from this documentation scan so retained run artifacts cannot
redden or green the committed documentation gate.

## Coverage Evidence And Threshold Policy

`npm test` runs Vitest with coverage enabled. The required hosted CI job retains
the machine-readable coverage outputs from that run through the
`PR Coverage Gate / coverage` step:

- `coverage/cobertura-coverage.xml`
- `coverage/coverage-summary.json`

The enforced coverage thresholds in `vitest.config.ts` are evidence-backed
baseline regression floors: 80% statements, 70% branches, 84% functions, and
80% lines. These floors were ratcheted toward the measured `develop` actuals at
v1.33.2, which measured 82.16% statements, 72.32% branches, 86.48% functions,
and 82.21% lines locally (the lower-running Ubuntu CI leg historically
trails by ~1 point); they are not a claim that the repository has complete
coverage. The two highest-risk
comparison-runtime files
(`src/reporting/comparisonRuntimeLocator.ts` and
`src/reporting/comparisonReportRuntimeExecution.ts`) additionally carry per-file
floors pinned just under their current actuals to prevent silent branch-coverage
drift on provider-selection and fail-closed paths. Raise the thresholds only in
a PR that shows new coverage evidence and updates this test plan with the new
baseline.

### Coverage Floor Policy

The global floors intentionally sit roughly two points below the measured
`develop` actuals. That gap is a cross-runner margin, not slack to be spent: the
Ubuntu CI leg measures coverage about one point below the local/Windows figure,
so a floor held ~1 point under the Ubuntu actual keeps ordinary cross-runner
variance from reddening the gate on unrelated pull requests.

Ratchet a floor only when it is durable, not merely reachable:

- Raise a floor in a PR that first adds real coverage lifting the actual, so the
  new floor still keeps ~2 points local (~1 point Ubuntu) margin. The Ubuntu
  `Build, Test, Package` leg validates the floor before merge — if a floor is
  set too high the PR reddens; lower it and repush.
- Move the floor in lockstep across its five pinned locations: `vitest.config.ts`,
  this test plan (floors plus the measured actuals), `docs/requirements/srs.md`
  (VHS-REQ-597), `docs/requirements/syrs.md`, and
  `tests/unit/requirementsDocs.test.ts`.
- Spend the coverage that unlocks a ratchet on requirement-mapped product logic.
  Do not chase coverage on excluded VS Code host bindings, network or socket
  boundary callbacks, or fixture-heavy integration paths purely to move a floor —
  that is low-value churn, and much of it is already excluded in
  `vitest.config.ts`.

The floors are a regression net, not a coverage-completeness claim. Once they sit
within ~2 points of actuals, further ratcheting buys marginal protection for
disproportionate effort; prefer targeted assurance (mutation testing, the
coverage traceability map) over percentage chasing.

## Mutation Testing (Advisory)

Run `npm run test:mutation` (Stryker, `stryker.config.mjs`) to mutation-test the
pure `src/domain` detection core. Coverage proves lines execute; mutation proves
the tests catch regressions, so surviving mutants pinpoint weak or missing
assertions behind requirement-mapped behavior. It is advisory
(`thresholds.break` is null) and never fails the build; use the surviving-mutant
report in `reports/mutation/mutation.json` to close assertion gaps. Widening the
mutate scope beyond `src/domain` and adding a scheduled run are separate
maintainer decisions.

## Coverage Traceability Map

Run `npm run coverage:map` after `npm test` to join
`coverage/coverage-summary.json`, `docs/requirements/traceability-inventory.csv`,
and `docs/requirements/rtm.csv`. The report highlights requirement-mapped files
below 50% coverage and zero-coverage supporting files tied to active
requirements so coverage-led assurance work starts with product-risk evidence
instead of percentage chasing. Use the report to seed follow-up coverage issues
and to justify future coverage threshold ratchets. Standards closeout runs this
map after `npm test` and before package validation so release-readiness evidence
captures coverage-risk backlog candidates without changing the Vitest threshold
gate semantics.

## Critical-Path Verification Evidence

| Requirement | Test Evidence | Code Path | Test Path | Coverage / Rationale |
| --- | --- | --- | --- | --- |
| VHS-REQ-597 | TEST-597 | .github/workflows/ci.yml; vitest.config.ts | tests/unit/branchGovernanceWorkflow.test.ts; tests/unit/requirementsDocs.test.ts | Hosted CI retains coverage artifacts, enforces evidence-backed baseline thresholds at 80% statements, 70% branches, 84% functions, and 80% lines, and runs `DoD Gate / dod` (`npm run dod:gate`) after packaging. |
| VHS-REQ-016 | TEST-016 | src/commands/openViHistoryCommand.ts | tests/unit/openViHistoryCommand.test.ts | User-facing command stops cover missing URI, trust gate, ineligible file guidance, history-load failures, documentation routing, and explicit cancellation stages. |
| VHS-REQ-017 | TEST-017 | src/services/viHistoryModel.ts; src/ui/historyPanel.ts | tests/unit/viHistoryModel.test.ts; tests/unit/historyPanelRendering.test.ts | History model facts cover repository/path/signature/history-window decisions and previous-hash links; the minimized panel renders a slim title and the selectable commit table (hash, date, author, subject, full body) with HTML escaping. |
| VHS-REQ-639 | TEST-639 | src/git/gitCli.ts; src/services/viHistoryModel.ts; src/ui/historyPanel.ts | tests/unit/gitCli.test.ts; tests/unit/historyPanelRendering.test.ts | Commit body (git `%b`) is captured per retained revision and rendered as a dedicated commit body column replacing the adjacent-pair column, HTML-escaped with multi-line preserved and an empty-body fallback. |
| VHS-REQ-039 | TEST-039 | src/commands/openViHistoryCommand.ts; src/extension.ts | tests/unit/historyReviewPacket.test.ts; tests/unit/openViHistoryCommand.test.ts; tests/unit/historyPanelTracker.test.ts | The factual review packet is copied through the labviewViHistory.copyReviewPacket command (trust + eligibility gated), verified through clipboard and panel action summaries. |
| VHS-REQ-133 | TEST-133 | src/ui/historyPanel.ts; src/commands/openViHistoryCommand.ts; src/reporting/comparisonReportPreflight.ts; src/reporting/comparisonReportAction.ts | tests/unit/explicitComparePairWorkflow.test.ts; tests/unit/openViHistoryCommand.test.ts; tests/unit/comparisonReportPreflight.test.ts; tests/unit/comparisonReportAction.test.ts | Explicit selected/base ordering is verified from panel selection through preflight and comparison action orchestration. |
| VHS-REQ-147 | TEST-147 | src/reporting/comparisonReportRuntimeExecution.ts; src/reporting/comparisonReportPlan.ts | tests/unit/comparisonReportRuntimeExecution.test.ts | Runtime execution stages deterministic inputs from historical blobs and preserves canonical names across container report output. |
| VHS-REQ-148 | TEST-148 | src/reporting/comparisonReportRuntimeExecution.ts; src/reporting/comparisonReportPacket.ts; src/reporting/comparisonReportExecutionPlan.ts; src/reporting/comparisonReportAction.ts | tests/unit/comparisonReportRuntimeExecution.test.ts; tests/unit/comparisonReportPacket.test.ts; tests/unit/comparisonReportAction.test.ts | Retained execution evidence covers failed runtime attempts, stale output rejection, archive creation, and packet fallback display. |
| VHS-REQ-155 | TEST-155 | src/reporting/comparisonRuntimeLocator.ts; src/reporting/comparisonRuntimeDoctor.ts; src/reporting/comparisonReportAction.ts; src/reporting/comparisonReportPacket.ts | tests/unit/comparisonRuntimeLocator.test.ts; tests/unit/comparisonRuntimeDoctor.test.ts; tests/unit/comparisonReportAction.test.ts; tests/unit/comparisonReportPacket.test.ts; tests/unit/comparisonReportRuntimeExecution.test.ts | Runtime discovery diagnostics cover host/container provider decisions and user-facing blocked-runtime summaries. |
| VHS-REQ-635 | TEST-635 | src/commands/openViHistoryCommand.ts; src/services/viHistoryModel.ts; src/services/viHistoryService.ts; src/git/gitCli.ts | tests/unit/openViHistoryCommand.test.ts; tests/unit/viHistoryModel.test.ts; tests/unit/viHistoryService.test.ts; tests/unit/gitCli.test.ts; tests/unit/packageManifest.test.ts | Opening VI History evaluates the selected file directly, keeps menu visibility as a hint, preserves factual ineligibility stops, and avoids repository-wide VI indexing as a prerequisite. |
| VHS-REQ-610 | TEST-610 | src/dashboard/comparisonReportArchive.ts; src/dashboard/dashboardLatestRun.ts; src/dashboard/multiReportDashboard.ts; src/dashboard/multiReportDashboardAction.ts; src/dashboard/retainedDashboardEvidence.ts; src/scenarios/decisionRecord.ts; src/scenarios/reviewScenarioRegistry.ts; src/support/repositorySupportPolicy.ts | tests/unit/comparisonReportArchive.test.ts; tests/unit/dashboardLatestRun.test.ts; tests/unit/multiReportDashboard.test.ts; tests/unit/multiReportDashboardAction.test.ts; tests/unit/retainedDashboardEvidence.test.ts; tests/unit/reviewDecisionRecord.test.ts; tests/unit/reviewScenarioSupportPolicy.test.ts | Dashboard retained-evidence archive, latest-run, aggregate rendering, action routing, proof seeding, decision records, scenario contracts, and support-tier rules have focused unit coverage. |
| VHS-REQ-611 | TEST-611 | src/docs/bundledDocumentation.ts; src/docs/bundledDocumentationAction.ts | tests/unit/bundledDocumentation.test.ts; tests/unit/bundledDocumentationAction.test.ts | Installed documentation manifest/page loading and command routing are covered directly. |
| VHS-REQ-612 | TEST-612 | src/tooling/localRuntimeSettingsCli.ts; src/extension.ts | tests/unit/localRuntimeSettingsCli.test.ts; tests/unit/packageManifest.test.ts; tests/unit/extensionActivationLazySideEffects.test.ts; tests/integration/suite/extensionHost.test.ts | Installed runtime settings CLI command exposure, argument parsing, launcher materialization, idempotent settings refresh, malformed-config errors, validation proof output, terminal output, and missing global-storage handling are verified without changing runtime selection behavior. |
| VHS-REQ-613 | TEST-613 | scripts/mapCoverageToTraceability.js; vitest.config.ts | tests/unit/coverageMapScript.test.ts; tests/unit/requirementsDocs.test.ts | Coverage map links retained coverage evidence to RTM/inventory risk and protects evidence-backed threshold ratchets. |
| VHS-REQ-614 | TEST-614 | tests/unit/vscodeTestHarness.ts | tests/unit/vscodeTestHarness.test.ts; tests/unit/requirementsDocs.test.ts | Shared VS Code fakes support coverage-led command, webview, storage, filesystem, clipboard, progress, output, and runtime CLI tests. |
| VHS-REQ-615 | TEST-615 | package.json; .github/workflows/ci.yml; .github/workflows/marketplace-release.yml; scripts/checkDefinitionOfDone.js; scripts/auditCustomizationGovernance.js; scripts/generateCloseoutEvidence.js; scripts/verifyMarketplaceListing.js; .github/pull_request_template.md; docs/maintainer-operations.md; docs/requirements/srs.md; docs/requirements/rtm.csv; docs/requirements/id-index.csv; docs/requirements/README.md; docs/testing/test-plan.md; docs/requirements/traceability-inventory.csv | tests/unit/definitionOfDoneGate.test.ts; tests/unit/customizationGovernanceAuditScript.test.ts; tests/unit/requirementsDocs.test.ts; tests/unit/traceabilityAuditScript.test.ts | Definition-of-Done operating contract covers issue quality, PR evidence, hosted CI order, local gates, standards provenance, closeout evidence, traceability drift prevention, release evidence, and hosted `DoD Gate / dod` enforcement in `.github/workflows/ci.yml`. |
| VHS-REQ-616 | TEST-616 | src/extension.ts; src/tooling/runtimeAutoDetect.ts; src/tooling/runtimeSettingsSeed.ts | tests/unit/runtimeAutoDetect.test.ts; tests/unit/runtimeSettingsSeed.test.ts; tests/unit/extensionActivationLazySideEffects.test.ts; tests/unit/requirementsDocs.test.ts | Activation runs the filesystem-only runtime detector and seeds or repairs `viHistorySuite.runtimeProvider`/`labviewVersion`/`labviewBitness` so fresh installs and upgrades arrive with a working comparison provider; preserves satisfiable persisted values; reports `no-runtime-detected` without writing when nothing is found. |
| VHS-REQ-617 | TEST-617 | src/extension.ts; src/ui/runtimeAvailabilityNotice.ts; src/commands/runtimeCommands.ts | tests/unit/runtimeAvailabilityNotice.test.ts; tests/unit/runtimeCommands.test.ts; tests/unit/requirementsDocs.test.ts | Status bar item reflects detection outcome, first-run information notice fires once via globalState `vihs.firstRunNoRuntimeNoticeShown`, and `onDidChangeWindowState` re-detect is throttled by `RUNTIME_RE_DETECT_THROTTLE_MS`. Three trust-gated VS Code commands expose runtime state: `Detect Runtime Now` bypasses the throttle, `Reset First-Run Runtime Notice` requires modal confirmation to clear the globalState flag, and `Show Runtime Summary` writes a structured report to the `VI History: Runtime` output channel with a clipboard Copy action. |
| VHS-REQ-620 | TEST-620 | src/extension.ts; src/ui/runtimeAvailabilityNotice.ts; src/ui/runtimeReportPanel.ts; src/commands/openRuntimeReportPanelCommand.ts; src/commands/pickRuntimeProviderCommand.ts; src/commands/runtimeCommands.ts | tests/unit/runtimeAvailabilityNotice.test.ts; tests/unit/runtimeAvailabilityWatcher.test.ts; tests/unit/runtimeReportPanel.test.ts; tests/unit/openRuntimeReportPanelCommand.test.ts; tests/unit/pickRuntimeProviderCommand.test.ts; tests/unit/runtimeCommands.test.ts; tests/unit/requirementsDocs.test.ts | Status bar label is sourced from the persisted runtime selection when `viHistorySuite.runtimeProvider`/`labviewVersion`/`labviewBitness` are populated and the combination is satisfiable per `isPersistedSelectionSatisfiable`, otherwise the auto-detection recommendation is used (silent fallback). The watcher subscribes to `onDidChangeConfiguration` filtered to `viHistorySuite` and re-renders from the cached detection without re-probing, so a `vihs --provider …` CLI invocation or manual settings.json edit updates the label immediately. The `labviewViHistory.pickRuntimeProvider` command opens the Runtime & Report Settings panel whose runtime provider section is built from the cached detection (host installations + Docker if `cliAvailable` + Clear option) and writes selections to `ConfigurationTarget.Global`; the same panel exposes the LabVIEW container image version and the comparison-report Include controls (VHS-REQ-645/651). The `Show Runtime Summary` report appends a `Drift:` line with three states: `none`, `selection differs from recommendation`, and `selection unsatisfiable on this host; falling back to recommendation`. |
| VHS-REQ-621 | TEST-621 | src/reporting/comparisonReportRuntimeExecution.ts; src/reporting/comparisonRuntimeLocator.ts; src/reporting/comparisonRuntimeDoctor.ts; src/reporting/comparisonReportAction.ts; src/commands/openViHistoryCommand.ts | tests/unit/comparisonReportRuntimeExecution.test.ts; tests/unit/comparisonRuntimeLocator.test.ts; tests/unit/comparisonRuntimeDoctor.test.ts; tests/unit/comparisonReportAction.test.ts; tests/unit/openViHistoryCommand.test.ts; tests/unit/requirementsDocs.test.ts | Windows host preflight infers the running LabVIEW bitness from the Get-Process executable path (`\Program Files\` → x64, `\Program Files (x86)\` → x86, otherwise `unknown`) via the injectable `resolveWindowsLabviewExecutablePath` seam and retains `labviewProcessBitness`/`labviewProcessExecutablePath` on `RuntimeProcessObservation`. `comparisonRuntimeLocator.locate()` short-circuits to `blockedReason='windows-host-bitness-conflict'` when the observed bitness is known and differs from the selected bitness, ahead of `windows-host-runtime-surface-contaminated`. `classifyRuntimeFailure` rewrites a generic `command-exited-nonzero` to `'labview-host-bitness-conflict'` when the retained process-exit snapshot shows a different-bitness `LabVIEW.exe`. `comparisonRuntimeDoctor` emits a next-action that names the observed bitness (or `match the running session` when unknown) and references `viHistorySuite.labviewBitness`. The pre-launch `windows-host-bitness-conflict` and `windows-host-version-conflict` blocks (VHS-REQ-653) surface a concise close-the-running-LabVIEW + `Retry Compare` toast built from structured running-vs-selected facts (`isHostBitnessConflictBlock`/`isHostVersionConflictBlock` + `buildHostBitnessConflictMessage`/`buildHostVersionConflictMessage`), suppress the verbose provider message, and do not auto-open the blocked-evidence report (the packet is still persisted); the mid-run reclassified `labview-host-bitness-conflict` failure keeps the verbose `Pick Runtime Provider` toast. The host-native rejection reason names the bitness/version conflict instead of the false `LabVIEWCLI was not located` fallback (#530). | 
| VHS-REQ-622 | TEST-622 | scripts/runWindowsRuntimeMatrix.js; scripts/windows-runtime-matrix/Invoke-RuntimeMatrixSteadyState.ps1; scripts/windows-runtime-matrix/Close-LabviewProcesses.ps1; .github/workflows/windows-runtime-matrix.yml | tests/unit/runWindowsRuntimeMatrixScript.test.ts; tests/unit/requirementsDocs.test.ts; tests/unit/windowsRuntimeMatrixWorkflow.test.ts | Maintainer-driven Windows harness drives `vihs --validate --proof-out` against a real running LabVIEW 2026 in both steady-state bitness directions (x64-host/x86-selected and x86-host/x64-selected); asserts `runtimeBlockedReason='windows-host-bitness-conflict'` and observed `LabVIEW.exe` `ExecutablePath` bitness root match on the emitted proof JSON; aggregates per-scenario outcomes into `assurance-closeout-evidence/manual-vhs-req-621.json` under schema `vi-history-suite/runtime-matrix-evidence@v1`. Race-condition reclassification (`labview-host-bitness-conflict`) is delegated to the existing unit-test contract at `tests/unit/comparisonReportRuntimeExecution.test.ts`. The dispatch-only `windows-runtime-matrix.yml` workflow runs on `vihs-windows-labview-maintainer` self-hosted runner under a trusted-ref allow-list and uploads matrix evidence + proofs as a build artifact. The Node driver module exposes a `runRuntimeMatrix(deps)` entry whose `spawnSync`, `getCimProcesses`, `closeLabview`, `now`, and `cwd` collaborators are injectable; the default CLI binding refuses non-Windows hosts unless `VIHS_FAKE_WINDOWS=1`. |
| VHS-REQ-623 | TEST-623 | src/reporting/comparisonReportRuntimeExecution.ts; src/reporting/comparisonReportPacket.ts; src/tooling/localRuntimeSettingsCli.ts | tests/unit/comparisonReportRuntimeExecution.test.ts; tests/unit/localRuntimeSettingsCli.test.ts; tests/unit/runWindowsRuntimeMatrixScript.test.ts; tests/unit/requirementsDocs.test.ts | Windows host-native `labview-cli` runs read the `LabVIEW.ini` adjacent to the selected LabVIEW executable before launching LabVIEWCLI and block execution with `blockedReason='windows-vi-server-tcp-disabled'` when `server.tcp.enabled=False` is explicitly set, paralleling the Linux preflight from VHS-REQ-156. `WindowsLabviewTcpSettings.viServerTcpEnabled` is a tri-state field: `true` when the key is `True` or absent (Windows LabVIEW defaults VI Server TCP on), `false` only when the key is explicitly `False`, and `'unknown'` when the ini is not readable (preserves the prior implicit-enabled behavior). The block runs after `preflightLinuxHostRuntimeSurface` and before `preflightWindowsHostRuntimeSurface`. The `lvcompare` engine is exempt. No auto-mutation of `LabVIEW.ini`. The `vihs --validate` runtime-validation proof serializes the observed host VI Server port (`runtime.hostLabviewTcpPort`) and its `LabVIEW.ini` path (`runtime.hostLabviewIniPath`), recorded as explicit `null` when the runtime is not Windows host-native; the Windows runtime matrix harness `port-A` scenario (maintainer real-hardware, dispatch-only) derives its expected VI Server port from the selected install's own `LabVIEW.ini` (the same parse the product uses) rather than a hardcoded or operator-supplied constant, then asserts the admitted (`blockedReason=none`) run's proof reports `hostLabviewIniPath` equal to that selected install's ini and `hostLabviewTcpPort` equal to the port parsed from it, so the contract stays correct for whatever port the operator configures and proves the product read the selected install rather than the latest-used one. |

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

## Dependency-Aware Comparison Check

`manual:dependency-harness-newest-tree-staging` (VHS-REQ-624). On a host with a
LabVIEW comparison provider available (a local Docker engine with the
`nationalinstruments/labview:<release>-linux` image is sufficient), verify that a
compared VI loads with its in-repo dependencies present rather than as an
isolated file.

1. Use the `vihs-test-harness-lvdependency` fixture, where `main.vi` depends on
   `Dependencies/dependencies.lvlib` (`data.ctl`, `dependency.vi`).
2. Select the commit window where both the VI and its dependencies changed:
   base `35b92bc` to selected `299c2a5`.
3. Generate a comparison report through the linux-container provider.
4. Confirm the staged tree under `<runDir>/container-out/staging` contains the
   renamed `left-*`/`right-*` VIs beside the materialized `Dependencies/` folder
   and the project file, and that the diagnostics manifest records
   `materializedTree` pinned to the selected revision.
5. Confirm the LabVIEW CLI reports `CreateComparisonReport operation succeeded.`
   and an HTML report is produced.

Expected scope: the report reflects the selected VI's own changes evaluated
against the selected revision's dependencies. Differences confined to shared
library members may not appear independently, matching the dependency caveat
rendered in the report packet. Retain the generated report and the
`<runDir>/diagnostics/diagnostics-manifest.json` as evidence.

This check requires a LabVIEW comparison runtime and is not a required public
PR gate; the deterministic staging contract is covered by
`tests/unit/comparisonReportRuntimeExecution.test.ts`.

## Source Control Semantic Change Hover Check

`manual:source-control-semantic-change-hover` (VHS-REQ-660). The Source Control
semantic change decoration has two states: a modified VI first shows a subtle
pending badge prompting a comparison, and once a working-tree comparison has
produced a narrative for the VI's current change the decoration upgrades to the
semantic "what changed" tooltip (served from cache). On a host with a LabVIEW
comparison provider available (a local Docker engine with the
`nationalinstruments/labview:<release>-linux` image is sufficient), verify both
states end to end:

1. Launch the Extension Development Host (`F5`, `Run VI History Suite`) and open
   a trusted Git repository that contains a tracked LabVIEW VI (for example,
   `ni/actor-framework`). Confirm a comparison runtime is configured with
   `VI History: Set Up Comparison Runtime`.
2. Make an uncommitted edit to a tracked `.vi` so it appears under Source
   Control as a working-tree change, and confirm the VI shows the pending badge
   whose tooltip prompts you to run Compare.
3. Open `VI History` on that VI, select the uncommitted working-tree entry
   paired with the most recent committed revision (HEAD), and choose `Compare`.
   Wait for the comparison to complete with differences.
4. Hover the changed VI in the Source Control view (or the Explorer) and confirm
   the decoration has upgraded to the `VI change: ...` narrative, matching the
   report's what-changed summary.
5. Confirm the decoration clears once it no longer applies: revert or commit the
   edit and confirm the badge is gone after the Source Control view refreshes.

Expected scope: the decoration reflects the HEAD-versus-working-tree change
only. A modified VI shows the pending badge before any comparison; the narrative
tooltip requires a completed working-tree comparison. Comparing the working tree
against an older revision (not HEAD), or comparing two committed revisions, does
not light the narrative decoration by design, and an untrusted workspace shows
no decoration.

This check requires a LabVIEW comparison runtime and is not a required public PR
gate; the cache, recorder, and decoration-resolution logic are covered by
`tests/unit/viSemanticNarrativeCache.test.ts` and
`tests/unit/viSemanticDecorationProvider.test.ts`.

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
`npm run dod:gate`, `npm run check`, `npm test`, `npm run coverage:map`, and
`npm run package` when `--run-gates` is set. It always runs standards evidence
and standards toolchain provenance against a temporary tracked-worktree
snapshot built from `git ls-files`, preserving symlink targets as text rather
than following them into generated cache roots. It tries host Python first in
`auto` mode and falls back to the published GitLab registry workbench image
when host preflight is unavailable.
When `--save-dir` is provided, closeout evidence writes a machine-readable
`closeout-summary.json` artifact with gate status, standards status, provenance
status, closure-decision state, and `standards.auditTarget` fields for
`mode`, `trackedFileCount`, and `generatedRootsExcluded`.
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
