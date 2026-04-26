# Current State

## Purpose

This document is the committed repo entrypoint for human readers and future
LLMs. It answers four questions without requiring chat history:

1. what is authoritative
2. what research has already been implemented
3. what is active now
4. where local evidence is generated

## Read Order

Read these in order:

1. [README.md](../../README.md)
2. [CHANGELOG.md](../../CHANGELOG.md)
3. [Public Release Candidate](./public-release-candidate.md)
4. [Public Release Candidate JSON](./public-release-candidate.json)
5. [Windows x64 Private-Release Packet](./private-release-windows-x64-v1.3.0.md)
6. [Windows x64 Private-Release Packet JSON](./private-release-windows-x64-v1.3.0.json)
7. [Windows Private-Release Runner Lane](./windows-private-release-runner-lane.md)
8. [Linux Assurance Runner Lane](./linux-assurance-runner-lane.md)
9. [Research Implementation Index](../research/authoritative/research-implementation-index.json)
10. [Research Alignment Matrix](../research/authoritative/research-alignment.md)
11. [Development Queue](./development-queue.json)
11. [Architecture Overview](../architecture/overview.md)
12. [Software Requirements Specification](../requirements/srs.md)
13. [SHIP-0001: Releasable VI History Suite](./SHIP-0001-releasable-vi-history-suite.md)
14. [wiki-authority-map.md](./wiki-authority-map.md)
15. [documentation-coherence-ledger.md](./documentation-coherence-ledger.md)
16. [wiki-seed-plan.md](./wiki-seed-plan.md)
17. [wiki-publication-ledger.md](./wiki-publication-ledger.md)
18. [wiki-publication-ledger.json](./wiki-publication-ledger.json)
19. [wiki-coverage-matrix.md](./wiki-coverage-matrix.md)
20. [wiki-coverage-matrix.json](./wiki-coverage-matrix.json)
21. [debt-retirement-contract.md](./debt-retirement-contract.md)
22. [debt-taxonomy.md](./debt-taxonomy.md)
23. [debt-ledger.md](./debt-ledger.md)
24. [debt-ledger.json](./debt-ledger.json)
25. [Documentation Package Workbench](../documentation-workbench.md)
26. [program-repo-jump.md](./program-repo-jump.md)
27. [PROGRAM-0001: Next Product Layer](./execution-programs/PROGRAM-0001-next-product-layer.md)
28. [PROGRAM-0002: Public Source Facade And Public-Product Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
29. [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)
30. [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
31. [post-release-sustainment-rules.md](./post-release-sustainment-rules.md)
32. [post-release-sustainment-rules.json](./post-release-sustainment-rules.json)
33. [hosted-ci-governance.md](./hosted-ci-governance.md)
34. [hosted-ci-governance.json](./hosted-ci-governance.json)
34. [Extension Execution Policy](./extension-execution-policy.md)
35. [PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
36. [PROGRAM-0006: Public Codespaces Public-Repo Bootstrap](./execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md)
37. [VS Code Marketplace Publication Ledger](./vscode-marketplace-publication-ledger.md)
38. [VS Code Marketplace Publication Ledger JSON](./vscode-marketplace-publication-ledger.json)
39. [Release Publication State](./release-publication-state.md)
40. [Release Publication State JSON](./release-publication-state.json)
41. [Marketplace Community-Validation Intake v1.3.10](./marketplace-community-validation-intake-v1.3.10.md)
42. [Marketplace Community-Validation Intake v1.3.10 JSON](./marketplace-community-validation-intake-v1.3.10.json)
43. [Public GitHub Community-Validation Intake Promotion Plan v1.3.10](./public-github-community-validation-intake-promotion-plan-v1.3.10.md)
44. [Public GitHub Community-Validation Intake Promotion Plan v1.3.10 JSON](./public-github-community-validation-intake-promotion-plan-v1.3.10.json)

## Authority Stack

Baseline retained research surfaces:

1. [deep-research-report.cleaned.md](../research/authoritative/deep-research-report.cleaned.md)
2. [deep-research-report.md](../research/authoritative/deep-research-report.md)
3. [vi-history-suite-authoritative-research.pdf](../research/authoritative/vi-history-suite-authoritative-research.pdf)

There is no active unresolved research-round artifact checked into the repo.
Consumed research rounds are deleted after their findings are normalized into
the committed queue, ADR, requirement, and implementation surfaces.

Current control-plane surfaces:

1. [research-alignment.md](../research/authoritative/research-alignment.md)
2. [CHANGELOG.md](../../CHANGELOG.md)
3. [public-release-candidate.md](./public-release-candidate.md)
4. [public-release-candidate.json](./public-release-candidate.json)
5. [private-release-windows-x64-v1.3.0.md](./private-release-windows-x64-v1.3.0.md)
6. [private-release-windows-x64-v1.3.0.json](./private-release-windows-x64-v1.3.0.json)
7. [windows-private-release-runner-lane.md](./windows-private-release-runner-lane.md)
8. [linux-assurance-runner-lane.md](./linux-assurance-runner-lane.md)
9. [research-implementation-index.json](../research/authoritative/research-implementation-index.json)
10. [development-queue.json](./development-queue.json)
11. [next-research-prompt.md](../research/authoritative/next-research-prompt.md)
12. [SHIP-0001: Releasable VI History Suite](./SHIP-0001-releasable-vi-history-suite.md)
13. [release-readiness-matrix.json](./release-readiness-matrix.json)
13. [blocker-ledger.json](./blocker-ledger.json)
14. [wiki-authority-map.md](./wiki-authority-map.md)
15. [documentation-coherence-ledger.md](./documentation-coherence-ledger.md)
16. [wiki-seed-plan.md](./wiki-seed-plan.md)
17. [wiki-publication-ledger.md](./wiki-publication-ledger.md)
18. [wiki-publication-ledger.json](./wiki-publication-ledger.json)
19. [wiki-coverage-matrix.md](./wiki-coverage-matrix.md)
20. [wiki-coverage-matrix.json](./wiki-coverage-matrix.json)
21. [debt-retirement-contract.md](./debt-retirement-contract.md)
22. [debt-taxonomy.md](./debt-taxonomy.md)
23. [debt-ledger.md](./debt-ledger.md)
24. [debt-ledger.json](./debt-ledger.json)
25. [Documentation Package Workbench](../documentation-workbench.md)
26. [program-repo-jump.md](./program-repo-jump.md)
27. [PROGRAM-0001: Next Product Layer](./execution-programs/PROGRAM-0001-next-product-layer.md)
28. [PROGRAM-0002: Public Source Facade And Public-Product Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
29. [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)
30. [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
31. [post-release-sustainment-rules.md](./post-release-sustainment-rules.md)
32. [post-release-sustainment-rules.json](./post-release-sustainment-rules.json)
33. [hosted-ci-governance.md](./hosted-ci-governance.md)
34. [hosted-ci-governance.json](./hosted-ci-governance.json)
35. [Extension Execution Policy](./extension-execution-policy.md)
36. [PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
37. [PROGRAM-0006: Public Codespaces Public-Repo Bootstrap](./execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md)
38. [VS Code Marketplace Publication Ledger](./vscode-marketplace-publication-ledger.md)
39. [VS Code Marketplace Publication Ledger JSON](./vscode-marketplace-publication-ledger.json)
40. [Release Publication State](./release-publication-state.md)
41. [Release Publication State JSON](./release-publication-state.json)
42. [Marketplace Community-Validation Intake v1.3.10](./marketplace-community-validation-intake-v1.3.10.md)
43. [Marketplace Community-Validation Intake v1.3.10 JSON](./marketplace-community-validation-intake-v1.3.10.json)
44. [Public GitHub Community-Validation Intake Promotion Plan v1.3.10](./public-github-community-validation-intake-promotion-plan-v1.3.10.md)
45. [Public GitHub Community-Validation Intake Promotion Plan v1.3.10 JSON](./public-github-community-validation-intake-promotion-plan-v1.3.10.json)
46. [Fast VS Code Loop](../dev-fast-loop.md)

## Committed Capability State

| Capability Surface | Status | Evidence | Governing Queue |
| --- | --- | --- | --- |
| Content-detected VI eligibility and menu gating | implemented | `package.json`; `src/domain/viMagicCore.ts`; `src/indexing/viEligibilityIndexer.ts`; `VHS-REQ-001..015` | sustain |
| Review-oriented history panel and actions | implemented with a checkbox-selected explicit compare-preflight workflow as the branch extension-user compare control: every retained row now exposes a selection checkbox, selecting two distinct retained revisions populates explicit compare preflight for the exact newer-selected and older-base pair, compare starts only from the dedicated `Compare` action, compare row buttons are no longer part of the extension-user surface, retained comparison opening from `Diff prev` uses retained-open-specific wording, unreadable retained generated-report HTML falls back to the retained packet with an explicit displayed-evidence status line, malformed or unusable retained archive records now fail closed with checkbox-flow rebuild guidance, compare generation preserves the current compare view when governed archive persistence was unavailable or failed, the panel exposes `Open docs` into the packaged bundled documentation surface, stale bundled-doc page ids fall back to the packaged overview page when the installed bundle is available, the bundled documentation surface is now a concise curated installed-user guide instead of a mirror of every published wiki/control-plane page, unsubmitted maintainer host-review drafts persist across tab switches or webview rerenders until successful submission clears them, and the status/review packet states whether the retained commit set is the full file history or a truncated auto/capped window | `src/ui/historyPanel.ts`; `src/ui/historyPanelTracker.ts`; `src/commands/openViHistoryCommand.ts`; `src/reporting/comparisonReportAction.ts`; `src/docs/bundledDocumentationAction.ts`; `src/extension.ts`; `VHS-REQ-016..040`; `VHS-REQ-328..329`; `VHS-REQ-361..382`; `VHS-REQ-386..390`; `VHS-REQ-498..499`; `VHS-REQ-533..540` | sustain |
| Canonical real-history harness smoke | implemented | `src/harness/harnessSmoke.ts`; `src/cli/runHarnessSmoke.ts`; `npm run proof:run -- smoke --harness-id HARNESS-VHS-001`; `VHS-REQ-029..030` | sustain |
| Comparison-report preflight, planning, and packet storage | implemented | `src/reporting/comparisonReportPreflight.ts`; `src/reporting/comparisonReportPlan.ts`; `src/reporting/comparisonReportPacket.ts`; `VHS-REQ-127..145` | sustain |
| LabVIEW 2026 Q1 runtime detection and governed live report execution | implemented and active | `src/reporting/comparisonRuntimeLocator.ts`; `src/reporting/comparisonReportRuntimeExecution.ts`; `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.json`; `VHS-REQ-146..181`; `VHS-REQ-217..220`; `VHS-REQ-239..250` | sustain |
| Canonical comparison-report smoke lane | implemented with succeeded NI proof | `src/harness/harnessReportSmoke.ts`; `src/cli/runHarnessReportSmoke.ts`; `npm run proof:run -- report-smoke --harness-id HARNESS-VHS-001`; `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.html`; `VHS-REQ-152..180`; `VHS-REQ-220` | sustain |
| Indexing and report progress uplift | partially implemented and active | `src/indexing/viEligibilityIndexer.ts`; `VHS-REQ-093`; `VHS-REQ-305..306`; research alignment marks this partial | `TRANCHE-004` |
| Windows 64-bit isolated container provider | implemented and active | `docs/architecture/adr/ADR-0006-windows64-container-isolation-for-extension-users.md`; `src/reporting/comparisonRuntimeLocator.ts`; `src/reporting/comparisonReportRuntimeExecution.ts`; `VHS-REQ-146`; `VHS-REQ-217..220` | sustain |
| Multi-report developer dashboard for one VI across at least three commits | implemented and active with canonical dashboard smoke, extension-host proof, whole-window metadata concentration, chronology-aware pair-position references in those whole-window summaries, a chronology-first pair metadata ledger, pair-evidence backfill for missing or stale adjacent pairs, governed retained-evidence seeding from governed proof caches before any local pair refresh on supported repo-family surfaces, progress-aware dashboard refresh stages, explicit preparation-state reporting for retained-complete, seeded-retained, backfill-in-progress, and backfill-unavailable refresh paths, retained preparation summaries in the dashboard HTML itself including refreshed-pair generated/blocked/failed/no-generated outcome counts, bounded minutes-and-seconds estimates during pair preparation, periodic keepalive progress while a long-running pair refresh remains in flight, explicit headless requests for host-native Windows dashboard backfill so the governed pair-refresh path does not open interactive LabVIEW, retained pair-level ETA accuracy characterization for the current refresh session, retained pair-level ETA characterization in canonical dashboard smoke, a stable `latest-dashboard-run.json` manifest with retained history-window/config/timing/progress experiment metadata for future-session consumption, direct local rendering for retained HTML artifacts, and cancellation honored through the final dashboard-open boundary with retained artifact paths preserved | `src/dashboard/comparisonReportArchive.ts`; `src/dashboard/dashboardEtaAccuracy.ts`; `src/dashboard/dashboardLatestRun.ts`; `src/dashboard/niComparisonReportParser.ts`; `src/dashboard/multiReportDashboard.ts`; `src/dashboard/multiReportDashboardAction.ts`; `src/dashboard/retainedDashboardEvidence.ts`; `src/harness/harnessDashboardSmoke.ts`; `src/cli/runHarnessDashboardSmoke.ts`; `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.json`; `tests/integration/suite/extensionHost.test.ts`; `VHS-REQ-212..215`; `VHS-REQ-221..223`; `VHS-REQ-232`; `VHS-REQ-237..238`; `VHS-REQ-268`; `VHS-REQ-295..304`; `VHS-REQ-330..340`; `VHS-REQ-347..349`; `VHS-REQ-363`; `VHS-REQ-375..376`; `VHS-REQ-380`; `VHS-REQ-388..389`; `VHS-REQ-485..487` | `TRANCHE-006` |
| Deterministic host-machine human review submission | implemented and active with a maintainer-only in-IDE history-panel submission surface on Sergio Velderrain's canonical Windows 11 host, concise outcome/confidence guidance, explicit in-panel submit feedback, stable `latest-human-review-submission.json` retention, fixed extension-global canonical host-machine fingerprint enforcement, fail-closed mismatch handling, a fail-closed non-OneDrive workspace boundary for the manual right-click proof path, and local `review:latest` evidence consumption for future sessions | `src/ui/historyPanel.ts`; `src/commands/openViHistoryCommand.ts`; `src/review/humanReviewSubmission.ts`; `src/review/humanReviewSubmissionAction.ts`; `scripts/printLatestHumanReviewSubmission.js`; `tests/unit/humanReviewSubmission.test.ts`; `tests/unit/openViHistoryCommand.test.ts`; `VHS-REQ-392..395`; `VHS-REQ-483` | `TRANCHE-010` |
| Repo-agnostic support with governed-evidence depth | implemented and active with normalized GitHub upstream/fork classification plus governed retained local fixture-clone recognition for `ni/labview-icon-editor` and `ni/actor-framework`, generic-repository classification for arbitrary trusted repos, explicit repo-support facts in the VI History panel, checkbox-selected compare availability beyond the canonical evidence family, and a separate governance boundary that keeps scenario, deep-benchmark, and maintainer host-review lanes narrower than the repo-agnostic core compare workflow | `src/support/repositorySupportPolicy.ts`; `src/services/viHistoryModel.ts`; `src/commands/openViHistoryCommand.ts`; `src/ui/historyPanel.ts`; `src/scenarios/reviewScenarioRegistry.ts`; `tests/unit/repositorySupportPolicy.test.ts`; `tests/unit/viHistoryCore.test.ts`; `tests/unit/historyPanel.test.ts`; `tests/unit/openViHistoryCommand.test.ts`; `docs/architecture/adr/ADR-0017-bounded-repo-family-support.md`; `VHS-REQ-406..408` | sustain |
| GitHub Linux benchmark experiment lane | partially implemented and active as a characterization-first Linux benchmark surface in the authority repo and private GitHub experiment mirror: the hosted workflow defaults to the shallower `HARNESS-VHS-001` canonical harness while the canonical Windows host retains ownership of the deep `HARNESS-VHS-002` / `lv_icon.vi` UX lane and the Windows benchmark image is now published as the repeatable deep Windows baseline through the governed `runGovernedProof benchmark-linux` subcommand, with a pinned NI Linux image, a published benchmark/source-experiment image, a headless derived container recipe for GitHub-hosted runs, and a canonical-host in-IDE benchmark-status panel that resolves the canonical `vi-history-suite` authority workspace even when the current VI History target lives in a different repo, stages that authority workspace into a fresh Windows-local benchmark workspace before launching the local host Linux benchmark while excluding repo-local transient/test-runtime artifacts such as `.vscode-test`, defaults host runs to the current published benchmark image tag unless explicitly overridden, filters raw `npm warn` noise out of the front-facing progress channel, emits pair-preparation progress into the same live VS Code progress surface used by the Windows lane rather than retaining it only in background receipts, enforces bounded per-pair runtime timeouts, writes machine-readable per-pair failure receipts, retains terminal partial summaries for failed runs, retains native Linux NI CLI diagnostic logs under governed report storage, discards stale reused report HTML that does not reference the current staged revisions, attempts one governed `CloseLabVIEW -Headless` reset plus one retry for retained `linux-headless-recursive-load` failures, and retains a governed comparable-prefix packet for the accepted cross-OS `129`-commit / `128`-pair timing scope derived from the first invalid governed surface rather than Linux generated-report count alone; a fresh governed canonical-host rerun on `2026-04-06` still fails truthfully late at pair `135/138` with `labview-cli-connection-failed (linux-headless-recursive-load)` after the governed headless reset exited `1`, so the lane remains an accepted bounded full-window exception while the retained comparable-prefix packet carries the current cross-OS timing truth and the first invalid Windows boundary at pair `129` | `src/harness/canonicalHarnesses.ts`; `src/cli/runGitHubLinuxDashboardBenchmark.ts`; `src/benchmark/benchmarkStatus.ts`; `src/benchmark/benchmarkStatusAction.ts`; `src/benchmark/hostLinuxBenchmarkRunner.ts`; `scripts/buildComparablePrefixBenchmarkPacket.js`; `docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json`; `.github/workflows/linux-runtime-benchmark-experiment.yml`; `docker/github-linux-dashboard-benchmark/Dockerfile`; `docker/github-linux-dashboard-benchmark/run-benchmark.sh`; `tests/unit/runGitHubLinuxDashboardBenchmarkCli.test.ts`; `tests/unit/githubLinuxBenchmarkWorkflow.test.ts`; `tests/unit/benchmarkStatus.test.ts`; `tests/unit/benchmarkStatusAction.test.ts`; `tests/unit/hostLinuxBenchmarkRunner.test.ts`; `tests/unit/buildComparablePrefixBenchmarkPacketScript.test.ts`; `VHS-REQ-397..417`; `VHS-REQ-431..434`; `VHS-REQ-439` | `TRANCHE-011` |
| Windows benchmark-image lane | implemented and published as a repeatable deep `HARNESS-VHS-002` benchmark baseline distinct from Sergio's canonical Windows host UX lane through the governed `runGovernedProof benchmark-windows` subcommand, with a pinned NI Windows image contract, Dockerfile, runner script, GHCR image-publication workflow, successful publication runs, a pullable `ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main` image, and a governed canonical-host proof runner that pulls the published image, pre-seeds the mounted harness cache from the governed local `ni/labview-icon-editor` clone when available, normalizes Git safe-directory handling for those mounted clones, respects the active PowerShell execution policy instead of using `ExecutionPolicy Bypass`, defaults `HARNESS-VHS-002` to the retained comparable-prefix dashboard window while the Linux full window remains blocked, writes launch/log/summary receipts under `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-proof`, and now snapshots immutable per-run `dashboard-smoke` artifacts beside each timestamped summary so future packet derivation can prefer the latest eligible proof instead of trusting only mutable `latest-*` files; the active hardening now retains explicit Windows `-LabVIEWPath` command planning, forces `LV_RTE_HEADLESS=1` in the published image, hardens `LabVIEWCLI.ini` startup timeouts, prelaunches headless LabVIEW before benchmark execution to mitigate NI's documented Windows-container `-350000` startup seam, attempts one governed `CloseLabVIEW -Headless` session reset plus one retry for connected-session `Error 66 / Call By Reference` failures after pair `1` is cleared, and fails closed when a contaminated rerun leaves any prepared pair at `runtimeExecutionState=not-available`; the latest retained eligible local proof still reaches pair `129/134` before that late seam, and hosted Windows benchmark execution remains explicitly not-yet-governed until local host proof exists | `src/cli/runGitHubWindowsDashboardBenchmark.ts`; `.github/workflows/windows-runtime-benchmark-image.yml`; `docker/github-windows-dashboard-benchmark/Dockerfile`; `docker/github-windows-dashboard-benchmark/run-benchmark.ps1`; `scripts/runHostWindowsBenchmarkImageProof.js`; `scripts/buildComparablePrefixBenchmarkPacket.js`; `src/reporting/comparisonReportExecutionPlan.ts`; `src/reporting/comparisonReportRuntimeExecution.ts`; `tests/unit/runGitHubWindowsDashboardBenchmarkCli.test.ts`; `tests/unit/buildComparablePrefixBenchmarkPacketScript.test.ts`; `tests/unit/githubWindowsBenchmarkWorkflow.test.ts`; `tests/unit/runHostWindowsBenchmarkImageProofScript.test.ts`; `tests/unit/comparisonReportExecutionPlan.test.ts`; `tests/unit/comparisonReportRuntimeExecution.test.ts`; `docs/architecture/adr/ADR-0018-windows-benchmark-image-lane.md`; `VHS-REQ-413..415`; `VHS-REQ-435..441`; `VHS-REQ-476`; `VHS-REQ-484` | `TRANCHE-011` |
| Review-scenario registry and human decision records | implemented and active as governed backend/proof surfaces with scenario matching by repository remote URL plus VI path, separate Markdown/JSON artifact persistence, persisted reviewer-name defaults across decision-record runs, cancellation honored after dashboard build and before retained Markdown open with already-built artifact paths preserved, and real extension-host proof, while the shipped extension-user workflow no longer exposes decision-record creation from the history panel | `src/scenarios/reviewScenarioRegistry.ts`; `src/scenarios/decisionRecord.ts`; `src/scenarios/reviewDecisionRecordAction.ts`; `src/harness/harnessDecisionRecord.ts`; `src/commands/openViHistoryCommand.ts`; `tests/integration/suite/extensionHost.test.ts`; `docs/product/review-scenarios.md`; `docs/product/decision-record-template.md`; `VHS-REQ-307..312`; `VHS-REQ-341..355`; `VHS-REQ-385` | `TRANCHE-007` |
| Runtime-doctor and compare-refresh developer experience | implemented and active with history-panel command routing that fails closed with explicit build-capability guidance when stale panel commands target unsupported optional surfaces, with stale bundled-doc page requests falling back to the packaged overview page when the installed bundle is still available, with `Diff prev` for content-detected VIs refusing text-diff fallback when comparison-report routing is unavailable in the current build, and with compare opening falling back to the retained packet when retained generated-report HTML is unreadable, rendering retained archive availability/failure facts in the live panel status block, and failing closed with explicit checkbox-flow rebuild guidance when the retained archive source record is malformed, mismatched, render-contract-invalid, or no longer points at a usable retained packet | `src/reporting/comparisonRuntimeDoctor.ts`; `src/reporting/comparisonRuntimeLocator.ts`; `src/reporting/comparisonReportPacket.ts`; `src/reporting/comparisonReportAction.ts`; `src/commands/openViHistoryCommand.ts`; `tests/integration/suite/extensionHost.test.ts`; `VHS-REQ-224..236`; `VHS-REQ-241`; `VHS-REQ-244..247`; `VHS-REQ-251..258`; `VHS-REQ-377..382`; `VHS-REQ-386` | sustain |
| Ship-control system and SemVer release target | implemented and active with retained immutable `v0.2.0` release evidence through GitLab release `v0.2.0`, tag pipeline `2428809456`, kept release job `13779604462`, and a governed wiki-authority map that constrains future wiki generation to repo docs instead of source or chat memory | `docs/product/SHIP-0001-releasable-vi-history-suite.md`; `docs/product/release-readiness-matrix.json`; `docs/product/blocker-ledger.json`; `docs/product/wiki-authority-map.md`; `docs/release-procedure.md`; `.gitlab-ci.yml`; `tests/unit/shipControlDocs.test.ts`; `VHS-REQ-313..323` | `TRANCHE-009` |
| Documentation-package workbench image and docs gate | implemented and active with a repo-published docs-authoring image, local, Docker-first, and published-image-local wiki-workbench commands, a repo-native docs gate that now fails closed on bundled-doc drift, a retained umbrella docs-continuous-integration lane under `.cache/docs-integration/latest/`, split local `docs:ci:public` and `docs:ci:internal` surfaces for public-user and internal-authority docs, split GitLab `docs_public_continuous_integration` and `docs_internal_continuous_integration` lanes beside the retained umbrella `docs_continuous_integration` lane, public GitHub wiki publication tracked separately from the internal GitLab maintainer wiki, explicit installed-user truth checks for Docker-only compare execution, engine-aware Windows/Linux image selection, Docker-required hard stops without host fallback, provider and progress visibility in the bundled guide, and an explicit public GitHub admission matrix spanning source package preview plus Linux/Windows installed-user coverage, an idempotent bundled-doc sync path that reports unchanged content instead of rewriting it, a guarded `npm run package` path that reruns `npm run docs:bundle` before `vsce package` so stale bundled docs cannot ship, a commit-aligned `wiki_workbench_prepare_published` GitLab lane that runs from `${CI_REGISTRY_IMAGE}/docs-authoring:sha-${CI_COMMIT_SHORT_SHA}` and retains `wiki-workbench-evidence/`, a governed no-op completion receipt when the publication ledger already retains `nextPage = null`, docs-authoring entrypoint workspace resolution that honors `VIHS_DOCS_WORKSPACE`, falls back to `CI_PROJECT_DIR` for GitLab package lanes, and only then falls back to `/workspace`, a repo-specific container-owned `node_modules` volume plus `package-lock.json` refresh so Linux workbench runs do not inherit incompatible host-mounted optional bindings, normalized GitLab CI-authenticated HTTPS remote comparison for the authority/wiki repo checks, supported GitLab-registry environment-variable auth for local published-image pulls plus explicit fail-closed registry-access diagnostics when the published image is not locally pullable, automated SRS/RTM/test-plan coherence checks, automated active post-release tranche/issue/program coherence checks plus open Gate C-D truth checks, research-control-plane regression checks for the live history-window/dashboard surfaces, a retained documentation coherence ledger, separate internal and public wiki publication ledgers, a generated packaged docs bundle, and a governed wiki workbench that resolves authority/wiki topology from the repo-jump map, stages page-authority bundles, retains `.cache/wiki-workbench/latest-workbench.json`, writes publication-prep receipts under `.cache/wiki-workbench/publication-prep/`, and self-heals onto writable `staging-runs/` or `publication-prep-runs/` paths when stale retained page directories are unwritable | `docker/docs-authoring/Dockerfile`; `docker/docs-authoring/entrypoint.sh`; `scripts/run-docs-gate.js`; `scripts/run-docs-continuous-integration.js`; `scripts/runPublicLinuxInstalledUserSmoke.js`; `scripts/syncBundledDocs.js`; `scripts/runDocsWorkbenchDocker.js`; `src/tooling/wikiWorkbench.ts`; `src/cli/runWikiWorkbench.ts`; `docs/documentation-workbench.md`; `docs/product/documentation-coherence-ledger.md`; `docs/product/wiki-seed-plan.md`; `docs/product/wiki-publication-ledger.md`; `docs/product/wiki-publication-ledger.json`; `docs/product/public-github-wiki-authority-map.md`; `docs/product/public-github-wiki-publication-ledger.md`; `docs/product/public-github-wiki-publication-ledger.json`; `resources/bundled-docs/manifest.json`; `.gitlab-ci.yml`; `.github/workflows/public-linux-installed-user-smoke.yml`; `.github/workflows/public-windows-installed-user-contract.yml`; `tests/unit/docsWorkbenchDocs.test.ts`; `tests/unit/docsContinuousIntegration.test.ts`; `tests/unit/syncBundledDocsScript.test.ts`; `tests/unit/packageManifest.test.ts`; `tests/unit/publicSurfaceBoundaryDocs.test.ts`; `tests/unit/publicLinuxInstalledUserSmoke.test.ts`; `tests/unit/publicWindowsInstalledUserContract.test.ts`; `tests/unit/requirementsDocs.test.ts`; `tests/unit/postReleaseControlPlaneDocs.test.ts`; `tests/unit/runWikiWorkbenchCli.test.ts`; `tests/unit/runDocsWorkbenchDocker.test.ts`; `VHS-REQ-350..360`; `VHS-REQ-367..370`; `VHS-REQ-391`; `VHS-REQ-418..426`; `VHS-REQ-491` | `TRANCHE-009` |
| Public Gate D operator preflight packet | implemented and active with a retained operator surface that verifies the published public repo and public wiki commits, the canonical fixture workspace and VI path, Docker Linux engine state, and governed Linux image presence or removal before the real human cold-pull rerun begins | `scripts/runPublicProductGateDPreflight.js`; `tests/unit/publicProductGateDPreflight.test.ts`; `docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md`; `VHS-REQ-501..503` | `TRANCHE-010` |
| Wiki completion invariant for requirements and standards surfaces | implemented and active with a machine-readable wiki coverage matrix, an accepted ADR aggregation rule, a zero-gap publication contract, and docs-gate enforcement that fails when an in-scope authority doc or ADR is uncovered, unpublished, or missing from the publication ledger | `docs/product/wiki-coverage-matrix.md`; `docs/product/wiki-coverage-matrix.json`; `tests/unit/wikiCoverageDocs.test.ts`; `VHS-REQ-427..430` | sustain |
| Debt-retirement contract for technical and documentation debt | implemented and active with a no-silent-debt rule, governed taxonomy, machine-readable debt ledger, and docs-gate enforcement that fails when debt items are unbounded, malformed, or absent from the authority package | `docs/product/debt-retirement-contract.md`; `docs/product/debt-taxonomy.md`; `docs/product/debt-ledger.md`; `docs/product/debt-ledger.json`; `tests/unit/debtLedgerDocs.test.ts`; `VHS-REQ-453..456` | sustain |
| Bundled version-matched user documentation | implemented and active with a machine-readable wiki publication ledger, generated packaged HTML fragments under `resources/bundled-docs/`, a command-palette documentation command, and a local documentation panel that keeps users inside VS Code instead of requiring repo access | `docs/product/wiki-publication-ledger.json`; `scripts/syncBundledDocs.js`; `resources/bundled-docs/manifest.json`; `src/docs/bundledDocumentation.ts`; `src/docs/bundledDocumentationAction.ts`; `src/extension.ts`; `tests/unit/bundledDocumentation.test.ts`; `tests/integration/suite/extensionHost.test.ts`; `VHS-REQ-367..370` | sustain |
| Cross-repo navigation control plane | implemented and active with a governed repo-constellation map, a local repo-jump CLI, and mirrored skill-side resolver entrypoints for `vi-history-suite`, `vi-history-suite-source-experiments`, `vi-history-suite.wiki`, and `repo-standards-review` | `docs/product/program-repo-jump-map.json`; `docs/product/program-repo-jump.md`; `src/tooling/programRepoJump.ts`; `src/cli/runProgramRepoJump.ts`; `tests/unit/runProgramRepoJumpCli.test.ts`; `VHS-REQ-364..366`; `VHS-REQ-401` | `TRANCHE-009` |
| Fast local VS Code development-host loop | implemented and active with reusable fixture-workspace prep, explicit workspace override, direct or staged extension-host launch, explicit Linux/Windows integration-host selection, Linux runtime preflight, and a least-privilege root-owned Linux bootstrap command | `src/tooling/devHostLoop.ts`; `src/cli/runDevHost.ts`; `src/tooling/integrationHostRuntime.ts`; `docs/dev-fast-loop.md`; `package.json`; `tests/unit/runDevHostCli.test.ts`; `tests/unit/integrationHostRuntime.test.ts`; `tests/unit/packageManifest.test.ts`; `VHS-REQ-338..339`; `VHS-REQ-344..346`; `docs/architecture/adr/ADR-0010-dual-host-extension-proof-and-linux-bootstrap.md` | sustain |

## Active Queue

Latest landed ship target:

- `SHIP-0001`: releasable `v0.2.0` VSIX product
- landed ship tranche: `TRANCHE-009`
- landed ship issue: `ISSUE-0406`
- retained exact-version release: `v0.2.0`
- preview install surface: `preview-evidence/vi-history-suite-<version>.vsix`
- retained release artifact: `vi-history-suite-0.2.0.vsix`
- target release manifest: `release-evidence/release-manifest.json`
- retained release surface: GitLab release `v0.2.0`
- retained release pipeline: `2428809456`
- retained release job: `13779604462`
- burned exact release line: `v1.0.2`
- current exact released line: `v1.3.9`
- current published package line on `main`: `1.3.9`
- current develop package line on `develop`: `1.3.10`
- active exact release candidate line on `develop`: none
- active release-candidate branch: none
- active exact hotfix candidate line on `main`: none
- active hotfix branch: none
- active feature-lane public GitHub release hardening branch on `develop`:
  none
- active software-factory governance branch on `develop`:
  none
- exact authority `v1.3.9` is now fully published across GitLab authority,
  public GitHub, and VS Code Marketplace, while blocked historical public
  GitHub incident evidence for `v1.3.8` remains retained separately
- active pre-tag public-exact proof package script:
  `npm run public:exact:pretag:proof`
- active pre-tag public-exact proof GitLab job: `public_exact_pretag_proof`
- public GitHub exact transaction verification package script:
  `npm run public:github:exact:transaction:verify`
- retained public GitHub exact transaction receipt:
  `.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json`
- Windows exact-VSIX install proof package script:
  `npm run vscode:marketplace:install-proof`
- retained Windows exact-VSIX install proof receipt:
  `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json`
- VS Code Marketplace publication prep package script:
  `npm run vscode:marketplace:prepare`
- retained VS Code Marketplace publication prep receipt:
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`
- VS Code Marketplace community-validation preview prep package script:
  `npm run vscode:marketplace:community-preview:prepare`
- retained VS Code Marketplace community-validation preview prep receipt:
  `.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json`
- software factory assessment package script:
  `npm run software:factory:assess`
- software factory rehearsal package script:
  `npm run software:factory:rehearse`
- software factory repair package script:
  `npm run software:factory:repair`
- software factory publish package script:
  `npm run software:factory:publish`
- software factory verify package script:
  `npm run software:factory:verify`
- VS Code Marketplace prep package script:
  `npm run vscode:marketplace:prepare`
- VS Code Marketplace community-validation preview prep package script:
  `npm run vscode:marketplace:community-preview:prepare`
- retained software factory assessment receipt:
  `.cache/software-factory-orchestrator/latest/software-factory-state.json`
- retained software factory rehearsal receipt:
  `.cache/software-factory-orchestrator/latest/rehearse/software-factory-state.json`
- retained software factory repair receipt:
  `.cache/software-factory-orchestrator/latest/repair/software-factory-state.json`
- retained software factory publish receipt:
  `.cache/software-factory-orchestrator/latest/publish/software-factory-state.json`
- retained software factory verify receipt:
  `.cache/software-factory-orchestrator/latest/verify/software-factory-state.json`
- retained VS Code Marketplace prep receipt:
  `.cache/vscode-marketplace-publication-prep/latest/vscode-marketplace-publication-prep.json`
- retained VS Code Marketplace community-validation preview prep receipt:
  `.cache/vscode-marketplace-community-validation-preview-prep/latest/vscode-marketplace-community-validation-preview-prep.json`
- software-factory contract phases:
  `assess`, `rehearse`, and `repair` remain admitted non-production phases;
  `publish` / `verify` are retained as guarded non-mutating contract phases
- current software-factory mutation policy:
  exact authority `v1.3.9` is now fully closed across public GitHub and VS
  Code Marketplace; later SemVer openings return to normal GitFlow governance
  while `v1.3.8` remains retained as blocked historical publication evidence
- active governed release claim: Linux/Docker validated preview with Windows
  installed-user proof deferred
- active Marketplace community-validation preview line: `1.3.10`
- active Marketplace community-validation preview trigger:
  user said `publish it now`
- active Marketplace community-validation preview path:
  admitted for pre-release publication; Windows/LabVIEW settings may remain
  selectable with proof-status disclosure through `vihs --validate` and
  `docs/requirements/rtm.csv`
- current separately gated public GitHub community-validation intake promotion
  plan:
  [public-github-community-validation-intake-promotion-plan-v1.3.10.md](./public-github-community-validation-intake-promotion-plan-v1.3.10.md)
- current public GitHub community-validation intake publication state:
  published and verified on public `main`
  `b56fde158fe151a736fe72c833efdfd0874d8537` through PR #45 after the
  explicit `publish the public intake now`; public labels were applied, while
  public GitHub release/tag/wiki and Marketplace mutation were not performed
  by the public intake publication
- current Linux/Docker preview release-control packet:
  [linux-docker-preview-release-control-packet-2026-04-25.md](./linux-docker-preview-release-control-packet-2026-04-25.md)
- current Linux/Docker preview release-control packet JSON:
  [linux-docker-preview-release-control-packet-2026-04-25.json](./linux-docker-preview-release-control-packet-2026-04-25.json)
- current no-mutation Windows/LabVIEW installed-user proof handoff:
  [windows-labview-installed-user-proof-handoff-2026-04-25.md](./windows-labview-installed-user-proof-handoff-2026-04-25.md)
- current no-mutation Windows/LabVIEW installed-user proof handoff JSON:
  [windows-labview-installed-user-proof-handoff-2026-04-25.json](./windows-labview-installed-user-proof-handoff-2026-04-25.json)
- retained Windows x64 private-release-prep slice: historical `release/1.3.1`
- retained Windows x64 private-release packet:
  [private-release-windows-x64-v1.3.1.md](./private-release-windows-x64-v1.3.1.md)
- retained Windows x64 private-release packet JSON:
  [private-release-windows-x64-v1.3.1.json](./private-release-windows-x64-v1.3.1.json)
- current Windows x64 private GitLab release: `private-v1.3.1-windows-x64`
- private GitLab release URL:
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.1-windows-x64`
- current Windows x64 private-release publish receipt:
  `.cache/private-release-publish/latest/private-release-publish.json`
- retained Windows x64 historical prior-line private-release packet: `v1.3.0`
- Windows host/container acceptance receipt set:
  `windows-private-release-evidence/manifest.json` is deferred on this
  Ubuntu-only machine unless `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`
- separate public GitHub exact release publication: published; public tag
  `v1.3.9` remains live at `fb0ef2b`, GitHub release `312994104` is
  published at
  `https://github.com/svelderrainruiz/vi-history-suite/releases/tag/v1.3.9`,
  the uploaded exact assets match the retained authority manifest under
  `.cache/gitlab-release-artifacts/v1.3.9/expanded/release-evidence/`, the
  verify receipt now records `verifyGateStatus=pass`, and VS Code Marketplace
  now serves `1.3.9`
- current public GitHub source publication: public `main` now publishes
  `b56fde1` for the `1.3.10` community-validation intake facade while the
  exact `v1.3.9` tag/release remains retained separately
- VS Code Marketplace retained published version: `1.3.9`
- VS Code Marketplace community-validation preview published version:
  `1.3.10`
- VS Code Marketplace community-validation preview Marketplace last updated:
  `2026-04-26T00:05:09.09Z`
- VS Code Marketplace community-validation preview VSIX SHA-256:
  `da09af0d288db60870c1a8125667303c710159c80c06ff2deda02a76e5085705`
- Marketplace community-validation intake packet:
  [marketplace-community-validation-intake-v1.3.10.md](./marketplace-community-validation-intake-v1.3.10.md)
- Marketplace community-validation intake packet JSON:
  [marketplace-community-validation-intake-v1.3.10.json](./marketplace-community-validation-intake-v1.3.10.json)
- Marketplace community-validation intake state: prepared for public facade
  source, with public GitHub template and label mutation gated separately
- blocked historical publication incident: public GitHub release `312768592`
  for `v1.3.8` is published and immutable with zero assets; retain it as
  historical evidence only while the current live Marketplace version remains
  `1.3.9`
- VS Code Marketplace publication prep and final publication are retained:
  `npm run vscode:marketplace:prepare` proves the public GitHub `v1.3.9`
  verify gate, exact authority VSIX/checksum evidence, live Marketplace
  `1.3.9` readback, local PAT locator, and pinned `vsce` publish command
  shape without retaining secret material.
- VS Code Marketplace community-validation preview is published and verified:
  `npm run vscode:marketplace:community-preview:prepare` writes the prep
  receipt, the package was published with pinned `vsce --pre-release`, the
  official gallery query plus `vsce show` read back `1.3.10`, and public
  GitHub was not mutated by this preview act.
- Windows exact-VSIX install proof is also retained:
  `npm run vscode:marketplace:install-proof` proves the exact `v1.3.9` VSIX
  installs into isolated VS Code user-data/extensions roots on Windows and
  that bare `vihs` plus `vihs --validate` both pass with
  `runtimeValidationOutcome=ready`, a launcher-only PATH, and no ambient Node
  dependency before any future Marketplace publication act opens.
- public GitHub default branch: `main`
- public Codespaces evaluation branch: `develop`
- integration branch: `develop`
- protected exact-release line: `main`
- release-candidate branch family: `release/*`
- hotfix branch family: `hotfix/*`
- next-line branch model: `GitFlow`
- `feature/*` branches are cut from `develop` and merge back into `develop`
- `release/*` branches are cut from `develop`, merge into `main`, merge back
  into `develop`, and are deleted only after both merges complete
- `hotfix/*` branches are cut from `main`, merge into `main`, merge back into
  `develop`, and are deleted only after both merges complete
- hosted automation governance matrix: [hosted-ci-governance.md](./hosted-ci-governance.md)
- repo-owned runner host asset pack, startup receipts, doctor surfaces, apply
  surfaces, and live drift assertions:
  - `scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1`
  - `scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1`
  - `scripts/gitlab-runner/windows/doctor-governed-runner-lanes.ps1`
  - `scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1`
  - `scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1`
  - `scripts/runWindowsProofRuntimeRecoveryRehearsal.js` via
    `npm run gitlab:runner:windows:recovery:rehearse`
  - `scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh`
  - `scripts/gitlab-runner/linux/start-linux-assurance.sh`
  - `scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh`
  - `scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service`
  - `scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh`
  - `scripts/doctorGovernedRunnerLanes.js` via
    `npm run gitlab:runner:doctor`
  - `scripts/assertGovernedRunnerLanes.js` via `npm run gitlab:runner:assert`
  - latest Windows startup receipt:
    `C:\GitLab-Runner\receipts\governed-runner-startup\latest.json`
  - latest Linux startup receipt:
    `$HOME/gitlab-runner/receipts/linux-assurance-startup/latest.json`
  - fail-fast GitLab Linux/Docker admission job:
    `ubuntu_docker_runner_admission`
  - deferred Windows/LabVIEW runner admission job:
    `governed_runner_admission`
  - deferred Windows/LabVIEW runner admission command:
    `npm run gitlab:runner:doctor -- --surface all --fail-on-drift --evidence-dir governed-runner-admission-evidence`
  - the Windows apply surface keeps the scheduled task on
    `powershell.exe -NoLogo -NoProfile -File "C:\GitLab-Runner\start-governed-runner-lanes.ps1"`
    without `ExecutionPolicy Bypass` and fails closed unless exactly one
    configured runner manager remains after apply
  - the Windows bootstrap now writes a machine-readable startup receipt that
    records duplicate-collapse, cold-admission cleanup, Linux-helper retry,
    and receipt-link facts before the current-user runner contract is
    considered healthy
  - the Windows drift assertion surface fails closed unless the installed
    bootstrap still matches the repo source, the scheduled task retains that
    exact action plus its logon trigger, `C:\GitLab-Runner\config.toml` still
    contains `request_concurrency = 2`, and exactly one configured runner
    manager is live
  - the Windows bootstrap clears stale `LabVIEW`, `LabVIEWCLI`, and
    `LVCompare` before cold runner admission with bounded `Stop-Process`,
    `taskkill /PID /T /F`, and `taskkill /IM /T /F`, and fails closed if
    contamination remains
  - the same Windows bootstrap also wakes the admitted Linux assurance distro,
    defaulting to `Ubuntu-24.04` unless `VIHS_LINUX_ASSURANCE_DISTRO`
    overrides it, and retries the repo-owned Linux assurance helper until it
    proves the paired
    `vihs-linux-assurance-runner.service` is `enabled`, `active`, and singular,
    failing closed otherwise
  - the Linux helper now reconciles `~/.gitlab-runner/config.toml` back to
    `concurrent = 2` plus `request_concurrency = 2`, restarts the admitted
    `systemd` service when needed, and writes a machine-readable startup
    receipt before it reports the Linux assurance surface healthy
  - the Linux apply surface installs the helper and service unit and fails
    closed unless `~/.gitlab-runner/config.toml` first retains
    `concurrent = 2` plus `request_concurrency = 2` and
    `vihs-linux-assurance-runner.service` is both enabled and active after
    apply
  - the Linux drift assertion surface fails closed unless the installed helper
    and service unit still match the repo source,
    `~/.gitlab-runner/config.toml` still contains `concurrent = 2` plus
    `request_concurrency = 2`, the admitted service fragment/user and working
    directory remain exact, the service is still `enabled` and `active`, and
    exactly one configured runner process is live
  - the repo-owned doctor surfaces now read both live runner state and the
    retained startup receipts, and the fail-fast
    `governed_runner_admission` job runs those doctor surfaces in the
    `admission` stage only when `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`;
    the active develop/package preview admission is
    `ubuntu_docker_runner_admission`, which proves the Linux Docker runner
    surface and does not claim Windows installed-user proof
  - when the host-native Windows proof exits on that same cleanup seam, the
    acceptance wrapper retains
    `windows-private-release-evidence/host/proof-run-pre-recovery.txt`, runs
    `scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1`,
    retains `windows-private-release-evidence/host/proof-runtime-recovery.txt`,
    waits `5000` ms, retries the host-native proof once, and still fails
    closed if the repo-owned recovery step plus retry cannot restore a clean
    host surface
  - the Windows proof runtime recovery rehearsal surface is
    `scripts/runWindowsProofRuntimeRecoveryRehearsal.js` via
    `npm run gitlab:runner:windows:recovery:rehearse`; it fails closed unless
    the admitted Windows host starts clean, seeds one headless LabVIEW
    contamination on the governed host-native `2026` `x64` runtime, runs the
    same repo-owned recovery script, and retains the latest rehearsal receipt
    at `.cache/windows-proof-runtime-recovery-rehearsal/latest.json`
- VS Code Marketplace listing: `https://marketplace.visualstudio.com/items?itemName=svelderrainruiz.vi-history-suite`
- VS Code Marketplace publication ledger: [vscode-marketplace-publication-ledger.md](./vscode-marketplace-publication-ledger.md)
- current changelog: [CHANGELOG.md](../../CHANGELOG.md)
- docs-workbench image: `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`
- assurance-workbench image: `registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main`
- remaining blockers: none on the exact `v1.3.9` publication path; authority
  exact `v1.3.9` is now tagged on `main`
  `2f86063a35926fa67963af5ccd47e971157927c6`, public GitHub `main` now
  publishes `b56fde1` for the community-validation intake facade, public tag
  `v1.3.9` remains live at `fb0ef2b`, GitHub release `312994104` is published
  with manifest-matched assets, the official gallery extension
  query now verifies Marketplace version `1.3.9` for
  `svelderrainruiz.vi-history-suite`, the maintained public `develop`
  candidate still publishes `11051ac`, the maintained public wiki head still
  publishes `141c39e`, no exact hotfix lane is currently open, `v1.3.8`
  remains retained as blocked historical incident evidence only, and later
  SemVer openings now return to normal GitFlow governance after retained
  `v1.3.9` closeout.

Current active and recently closed tranches:

- `TRANCHE-014`: Public Codespaces public-repo bootstrap
- closed issue: [ISSUE-0411 Public Codespaces Public-Repo Bootstrap](./issues/ISSUE-0411-public-codespaces-public-repo-bootstrap.md)
- closed execution program: [PROGRAM-0006: Public Codespaces Public-Repo Bootstrap](./execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md)
  - closed exact-release slice:
  - back-merge exact `v1.1.0` `main` into `develop` before the `1.2.0`
    candidate line continues
  - keep the canonical `npm run public:fixture:icon-editor` helper-backed path
    as the easiest first-time proof for `ni/labview-icon-editor`
  - add one generic `npm run public:repo:clone` surface for public GitHub and
    GitLab HTTPS repos with optional explicit branch and remote default-branch
    resolution when omitted
  - keep the maintained public generic path as a standalone reference manual,
    not a second quickstart
  - Sergio's first dry-run review from a brand new fork and a brand new
    Codespace produced findings that were folded before exact `v1.2.0`
    publication
  - a repo-access LLM pre-review then narrowed the remaining issues to one
    smaller doc-clarification slice on the public README/install/wiki package
  - that clarification slice is now validated locally through focused
    authority/public tests plus docs/design gates
  - Sergio's next brand-new-fork rerun on `hse-logger` then exposed a real
    moved-VI compare blocker (`left-blob-read-failed`) on a pair where the VI
    had moved between selected/base commits
  - the refreshed maintained public `develop` head now carries the rename-aware
    compare fix, bundled compare-flow wording cleanup, and public smoke
    required-check path-admission repair, and Sergio's brand-new-fork rerun has
    now passed on `Examples/Logging with Helper-VIs.vi`, so exact `v1.2.0`
    was published on public `main` before later candidate lines reopened on
    `develop`
- `TRANCHE-016`: Host-default LabVIEWCLI, expert Docker provider, and explicit compare workflow
- active issue: [ISSUE-0412 Installed Local LabVIEWCLI Selection And Explicit Compare](./issues/ISSUE-0412-installed-local-labviewcli-selection-and-explicit-compare.md)
- active execution program: [PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
  - exact `v1.3.9` now publishes the host-default Windows local
    `LabVIEWCLI` contract with bounded expert Docker, while the Docker-only
    line remains explicit only as historical baseline evidence under
    `ISSUE-0410`
  - the released line now includes generated provider selection with
    explicit provider, version, and bitness facts, with version plus bitness
    required across both provider classes
  - the released line now includes exact Windows host-runtime preflight
    that resolves one matching local `LabVIEWCLI`-backed runtime and fails
    closed on missing, ambiguous, or incompatible resolution
  - the released line now includes explicit compare preflight that shows
    selected/base commit plus provider, version, and bitness before the
    explicit compare action
  - historical released `repo-standards-review` `v0.2.9` compliance closeout
    is retained on this branch, the current outer assurance lane now uses the
    published `repo-standards-review` assurance-workbench `:main` image, and
    the latest tagged release remains `v0.2.18`
  - branch promotion into `develop`, exact publication alignment, and the
    runtime-provider public-acceptance gate are now retained as completed on
    the published `v1.3.9` line
  - remaining work is the unresolved live active-settings mutation seam for an
    already-running VS Code session plus later sustainment truth-alignment work
  - retained handoff packet:
    [issue-0412-promotion-and-publication-handoff.md](./issue-0412-promotion-and-publication-handoff.md)
  - explicit public-acceptance gate record:
    [runtime-provider-public-acceptance-gate.md](./runtime-provider-public-acceptance-gate.md)
- `TRANCHE-012`: Post-release sustainment and release cadence
- active issue: [ISSUE-0409 Post-Release Sustainment And Release Cadence](./issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md)
- active execution program: [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
  - current first slice:
  - retain event-driven release refresh and benchmark refresh rules
  - keep authority/wiki/bundled-doc/operator surfaces aligned as truth changes
  - keep exact release closeout incomplete until the matching released `main`
    line has been back-merged into `develop` through the protected path and
    the resulting `develop` pipeline is green
  - do not absorb the active `PROGRAM-0005` local-LabVIEWCLI work, the
    historical `PROGRAM-0002` Docker-only closeout, or the runtime-provider
    public-acceptance gate record into generic sustainment language
- closed public-product closeout:
  - `TRANCHE-010` / [ISSUE-0407 Public Source Facade And Public-Product Acceptance](./issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md) / [PROGRAM-0002: Public Source Facade And Public-Product Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
  - the earlier retained canonical host pass at `2026-04-06T20:48:13.412Z`
    remains historical evidence for the older public bundle only
  - the Docker-only closing Gate D rerun passed as a Linux-engine cold-pull
    compare on the deterministic `c:\dev\labview-icon-editor` fixture workspace
  - retained preflight preparation already proves the canonical fixture commit,
    Docker Linux engine state, and governed Linux image absence before the
    human compare pass; the exact retained packet remains under
    `.cache/public-product-gate-d/latest/`
  - retained hosted public proof on GitHub Codespace `novacula` now passes and
    proves public design-contract viability, Debian hosted bootstrap with
    xauth/Xvfb, Docker Linux cold pull, and containerized
    `CreateComparisonReport` reachability on the public product surface
  - the latest retained human review submission at `2026-04-07T04:06:58.998Z`
    is a real `passed-human-review` on
    `c:\dev\labview-icon-editor\resource\plugins\lv_icon.vi` with note
    `Comparison report is as expected.`
  - the earlier same-day failure on
    `Tooling/deployment/VIP_Pre-Uninstall Custom Action.vi` remains retained as
    the diagnosis that exposed the Linux-container staged-path seam later
    retired in the Docker-only public line

Post-release tranches:

- `TRANCHE-004`: Add progress-surface uplift for indexing and report generation
- `TRANCHE-011`: Repeatable Windows and Linux benchmark proof
  - closed issue: [ISSUE-0408 Repeatable Benchmark Proof](./issues/ISSUE-0408-repeatable-benchmark-proof.md)
  - closed execution program: [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)
  - benchmark truth is now explicitly separate from `PROGRAM-0002` acceptance truth
  - the authority repo mirrors its GitHub Linux benchmark lane into the private `vi-history-suite-source-experiments` repo with hosted runs defaulting to `HARNESS-VHS-001` / `Tooling/deployment/VIP_Pre-Install Custom Action.vi`, while the canonical Windows host retains ownership of the deep `HARNESS-VHS-002` / `resource/plugins/lv_icon.vi` benchmark and GitLab remains the authority source repo and release-control surface
  - the GitHub experiment lane publishes a dedicated headless Linux benchmark/source-experiment image so benchmark runs can reuse the derived container by digest
  - the separate Windows benchmark-image lane is now published in the authority repo for the deep `HARNESS-VHS-002` benchmark, with a pinned `nationalinstruments/labview:2026q1-windows` image contract, successful publication runs `23993316899`, `23993748337`, and `23994505706`, and a pullable `ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main` image, while hosted Windows benchmark execution remains explicitly not-yet-governed
  - the authority repo now retains `scripts/runHostWindowsBenchmarkImageProof.js` as the governed canonical-host proof surface for that published image; it pulls the published GHCR image, pre-seeds the mounted harness cache from the governed local `ni-labview-icon-editor` clone when available, normalizes Git safe-directory handling for those mounted clones, respects the active PowerShell execution policy instead of using `ExecutionPolicy Bypass`, defaults `HARNESS-VHS-002` to the retained `129`-commit comparable-prefix packet unless overridden, keeps public proof execution on `runGovernedProof` with canonical `CreateComparisonReport`, treats any `LVCompare` evidence as retained internal parity-only diagnosis, labels Windows diagnosis progress as Windows rather than Linux, and writes launch/log/summary receipts under `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-proof`
  - `VHS-REQ-437..438` are implemented for the Windows benchmark-image lane: Windows `labview-cli` now retains the governed `-LabVIEWPath`, runs headless under `LV_RTE_HEADLESS=1`, hardens `LabVIEWCLI.ini` startup timeouts, and prelaunches headless LabVIEW before the benchmark CLI starts
  - `VHS-REQ-440..441` are now implemented for the Windows benchmark-image lane: a native Windows headless `labview-cli` pair that establishes a connection and retains `labview-cli-call-by-reference` now triggers one governed `LabVIEWCLI CloseLabVIEW -Headless` session reset with the selected `-LabVIEWPath` when available, then retries the same pair once before retaining terminal failure, and the bounded comparable-prefix packet plus benchmark failure summary now retain that terminal diagnostic reason explicitly instead of collapsing pair `129` into generic Windows failure
  - `VHS-REQ-476` is now implemented for Windows benchmark-proof contamination control: a fresh canonical-host rerun that began with stale non-headless host `LabVIEW.exe` plus a preexisting governed VI Server listener exposed a false-green seam where every prepared pair remained `runtimeExecutionState=not-available` even though the retained summary still looked completed; the Windows benchmark summary now fails closed on any retained `not-available` pair, surfaces the blocked reason such as `windows-host-runtime-surface-contaminated`, marks the run `characterization-only`, snapshots immutable per-run `dashboard-smoke` artifacts beside the timestamped run summary, and keeps future comparable-prefix packet derivation on the latest eligible proof instead of trusting only mutable `latest-summary.json` and `dashboard-smoke.json`
  - `VHS-REQ-477` is now implemented for current-contract Windows image truth: the canonical-host Windows benchmark-image proof runner now retains a machine-readable `latest-runtime-surface.json` plus timestamped runtime-surface snapshots under the governed proof root, and the comparable-prefix packet now carries that retained image-contract summary so future sessions can distinguish the current governed mixed-bitness ceiling from out-of-scope alternative provisioning paths
  - `VHS-REQ-446` is now implemented for both Linux and Windows recovery posture: when the governed `CloseLabVIEW -Headless` session reset is attempted, the comparison-report packet now retains the recovery command, exit code, and dedicated `headless-session-reset-stdout.txt` / `headless-session-reset-stderr.txt` artifacts instead of reducing the recovery attempt to a note-only outcome
  - `VHS-REQ-447` is now implemented for exact-pair diagnosis surfaces: the governed `comparison-report-smoke.json` / `.md` / `.html` outputs now retain those `CloseLabVIEW -Headless` recovery facts too, and the comparable-prefix packet renders the failed Windows reset exit code plus reset artifact paths so the exact pair `6dd65df -> 3408654` no longer requires raw `report-metadata.json` archaeology
  - `VHS-REQ-448` is now implemented for native Windows `labview-cli` proof: the runtime derives the selected `LabVIEW.ini` TCP port, passes `-PortNumber` explicitly for `CreateComparisonReport` and `CloseLabVIEW`, and retains the selected `LabVIEW.ini` path plus TCP port on the packet, derived `comparison-report-smoke` surfaces, and exact-pair comparable-prefix diagnostics
  - `VHS-REQ-449` is now implemented for exact-pair diagnosis control: `runGovernedProof report-smoke` rejects non-canonical selected/base hash bundles, incomplete canonical `CreateComparisonReport` override bundles, wrong Windows executable basenames, and Windows bitness/path contradictions before a targeted diagnosis rerun can contaminate retained benchmark evidence
  - `VHS-REQ-450` is now implemented for canonical Windows proof hygiene: on the canonical Windows host, explicit Windows proof-admission runtime paths must exist before a targeted exact-pair rerun starts, and host-native Windows comparison execution now fails closed with `blockedReason=windows-host-runtime-surface-contaminated` when preflight detects already-running `LabVIEW.exe` / `LabVIEWCLI.exe` / `LVCompare.exe` processes or a preexisting listener on the selected `LabVIEW.ini` VI Server port
  - `VHS-REQ-451` is now implemented for shared `PROGRAM-0003` admission control: the one public `runGovernedProof` surface and its `dashboard-smoke`, `decision-record`, `report-smoke`, `benchmark-linux`, and `benchmark-windows` subcommands now share one canonical proof-admission validation layer for explicit proof-admission override bundles, so contradictory runtime bundles are rejected before any retained benchmark or diagnosis surface can be produced
  - `VHS-REQ-452` is now implemented for canonical Windows override coherence: explicit Windows proof-admission runtime path bundles now fail closed only when they contradict the selected runtime bitness, while the canonical x86 `LabVIEWCLI.exe` plus x64 `LabVIEW.exe` bundle is admitted when that x64 LabVIEW 2026 surface is the selected governed host runtime
  - `VHS-REQ-457..458` are now implemented for effective-bundle admission truth: governed proof subcommands now validate the effective proof-admission bundle after CLI arguments, environment variables, and subcommand-local defaults have been resolved, and the Windows benchmark path no longer injects hidden explicit Windows executable defaults when no explicit override was requested
  - `VHS-REQ-442..444` are now implemented for Windows diagnosis reruns: the canonical-host Windows benchmark-image proof runner now stays on the same canonical `CreateComparisonReport` proof contract instead of exposing a public engine selector, the shared dashboard-smoke progress surface labels the active Windows lane truthfully instead of leaking Linux wording, and the governed `runGovernedProof report-smoke` surface accepts an exact selected/base hash pair plus `--runtime-timeout-ms` for bounded pair diagnosis reruns
  - host Linux benchmark evidence and private GitHub experiment evidence are governed to stay aligned on the same authority commit and published benchmark-image contract before any evidence comparison is treated as meaningful, while the GitHub-hosted default remains shallower than the host-owned deep benchmark
  - `VHS-REQ-409..412` are implemented for the Linux benchmark lane: bounded per-pair runtime timeout handling, machine-readable per-pair failure receipts, runtime heartbeat progress, and terminal partial-summary retention for failed or timed-out runs
  - `VHS-REQ-416..417` are implemented for the Linux benchmark lane: native Linux NI CLI diagnostic logs are retained under governed report storage, and reused working-report HTML is discarded as stale output when it does not reference the current staged revisions
  - `VHS-REQ-431..432` are now implemented for the Linux benchmark lane: Linux failures retain supplemental headless artifacts such as `LVStatus.txt` and current `labview_*_headless_*_cur.txt` files under governed report storage, classify retained recursive LEIF-load markers as `linux-headless-recursive-load`, and surface the terminal diagnostic reason in the benchmark summary and canonical VS Code benchmark-status panel
  - `VHS-REQ-439` is now implemented for the Linux benchmark lane: a native Linux `labview-cli` pair that retains `linux-headless-recursive-load` now triggers one governed `LabVIEWCLI CloseLabVIEW -Headless` session reset with the selected `-LabVIEWPath` when available, then retries the same pair once before retaining terminal failure
  - `VHS-REQ-433..434` are now implemented for benchmark-proof control: the repo retains `docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json` as the accepted cross-OS `129`-commit / `128`-pair timing packet, derived from the first invalid governed surface rather than Linux generated-report count alone, while the full Linux `139`-commit / `138`-pair window remains an explicit retained blocker rather than an implied benchmark target
  - `TRANCHE-011` is now closed on bounded benchmark truth: a fresh governed canonical-host rerun on `2026-04-06` still failed late at pair `135/138`, and the retained summary now records `completionState=failed`, `terminalPairFailureReason=labview-cli-connection-failed`, `terminalPairDiagnosticReason=linux-headless-recursive-load`, plus recovery notes that the governed `CloseLabVIEW -Headless` session reset exited `1` before retry; the pair-failure receipt plus native Linux CLI and headless temp-surface diagnostics are present, bounded fresh-container repros fail the same pair under both `LabVIEWCLI` and `LVCompare`, and the accepted cross-OS comparable truth remains the retained `129`-commit / `128`-pair prefix packet with last comparable pair id `87792a7b6545`
  - the latest retained local Windows benchmark-image proof now reaches pair `129/134` before failing with `command-exited-nonzero`; the retained summary and bounded comparable-prefix packet now surface `terminalPairDiagnosticReason=labview-cli-call-by-reference`, the retained diagnostic log shows a successful LabVIEW connection followed by `Error 66 / Call By Reference`, and the older retained canonical-host Windows-container proof for the same pair shows the same connected-session `Error 66 / Call By Reference` seam, so the active Windows ceiling is treated as pair-specific benchmark truth rather than as an image-only startup defect
  - a fresh governed repo-local exact-pair rerun now retains the active Windows-image surface explicitly: the authority repo `.cache` `comparison-report-smoke.json` now carries `runtimeLabviewIniPath=C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.ini`, `runtimeLabviewTcpPort=3363`, and startup-hardening notes from the container meta line itself, while the governed runtime-surface summary under `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-proof\cache\github-experiments\windows-dashboard-benchmark\HARNESS-VHS-002\latest-runtime-surface.json` proves the current image contract exposes x64 `LabVIEW.exe`, x86 `LabVIEWCLI.exe`, x64 `LVCompare.exe`, and no coherent same-bitness `labview-cli` bundle; that closes pair `129` as the accepted current-contract Windows ceiling rather than as an open missing-argument seam
  - exact-pair benchmark-image admission is now fail-closed on retained execution-surface truth instead of proof-root naming alone: `buildComparablePrefixBenchmarkPacket` searches the current and archived `.prev-*` exact-pair smoke receipts, selects the latest eligible receipt whose smoke report still carries Windows benchmark-image container markers such as `C:\workspace\.cache` clone/artifact paths and, when available, `C:\Users\ContainerAdministrator\...` diagnostic-log sources, and records rejected latest reruns separately if they no longer prove that governed surface
  - those exact-pair `comparison-report-smoke` receipts now also persist `executionSurfaceContext` plus `executionSurfaceMarkers` when those retained markers prove the governed Windows benchmark-image surface, and the comparable-prefix packet now prefers those explicit retained fields while still falling back to path-derived admission for older receipts
  - the comparable-prefix packet now also retains an explicit Windows blocker characterization for that same exact pair: the retained `labview-cli` receipt proves `runtimeExecutableBitness=x86` while the governed headless-reset `-LabVIEWPath` resolves to the x64 `LabVIEW.exe`, so the bounded Windows ceiling is carried as `mixed-bitness-call-by-reference-seam`; out-of-scope alternative Windows x86 provisioning may exist through slower NI Package Manager plus ISO installation, but that is not the current governed benchmark image contract and does not reopen the accepted ceiling
  - the governed exact-pair Windows diagnosis receipts now prove the same blocker boundary `6dd65df -> 3408654` fails under both supported engines: `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-pair129-labviewcli` retains `command-exited-nonzero (labview-cli-call-by-reference)` after a connected session plus one governed `CloseLabVIEW -Headless` recovery attempt, and its derived `comparison-report-smoke` surfaces plus the comparable-prefix packet now retain the failed reset itself as `headlessSessionResetExitCode=1` with dedicated stdout/stderr artifacts whose stderr retains the `-350000` connection-failure diagnosis before retry; the packet also retains `windows-benchmark-image-pair129-lvcompare` as a bounded exact-pair `command-timed-out` proof after `120000ms`, so future sessions no longer need to mine AppData receipts just to confirm that both Windows engines were exercised on the same selected/base pair
  - after clearing a stale non-headless host `LabVIEW.exe` session and forcing a truly host-native exact-pair rerun with `--bitness x86`, the same blocker boundary in `C:\dev\vi-history-suite-pair-diagnosis-stage\.cache\harness-reports\HARNESS-VHS-002` first failed as `provider=host-native` plus `command-timed-out`, observed `LabVIEWCLI.exe` without `LabVIEW.exe`, and retained only the x86 LabVIEW path in the CLI log; after the `VHS-REQ-448` port fix, a fresh rerun on the same boundary now also retains `runtimeLabviewIniPath=C:\Program Files (x86)\National Instruments\LabVIEW 2026\LabVIEW.ini` and `runtimeLabviewTcpPort=3364`, but still times out after `120000ms` while observing `LabVIEWCLI.exe` without `LabVIEW.exe`, so VI Server port drift was real and is now governed explicitly, yet multiple installed LabVIEW versions plus native-host startup/session state remain a separate unresolved Windows-host seam rather than the full explanation of the Windows image blocker
  - a follow-on canonical host-native rerun of that same exact pair under `LV_RTE_HEADLESS=1` now retains bare `-Headless` in the governed `runtimeArgs`, but it still times out after `120000ms` while observing only `LabVIEWCLI.exe` and never `LabVIEW.exe`; that narrows the unresolved native-host Windows seam further, because explicit headless mode plus explicit `-PortNumber 3364` still do not cause LabVIEW itself to launch
  - the canonical Windows host runtime surface is now fail-closed on contamination: explicit override paths must exist, preflight blocks reruns when stale LabVIEW-related processes or a preexisting governed VI Server listener remain open, and the current host fact pattern is explicit too, because only `C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.exe` exists locally while `LabVIEW.exe` and `LVCompare.exe` exist under both `Program Files` and `Program Files (x86)`; that leaves the canonical host bundle as x86 `LabVIEWCLI.exe` plus the selected x86 or x64 LabVIEW 2026 runtime surface rather than a same-bitness CLI install requirement
  - while refreshed benchmark images republish, the active PROGRAM-0003 follow-on move is now a governed `runGovernedProof host-operation-matrix` lane on the canonical Windows host: it inventories the installed LabVIEWCLI operation set from `C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\Operations`, runs the LabVIEW 2026 x64 tranche first and gates the x86 tranche until that x64 tranche completes cleanly in the same governed run, uses the local canonical `labview-ci-cd/actions/VICompareTooling` tree for the repo-supplied `PrintToSingleFileHtml` operation and fails closed when that tree is missing, requires pre-run and post-run contamination inspection plus retained cleanup truth for every case, distinguishes cold CLI attach from warm headless-prelaunched LabVIEW attach, and keeps `CreateComparisonReport` gated until the simpler operations are exercised first
  - fresh governed host proof on `2026-04-14` now retains the next exact blocker receipt explicitly instead of relying on the older `2026-04-06` warm-headless ledger alone: the current cold-only `runGovernedProof host-operation-matrix` receipt at `.cache/governed-proof/windows-host-operation-matrix/2026-04-14T07-59-35-969Z/host-operation-matrix.json` proves every x64 cold prerequisite case (`CloseLabVIEW`, `ExecuteBuildSpec`, `MassCompile`, `RunUnitTests`, `RunVI`, `RunVIAnalyzer`, and `PrintToSingleFileHtml`) now exits only after leaving `LabVIEWCLI.exe` hot long enough to retain `blockedReason=post-run-runtime-surface-contaminated`, so the same governed run correctly gates the entire x86 tranche as `x64-tranche-did-not-complete-cleanly`; that means the current active canonical-host prerequisite blocker is the x64 cold-attach contamination seam, while the older warm-headless x64 success and x86-specific `CloseLabVIEW` / `RunUnitTests` seams remain historical subordinate evidence rather than the newest host truth, and the host-operation-matrix lane still keeps `CreateComparisonReport` gated behind that fresh cold-host blocker
- direct canonical host `CreateComparisonReport` characterization from
  `2026-04-14` remains retained per host bundle in the tracked packet
  [docs/product/benchmark-packets/HARNESS-VHS-001-windows-host-create-comparison-proof-2026-04-14.md](./benchmark-packets/HARNESS-VHS-001-windows-host-create-comparison-proof-2026-04-14.md)
  plus the raw governed roots
  `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x64/`
  and
  `.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x86/`:
  both host-native LabVIEW 2026 runs reached `ready-for-runtime`, derived
  explicit VI Server ports (`3363` for x64, `3364` for x86), observed
  `LabVIEWCLI.exe` at the banner snapshot while `LabVIEW.exe` was not
  observed, retained no LabVIEW-related processes at exit, and failed
  `command-timed-out` after `120000ms` without a generated report; that packet
  is historical characterization only rather than current Linux/Docker
  validated-preview admission, because Windows x64 installed-user proof is
  deferred on the Ubuntu-only machine and Windows x86 / 32-bit LabVIEW remains
  out of scope for any Windows installed-user claim
  - canonical proof-admission validation for explicit proof-admission override bundles is now shared across the full governed-proof control surface rather than one diagnosis path only, so `runGovernedProof` subcommands for `dashboard-smoke`, `decision-record`, `report-smoke`, `benchmark-linux`, and `benchmark-windows` all reject contradictory explicit proof-admission bundles before they can bias retained evidence
  - retained internal `LVCompare` parity evidence still does not extend the comparable window: the published-image parity proof at `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-proof-lvcompare` times out immediately on pair `1/129`, retains `completionState=failed`, `terminalPairFailureReason=command-timed-out`, and remains characterization-only, so `LVCompare` is not currently a viable Windows workaround around the pair-129 `labview-cli-call-by-reference` ceiling
  - the retained exact-pair Windows `LVCompare` parity diagnosis on the precise blocker boundary `6dd65df -> 3408654` also fails closed: the retained report-smoke proof at `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-pair129-lvcompare` reaches the targeted pair, retains `runtimeExecutionState=failed` with `runtimeFailureReason=command-timed-out`, observes both `LabVIEW.exe` and `LVCompare.exe` at process spawn, and then exits the bounded `120000ms` budget without a generated report, so that retained internal parity lane is not a viable exact-pair Windows workaround either
- `TRANCHE-012`: Post-release sustainment and release cadence
  - active issue: [ISSUE-0409 Post-Release Sustainment And Release Cadence](./issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md)
  - active execution program: [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
  - active operating rules: [post-release-sustainment-rules.md](./post-release-sustainment-rules.md) and [post-release-sustainment-rules.json](./post-release-sustainment-rules.json)
  - this tranche now owns long-tail release cadence, benchmark refresh cadence, operator-surface upkeep, and post-release control-plane maintenance after benchmark proof, execution-policy closeout, and public-facade acceptance closeout all landed
  - release sustainment is now explicit event-driven repo truth: preview and tagged release refreshes occur only when package, release-manifest, public-release-kit, or release-procedure contracts change
  - benchmark sustainment is now explicit event-driven bounded truth: the accepted `129`-commit / `128`-pair packet, the Windows pair-129 ceiling, and the Linux pair-135/138 blocker stay stable unless the governed benchmark contract changes enough to trigger a reopen
  - the closed `1.2.1` patch slice now governs VS Code Marketplace publication
    as an explicit exact-release closeout surface and retains a dedicated
    Marketplace publication ledger instead of leaving Marketplace state in chat
    memory
  - the same closed `1.2.1` slice now redesigns the installed-user entry
    surface so Marketplace users land on maintained local-use documentation
    first, while repo/fork/Codespaces procedures remain explicit secondary
    source-evaluation lanes
  - the exact public `main` line now publishes `0ea58af`, the maintained
    public `develop` candidate now publishes `ab293d5`, the last clean
    expert-agent-reviewed public source/wiki heads remain `0f19f4b` /
    `53b5348`, the maintained public wiki head now publishes `141c39e`, the
    VS Code Marketplace item verifies `1.3.0`, and exact `v1.3.0` closeout is
    now complete on authority `main` `9587a99` back-merged into `develop`
    `04b07bd` with green pipeline `2467081960`; the next exact line is now
    `v1.3.1` and is now `tag-eligible` for exact-release reopening on
    published-surface grounds
  - sustainment does not absorb the active `TRANCHE-016` local-LabVIEWCLI
    contract reset, the historical `TRANCHE-010` Docker-only public closeout,
    or the runtime-provider public-acceptance gate record
- `TRANCHE-016`: Host-default LabVIEWCLI, expert Docker provider, and explicit compare workflow
  - active issue: [ISSUE-0412 Installed Local LabVIEWCLI Selection And Explicit Compare](./issues/ISSUE-0412-installed-local-labviewcli-selection-and-explicit-compare.md)
  - active execution program: [PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
  - the current exact released installed extension now defaults to Windows
    local `LabVIEWCLI` with bounded expert Docker, while the Docker-only line
    is retained only as historical baseline truth under `ISSUE-0410`
  - the control-plane reset, explicit compare preflight, exact Windows
    host-runtime preflight, and provider-selection CLI slice are now
    published in exact `v1.3.9`
  - the installed manifest/settings slice now truthfully exposes
    `viHistorySuite.runtimeProvider`, `viHistorySuite.labviewVersion`, and
    `viHistorySuite.labviewBitness`
  - expert Docker provider selection now flows through the generated CLI and
    the governed engine-derived image-family admission path
  - installed-user warning behavior is now landed with compare-preflight block
    plus VS Code warning surfaces
  - the generated settings CLI is now proven through first-use launcher
    materialization plus current-host launcher invocation against a temporary
    settings file
  - the explicit Windows proof lane `npm run test:integration:windows` now
    proves the `.cmd` launcher path and the default no-`--settings-file`
    target under a disposable `APPDATA\\Code\\User\\settings.json`, aligned
    to the active disposable Windows integration-host profile
  - that same Windows proof lane now also proves the governed provider-CLI
    validation surface against a persisted `docker` / `2026` / `x64` bundle:
    when Docker Desktop and the governed Windows image are available on the
    canonical host, validation returns `runtimeValidationOutcome=ready`,
    `runtimeProvider=windows-container`, `runtimeEngine=labview-cli`, and no
    blocked reason
  - current real-host x64 validation now admits the governed mixed-bitness
    host bundle on this machine: persisted `host` / `2026` / `x64` settings
    resolve to x64 `LabVIEW.exe` plus the canonical installed x86
    `LabVIEWCLI.exe`, and the governed x64 host proof now succeeds on that
    same mixed-bitness bundle when the proof command is given a bounded
    `300000ms` runtime budget
  - the earlier retained `HARNESS-VHS-002` x64 host-only timeout receipt at
    `180000ms` remains historical under-timed evidence only; the current
    retained host truth is that `CreateComparisonReport` on
    `resource/plugins/lv_icon.vi` generated a report on this machine under the
    same mixed-bitness bundle, with `LabVIEWCLI.exe` observed at the banner
    snapshot and `LabVIEW.exe` observed at exit
- private-release proof focus is now explicit: Windows x64 host and
  Windows-container lanes are deferred proof lanes on the current Ubuntu-only
  setup; the active develop/package claim is Linux/Docker validated preview,
  and Windows x86 / 32-bit LabVIEW remains out of scope for any Windows
  installed-user claim
- installed-user and private-release docs now fail closed on scope: Windows
  x64 only for the released host-default contract, with Linux public smoke, Linux
  benchmark material, and Windows x86 evidence retained only as
  source-evaluation or internal proof surfaces rather than part of the active
  user contract
  - WSL is not part of the retained Windows x64 private-release contract; those
    deferred proof lanes require native Windows host execution and Docker Desktop Windows-container execution, historically retained under
    `.cache/private-release/1.3.0/windows-x64-host/` and
    `.cache/private-release/1.3.0/windows-x64-container/`
  - the tracked branch packet that binds those ignored proof roots, the
    package identity, and the Windows-only claim is now retained in
    [private-release-windows-x64-v1.3.0.md](./private-release-windows-x64-v1.3.0.md)
    and
    [private-release-windows-x64-v1.3.0.json](./private-release-windows-x64-v1.3.0.json)
  - the governed private GitLab release for that same packet is now published
    as `private-v1.3.0-windows-x64` and is refreshable through
    `npm run gitlab:private-release:publish`
  - the repo retains the tagged GitLab Windows acceptance lane for this same
    scenario in
    [windows-private-release-runner-lane.md](./windows-private-release-runner-lane.md):
    the job `windows_private_release_acceptance` calls
    `npm run acceptance:windows:private-release` and retains
    `windows-private-release-evidence/` as the machine-readable recovery root
    when a real Windows/LabVIEW runner is available and
    `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`
  - the repo now also retains a separate self-hosted Linux assurance lane for
    the same protected branch sequence in
    [linux-assurance-runner-lane.md](./linux-assurance-runner-lane.md): the
    blocking jobs `assurance_release_gate`, `assurance_26514_authority`,
    `assurance_requirements_quality`, and
    `assurance_external_user_information` all pull the latest published
    `registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main`
    image on the local authenticated Linux runner and block preview or exact
    packaging when any blocking assurance lane fails, while
    `assurance_audit_packet` remains advisory only
  - a governed live-session probe command now compares persisted
    provider/version/bitness facts against active in-session VS Code runtime
    settings and retains per-run plus latest probe packets (`JSON` and
    `Markdown`) under extension-global storage, including explicit
    `in-session-updated` versus `reload-required` live-uptake observation plus
    cumulative retained history stance counts on each packet
  - one local fail-closed packet gate now exists at
    `npm run proof:runtime-settings-live-session:assert`; it blocks admission
    when the retained latest probe packet is missing, malformed, or does not
    prove `mutationTargetPersistedMatch=true`,
    `mutationTargetBaselineChanged=true`, and
    `historyProofStatus=re-evaluation-required`,
    `historyStance=candidate-live-uptake-observed`, with latest
    `liveUptakeObservation=in-session-updated`,
    `safeRestoreVerified=true`, latest `providerDrift=false`,
    explicit baseline/persisted provider
    `host`/`docker` facts, and retained
    `historyReloadRequiredCount=0` plus retained
    `historyInSessionUpdatedCount>=1` plus
    `historyUnknownObservationCount=0`, with retained history total/count
    integrity preserved
  - one local history receipt now exists at
    `npm run proof:runtime-settings-live-session:history`; it summarizes
    retained probe runs into one bounded live-uptake stance and explicit
    proof-status receipt (`not-fully-proven` vs `re-evaluation-required`),
    plus mutation-target alignment counts and baseline-switch counts
  - one local policy-boundary assertion now exists at
    `npm run proof:runtime-settings-live-session:policy:assert`; it fails
    closed when retained history no longer supports the current conditional
    stale-result guidance or when retained probe runs do not include bidirectional
    provider-selection mutation coverage (`host` and `docker`) with explicit
    retained mutation-target alignment and baseline-switch receipts, and when
    the latest retained probe observation is not `in-session-updated`, latest
    retained provider drift is not explicit `false`, retained history includes
    one or more `reload-required`, `providerDrift=true`, or missing
    provider-drift receipts, or retained history includes unknown
    observations, or retained safe-restore verification is not complete across
    retained runs
  - one repo-owned end-to-end proof runner now exists at
    `npm run proof:runtime-settings-live-session`; it executes the governed
    extension-host lane on the current supported host and snapshots the latest
    probe packet, retained history receipt, policy-boundary receipt, and
    integration logs under `.cache/runtime-settings-live-session-proof/latest/`
  - the latest retained governed Windows proof receipt at
    `.cache/runtime-settings-live-session-proof/latest/runtime-settings-live-session-proof.json`
    was refreshed on `2026-04-21T06:48:16.064Z`; its latest retained packet run
    `2026-04-21T06-45-35-068Z` now satisfies the strengthened branch boundary
    with `liveUptakeObservation=in-session-updated`,
    `providerDrift=false`, `historyReloadRequiredCount=0`,
    `historyInSessionUpdatedCount=2`, `historyUnknownObservationCount=0`,
    `historyStance=candidate-live-uptake-observed`,
    `historyProofStatus=re-evaluation-required`,
    `providerSelectionCoverage=bidirectional-selection-observed`, explicit
    retained host-plus-docker mutation coverage, and zero retained
    alignment/baseline-switch unknowns or mismatches
  - the remaining CLI proof gap is now narrower: direct live mutation of the
    already-running VS Code session is not yet end-to-end proven on this line;
    probe mutation safe-restore is now fail-closed and locally proven, and
    retained proof now observes provider live uptake on the admitted
    bidirectional provider-mutation path, so the generated CLI plus the
    settings-driven compare-preflight and runtime-doctor surfaces tell users
    to review Compare or runtime validation again after CLI updates and reload
    or restart only if stale provider or runtime facts remain
  - historical released `repo-standards-review` `v0.2.9` compliance closeout
    is retained in the branch control plane, while the current outer
    assurance lane uses the published `repo-standards-review`
    assurance-workbench `:main` image and the latest tagged release remains
    `v0.2.18`
  - the retained gate decision now keeps reload-or-restart guidance active
    while direct live-session uptake of updated settings remains unproven
  - no further `ISSUE-0414` implementation slice is currently required before
    later sustainment work on this published line; the remaining work on this
    line is authority/public reader-surface retention plus the unresolved
    active-settings mutation seam
  - retained handoff packet:
    [issue-0412-promotion-and-publication-handoff.md](./issue-0412-promotion-and-publication-handoff.md)
  - explicit public-acceptance gate:
    [runtime-provider-public-acceptance-gate.md](./runtime-provider-public-acceptance-gate.md)
    and
    [runtime-provider-public-acceptance-gate.json](./runtime-provider-public-acceptance-gate.json)
  - Docker is now a bounded expert provider rather than either the default
    installed-user dependency or an internal-only path
- historical installed-user Docker baseline:
  - `TRANCHE-013`: Extension execution flexibility and runtime acquisition UX
    - historical issue: [ISSUE-0410 Extension Execution Flexibility And Runtime Acquisition UX](./issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md)
    - landed the current released Docker-only compare contract and no-host-
      fallback rule
  - `TRANCHE-015`: Installed-user first-run Docker onboarding and fail-closed guidance
    - historical issue: [ISSUE-0410 Extension Execution Flexibility And Runtime Acquisition UX](./issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md)
    - landed the current released missing-Docker guidance and fail-closed
      first-run recovery text
- `TRANCHE-014`: Public Codespaces public-repo bootstrap
  - closed issue: [ISSUE-0411 Public Codespaces Public-Repo Bootstrap](./issues/ISSUE-0411-public-codespaces-public-repo-bootstrap.md)
  - closed execution program: [PROGRAM-0006: Public Codespaces Public-Repo Bootstrap](./execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md)
  - exact public `main` now publishes `v1.3.1`, and the maintained public
    `v1.3.1` `develop` line still publishes `ab293d5`, and the current
    expert-agent review on the published candidate heads now reports
    `no findings; exact release / Marketplace publish may proceed`, the
    published-surface reopening gate is closed cleanly, the controlled Windows
    x64 private GitLab release and the separate public GitHub exact release
    are now published, and Marketplace publication is the next separate act
    while Marketplace remains `1.3.0`
  - the first `1.2.0` correction repaired branch-governance admission by
    realigning exact `main` back into `develop` before feature work continues
  - the line now adds one generic public-repo bootstrap surface for public
    GitHub and GitLab HTTPS repos while keeping the canonical icon-editor
    helper path separate
  - Sergio's documented brand-new-fork and brand-new-Codespace rerun passes on
    `Examples/Logging with Helper-VIs.vi`, the exact public `main` line now
    publishes `ad351ed`, the maintained public `develop` candidate still
    publishes `ab293d5`, the public GitHub exact release `v1.3.1` is live,
    the VS Code Marketplace listing still serves `1.3.0`, the maintained
    public wiki/reference-manual package now publishes `141c39e`, the last
    clean expert-agent-reviewed public source/wiki heads remain `0f19f4b` /
    `53b5348`, and exact `v1.3.0` closeout is complete on authority `develop`
    `04b07bd`

Historical public closeout and runtime-provider public-acceptance gate record:

- [PROGRAM-0002: Public Source Facade And Public-Product Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
- historical issue: [ISSUE-0407 Public Source Facade And Public-Product Acceptance](./issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md)
- gate record (closed):
  - [runtime-provider-public-acceptance-gate.md](./runtime-provider-public-acceptance-gate.md)
  - [runtime-provider-public-acceptance-gate.json](./runtime-provider-public-acceptance-gate.json)
- trust boundary:
  - private GitLab immutable release remains product truth
  - private GitLab source repo remains the authority repo and release-control surface
  - internal GitLab wiki remains the maintainer-facing derived reader surface
  - the private GitHub experiment mirror is a non-authoritative Linux benchmark lane only
  - public GitHub facade repo is the public source product surface at `https://github.com/svelderrainruiz/vi-history-suite`; the exact published head is retained in `docs/product/public-github-source-publication-ledger.md` and `docs/product/public-github-source-publication-ledger.json`
  - public GitHub user wiki now exists at `https://github.com/svelderrainruiz/vi-history-suite.wiki.git` as a public extension-user reader surface; the exact published head is retained in `docs/product/public-github-wiki-publication-ledger.md` and `docs/product/public-github-wiki-publication-ledger.json`
  - public GitHub source publication is tracked separately from both wiki surfaces in `docs/product/public-github-source-publication-ledger.md` and `docs/product/public-github-source-publication-ledger.json`
  - VS Code Marketplace publication is tracked separately in
    `docs/product/vscode-marketplace-publication-ledger.md` and
    `docs/product/vscode-marketplace-publication-ledger.json`; GitHub release,
    GitLab tag, and Marketplace publication are related but distinct
  - published public GitHub wiki pages now include `Home`, `User-Workflow`, `Install-And-Release`, `Fork-Codespace-Quickstart`, `Clone-Public-Repo-In-Codespace`, `Review-Public-LabVIEW-VI-Changes`, `Refresh-Codespace-Repositories`, `Comparison-Reports-And-Dashboard-Review`, and `Current-State`
  - installed users now land on the VS Code Marketplace listing plus the public
    GitHub wiki home as the intended local-use reader surface; the repo root is
    the source/contributor/control-plane surface instead of the first-contact
    installed-user overview
  - the canonical Gate D blocker on `resource/plugins/lv_icon.vi` is retired,
    while `v1.0.2` is now retained as a burned exact release and the current
    exact public GitHub release line is `v1.3.0`
  - the public branch model is now explicit: `develop` is the integration and
    Codespaces-evaluation branch, `release/*` is the release-candidate lane,
    and `main` remains the protected exact-release line
  - protected-branch promotion now depends on required checks instead of direct
    operator memory
  - public GitHub wiki publication is tracked separately from the internal GitLab maintainer wiki in `docs/product/public-github-wiki-publication-ledger.md` and `docs/product/public-github-wiki-publication-ledger.json`
  - public GitHub source repo is not the private GitHub experiment mirror
  - the authority VSIX install surface is compile-and-audit guarded, admits only explicitly governed shipped runtime dependencies, and fails closed on ungoverned `node_modules` payloads
  - the public GitHub source repo and public GitHub wiki publish extension-user and public-product material only; they do not publish private requirements, benchmark-control detail, or design-gate docs
  - public source promotion is now a governed one-way act through `npm run public:source:promote`
  - the local public-source operator surface now binds the intended checkout
    through `--target-root` or `VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT` and fails
    closed on dirty target repos before source-drift comparison or write
  - the GitHub workflow is the active public product smoke surface, while source publication remains a separate governed promotion act
  - `docs:ci:public` and `docs:ci:internal` now split public-user and internal-authority docs surfaces without removing the retained umbrella `docs:ci` lane
  - NSIS has been removed from the active public toolchain
  - Docker is now part of the default installed extension setup path
  - the current Windows 11 host machine has already proven the earlier public bundle, and the published public GitHub source repo plus the canonical fixture workspace remain historical acceptance evidence for the closed Docker-only line rather than automatic proof for the next host-default contract
  - the public GitHub admission matrix now uses `.github/workflows/public-source-package-preview.yml`, `.github/workflows/public-linux-installed-user-smoke.yml`, and `.github/workflows/public-windows-installed-user-contract.yml`, while `npm run public:smoke:linux` remains the public Docker-product smoke surface
  - the authority repo now retains `npm run public:gate-d:preflight` and `npm run public:gate-d:prepare-cold-pull` so the next human Gate D rerun can record published public commits, canonical fixture facts, Docker Linux engine state, and governed-image absence before the compare pass starts
  - the [Public Release Candidate](./public-release-candidate.md) and [public-release-candidate.json](./public-release-candidate.json) now retain the stable multi-surface exact-release snapshot without relying on ephemeral pipeline ids
  - the local public devcontainer now passes on this machine from a Windows-hosted public checkout after retiring the repo-owned `.devcontainer/devcontainer.json` `overrideCommand=false` defect that let the base Node image exit before `postCreateCommand` finished
  - the earlier WSL-path bind-mount failure is explicitly classified as a machine-surface mismatch between the broken Linux Docker CLI and Windows `docker.exe`, not as a public-repo devcontainer defect
  - the public product now carries an optional governed tester-fixture helper,
    `npm run public:fixture:icon-editor`, which clones
    `ni/labview-icon-editor` into a visible repo-sibling `labview-icon-editor`
    folder for devcontainer/Codespaces evaluation without making that clone a
    default startup dependency
  - the setup adapters prepare Visual Studio Code and Git when needed, install the exact VSIX, and materialize the local `ni/labview-icon-editor` Git fixture workspace with commit history
  - Visual Studio Code CLI automates install/verify/open surfaces after setup
  - the earlier retained manual right-click review pass remains historical evidence only, and Sergio Velderrain remains the sole named maintainer of the canonical host-machine proof surface for the closed Docker-only Gate D contract
  - the private extension now retains that human closeout through a deterministic in-IDE submission surface bound to the canonical host machine
  - the public acceptance surface now includes a dedicated host-machine human-gate closeout script with structured checklist retention in the acceptance record
  - public GitHub issues are supplemental field feedback, not gate-closing proof
- active and closed follow-on execution programs:
  - [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)
  - [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
  - [PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
  - [PROGRAM-0006: Public Codespaces Public-Repo Bootstrap](./execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md)
  - [runtime-provider-public-acceptance-gate.md](./runtime-provider-public-acceptance-gate.md)
  - [runtime-provider-public-acceptance-gate.json](./runtime-provider-public-acceptance-gate.json)

The active-queue source of truth is:

- [development-queue.json](./development-queue.json)
- [PROGRAM-0002: Public Source Facade And Public-Product Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
- [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)
- [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
- [PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- [PROGRAM-0006: Public Codespaces Public-Repo Bootstrap](./execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md)
- [runtime-provider-public-acceptance-gate.md](./runtime-provider-public-acceptance-gate.md)
- [runtime-provider-public-acceptance-gate.json](./runtime-provider-public-acceptance-gate.json)
- [extension-execution-policy.md](./extension-execution-policy.md)
- [debt-retirement-contract.md](./debt-retirement-contract.md)
- [debt-taxonomy.md](./debt-taxonomy.md)
- [debt-ledger.md](./debt-ledger.md)
- [debt-ledger.json](./debt-ledger.json)
- [wiki-authority-map.md](./wiki-authority-map.md)
- [documentation-coherence-ledger.md](./documentation-coherence-ledger.md)
- [wiki-seed-plan.md](./wiki-seed-plan.md)
- [wiki-publication-ledger.md](./wiki-publication-ledger.md)
- [wiki-publication-ledger.json](./wiki-publication-ledger.json)
- [wiki-coverage-matrix.md](./wiki-coverage-matrix.md)
- [wiki-coverage-matrix.json](./wiki-coverage-matrix.json)
- [release-procedure.md](../release-procedure.md)
- [Documentation Package Workbench](../documentation-workbench.md)
- [program-repo-jump.md](./program-repo-jump.md)
- [public-github-source-authority-map.md](./public-github-source-authority-map.md)
- [public-github-source-publication-ledger.md](./public-github-source-publication-ledger.md)
- [public-github-source-publication-ledger.json](./public-github-source-publication-ledger.json)

The current wiki stop rule is the zero-gap coverage matrix, not a soft page
count threshold. The wiki remains finished only while every in-scope
requirements-and-standards source stays `complete` and `published` in
`docs/product/wiki-coverage-matrix.json` and the publication ledger keeps
`nextPage = null`.

The current debt stop rule is no silent debt. Work remains unfinished whenever
a meaningful technical or documentation debt item is known locally but is not
either retired, recorded as open in `docs/product/debt-ledger.json`, or
recorded there as an accepted bounded exception under
`docs/product/debt-retirement-contract.md`.

The landed ship-record source of truth is:

- [SHIP-0001: Releasable VI History Suite](./SHIP-0001-releasable-vi-history-suite.md)
- [release-readiness-matrix.json](./release-readiness-matrix.json)
- [blocker-ledger.json](./blocker-ledger.json)
- [release-procedure.md](../release-procedure.md)

## Research Refresh

There is no committed active research round at this time.

When a future research cycle is needed, start from:

- [next-research-prompt.md](../research/authoritative/next-research-prompt.md)

## Local Evidence Surfaces

These are generated locally and are not the committed source of truth:

- design gate:
  - `.cache/design-gate/latest-report.json`
  - `.cache/design-gate/latest-report.md`
  - retained reports now distinguish `running` versus `complete` gate state
    and retain the pending next step when a later stage has not finished yet
  - use `npm run design:gate:assert-complete` before treating a retained
    report as a finished green gate, unless you already waited for the live
    `npm run design:gate` process to exit `0`
  - when the available standards-assurance skill resolves under `/mnt`, the
    gate mirrors it locally under
    `.cache/design-gate/assurance-skill/repo-standards-review/` before
    execution
  - the standards-assurance step now fails closed on timeout instead of
    hanging indefinitely
- canonical history smoke:
  - `.cache/harness-reports/HARNESS-VHS-001/report.json`
  - `.cache/harness-reports/HARNESS-VHS-001/report.md`
  - `.cache/harness-reports/HARNESS-VHS-001/report.html`
- canonical comparison-report smoke:
  - `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.json`
  - `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.md`
  - `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.html`
- canonical dashboard smoke:
  - `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.json`
  - `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.md`
  - `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.html`
  - `<workspace-storage>/dashboards/<repoId>/<fileId>/<windowId>/dashboard-pair-eta-accuracy.json`
- documentation-package workbench:
  - `docker/docs-authoring/Dockerfile`
  - `docs/documentation-workbench.md`
  - `docs/product/wiki-publication-ledger.md`
  - `docs/product/wiki-publication-ledger.json`
  - `resources/bundled-docs/manifest.json`
  - `.cache/wiki-workbench/latest-workbench.json`
  - `.cache/wiki-workbench/staging/<page-id>/`
  - `.cache/wiki-workbench/publication-prep/<page-id>/publication-prep.json`
  - `docs-workbench-evidence/docs-workbench-manifest.json`
  - local gate via `npm run docs:gate`
  - local bundle refresh via `npm run docs:bundle`
  - local wiki workbench via `npm run wiki:workbench:doctor`,
    `npm run wiki:workbench:plan`, `npm run wiki:workbench:prepare`, and
    `npm run wiki:workbench:sync-bundled-docs`
  - local workbench image via `npm run docs:workbench:build`
  - local container gate via `npm run docs:workbench:gate`
  - local container wiki workbench via `npm run docs:workbench:wiki:doctor`,
    `npm run docs:workbench:wiki:plan`, `npm run docs:workbench:wiki:prepare`,
    and `npm run docs:workbench:wiki:sync-bundled-docs`
- fast local dev-host loop:
  - `.cache/dev-host/` or `C:\Users\sveld\AppData\Local\Temp\vihs-dev-host\`
  - reusable fixture workspace via `npm run dev:workspace`
  - dedicated development host via `npm run dev:host`
  - explicit Linux integration-host proof via `npm run test:integration:linux`
  - explicit Windows integration-host proof via `npm run test:integration:windows`
  - Linux bootstrap via `npm run public:host:bootstrap-linux`
- concentrated review dashboard:
  - `<workspace-storage>/report-history/<repoId>/<fileId>/pairs/<pairId>/source-record.json`
  - `<workspace-storage>/dashboards/<repoId>/<fileId>/<windowId>/dashboard.json`
  - `<workspace-storage>/dashboards/<repoId>/<fileId>/<windowId>/dashboard.html`
  - `<workspace-storage>/human-reviews/latest-human-review-submission.json`
  - `<extension-global-storage>/human-reviews/canonical-host-machine.json`
  - local consumer scripts: `npm run dashboard:latest`, `npm run dashboard:latest:host`, and `npm run review:latest`
- GitHub Linux benchmark experiment lane:
  - `.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-001/latest-summary.json`
  - `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.json`
  - `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.md`
  - `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.html`
  - deep host-owned benchmark target: `HARNESS-VHS-002` / `resource/plugins/lv_icon.vi`
  - local consumer scripts: `npm run benchmark:github:latest` and `npm run benchmark:github:latest:json`
- public facade host-machine acceptance:
  - `C:\Users\sveld\AppData\Local\VI History Suite\acceptance\host-machine\setup\setup-record.json`
  - `C:\Users\sveld\AppData\Local\VI History Suite\acceptance\host-machine\acceptance-record.json`
- public-facade Linux smoke:
  - `artifacts/public-linux-installed-user-smoke/public-linux-installed-user-smoke.json`
- public product Gate D preflight:
  - `.cache/public-product-gate-d/latest/public-product-gate-d-preflight.json`
  - `.cache/public-product-gate-d/latest/public-product-gate-d-preflight.md`
- public GitHub exact-release transaction:
  - `.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.json`
  - `.cache/public-github-exact-release-transaction/latest/public-github-exact-release-transaction.md`
  - local fail-closed assessment via
    `npm run public:github:exact:transaction:assess`
  - latest retained draft-publishability probe:
    `draftPublishabilityProbeReleaseId=312363117`,
    `draftPublishabilityByIdStatusCode=200`,
    `draftPublishabilityTagMatchesAuthority=true`,
    `draftPublishabilitySafeToAttemptPublish=false`
  - latest retained publishability probe:
    `immutableReleasesEnabled=true`,
    `immutableReleasesEnforcedByOwner=false`,
    `draftReleaseTargetCommitish=main`,
    `draftReleaseLookupStatusCode=404`,
    `draftReleaseHtmlUrlUsesUntaggedPath=true`,
    `publishabilityBlockerCode=draft-release-tag-lookup-unavailable`

## Commands

Primary local commands:

```bash
npm run design:gate
npm run design:gate:assert-complete
npm run proof:run -- smoke --harness-id HARNESS-VHS-001
npm run proof:run -- report-smoke --harness-id HARNESS-VHS-001
npm run proof:run -- dashboard-smoke --harness-id HARNESS-VHS-001
npm run proof:run -- decision-record --harness-id HARNESS-VHS-001
npm run proof:run -- benchmark-linux --harness-id HARNESS-VHS-001
npm run proof:run -- benchmark-linux --harness-id HARNESS-VHS-002
npm run proof:run -- benchmark-windows --harness-id HARNESS-VHS-002
npm run public:gate-d:preflight
npm run public:gate-d:prepare-cold-pull
npm run docs:gate
npm run docs:bundle
npm run docs:workbench:build
npm run docs:workbench:gate
npm run program:repos
npm run test:integration:linux
npm run test:integration:windows
```

## Update Rule

When the repo meaningfully changes, update these together:

- [README.md](../../README.md)
- [Research Alignment Matrix](../research/authoritative/research-alignment.md)
- [Research Implementation Index](../research/authoritative/research-implementation-index.json)
- [Development Queue](./development-queue.json)
- [SHIP-0001: Releasable VI History Suite](./SHIP-0001-releasable-vi-history-suite.md)
- [release-readiness-matrix.json](./release-readiness-matrix.json)
- [blocker-ledger.json](./blocker-ledger.json)
- [wiki-authority-map.md](./wiki-authority-map.md)
- [program-repo-jump.md](./program-repo-jump.md)
- [Documentation Package Workbench](../documentation-workbench.md)
- [wiki-publication-ledger.json](./wiki-publication-ledger.json)
- [wiki-coverage-matrix.json](./wiki-coverage-matrix.json)
- [Software Requirements Specification](../requirements/srs.md)
- [Traceability Matrix](../requirements/rtm.csv)
- [Test Plan](../testing/test-plan.md)
