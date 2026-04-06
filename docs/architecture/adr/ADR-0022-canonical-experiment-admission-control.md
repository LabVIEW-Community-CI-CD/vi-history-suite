# ADR-0022: Canonical Experiment Admission Control For PROGRAM-0003

## Status

Accepted

## Context

`PROGRAM-0003` no longer depends on one diagnosis surface only.

The benchmark-proof control plane now exposes one public proof entrypoint,
`runGovernedProof`, while several governed proof subcommands and internal
handlers can still influence retained evidence:

- `report-smoke`
- `dashboard-smoke`
- `decision-record`
- `benchmark-windows`
- `benchmark-linux`

`ADR-0021` already tightened exact-pair argument rules, but sibling
subcommands and internal handlers could still accept contradictory runtime
override bundles even though they feed the same retained benchmark and
diagnosis surfaces.

Separately, the canonical Windows host has proven that stale non-headless
LabVIEW processes, preexisting governed VI Server listeners, multiple installed
LabVIEW versions, and nonexistent explicit runtime paths can all contaminate a
future rerun while still looking like product behavior.

Without a shared admission-control boundary, the retained proof surface changes
depending on which governed proof subcommand or internal handler happened to
run rather than on one governed experiment contract.

## Decision

Adopt canonical experiment admission control for `PROGRAM-0003`.

1. The one public governed-proof surface and every internal handler behind its
   `PROGRAM-0003` subcommands that accepts runtime override arguments shall
   share one canonical validation contract before execution starts.
2. Shared runtime override validation shall reject contradictory bundles:
   - explicit override paths require matching platform and engine selectors
   - engine-specific path sets must remain complete and non-conflicting
   - Windows bitness overrides must not contradict explicit runtime paths
   - explicit Windows runtime paths must not mix x86 and x64 surfaces even
     when `--bitness` is omitted
   - explicit Windows executable paths must match governed executable basenames
3. Exact-pair selected/base hash validation remains a local rule of
   `runGovernedProof report-smoke` and stays governed by `ADR-0021`.
4. On the canonical Windows host, explicit runtime override paths shall exist
   before a targeted rerun starts.
5. Canonical Windows host-native comparison execution shall still fail closed
   when runtime preflight detects:
   - already-running `LabVIEW.exe`, `LabVIEWCLI.exe`, or `LVCompare.exe`
   - a preexisting listener on the selected `LabVIEW.ini`-derived VI Server
     port
6. Invalid argument bundles or contaminated host-runtime surfaces shall be
   treated as experiment contamination, not as retained product behavior.
7. The documentation package shall explain both layers explicitly:
   - exact-pair operator guidance
   - shared PROGRAM-0003 admission control

## Consequences

### Positive

- retained benchmark evidence is less likely to be poisoned by whichever CLI
  happened to launch it
- future sessions can reason about one PROGRAM-0003 admission contract instead
  of reconstructing per-subcommand quirks
- canonical Windows host reruns fail earlier and more truthfully when the host
  itself is the problem
- the control plane now distinguishes exact-pair argument rules from wider
  experiment admission control

### Negative

- more governed proof subcommands now reject ambiguous manual overrides that
  used to be tolerated
- mixed x86/x64 explicit Windows bundles are now classified as experiment
  contamination instead of being allowed to retain misleading blocker evidence
- operators must keep explicit runtime overrides coherent across more surfaces
- documentation upkeep expands because the admission-control boundary is now a
  first-class product contract

## Implementation Surface

- `src/cli/canonicalRuntimeOverrideValidation.ts`
- `src/cli/runGovernedProof.ts`
- `src/cli/runHarnessReportSmoke.ts`
- `src/cli/runHarnessDashboardSmoke.ts`
- `src/cli/runHarnessDecisionRecord.ts`
- `src/cli/runGitHubWindowsDashboardBenchmark.ts`
- `src/cli/runGitHubLinuxDashboardBenchmark.ts`
- `src/reporting/comparisonReportRuntimeExecution.ts`
- `tests/unit/runHarnessReportSmokeCli.test.ts`
- `tests/unit/runHarnessDashboardSmokeCli.test.ts`
- `tests/unit/runHarnessDecisionRecordCli.test.ts`
- `tests/unit/runGitHubWindowsDashboardBenchmarkCli.test.ts`
- `tests/unit/runGitHubLinuxDashboardBenchmarkCli.test.ts`
- `tests/unit/comparisonReportRuntimeExecution.test.ts`
- `docs/product/current-state.md`
- `docs/product/canonical-exact-pair-diagnosis.md`
- `docs/product/harnesses.md`
- `docs/product/execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md`
- `docs/product/issues/ISSUE-0408-repeatable-benchmark-proof.md`
- `docs/requirements/srs.md`
- `docs/requirements/rtm.csv`
- `docs/testing/test-plan.md`
