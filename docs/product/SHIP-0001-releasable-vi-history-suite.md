# SHIP-0001: Releasable VI History Suite

## Purpose

Install one authoritative ship target for `vi-history-suite` so future work is
driven by release criteria instead of open-ended tranche iteration.

## Release Target

- Target release: `v0.2.0`
- Current package baseline: `0.1.0`
- Primary release artifact: versioned VSIX package
- Distribution baseline: shareable GitLab release artifact for exact-version
  installation
- Pre-release install surface: `main` pipeline preview VSIX artifact
- Target VSIX artifact: `vi-history-suite-0.2.0.vsix`
- Target release manifest: `release-evidence/release-manifest.json`

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
- repo-native control-plane docs agree on what is blocked, what is done, and
  what the single active tranche is

## Out Of Scope

- ungoverned feature work not mapped to a ship criterion
- Marketplace publication before the versioned VSIX release path is stable
- new dashboard/research expansion that does not remove a ship blocker

## Stop Rule

No work is in scope unless it moves one release-readiness criterion toward
`done`, reduces one active blocker, or sustains an already-shipped criterion.

## Active Ship Tranche

- `TRANCHE-009`
- issue: [ISSUE-0406 Ship Control And SemVer Releaseability](./issues/ISSUE-0406-ship-control-and-semver-releaseability.md)
- targeted blocker ids: `BL-001`, `BL-003`

## Control Plane

These files are now the authoritative direction surfaces for ship work:

1. [release-readiness-matrix.json](./release-readiness-matrix.json)
2. [blocker-ledger.json](./blocker-ledger.json)
3. [development-queue.json](./development-queue.json)
4. [current-state.md](./current-state.md)
5. [release-procedure.md](../release-procedure.md)
6. [documentation-workbench.md](../documentation-workbench.md)
7. [documentation-coherence-ledger.md](./documentation-coherence-ledger.md)
8. [wiki-seed-plan.md](./wiki-seed-plan.md)

## Queue Rule

`development-queue.json` shall have exactly one `active` tranche at a time.
Everything else is `queued`, `done`, or sustain work described outside the
active implementation lane.

## Evidence Rule

The ship-control surfaces shall agree on these identities without relying on
chat history:

- active tranche id
- active ship issue id
- current package version
- target release version
- target VSIX artifact name
- open blocker ids and the readiness criteria they block
