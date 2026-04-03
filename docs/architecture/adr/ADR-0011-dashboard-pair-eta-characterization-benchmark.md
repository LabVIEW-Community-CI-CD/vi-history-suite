# ADR-0011: Dashboard Pair ETA Characterization Benchmark

## Status

Accepted

## Context

`vi-history-suite` now shows a bounded minutes-and-seconds ETA while the review
dashboard backfills missing adjacent-pair comparison evidence. That improves
user experience, but it also creates a new risk: future sessions could tune the
estimator by intuition instead of by retained evidence.

The repo therefore needs a governed characterization surface that proves how
accurate the dashboard ETA actually was:

- per prepared pair, not only for the whole dashboard
- from the current dashboard refresh session, not from previously retained
  historical pairs
- in retained smoke/benchmark artifacts, not only in transient UI text

## Decision

The repo will characterize dashboard ETA accuracy as follows:

1. The live dashboard ETA remains a current-session estimate derived only from
   completed pair-preparation durations in the active refresh.
2. Canonical dashboard smoke shall retain pair-level actual preparation
   duration, estimated preparation duration when available, and pair-level ETA
   error facts.
3. Canonical dashboard smoke shall also retain a summary accuracy record under
   the dashboard artifact directory as `dashboard-pair-eta-accuracy.json`.
4. Smoke CLI and rendered smoke artifacts shall surface concise accuracy
   summary facts so operators can see estimator quality without opening raw
   JSON first.
5. The retained ETA characterization is diagnostic and benchmark evidence, not
   a release gate by itself, until enough retained runs exist to justify a
   governed threshold.

## Consequences

Positive:

- ETA tuning can now be based on retained benchmark evidence instead of visual
  impression alone
- future sessions can see whether the estimator is improving or regressing
  without recreating the exact interactive run
- pair-level accuracy facts remain aligned with what the dashboard actually
  estimates

Tradeoffs:

- smoke artifacts now carry more retained timing detail
- the current characterization is descriptive, not yet a calibrated pass/fail
  gate
- prepared pairs that had no prior sample remain explicitly unmeasured rather
  than force-fit into a misleading score

## Evidence

- `src/dashboard/dashboardEtaAccuracy.ts`
- `src/dashboard/multiReportDashboardAction.ts`
- `src/harness/harnessDashboardSmoke.ts`
- `src/cli/runHarnessDashboardSmoke.ts`
- `tests/unit/dashboardEtaAccuracy.test.ts`
- `tests/unit/harnessDashboardSmoke.test.ts`
- `tests/unit/runHarnessDashboardSmokeCli.test.ts`
