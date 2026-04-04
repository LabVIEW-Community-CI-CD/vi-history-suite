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
13. [Documentation Package Workbench](../documentation-workbench.md)
14. [program-repo-jump.md](./program-repo-jump.md)
15. [PROGRAM-0001: Next Product Layer](./execution-programs/PROGRAM-0001-next-product-layer.md)
16. [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)

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
13. [Documentation Package Workbench](../documentation-workbench.md)
14. [program-repo-jump.md](./program-repo-jump.md)
15. [PROGRAM-0001: Next Product Layer](./execution-programs/PROGRAM-0001-next-product-layer.md)
16. [Fast VS Code Loop](../dev-fast-loop.md)
17. [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)

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
| Deterministic host-machine human review submission | implemented and active with an in-IDE history-panel submission surface, stable `latest-human-review-submission.json` retention, extension-global canonical host-machine fingerprint registration, fail-closed mismatch handling, and local `review:latest` evidence consumption for future sessions | `src/ui/historyPanel.ts`; `src/commands/openViHistoryCommand.ts`; `src/review/humanReviewSubmission.ts`; `src/review/humanReviewSubmissionAction.ts`; `scripts/printLatestHumanReviewSubmission.js`; `tests/unit/humanReviewSubmission.test.ts`; `tests/unit/openViHistoryCommand.test.ts`; `VHS-REQ-392..395` | `TRANCHE-010` |
| GitHub Linux benchmark experiment lane | implemented in the authority repo and ready to mirror into a planned private GitHub experiment repo as a non-authoritative `lv_icon.vi` benchmark surface with a canonical high-history harness, a stable benchmark CLI, a pinned NI Linux image, and a derived benchmark container recipe for GitHub-hosted runs | `src/harness/canonicalHarnesses.ts`; `src/cli/runGitHubLinuxDashboardBenchmark.ts`; `.github/workflows/linux-runtime-benchmark-experiment.yml`; `docker/github-linux-dashboard-benchmark/Dockerfile`; `docker/github-linux-dashboard-benchmark/run-benchmark.sh`; `tests/unit/runGitHubLinuxDashboardBenchmarkCli.test.ts`; `tests/unit/githubLinuxBenchmarkWorkflow.test.ts`; `VHS-REQ-397..401` | sustain |
| Review-scenario registry and human decision records | implemented and active with extension-facing decision-record creation from the history panel, scenario matching by repository remote URL plus VI path, separate Markdown/JSON artifact persistence, persisted reviewer-name defaults across decision-record runs, cancellation honored after dashboard build and before retained Markdown open with already-built artifact paths preserved, and real extension-host proof | `src/scenarios/reviewScenarioRegistry.ts`; `src/scenarios/decisionRecord.ts`; `src/scenarios/reviewDecisionRecordAction.ts`; `src/harness/harnessDecisionRecord.ts`; `src/commands/openViHistoryCommand.ts`; `tests/integration/suite/extensionHost.test.ts`; `docs/product/review-scenarios.md`; `docs/product/decision-record-template.md`; `VHS-REQ-307..312`; `VHS-REQ-341..355`; `VHS-REQ-385` | `TRANCHE-007` |
| Runtime-doctor and dashboard-refresh developer experience | implemented and active with history-panel command routing that now fails closed with explicit build-capability guidance when stale panel commands target unsupported optional surfaces, with stale bundled-doc page requests falling back to the packaged overview page when the installed bundle is still available, with `Diff prev` for content-detected VIs refusing text-diff fallback when comparison-report routing is unavailable in the current build, with dashboard pair-preparation progress now distinguishing refreshed generated, blocked, failed, no-generated-report, and missing-retained-archive outcomes, and with compare opening both falling back to the retained packet when retained generated-report HTML is unreadable, rendering retained archive availability/failure facts in the live panel status block, and failing closed with explicit `Refresh compare` guidance when the retained archive source record is malformed, mismatched, render-contract-invalid, or no longer points at a usable retained packet | `src/reporting/comparisonRuntimeDoctor.ts`; `src/reporting/comparisonRuntimeLocator.ts`; `src/reporting/comparisonReportPacket.ts`; `src/reporting/comparisonReportAction.ts`; `src/dashboard/multiReportDashboardAction.ts`; `src/commands/openViHistoryCommand.ts`; `tests/integration/suite/extensionHost.test.ts`; `VHS-REQ-224..236`; `VHS-REQ-241`; `VHS-REQ-244..247`; `VHS-REQ-251..258`; `VHS-REQ-377..382`; `VHS-REQ-386` | sustain |
| Ship-control system and SemVer release target | implemented and active with retained immutable `v0.2.0` release evidence through GitLab release `v0.2.0`, tag pipeline `2428809456`, kept release job `13779604462`, and a governed wiki-authority map that constrains future wiki generation to repo docs instead of source or chat memory | `docs/product/SHIP-0001-releasable-vi-history-suite.md`; `docs/product/release-readiness-matrix.json`; `docs/product/blocker-ledger.json`; `docs/product/wiki-authority-map.md`; `docs/release-procedure.md`; `.gitlab-ci.yml`; `tests/unit/shipControlDocs.test.ts`; `VHS-REQ-313..323` | `TRANCHE-009` |
| Documentation-package workbench image and docs gate | implemented and active with a repo-published docs-authoring image, local workbench commands, a repo-native docs gate, automated SRS/RTM/test-plan coherence checks, automated active post-release tranche/issue/program coherence checks plus open Gate C-D truth checks, research-control-plane regression checks for the live history-window/dashboard surfaces, a retained documentation coherence ledger, a wiki seed plan, Markdown and JSON wiki publication ledgers, a generated packaged docs bundle, and a retained publish-manifest lane for future documentation and wiki iteration | `docker/docs-authoring/Dockerfile`; `docker/docs-authoring/entrypoint.sh`; `scripts/run-docs-gate.js`; `scripts/syncBundledDocs.js`; `docs/documentation-workbench.md`; `docs/product/documentation-coherence-ledger.md`; `docs/product/wiki-seed-plan.md`; `docs/product/wiki-publication-ledger.md`; `docs/product/wiki-publication-ledger.json`; `resources/bundled-docs/manifest.json`; `.gitlab-ci.yml`; `tests/unit/docsWorkbenchDocs.test.ts`; `tests/unit/requirementsDocs.test.ts`; `tests/unit/postReleaseControlPlaneDocs.test.ts`; `VHS-REQ-350..360`; `VHS-REQ-367..370`; `VHS-REQ-391` | `TRANCHE-009` |
| Bundled version-matched user documentation | implemented and active with a machine-readable wiki publication ledger, generated packaged HTML fragments under `resources/bundled-docs/`, a command-palette documentation command, and a local documentation panel that keeps users inside VS Code instead of requiring repo access | `docs/product/wiki-publication-ledger.json`; `scripts/syncBundledDocs.js`; `resources/bundled-docs/manifest.json`; `src/docs/bundledDocumentation.ts`; `src/docs/bundledDocumentationAction.ts`; `src/extension.ts`; `tests/unit/bundledDocumentation.test.ts`; `tests/integration/suite/extensionHost.test.ts`; `VHS-REQ-367..370` | sustain |
| Cross-repo navigation control plane | implemented and active with a governed repo-constellation map, a local repo-jump CLI, and mirrored skill-side resolver entrypoints for `vi-history-suite`, the planned `vi-history-suite-source-experiments` mirror, `vi-history-suite.wiki`, and `repo-standards-review` | `docs/product/program-repo-jump-map.json`; `docs/product/program-repo-jump.md`; `src/tooling/programRepoJump.ts`; `src/cli/runProgramRepoJump.ts`; `tests/unit/runProgramRepoJumpCli.test.ts`; `VHS-REQ-364..366`; `VHS-REQ-401` | `TRANCHE-009` |
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
  - the authority repo now retains a ready-to-mirror GitHub Linux benchmark lane for `HARNESS-VHS-002` / `resource/plugins/lv_icon.vi`, while GitLab remains the authority source repo and release-control surface
  - no private GitHub experiment mirror exists yet; creating it remains gated on a green design gate for the four-surface authority model
  - automated Windows 11 host-machine proof now succeeds through the direct-release setup lane with retained records at `C:\Users\sveld\AppData\Local\VI History Suite\acceptance\host-machine\setup\setup-record.json` and `C:\Users\sveld\AppData\Local\VI History Suite\acceptance\host-machine\acceptance-record.json`
  - Gate D remains open pending the manual right-click acceptance pass by Sergio Velderrain on the current Windows 11 host machine

