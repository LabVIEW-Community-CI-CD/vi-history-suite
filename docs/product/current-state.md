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
8. [PROGRAM-0001: Next Product Layer](./execution-programs/PROGRAM-0001-next-product-layer.md)

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
8. [PROGRAM-0001: Next Product Layer](./execution-programs/PROGRAM-0001-next-product-layer.md)

## Committed Capability State

| Capability Surface | Status | Evidence | Governing Queue |
| --- | --- | --- | --- |
| Content-detected VI eligibility and menu gating | implemented | `package.json`; `src/domain/viMagicCore.ts`; `src/indexing/viEligibilityIndexer.ts`; `VHS-REQ-001..015` | sustain |
| Review-oriented history panel and actions | implemented with stateful retained-pair actions so first-use rows show `Generate compare`, retained rows show `Refresh compare`, and `Open compare` is enabled only when retained evidence exists | `src/ui/historyPanel.ts`; `src/commands/openViHistoryCommand.ts`; `src/reporting/comparisonReportAction.ts`; `src/extension.ts`; `VHS-REQ-016..040`; `VHS-REQ-328..329` | sustain |
| Canonical real-history harness smoke | implemented | `src/harness/harnessSmoke.ts`; `src/cli/runHarnessSmoke.ts`; `npm run harness:smoke`; `VHS-REQ-029..030` | sustain |
| Comparison-report preflight, planning, and packet storage | implemented | `src/reporting/comparisonReportPreflight.ts`; `src/reporting/comparisonReportPlan.ts`; `src/reporting/comparisonReportPacket.ts`; `VHS-REQ-127..145` | sustain |
| LabVIEW 2026 Q1 runtime detection and governed live report execution | implemented and active | `src/reporting/comparisonRuntimeLocator.ts`; `src/reporting/comparisonReportRuntimeExecution.ts`; `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.json`; `VHS-REQ-146..181`; `VHS-REQ-217..220`; `VHS-REQ-239..250` | sustain |
| Canonical comparison-report smoke lane | implemented with succeeded NI proof | `src/harness/harnessReportSmoke.ts`; `src/cli/runHarnessReportSmoke.ts`; `npm run harness:report:smoke`; `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.html`; `VHS-REQ-152..180`; `VHS-REQ-220` | sustain |
| Indexing and report progress uplift | partially implemented and active | `src/indexing/viEligibilityIndexer.ts`; `VHS-REQ-093`; `VHS-REQ-305..306`; research alignment marks this partial | `TRANCHE-004` |
| Windows 64-bit isolated container provider | implemented and active | `docs/architecture/adr/ADR-0006-windows64-container-isolation-for-extension-users.md`; `src/reporting/comparisonRuntimeLocator.ts`; `src/reporting/comparisonReportRuntimeExecution.ts`; `VHS-REQ-146`; `VHS-REQ-217..220` | sustain |
| Multi-report developer dashboard for one VI across at least three commits | implemented and active with canonical dashboard smoke, extension-host proof, whole-window metadata concentration, pair-evidence backfill for missing or stale adjacent pairs, progress-aware dashboard refresh stages, and bounded minutes-and-seconds estimates during pair preparation | `src/dashboard/comparisonReportArchive.ts`; `src/dashboard/niComparisonReportParser.ts`; `src/dashboard/multiReportDashboard.ts`; `src/dashboard/multiReportDashboardAction.ts`; `src/harness/harnessDashboardSmoke.ts`; `src/cli/runHarnessDashboardSmoke.ts`; `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.json`; `tests/integration/suite/extensionHost.test.ts`; `VHS-REQ-212..215`; `VHS-REQ-221..223`; `VHS-REQ-232`; `VHS-REQ-237..238`; `VHS-REQ-268`; `VHS-REQ-295..304`; `VHS-REQ-330..334` | `TRANCHE-006` |
| Review-scenario registry and human decision records | partially implemented and active | `src/scenarios/reviewScenarioRegistry.ts`; `src/scenarios/decisionRecord.ts`; `src/harness/harnessDecisionRecord.ts`; `src/cli/runHarnessDecisionRecord.ts`; `docs/product/review-scenarios.md`; `docs/product/decision-record-template.md`; `VHS-REQ-307..312` | `TRANCHE-007` |
| Runtime-doctor and dashboard-refresh developer experience | partially implemented and active | `src/reporting/comparisonRuntimeDoctor.ts`; `src/reporting/comparisonRuntimeLocator.ts`; `src/reporting/comparisonReportPacket.ts`; `src/reporting/comparisonReportAction.ts`; `src/dashboard/multiReportDashboardAction.ts`; `src/commands/openViHistoryCommand.ts`; `VHS-REQ-224..236`; `VHS-REQ-241`; `VHS-REQ-244..247`; `VHS-REQ-251..258` | `TRANCHE-008` |
| Ship-control system and SemVer release target | implemented and active with preview VSIX delivery plus first tagged release proof pending | `docs/product/SHIP-0001-releasable-vi-history-suite.md`; `docs/product/release-readiness-matrix.json`; `docs/product/blocker-ledger.json`; `docs/release-procedure.md`; `.gitlab-ci.yml`; `tests/unit/shipControlDocs.test.ts`; `VHS-REQ-313..323` | `TRANCHE-009` |

## Active Queue

Current active ship tranche:

- `TRANCHE-009`: Ship `vi-history-suite` as a releasable SemVer VSIX
- release target: `v0.2.0`
- current package baseline: `0.1.0`
- preview install surface: `preview-evidence/vi-history-suite-<version>.vsix`
- target release artifact: `vi-history-suite-0.2.0.vsix`
- target release manifest: `release-evidence/release-manifest.json`
- remaining blocker: first successful retained SemVer-tagged release evidence

Queued follow-on tranches:

- `TRANCHE-004`: Add progress-surface uplift for indexing and report generation
- `TRANCHE-007`: Introduce a review-scenario registry and human decision records
- `TRANCHE-008`: Introduce runtime-doctor and dashboard-refresh developer experience

The queue source of truth is:

- [development-queue.json](./development-queue.json)
- [PROGRAM-0001: Next Product Layer](./execution-programs/PROGRAM-0001-next-product-layer.md)
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
- concentrated review dashboard:
  - `<workspace-storage>/report-history/<repoId>/<fileId>/pairs/<pairId>/source-record.json`
  - `<workspace-storage>/dashboards/<repoId>/<fileId>/<windowId>/dashboard.json`
  - `<workspace-storage>/dashboards/<repoId>/<fileId>/<windowId>/dashboard.html`

## Commands

Primary local commands:

```bash
npm run design:gate
npm run harness:smoke
npm run harness:report:smoke
npm run harness:dashboard:smoke
npm run harness:decision:record
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
- [Software Requirements Specification](../requirements/srs.md)
- [Traceability Matrix](../requirements/rtm.csv)
- [Test Plan](../testing/test-plan.md)
