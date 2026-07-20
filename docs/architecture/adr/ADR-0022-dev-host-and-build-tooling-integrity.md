# ADR-0022: Dev-Host And Build Tooling Integrity

- Status: Accepted
- Date: 2026-07-20

> This ADR records the retained design for the dev-host and build-tooling
> integrity gate under system requirement VHS-SYS-REQ-013 (CI And Developer
> Environment). It is the second theme of the dev-only-mapping sweep (epic
> #2159). The requirements package holds the authoritative text; this is the
> design record.

## Context

The extension's build reference is produced by a two-part contract: the build
step runs `scripts/generateBuildInfo.js`, which writes `out/buildInfo.json` with
`extensionVersion` and `extensionCommit`, and the shipped runtime consumer
`src/tooling/buildInfo.ts` reads exactly those keys to compose the displayed
build ref (`<version>+<shortCommit>`).

Before this requirement the generator and its dev-host/build siblings were
unmapped `dev-only` surface, and nothing asserted that the generator's output
actually satisfies the consumer's contract. A regression that dropped a key,
emitted a version that disagreed with `package.json`, or wrote a malformed commit
would not fail any gate — the runtime consumer would silently fall back (to
`0.0.0` / `<unknown>`), degrading the build ref without a signal.

## Decision

Ship a **build-info contract integrity gate** (`scripts/checkBuildInfoIntegrity.js`,
`npm run build-info:check`) that **fails closed** when the generator's output
does not satisfy the consumer contract.

- A pure `validateBuildInfoRecord(record, { expectedVersion })` checks that the
  record is an object with a non-empty `extensionVersion` (matching the package
  version when provided) and an `extensionCommit` that is a 7–40 char hex sha or
  the `<unknown>` sentinel. Missing keys, invalid version/commit, version
  mismatch, and malformed commit are all problems.
- The gate runs the **real** `generateBuildInfo` with an in-memory write boundary
  (so it proves the shipped generator's output without touching disk) and
  validates the emitted record against `package.json`.

This also maps the build/dev-host tooling (generator, runtime consumer, dev-host
loop and CLI) from `dev-only` to requirement-mapped (VHS-REQ-683). Each of those
files already exceeds the coverage-risk threshold, so the reclassification does
not weaken any gate.

The self-hosted-host runner scripts that are excluded from unit coverage
(`bootstrapLinuxVsCodeHost.js` and the integration-host runners) are deliberately
**out of scope** here; they are coupled to the planned self-hosted
integration-coverage lane (the sweep's final theme), which carries its own
security posture and ADR.

## Consequences

- A build-info generator/consumer contract regression now fails `build-info:check`
  instead of silently degrading the runtime build ref.
- The gate drives the real generator, so it proves shipped behavior, while its
  validator stays pure and deterministically unit-tested.
- The build/dev-host tooling is now a mapped surface covered by the coverage-risk
  and traceability gates.

## Requirements recorded

VHS-SYS-REQ-013; VHS-REQ-683.