Queued follow-on tranches:

- `TRANCHE-004`: Add progress-surface uplift for indexing and report generation

Current active post-release program:

- [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
- active issue: [ISSUE-0407 Public Facade Release Kit And Host-Machine Acceptance](./issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md)
- trust boundary:
  - private GitLab immutable release remains product truth
  - private GitLab source repo remains the authority repo and release-control surface
  - a future private GitHub experiment mirror is a non-authoritative Linux benchmark lane only
  - public GitHub facade repo is the public release-kit/setup/support surface
  - public GitHub facade repo is not the private GitHub experiment mirror
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
  - GitHub Linux benchmark results for `HARNESS-VHS-002` / `resource/plugins/lv_icon.vi` are retained benchmark evidence, not product truth or release truth
  - public GitHub issues are supplemental field feedback, not gate-closing proof

The active-queue source of truth is:

- [development-queue.json](./development-queue.json)
- [PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
- [wiki-authority-map.md](./wiki-authority-map.md)
- [documentation-coherence-ledger.md](./documentation-coherence-ledger.md)
- [wiki-seed-plan.md](./wiki-seed-plan.md)
- [wiki-publication-ledger.md](./wiki-publication-ledger.md)
- [wiki-publication-ledger.json](./wiki-publication-ledger.json)
- [release-procedure.md](../release-procedure.md)
- [Documentation Package Workbench](../documentation-workbench.md)
- [program-repo-jump.md](./program-repo-jump.md)

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
  - `docs-workbench-evidence/docs-workbench-manifest.json`
  - local gate via `npm run docs:gate`
  - local bundle refresh via `npm run docs:bundle`
  - local workbench image via `npm run docs:workbench:build`
  - local container gate via `npm run docs:workbench:gate`
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
  - local consumer scripts: `npm run dashboard:latest` and `npm run review:latest`
- GitHub Linux benchmark experiment lane:
  - `.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-002/latest-summary.json`
  - `.cache/harness-reports/HARNESS-VHS-002/dashboard-smoke.json`
  - `.cache/harness-reports/HARNESS-VHS-002/dashboard-smoke.md`
  - `.cache/harness-reports/HARNESS-VHS-002/dashboard-smoke.html`
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
- [Software Requirements Specification](../requirements/srs.md)
- [Traceability Matrix](../requirements/rtm.csv)
- [Test Plan](../testing/test-plan.md)
