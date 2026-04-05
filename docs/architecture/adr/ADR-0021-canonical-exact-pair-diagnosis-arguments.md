# ADR-0021: Canonical Exact-Pair Diagnosis Arguments

## Status

Accepted

## Context

`PROGRAM-0003` now depends on targeted exact-pair diagnosis reruns to explain
the first invalid governed benchmark surfaces.

Those reruns have become sensitive to operator-supplied runtime arguments:

- Windows exact-pair proof can be affected by multiple installed LabVIEW
  versions
- native Windows proof can be affected by non-default VI Server TCP ports
- explicit runtime overrides can accidentally mix engines, executable paths,
  and bitness
- partial selected/base hashes can target the right selected revision while
  still weakening the retained proof contract for the exact pair under
  judgment

Without a canonical argument contract, future experiments can contaminate the
retained evidence surface with ambiguous launch conditions that look like
product behavior rather than operator error.

## Decision

Adopt canonical fail-closed argument validation for exact-pair
`runHarnessReportSmoke` diagnosis.

1. Targeted diagnosis shall require a full selected/base pair:
   - `--selected-hash`
   - `--base-hash`
   - both must be full 40-character git hashes
2. Explicit runtime override paths shall require matching authority selectors:
   - `--platform`
   - `--engine`
3. Engine-specific path bundles shall remain coherent:
   - `--engine labview-cli` does not allow `--lvcompare-path`
   - `--engine lvcompare` does not allow `--labview-cli-path`
   - partial path bundles are rejected
4. Windows bitness overrides shall not contradict explicit runtime paths:
   - `Program Files (x86)` implies `x86`
   - `Program Files` implies `x64`
5. Explicit executable paths shall be validated against their governed
   executable basenames before the harness runs.
6. The documentation package shall keep a dedicated operator-facing canonical
   diagnosis reference so future sessions do not have to reconstruct the valid
   bundles from tests or source alone.

## Consequences

### Positive

- future exact-pair reruns fail closed before ambiguous runtime launches start
- retained benchmark blocker evidence becomes more trustworthy
- pair-specific experiments become easier to compare across sessions because
  the launch contract is explicit
- the documentation package now has an operator-facing place to explain the
  canonical bundles separately from current-state or issue chronology

### Negative

- ad hoc diagnosis commands become stricter and less forgiving
- operators must provide a complete canonical bundle when they want explicit
  runtime overrides
- existing habits that relied on partial overrides must be updated

## Implementation Surface

- `src/cli/runHarnessReportSmoke.ts`
- `tests/unit/runHarnessReportSmokeCli.test.ts`
- `docs/product/harnesses.md`
- `docs/product/current-state.md`
- `docs/product/canonical-exact-pair-diagnosis.md`
- `docs/product/execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md`
- `docs/product/issues/ISSUE-0408-repeatable-benchmark-proof.md`
- `docs/requirements/srs.md`
- `docs/requirements/rtm.csv`
- `docs/testing/test-plan.md`
