# SHIP-0001: Releasable VI History Suite

## Purpose

Install one authoritative ship target for `vi-history-suite` so future work is
driven by release criteria instead of open-ended tranche iteration.

## Status

Closed and landed for the first immutable SemVer release:

- retained release: `v0.2.0`
- retained pipeline: `2428809456`
- retained release job: `13779604462`
- current repo-active tranche: `TRANCHE-016`
- current repo-active issue: [ISSUE-0412 Installed Local LabVIEWCLI Selection And Explicit Compare](./issues/ISSUE-0412-installed-local-labviewcli-selection-and-explicit-compare.md)
- current repo-active execution program: [PROGRAM-0005 Extension Execution Flexibility And Runtime Acquisition UX](./execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md)
- historical public-closeout tranche: `TRANCHE-010`
- historical public-closeout issue: [ISSUE-0407 Public Facade Release Kit And Host-Machine Acceptance](./issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md)
- historical public-closeout execution program: [PROGRAM-0002 Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
- runtime-provider public-acceptance gate record:
  [runtime-provider-public-acceptance-gate.md](./runtime-provider-public-acceptance-gate.md)
- current driver-seat post-release tranche: `TRANCHE-012`
- current driver-seat post-release issue: [ISSUE-0409 Post-Release Sustainment And Release Cadence](./issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md)
- current driver-seat post-release execution program: [PROGRAM-0004 Post-Release Sustainment And Release Cadence](./execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md)
- current governed post-release lanes:
  - historical `TRANCHE-010` / [ISSUE-0407 Public Facade Release Kit And Host-Machine Acceptance](./issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md) / [PROGRAM-0002 Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)
  - closed runtime-provider public-acceptance gate record:
    [runtime-provider-public-acceptance-gate.md](./runtime-provider-public-acceptance-gate.md)
  - closed `TRANCHE-011` / [ISSUE-0408 Repeatable Benchmark Proof](./issues/ISSUE-0408-repeatable-benchmark-proof.md) / [PROGRAM-0003 Repeatable Benchmark Proof](./execution-programs/PROGRAM-0003-repeatable-benchmark-proof.md)

## Release Target

- Target release: `v0.2.0`
- Current package baseline: `0.2.0`
- Primary release artifact: versioned VSIX package
- Distribution baseline: shareable GitLab release artifact for exact-version
  installation
- Pre-release install surface: `main` pipeline preview VSIX artifact
- Target VSIX artifact: `vi-history-suite-0.2.0.vsix`
- Target release manifest: `release-evidence/release-manifest.json`
- Retained release evidence: GitLab release `v0.2.0`, pipeline `2428809456`,
  release job `13779604462`

## Product Promise

Ship `vi-history-suite` as a releasable Visual Studio Code extension that a
user can install at a specific semantic version and use to:

- right-click an eligible LabVIEW VI in a trusted Git repository
- review commit history for that VI
- generate reliable NI comparison reports
- review a metadata-concentrated dashboard across at least three commits
- retain a separate human decision record without mutating machine evidence

## Ship Pillars

1. installable extension surface
2. reliable comparison-report execution
3. dashboard-first expert review surface
4. runtime-doctor, progress, cancellation, and trust-aware UX
5. review-scenario and decision-record flow
6. semantic-versioned VSIX release and retained release evidence

## Definition Of Done

`SHIP-0001` is complete only when all of these are true:

- `package.json` and release artifacts name a governed target version
- CI can build a versioned `.vsix` artifact for a SemVer tag
- the release evidence retains version, commit, VSIX artifact identity, and a
  machine-readable release manifest
- a user can install the exact versioned VSIX and invoke `VI History`
- reliable NI comparison-report execution remains proven
- the dashboard remains the default multi-commit review surface
- a separate human decision record can be created from retained dashboard
  evidence
- the repo publishes and documents a docs-authoring workbench for governed
  requirements/documentation-package iteration and future wiki preparation
- repo-native control-plane docs agree on what was blocked, what is done, and
  which tranche landed the release target

## Release-Gate DoD Evidence

DoD Gate / dod

Decision: the release-gate DoD signal is repo-owned evidence, not an
intentional `N/A`. The standards release-gate scorecard may report DoD as
present when this retained ship target and the machine-readable
`release-readiness-matrix.json` both keep the DoD gate explicit.

The DoD gate is satisfied when:

- every `SHIP-0001` readiness criterion in `release-readiness-matrix.json` is
  `done`;
- no readiness criterion keeps an open blocker;
- the retained ship target records the landed release, pipeline, release job,
  release manifest, and VSIX artifact identity;
- release-control docs keep the mutation boundary explicit for later preview,
  exact release, publication, and protected-branch work.

Standards anchor: ISO/IEC/IEEE 29119-2 completion criteria,
ISO/IEC/IEEE 15289 lifecycle information items, and ISO 10007 release/status
accounting.

## Out Of Scope

- ungoverned feature work not mapped to a ship criterion
- Marketplace publication before the versioned VSIX release path is stable
- new dashboard/research expansion that does not remove a ship blocker

## Stop Rule

No work is in scope unless it moves one release-readiness criterion toward
`done`, reduces one active blocker, or sustains an already-shipped criterion.

## Landed Ship Tranche

- `TRANCHE-009`
- issue: [ISSUE-0406 Ship Control And SemVer Releaseability](./issues/ISSUE-0406-ship-control-and-semver-releaseability.md)
- targeted blocker ids: `none`

This closed ship record is retained as historical release evidence. Current
repo-active work may advance under a separate post-release tranche without
rewriting this ship target.

## Control Plane

These files are the authoritative retained ship-record surfaces:

1. [release-readiness-matrix.json](./release-readiness-matrix.json)
2. [blocker-ledger.json](./blocker-ledger.json)
3. [development-queue.json](./development-queue.json)
4. [current-state.md](./current-state.md)
5. [post-release-sustainment-rules.md](./post-release-sustainment-rules.md)
6. [post-release-sustainment-rules.json](./post-release-sustainment-rules.json)
7. [release-procedure.md](../release-procedure.md)
8. [documentation-workbench.md](../documentation-workbench.md)
9. [documentation-coherence-ledger.md](./documentation-coherence-ledger.md)
10. [wiki-seed-plan.md](./wiki-seed-plan.md)
11. [wiki-publication-ledger.md](./wiki-publication-ledger.md)
12. [wiki-publication-ledger.json](./wiki-publication-ledger.json)

## Queue Rule

While a ship target is still open, `development-queue.json` shall have exactly
one `active` tranche and that tranche must match the active ship record. After
ship closure, the queue may retain the human-gated public-closeout tranche as
the repo-active surface while also promoting one separate driver-seat
post-release tranche for deterministic implementation work. Everything else
remains `queued`, `done`, or sustain work described outside those explicit
active lanes.

## Evidence Rule

The landed ship-control surfaces shall agree on these identities without
relying on chat history:

- landed tranche id
- landed ship issue id
- current package version
- target release version
- target VSIX artifact name
- open blocker ids and the readiness criteria they block
