# ADR-0024: Canonical Effective Runtime Override Validation

## Status

Accepted

## Context

`ADR-0022` established one shared runtime-override admission boundary for
`PROGRAM-0003`, but that decision still left one important ambiguity:
entrypoints do not always execute from raw CLI args alone.

Some benchmark and diagnosis entrypoints can synthesize the effective runtime
bundle from multiple sources:

- raw CLI arguments
- environment variables
- entrypoint-local defaults

That matters because canonical admission control is only trustworthy when it
validates the launch shape that will actually execute.

The Windows benchmark CLI previously proved the gap: env-derived explicit
runtime paths and entrypoint-synthesized default executable paths could
materialize an explicit Windows runtime bundle after the raw CLI surface had
already been validated. That weakened the canonical experiment contract and let
non-canonical retained evidence look like product behavior.

## Decision

Adopt canonical effective runtime-override validation for benchmark-proof and
exact-pair diagnosis entrypoints.

1. Canonical runtime-override admission shall validate the effective runtime bundle after CLI arguments, environment variables, and entrypoint-local defaults have been resolved.
2. Entry points shall not inject hidden explicit Windows runtime executable defaults into the effective launch bundle when the operator did not request an explicit override.
3. If any non-CLI source materializes explicit runtime paths, the resulting
   effective bundle shall still satisfy the same canonical engine, platform,
   bitness, basename, and path-existence rules as a raw CLI-provided bundle.
4. Any retained evidence produced only because raw-CLI validation was looser
   than effective-bundle validation shall be treated as contamination, not as
   governed product truth.

## Rationale

- The product should validate what it will actually run, not a narrower input
  surface that may be transformed later.
- Hidden explicit Windows defaults are especially dangerous because they look
  like discovery while actually hardcoding a specific host launch shape.
- Keeping this decision separate from `ADR-0022` prevents the broader
  PROGRAM-0003 admission boundary from hiding the more specific
  CLI/env/default synthesis rule.

## Consequences

### Positive

- canonical benchmark entrypoints now fail closed on the real effective launch
  bundle
- env-derived explicit Windows runtime paths cannot bypass admission control
- benchmark-proof evidence no longer depends on hidden default executable paths
- the documentation package can distinguish raw exact-pair argument rules from
  wider effective-bundle validation

### Negative

- operators using environment variables for targeted reruns now need to supply
  a canonical engine/platform shape explicitly
- benchmark CLIs can reject previously tolerated env/default combinations that
  were never truly canonical
- the control plane grows because effective-bundle validation is now its own
  documented contract

## Implementation Surface

- `src/cli/canonicalRuntimeOverrideValidation.ts`
- `src/cli/runGitHubWindowsDashboardBenchmark.ts`
- `src/cli/runGitHubLinuxDashboardBenchmark.ts`
- `tests/unit/canonicalRuntimeOverrideValidation.test.ts`
- `tests/unit/runGitHubWindowsDashboardBenchmarkCli.test.ts`
- `tests/unit/runGitHubLinuxDashboardBenchmarkCli.test.ts`
- `docs/product/current-state.md`
- `docs/product/execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md`
- `docs/product/issues/ISSUE-0408-repeatable-benchmark-proof.md`
- `docs/product/debt-ledger.json`
- `docs/product/debt-ledger.md`
- `docs/product/canonical-exact-pair-diagnosis.md`
- `docs/requirements/srs.md`
- `docs/requirements/rtm.csv`
- `docs/testing/test-plan.md`
