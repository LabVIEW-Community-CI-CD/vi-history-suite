# ADR-0030: SemVer Decision Framework And GitFlow Branch/CI Topology

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

- keep `main` as the protected exact-release line and public default branch
- keep `develop` as the integration branch
- add governed temporary lanes:
  - `feature/*`
  - `release/*`
  - `hotfix/*`
- require `feature/*` branches to be cut from `develop` and merged back into
  `develop`
- require `release/*` branches to be cut from `develop`, merged into `main`,
  merged back into `develop`, and deleted only after both merges complete
- require `hotfix/*` branches to be cut from `main`, merged into `main`,
  merged back into `develop`, and deleted only after both merges complete
- treat exact release closeout as incomplete until exact released `main` has
  been back-merged into `develop` through the protected path and the resulting
  `develop` pipeline is green before opening the next candidate line
- fail closed on that branch-baseline rule through one explicit
  `npm run branch:governance:assert` surface, and keep that assertion first in
  `npm run design:gate`

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
  - public sibling product proof before merge to `main`
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
- exact release truth is merged back into `develop` and proven green there
  before release closeout is considered complete or new candidate work starts
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
- keep the governed branch-baseline assertion as the fail-closed guard around
  realigning `develop` to the exact released `main` baseline before the next
  public candidate is promoted
- keep exact release closeout incomplete until the protected back-merge into
  `develop` and the green `develop` pipeline are both retained as evidence
