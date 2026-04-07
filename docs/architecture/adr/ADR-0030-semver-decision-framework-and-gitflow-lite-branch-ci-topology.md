# ADR-0030: SemVer Decision Framework And Gitflow-Lite Branch/CI Topology

## Status

Accepted

## Context

`v1.0.5` closed the exact public release line cleanly, but the next release
line still needed stronger governance in three places:

- future sessions needed an explicit way to choose `major`, `minor`, or
  `patch` instead of relying on chat-memory judgment
- `develop` had to stop drifting away from the exact released `main` line after
  a release cut
- CI and `design:gate` responsibility had to be placed deliberately across the
  branch lanes that future release work will actually use

The repo already proved that two long-lived branches alone are not enough when
the control plane does not say which temporary lanes are allowed, how they
promote, and what checks they owe before merge or tag.

## Decision

Adopt this next-line governance model:

- keep `main` as the exact release branch
- keep `develop` as the integration branch
- keep the public GitHub default branch on `main` so casual readers and fork
  owners land on the latest exact released line by default
- add governed temporary lanes:
  - `feature/*`
  - `release/*`
  - `hotfix/*`
- back-merge exact released `main` into `develop` before opening the next
  candidate line

Adopt this SemVer decision framework:

- choose `major` for intentional breaking contract changes
- choose `minor` for additive governed capability changes
- choose `patch` for fixes, hardening, governance, documentation-package, or
  CI/branch-policy corrections that preserve the current exact released
  contract
- record the bump rationale in the control plane before further publication or
  release normalization continues

Adopt this lane-specific gate posture:

- `feature/*`
  - focused tests
  - affected docs/design gates before merge to `develop`
- `develop`
  - required checks
  - `npm run design:gate`
  - `npm run design:gate:assert-complete` for governance or architecture work
- `release/*`
  - required checks
  - design gates
  - release-readiness normalization
  - public-facade proof before merge to `main`
- `hotfix/*`
  - focused regression checks
  - affected docs/design gates
  - exact-line package audit before merge to `main`
- `main`
  - protected exact-release branch
  - exact SemVer tags only after merged `main` is green

## Consequences

Positive:

- future sessions have governed criteria for the next bump instead of guessing
- exact release truth is merged back into `develop` before new candidate work
  starts
- branch topology and CI responsibility now reinforce each other

Costs:

- the control plane is more explicit and must be maintained deliberately
- future slices must keep the branch/CI matrix and SemVer-decision rules in
  sync with the live release procedure

## Follow-On

- keep the SemVer-decision framework in sustainment rules, release procedure,
  README, current-state, SRS, RTM, and test plan
- keep branch-lane CI and `design:gate` obligations explicit on the next
  release line
- realign public `develop` to the exact released `main` baseline before the
  next public candidate is promoted
