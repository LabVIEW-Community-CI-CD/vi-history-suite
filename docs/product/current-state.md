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
2. [Research Implementation Index](../research/authoritative/research-implementation-index.json)
3. [Research Alignment Matrix](../research/authoritative/research-alignment.md)
4. [Development Queue](./development-queue.json)
5. [Architecture Overview](../architecture/overview.md)
6. [Software Requirements Specification](../requirements/srs.md)
7. [SHIP-0001: Releasable VI History Suite](./SHIP-0001-releasable-vi-history-suite.md)
8. [wiki-authority-map.md](./wiki-authority-map.md)
9. [documentation-coherence-ledger.md](./documentation-coherence-ledger.md)
10. [wiki-seed-plan.md](./wiki-seed-plan.md)
11. [wiki-publication-ledger.md](./wiki-publication-ledger.md)
12. [wiki-publication-ledger.json](./wiki-publication-ledger.json)
13. [wiki-coverage-matrix.md](./wiki-coverage-matrix.md)
14. [wiki-coverage-matrix.json](./wiki-coverage-matrix.json)
15. [Documentation Package Workbench](../documentation-workbench.md)
16. [program-repo-jump.md](./program-repo-jump.md)
17. [PROGRAM-0001: Next Product Layer](./execution-programs/PROGRAM-0001-next-product-layer.md)
18. [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
19. [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)
20. [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)

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
2. [research-implementation-index.json](../research/authoritative/research-implementation-index.json)
3. [development-queue.json](./development-queue.json)
4. [next-research-prompt.md](../research/authoritative/next-research-prompt.md)
5. [SHIP-0001: Releasable VI History Suite](./SHIP-0001-releasable-vi-history-suite.md)
6. [release-readiness-matrix.json](./release-readiness-matrix.json)
7. [blocker-ledger.json](./blocker-ledger.json)
8. [wiki-authority-map.md](./wiki-authority-map.md)
9. [documentation-coherence-ledger.md](./documentation-coherence-ledger.md)
10. [wiki-seed-plan.md](./wiki-seed-plan.md)
11. [wiki-publication-ledger.md](./wiki-publication-ledger.md)
12. [wiki-publication-ledger.json](./wiki-publication-ledger.json)
13. [wiki-coverage-matrix.md](./wiki-coverage-matrix.md)
14. [wiki-coverage-matrix.json](./wiki-coverage-matrix.json)
15. [Documentation Package Workbench](../documentation-workbench.md)
16. [program-repo-jump.md](./program-repo-jump.md)
17. [PROGRAM-0001: Next Product Layer](./execution-programs/PROGRAM-0001-next-product-layer.md)
18. [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
19. [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)
20. [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
21. [Fast VS Code Loop](../dev-fast-loop.md)

## Committed Capability State

| Capability Surface | Status | Evidence | Governing Queue |
| --- | --- | --- | --- |
| Content-detected VI eligibility and menu gating | implemented | `package.json`; `src/domain/viMagicCore.ts`; `src/indexing/viEligibilityIndexer.ts`; `VHS-REQ-001..015` | sustain |
| Review-oriented history panel and actions | implemented with stateful retained-pair actions so first-use rows show `Generate compare`, retained rows show `Refresh compare`, `Open compare` is enabled only when retained evidence exists, comparison view opening honors cancellation before panel open, retained comparison opening from `Diff prev` uses retained-open-specific wording, unreadable retained generated-report HTML now falls back to the retained packet with an explicit displayed-evidence status line, malformed, mismatched, unusable, or render-contract-invalid retained archive records now fail closed with stable `Refresh compare` guidance, compare generation now preserves the current compare view while refusing to flip the row into retained-open state when governed archive persistence was unavailable or failed, the panel exposes `Open docs` into the packaged bundled documentation surface, stale bundled-doc page ids now fall back to the packaged overview page when the installed bundle is available, the rendered action controls plus the installed action-surface packet now stay truthful to which optional compare/dashboard/docs/decision flows are actually wired in the current build, and the status/review packet now states whether the retained commit set is the full file history or a truncated auto/capped window | `src/ui/historyPanel.ts`; `src/commands/openViHistoryCommand.ts`; `src/reporting/comparisonReportAction.ts`; `src/docs/bundledDocumentationAction.ts`; `src/extension.ts`; `VHS-REQ-016..040`; `VHS-REQ-328..329`; `VHS-REQ-361..382`; `VHS-REQ-386..387` | sustain |
| Canonical real-history harness smoke | implemented | `src/harness/harnessSmoke.ts`; `src/cli/runHarnessSmoke.ts`; `npm run harness:smoke`; `VHS-REQ-029..030` | sustain |
| Comparison-report preflight, planning, and packet storage | implemented | `src/reporting/comparisonReportPreflight.ts`; `src/reporting/comparisonReportPlan.ts`; `src/reporting/comparisonReportPacket.ts`; `VHS-REQ-127..145` | sustain |
| LabVIEW 2026 Q1 runtime detection and governed live report execution | implemented and active | `src/reporting/comparisonRuntimeLocator.ts`; `src/reporting/comparisonReportRuntimeExecution.ts`; `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.json`; `VHS-REQ-146..181`; `VHS-REQ-217..220`; `VHS-REQ-239..250` | sustain |
| Canonical comparison-report smoke lane | implemented with succeeded NI proof | `src/harness/harnessReportSmoke.ts`; `src/cli/runHarnessReportSmoke.ts`; `npm run harness:report:smoke`; `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.html`; `VHS-REQ-152..180`; `VHS-REQ-220` | sustain |
| Indexing and report progress uplift | partially implemented and active | `src/indexing/viEligibilityIndexer.ts`; `VHS-REQ-093`; `VHS-REQ-305..306`; research alignment marks this partial | `TRANCHE-004` |
| Windows 64-bit isolated container provider | implemented and active | `docs/architecture/adr/ADR-0006-windows64-container-isolation-for-extension-users.md`; `src/reporting/comparisonRuntimeLocator.ts`; `src/reporting/comparisonReportRuntimeExecution.ts`; `VHS-REQ-146`; `VHS-REQ-217..220` | sustain |
| Multi-report developer dashboard for one VI across at least three commits | implemented and active with canonical dashboard smoke, extension-host proof, whole-window metadata concentration, chronology-aware pair-position references in those whole-window summaries, a chronology-first pair metadata ledger, pair-evidence backfill for missing or stale adjacent pairs, progress-aware dashboard refresh stages, explicit preparation-state reporting for retained-complete, backfill-in-progress, and backfill-unavailable refresh paths, retained preparation summaries in the dashboard HTML itself including refreshed-pair generated/blocked/failed/no-generated outcome counts, bounded minutes-and-seconds estimates during pair preparation, retained pair-level ETA accuracy characterization for the current refresh session, retained pair-level ETA characterization in canonical dashboard smoke, a stable `latest-dashboard-run.json` manifest with retained history-window/config/timing/progress experiment metadata for future-session consumption, direct local rendering for retained HTML artifacts, and cancellation honored through the final dashboard-open boundary with retained artifact paths preserved | `src/dashboard/comparisonReportArchive.ts`; `src/dashboard/dashboardEtaAccuracy.ts`; `src/dashboard/dashboardLatestRun.ts`; `src/dashboard/niComparisonReportParser.ts`; `src/dashboard/multiReportDashboard.ts`; `src/dashboard/multiReportDashboardAction.ts`; `src/harness/harnessDashboardSmoke.ts`; `src/cli/runHarnessDashboardSmoke.ts`; `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.json`; `tests/integration/suite/extensionHost.test.ts`; `VHS-REQ-212..215`; `VHS-REQ-221..223`; `VHS-REQ-232`; `VHS-REQ-237..238`; `VHS-REQ-268`; `VHS-REQ-295..304`; `VHS-REQ-330..340`; `VHS-REQ-347..349`; `VHS-REQ-363`; `VHS-REQ-375..376`; `VHS-REQ-380`; `VHS-REQ-388..389` | `TRANCHE-006` |
| Deterministic host-machine human review submission | implemented and active with a maintainer-only in-IDE history-panel submission surface on Sergio Velderrain's canonical Windows 11 host, concise outcome/confidence guidance, explicit in-panel submit feedback, stable `latest-human-review-submission.json` retention, fixed extension-global canonical host-machine fingerprint enforcement, fail-closed mismatch handling, and local `review:latest` evidence consumption for future sessions | `src/ui/historyPanel.ts`; `src/commands/openViHistoryCommand.ts`; `src/review/humanReviewSubmission.ts`; `src/review/humanReviewSubmissionAction.ts`; `scripts/printLatestHumanReviewSubmission.js`; `tests/unit/humanReviewSubmission.test.ts`; `tests/unit/openViHistoryCommand.test.ts`; `VHS-REQ-392..395` | `TRANCHE-010` |
| Bounded repo-family support policy | implemented and active with normalized GitHub upstream/fork classification plus governed retained local fixture-clone recognition for `ni/labview-icon-editor` and `ni/actor-framework`; explicit repo-support facts in the VI History panel; fail-closed blocking for compare/dashboard/decision-record/benchmark/host-review actions outside that family; and a separate governance boundary that keeps scenario, deep-benchmark, and maintainer host-review lanes narrower than generic family membership | `src/support/repositorySupportPolicy.ts`; `src/services/viHistoryModel.ts`; `src/commands/openViHistoryCommand.ts`; `src/ui/historyPanel.ts`; `src/scenarios/reviewScenarioRegistry.ts`; `tests/unit/repositorySupportPolicy.test.ts`; `tests/unit/viHistoryCore.test.ts`; `tests/unit/historyPanel.test.ts`; `tests/unit/openViHistoryCommand.test.ts`; `docs/architecture/adr/ADR-0017-bounded-repo-family-support.md`; `VHS-REQ-406..408` | sustain |
| GitHub Linux benchmark experiment lane | partially implemented and active as a characterization-first Linux benchmark surface in the authority repo and private GitHub experiment mirror: the hosted workflow defaults to the shallower `HARNESS-VHS-001` canonical harness while the canonical Windows host retains ownership of the deep `HARNESS-VHS-002` / `lv_icon.vi` UX lane and the Windows benchmark image is now published as the repeatable deep Windows baseline, with a stable benchmark CLI, a pinned NI Linux image, a published benchmark/source-experiment image, a headless derived container recipe for GitHub-hosted runs, and a canonical-host in-IDE benchmark-status panel that resolves the canonical `vi-history-suite` authority workspace even when the current VI History target lives in a different repo, stages that authority workspace into a fresh Windows-local benchmark workspace before launching the local host Linux benchmark while excluding repo-local transient/test-runtime artifacts such as `.vscode-test`, defaults host runs to the current published benchmark image tag unless explicitly overridden, filters raw `npm warn` noise out of the front-facing progress channel, emits pair-preparation progress into the same live VS Code progress surface used by the Windows lane rather than retaining it only in background receipts, enforces bounded per-pair runtime timeouts, writes machine-readable per-pair failure receipts, retains terminal partial summaries for failed runs, retains native Linux NI CLI diagnostic logs under governed report storage, discards stale reused report HTML that does not reference the current staged revisions, attempts one governed `CloseLabVIEW -Headless` reset plus one retry for retained `linux-headless-recursive-load` failures, and retains a governed comparable-prefix packet for the accepted cross-OS `129`-commit / `128`-pair timing scope derived from the first invalid governed surface rather than Linux generated-report count alone; the full deep Linux lane still fails truthfully late at pair `135/138` with `command-exited-nonzero (linux-headless-recursive-load)`, so the lane remains bounded-blocked for the full window while the retained comparable-prefix packet carries the current cross-OS timing truth and the first invalid Windows boundary at pair `129` | `src/harness/canonicalHarnesses.ts`; `src/cli/runGitHubLinuxDashboardBenchmark.ts`; `src/benchmark/benchmarkStatus.ts`; `src/benchmark/benchmarkStatusAction.ts`; `src/benchmark/hostLinuxBenchmarkRunner.ts`; `scripts/buildComparablePrefixBenchmarkPacket.js`; `docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json`; `.github/workflows/linux-runtime-benchmark-experiment.yml`; `docker/github-linux-dashboard-benchmark/Dockerfile`; `docker/github-linux-dashboard-benchmark/run-benchmark.sh`; `tests/unit/runGitHubLinuxDashboardBenchmarkCli.test.ts`; `tests/unit/githubLinuxBenchmarkWorkflow.test.ts`; `tests/unit/benchmarkStatus.test.ts`; `tests/unit/benchmarkStatusAction.test.ts`; `tests/unit/hostLinuxBenchmarkRunner.test.ts`; `tests/unit/buildComparablePrefixBenchmarkPacketScript.test.ts`; `VHS-REQ-397..417`; `VHS-REQ-431..434`; `VHS-REQ-439` | `TRANCHE-011` |
| Windows benchmark-image lane | implemented and published as a repeatable deep `HARNESS-VHS-002` benchmark baseline distinct from Sergio's canonical Windows host UX lane, with a dedicated Windows benchmark CLI, pinned NI Windows image contract, Dockerfile, runner script, GHCR image-publication workflow, successful publication runs, a pullable `ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main` image, and a governed canonical-host proof runner that pulls the published image, pre-seeds the mounted harness cache from the governed local `ni/labview-icon-editor` clone when available, normalizes Git safe-directory handling for those mounted clones, defaults `HARNESS-VHS-002` to the retained comparable-prefix dashboard window while the Linux full window remains blocked, and writes launch/log/summary receipts under `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-proof`; the active hardening now retains explicit Windows `-LabVIEWPath` command planning, forces `LV_RTE_HEADLESS=1` in the published image, hardens `LabVIEWCLI.ini` startup timeouts, prelaunches headless LabVIEW before benchmark execution to mitigate NI's documented Windows-container `-350000` startup seam, and now attempts one governed `CloseLabVIEW -Headless` session reset plus one retry for connected-session `Error 66 / Call By Reference` failures after pair `1` is cleared; the latest retained local proof now reaches pair `129/134` before that late seam, and hosted Windows benchmark execution remains explicitly not-yet-governed until local host proof exists | `src/cli/runGitHubWindowsDashboardBenchmark.ts`; `.github/workflows/windows-runtime-benchmark-image.yml`; `docker/github-windows-dashboard-benchmark/Dockerfile`; `docker/github-windows-dashboard-benchmark/run-benchmark.ps1`; `scripts/runHostWindowsBenchmarkImageProof.js`; `src/reporting/comparisonReportExecutionPlan.ts`; `src/reporting/comparisonReportRuntimeExecution.ts`; `tests/unit/runGitHubWindowsDashboardBenchmarkCli.test.ts`; `tests/unit/githubWindowsBenchmarkWorkflow.test.ts`; `tests/unit/runHostWindowsBenchmarkImageProofScript.test.ts`; `tests/unit/comparisonReportExecutionPlan.test.ts`; `tests/unit/comparisonReportRuntimeExecution.test.ts`; `docs/architecture/adr/ADR-0018-windows-benchmark-image-lane.md`; `VHS-REQ-413..415`; `VHS-REQ-435..440` | `TRANCHE-011` |
| Review-scenario registry and human decision records | implemented and active with extension-facing decision-record creation from the history panel, scenario matching by repository remote URL plus VI path, separate Markdown/JSON artifact persistence, persisted reviewer-name defaults across decision-record runs, cancellation honored after dashboard build and before retained Markdown open with already-built artifact paths preserved, and real extension-host proof | `src/scenarios/reviewScenarioRegistry.ts`; `src/scenarios/decisionRecord.ts`; `src/scenarios/reviewDecisionRecordAction.ts`; `src/harness/harnessDecisionRecord.ts`; `src/commands/openViHistoryCommand.ts`; `tests/integration/suite/extensionHost.test.ts`; `docs/product/review-scenarios.md`; `docs/product/decision-record-template.md`; `VHS-REQ-307..312`; `VHS-REQ-341..355`; `VHS-REQ-385` | `TRANCHE-007` |
| Runtime-doctor and dashboard-refresh developer experience | implemented and active with history-panel command routing that now fails closed with explicit build-capability guidance when stale panel commands target unsupported optional surfaces, with stale bundled-doc page requests falling back to the packaged overview page when the installed bundle is still available, with `Diff prev` for content-detected VIs refusing text-diff fallback when comparison-report routing is unavailable in the current build, with dashboard pair-preparation progress now distinguishing refreshed generated, blocked, failed, no-generated-report, and missing-retained-archive outcomes, and with compare opening both falling back to the retained packet when retained generated-report HTML is unreadable, rendering retained archive availability/failure facts in the live panel status block, and failing closed with explicit `Refresh compare` guidance when the retained archive source record is malformed, mismatched, render-contract-invalid, or no longer points at a usable retained packet | `src/reporting/comparisonRuntimeDoctor.ts`; `src/reporting/comparisonRuntimeLocator.ts`; `src/reporting/comparisonReportPacket.ts`; `src/reporting/comparisonReportAction.ts`; `src/dashboard/multiReportDashboardAction.ts`; `src/commands/openViHistoryCommand.ts`; `tests/integration/suite/extensionHost.test.ts`; `VHS-REQ-224..236`; `VHS-REQ-241`; `VHS-REQ-244..247`; `VHS-REQ-251..258`; `VHS-REQ-377..382`; `VHS-REQ-386` | sustain |
| Ship-control system and SemVer release target | implemented and active with retained immutable `v0.2.0` release evidence through GitLab release `v0.2.0`, tag pipeline `2428809456`, kept release job `13779604462`, and a governed wiki-authority map that constrains future wiki generation to repo docs instead of source or chat memory | `docs/product/SHIP-0001-releasable-vi-history-suite.md`; `docs/product/release-readiness-matrix.json`; `docs/product/blocker-ledger.json`; `docs/product/wiki-authority-map.md`; `docs/release-procedure.md`; `.gitlab-ci.yml`; `tests/unit/shipControlDocs.test.ts`; `VHS-REQ-313..323` | `TRANCHE-009` |
| Documentation-package workbench image and docs gate | implemented and active with a repo-published docs-authoring image, local, Docker-first, and published-image-local wiki-workbench commands, a repo-native docs gate, a commit-aligned `wiki_workbench_prepare_published` GitLab lane that runs from `${CI_REGISTRY_IMAGE}/docs-authoring:sha-${CI_COMMIT_SHORT_SHA}` and retains `wiki-workbench-evidence/`, supported GitLab-registry environment-variable auth for local published-image pulls plus explicit fail-closed registry-access diagnostics when the published image is not locally pullable, automated SRS/RTM/test-plan coherence checks, automated active post-release tranche/issue/program coherence checks plus open Gate C-D truth checks, research-control-plane regression checks for the live history-window/dashboard surfaces, a retained documentation coherence ledger, a wiki seed plan, Markdown and JSON wiki publication ledgers, a generated packaged docs bundle, and a governed wiki workbench that resolves authority/wiki topology from the repo-jump map, stages page-authority bundles, retains `.cache/wiki-workbench/latest-workbench.json`, writes publication-prep receipts under `.cache/wiki-workbench/publication-prep/`, and self-heals onto writable `staging-runs/` or `publication-prep-runs/` paths when stale retained page directories are unwritable | `docker/docs-authoring/Dockerfile`; `docker/docs-authoring/entrypoint.sh`; `scripts/run-docs-gate.js`; `scripts/syncBundledDocs.js`; `scripts/runDocsWorkbenchDocker.js`; `src/tooling/wikiWorkbench.ts`; `src/cli/runWikiWorkbench.ts`; `docs/documentation-workbench.md`; `docs/product/documentation-coherence-ledger.md`; `docs/product/wiki-seed-plan.md`; `docs/product/wiki-publication-ledger.md`; `docs/product/wiki-publication-ledger.json`; `resources/bundled-docs/manifest.json`; `.gitlab-ci.yml`; `tests/unit/docsWorkbenchDocs.test.ts`; `tests/unit/packageManifest.test.ts`; `tests/unit/requirementsDocs.test.ts`; `tests/unit/postReleaseControlPlaneDocs.test.ts`; `tests/unit/runWikiWorkbenchCli.test.ts`; `tests/unit/runDocsWorkbenchDocker.test.ts`; `VHS-REQ-350..360`; `VHS-REQ-367..370`; `VHS-REQ-391`; `VHS-REQ-418..426` | `TRANCHE-009` |
| Wiki completion invariant for requirements and standards surfaces | implemented and active with a machine-readable wiki coverage matrix, an accepted ADR aggregation rule, a zero-gap publication contract, and docs-gate enforcement that fails when an in-scope authority doc or ADR is uncovered, unpublished, or missing from the publication ledger | `docs/product/wiki-coverage-matrix.md`; `docs/product/wiki-coverage-matrix.json`; `tests/unit/wikiCoverageDocs.test.ts`; `VHS-REQ-427..430` | sustain |
| Bundled version-matched user documentation | implemented and active with a machine-readable wiki publication ledger, generated packaged HTML fragments under `resources/bundled-docs/`, a command-palette documentation command, and a local documentation panel that keeps users inside VS Code instead of requiring repo access | `docs/product/wiki-publication-ledger.json`; `scripts/syncBundledDocs.js`; `resources/bundled-docs/manifest.json`; `src/docs/bundledDocumentation.ts`; `src/docs/bundledDocumentationAction.ts`; `src/extension.ts`; `tests/unit/bundledDocumentation.test.ts`; `tests/integration/suite/extensionHost.test.ts`; `VHS-REQ-367..370` | sustain |
| Cross-repo navigation control plane | implemented and active with a governed repo-constellation map, a local repo-jump CLI, and mirrored skill-side resolver entrypoints for `vi-history-suite`, `vi-history-suite-source-experiments`, `vi-history-suite.wiki`, and `repo-standards-review` | `docs/product/program-repo-jump-map.json`; `docs/product/program-repo-jump.md`; `src/tooling/programRepoJump.ts`; `src/cli/runProgramRepoJump.ts`; `tests/unit/runProgramRepoJumpCli.test.ts`; `VHS-REQ-364..366`; `VHS-REQ-401` | `TRANCHE-009` |
| Fast local VS Code development-host loop | implemented and active with reusable fixture-workspace prep, explicit workspace override, direct or staged extension-host launch, explicit Linux/Windows integration-host selection, Linux runtime preflight, and a least-privilege root-owned Linux bootstrap command | `src/tooling/devHostLoop.ts`; `src/cli/runDevHost.ts`; `src/tooling/integrationHostRuntime.ts`; `docs/dev-fast-loop.md`; `package.json`; `tests/unit/runDevHostCli.test.ts`; `tests/unit/integrationHostRuntime.test.ts`; `tests/unit/packageManifest.test.ts`; `VHS-REQ-338..339`; `VHS-REQ-344..346`; `docs/architecture/adr/ADR-0010-dual-host-extension-proof-and-linux-bootstrap.md` | sustain |

## Active Queue

Latest landed ship target:

- `SHIP-0001`: releasable `v0.2.0` VSIX product
- landed ship tranche: `TRANCHE-009`
- landed ship issue: `ISSUE-0406`
- release target: `v0.2.0`
- current package baseline: `0.2.0`
- preview install surface: `preview-evidence/vi-history-suite-<version>.vsix`
- target release artifact: `vi-history-suite-0.2.0.vsix`
- target release manifest: `release-evidence/release-manifest.json`
- retained release surface: GitLab release `v0.2.0`
- retained release pipeline: `2428809456`
- retained release job: `13779604462`
- docs-workbench image: `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`
- remaining blockers: none

Current active tranche:

- `TRANCHE-010`: Public facade release kit and host-machine acceptance
- active issue: [ISSUE-0407 Public Facade Release Kit And Host-Machine Acceptance](./issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md)
- active execution program: [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
  - current first slice:
  - ingest immutable `v0.2.0` release truth into the public facade repo
  - pin the canonical `ni/labview-icon-editor` acceptance fixture
  - land the public facade scaffold surfaces:
    - immutable release contract plus `release-evidence` staging README
    - scaffold validation script
    - primary public setup manifest plus Windows and Linux setup adapters
    - pinned `ni/labview-icon-editor` Git fixture bundle, manifest, and metadata
    - Windows 11 host-machine acceptance harness, human-gate closeout script, record template, and manual checklist
    - direct-release Windows smoke against the public setup manifest, exact VSIX, and pinned fixture bundle
  - exact retained `v0.2.0` release evidence is now staged in the public facade repo from GitLab release job `13779604462`
  - the GitHub workflow now publishes only the public release kit and deletes retired legacy installer assets when they are still present on the GitHub release
  - the latest successful public release-kit publication run is `23985908613` on public facade head `9ebee6c`, and that run refreshed the public setup checksum asset after the container smoke scaffold landed
  - Docker is no longer part of the default public setup path
  - a scaffolded container public-release-kit smoke recipe and workflow now exist at `docker/public-release-kit-smoke/` and `.github/workflows/container-public-release-kit-smoke.yml`
  - a local container public-release-kit smoke now passes against the live `v0.2.0` GitHub release assets
  - a future published container image remains the intended reproducible automation follow-on, replacing VM replay as the preferred direction
  - the authority repo now guards its local and CI VSIX packaging path with `npm run package:audit`, and that audit fails closed if runtime `node_modules` or transient/test artifacts such as `.cache` or `.vscode-test` would leak into the shipped surface
  - packaging-only npm tooling is now kept out of the default `npm ci` surface used by compile/test/benchmark lanes, and the guarded package path invokes its pinned package manager tooling only on demand
  - automated Windows 11 host-machine proof now succeeds through the direct-release setup lane with retained records at `C:\Users\sveld\AppData\Local\VI History Suite\acceptance\host-machine\setup\setup-record.json` and `C:\Users\sveld\AppData\Local\VI History Suite\acceptance\host-machine\acceptance-record.json`
  - Gate D remains open pending the manual right-click acceptance pass by Sergio Velderrain on the current Windows 11 host machine

Queued follow-on tranches:

- `TRANCHE-004`: Add progress-surface uplift for indexing and report generation
- `TRANCHE-011`: Repeatable Windows and Linux benchmark proof
  - queued issue: [ISSUE-0408 Repeatable Benchmark Proof](./issues/ISSUE-0408-repeatable-benchmark-proof.md)
  - queued execution program: [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)
  - benchmark truth is now explicitly separate from `PROGRAM-0002` acceptance truth
  - the authority repo mirrors its GitHub Linux benchmark lane into the private `vi-history-suite-source-experiments` repo with hosted runs defaulting to `HARNESS-VHS-001` / `Tooling/deployment/VIP_Pre-Install Custom Action.vi`, while the canonical Windows host retains ownership of the deep `HARNESS-VHS-002` / `resource/plugins/lv_icon.vi` benchmark and GitLab remains the authority source repo and release-control surface
  - the GitHub experiment lane publishes a dedicated headless Linux benchmark/source-experiment image so benchmark runs can reuse the derived container by digest
  - the separate Windows benchmark-image lane is now published in the authority repo for the deep `HARNESS-VHS-002` benchmark, with a pinned `nationalinstruments/labview:2026q1-windows` image contract, successful publication runs `23993316899`, `23993748337`, and `23994505706`, and a pullable `ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:main` image, while hosted Windows benchmark execution remains explicitly not-yet-governed
  - the authority repo now retains `scripts/runHostWindowsBenchmarkImageProof.js` as the governed canonical-host proof surface for that published image; it pulls the published GHCR image, pre-seeds the mounted harness cache from the governed local `ni-labview-icon-editor` clone when available, normalizes Git safe-directory handling for those mounted clones, defaults `HARNESS-VHS-002` to the retained `129`-commit comparable-prefix packet unless overridden, accepts a targeted `--engine <labview-cli|lvcompare>` override for diagnosis reruns without leaving the governed proof surface, labels Windows diagnosis progress as Windows rather than Linux, and writes launch/log/summary receipts under `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-proof`
  - `VHS-REQ-437..438` are implemented for the Windows benchmark-image lane: Windows `labview-cli` now retains the governed `-LabVIEWPath`, runs headless under `LV_RTE_HEADLESS=1`, hardens `LabVIEWCLI.ini` startup timeouts, and prelaunches headless LabVIEW before the benchmark CLI starts
  - `VHS-REQ-440..441` are now implemented for the Windows benchmark-image lane: a native Windows headless `labview-cli` pair that establishes a connection and retains `labview-cli-call-by-reference` now triggers one governed `LabVIEWCLI CloseLabVIEW -Headless` session reset with the selected `-LabVIEWPath` when available, then retries the same pair once before retaining terminal failure, and the bounded comparable-prefix packet plus benchmark failure summary now retain that terminal diagnostic reason explicitly instead of collapsing pair `129` into generic Windows failure
  - `VHS-REQ-442..444` are now implemented for Windows diagnosis reruns: the canonical-host Windows benchmark-image proof runner accepts a governed `--engine` override for targeted reruns while preserving the same proof-root contract, the shared dashboard-smoke progress surface now labels the active Windows lane truthfully instead of leaking Linux wording, and the governed harness report-smoke surface now accepts an exact selected/base hash pair plus `--runtime-timeout-ms` for bounded pair diagnosis reruns
  - host Linux benchmark evidence and private GitHub experiment evidence are governed to stay aligned on the same authority commit and published benchmark-image contract before any evidence comparison is treated as meaningful, while the GitHub-hosted default remains shallower than the host-owned deep benchmark
  - `VHS-REQ-409..412` are implemented for the Linux benchmark lane: bounded per-pair runtime timeout handling, machine-readable per-pair failure receipts, runtime heartbeat progress, and terminal partial-summary retention for failed or timed-out runs
  - `VHS-REQ-416..417` are implemented for the Linux benchmark lane: native Linux NI CLI diagnostic logs are retained under governed report storage, and reused working-report HTML is discarded as stale output when it does not reference the current staged revisions
  - `VHS-REQ-431..432` are now implemented for the Linux benchmark lane: Linux failures retain supplemental headless artifacts such as `LVStatus.txt` and current `labview_*_headless_*_cur.txt` files under governed report storage, classify retained recursive LEIF-load markers as `linux-headless-recursive-load`, and surface the terminal diagnostic reason in the benchmark summary and canonical VS Code benchmark-status panel
  - `VHS-REQ-439` is now implemented for the Linux benchmark lane: a native Linux `labview-cli` pair that retains `linux-headless-recursive-load` now triggers one governed `LabVIEWCLI CloseLabVIEW -Headless` session reset with the selected `-LabVIEWPath` when available, then retries the same pair once before retaining terminal failure
  - `VHS-REQ-433..434` are now implemented for benchmark-proof control: the repo retains `docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json` as the accepted cross-OS `129`-commit / `128`-pair timing packet, derived from the first invalid governed surface rather than Linux generated-report count alone, while the full Linux `139`-commit / `138`-pair window remains an explicit retained blocker rather than an implied benchmark target
  - the latest retained deep-host Linux `lv_icon.vi` benchmark still fails truthfully late at pair `135/138`; the retained summary is `completionState=failed`, `terminalPairFailureReason=command-exited-nonzero`, `terminalPairDiagnosticReason=linux-headless-recursive-load`, the pair-failure receipt plus native Linux CLI and headless temp-surface diagnostics are present, bounded fresh-container repros fail the same pair under both `LabVIEWCLI` and `LVCompare`, retrying the pair after timeout degrades into `-350000` connection failure rather than recovering benchmark comparability, and the accepted cross-OS comparable truth is now the retained `129`-commit / `128`-pair prefix packet with last comparable pair id `87792a7b6545`; the newly landed Linux recovery posture is one governed `CloseLabVIEW -Headless` session reset plus one retry before the next rerun retains terminal failure
  - the latest retained local Windows benchmark-image proof now reaches pair `129/134` before failing with `command-exited-nonzero`; the retained summary and bounded comparable-prefix packet now surface `terminalPairDiagnosticReason=labview-cli-call-by-reference`, the retained diagnostic log shows a successful LabVIEW connection followed by `Error 66 / Call By Reference`, and the older retained canonical-host Windows-container proof for the same pair shows the same connected-session `Error 66 / Call By Reference` seam, so the active Windows ceiling is treated as pair-specific benchmark truth rather than as an image-only startup defect
  - a fresh governed canonical-host Windows diagnosis rerun with `--engine lvcompare` does not extend the comparable window: the published-image proof at `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-proof-lvcompare` times out immediately on pair `1/129`, retains `completionState=failed`, `terminalPairFailureReason=command-timed-out`, and remains characterization-only, so `lvcompare` is not currently a viable Windows fallback around the pair-129 `labview-cli-call-by-reference` ceiling
  - a fresh exact-pair governed Windows `lvcompare` diagnosis rerun on the precise blocker boundary `6dd65df -> 3408654` also fails closed: the retained report-smoke proof at `C:\Users\sveld\AppData\Local\VI History Suite\windows-benchmark-image-pair129-lvcompare` reaches the targeted pair, retains `runtimeExecutionState=failed` with `runtimeFailureReason=command-timed-out`, observes both `LabVIEW.exe` and `LVCompare.exe` at process spawn, and then exits the bounded `120000ms` budget without a generated report, so `lvcompare` is not a viable exact-pair Windows fallback either
- `TRANCHE-012`: Post-release sustainment and release cadence
  - queued issue: [ISSUE-0409 Post-Release Sustainment And Release Cadence](./issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md)
  - queued execution program: [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
  - this tranche owns long-tail release cadence, benchmark refresh cadence, operator-surface upkeep, and post-release control-plane maintenance after benchmark proof lands

Current active and queued post-release programs:

- [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
- active issue: [ISSUE-0407 Public Facade Release Kit And Host-Machine Acceptance](./issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md)
- trust boundary:
  - private GitLab immutable release remains product truth
  - private GitLab source repo remains the authority repo and release-control surface
  - the private GitHub experiment mirror is a non-authoritative Linux benchmark lane only
  - public GitHub facade repo is the public release-kit/setup/support surface
  - public GitHub facade repo is not the private GitHub experiment mirror
  - the authority VSIX install surface is compile-and-audit guarded and does not permit shipped runtime `node_modules`
  - the public facade repo publishes release/setup/support material only; it
    does not publish private requirements or design-gate docs
  - the GitHub workflow is the active public release-kit publication surface
  - NSIS has been removed from the active public toolchain
  - Docker is not part of the default public setup path
  - the current Windows 11 host machine has already proven the automated installed-user flow
  - a scaffolded container public-release-kit smoke recipe and workflow now exist in the public repo, local smoke against the live public release now passes, and a future published container image remains the preferred reproducible automation follow-on
  - the setup adapters prepare Visual Studio Code and Git when needed, install the exact VSIX, and materialize the local `ni/labview-icon-editor` Git fixture workspace with commit history
  - Visual Studio Code CLI automates install/verify/open surfaces after setup
  - the manual right-click review pass remains the human UX gate, and Sergio Velderrain is the sole named maintainer gate owner for that host-machine click pass
  - the private extension now retains that human closeout through a deterministic in-IDE submission surface bound to the canonical host machine
  - the public acceptance surface now includes a dedicated host-machine human-gate closeout script with structured checklist retention in the acceptance record
  - public GitHub issues are supplemental field feedback, not gate-closing proof
- queued follow-on execution programs:
  - [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)
  - [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)

The active-queue source of truth is:

- [development-queue.json](./development-queue.json)
- [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
- [PROGRAM-0003: Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)
- [PROGRAM-0004: Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
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

The current wiki stop rule is the zero-gap coverage matrix, not a soft page
count threshold. The wiki remains finished only while every in-scope
requirements-and-standards source stays `complete` and `published` in
`docs/product/wiki-coverage-matrix.json` and the publication ledger keeps
`nextPage = null`.

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
  - Linux bootstrap via `sudo /usr/local/bin/vihs-bootstrap-vscode-linux-host install`
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
- public facade container smoke:
  - `artifacts/container-public-release-kit-smoke/public-release-kit-smoke.json`

## Commands

Primary local commands:

```bash
npm run design:gate
npm run design:gate:assert-complete
npm run harness:smoke
npm run harness:report:smoke
npm run harness:dashboard:smoke
npm run harness:decision:record
npm run benchmark:github:linux:canonical
npm run benchmark:github:linux:lv-icon
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
