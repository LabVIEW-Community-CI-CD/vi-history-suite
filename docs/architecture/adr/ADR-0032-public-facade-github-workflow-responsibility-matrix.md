# ADR-0032: Public Facade GitHub Workflow Responsibility Matrix

## Status

Accepted

## Context

The public GitHub facade now depends on two protected required checks:

- `Public Facade Package Preview / package-preview`
- `Public Facade Linux Smoke / public-facade-linux-smoke`

Those checks were already named in the control plane, but their actual
workflow responsibilities, trigger boundaries, and churn controls were still
encoded mainly in raw GitHub Actions YAML. That left a landmine:

- future sessions could widen triggers or duplicate responsibilities without
  realizing they were changing governed product truth
- branch/CI improvements could accidentally burn unnecessary GitHub CI on
  unrelated pushes
- readers could see the workflow names in required-check lists without knowing
  what each workflow actually owns

## Decision

Retain a governed two-workflow public-facade matrix:

- `Public Facade Package Preview`
  - owns `npm run compile`
  - owns `npm run test:design-contract`
  - owns preview VSIX packaging and artifact upload
- `Public Facade Linux Smoke`
  - owns Docker Linux engine verification
  - owns `npm run public:smoke:linux`
  - owns retained smoke-evidence upload

Retain these trigger rules for both workflows:

- allow `workflow_dispatch`
- allow bounded `push` admission only on `develop`, `main`, `release/*`, and
  `hotfix/*`
- allow bounded `pull_request` admission only when the target protected branch
  is `develop` or `main`
- admit only workflow-relevant path changes instead of every push on those
  branches
- do not create a `feature/*` push lane

Retain these churn controls:

- each workflow uses per-workflow/per-ref concurrency
- newer runs cancel older in-progress runs on the same PR or ref

## Consequences

Positive:

- the two required public GitHub checks now have stable owned responsibilities
- public workflow trigger changes become requirement/ADR-visible changes
- GitHub CI churn is reduced because unrelated pushes no longer run public
  workflow lanes

Costs:

- the workflow matrix must stay aligned across YAML, sustainment docs, SRS,
  RTM, and the test plan
- future workflow refactors must update this ADR instead of silently evolving
  by implementation drift

## Follow-On

- keep workflow trigger boundaries and concurrency aligned in both public
  workflow files
- keep the workflow-responsibility matrix explicit in sustainment rules,
  PROGRAM-0004, ISSUE-0409, SRS, RTM, and test-plan coverage
- treat future additions, removals, or role swaps in the public GitHub
  workflow pair as governed ADR-impacting changes
