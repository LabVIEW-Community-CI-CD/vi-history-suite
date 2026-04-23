# ADR-0032: Public GitHub Admission Matrix

## Status

Accepted

## Context

The public GitHub facade now depends on three protected required checks:

- `Public Source Package Preview / public-source-package-preview`
- `Public Linux Installed-User Smoke / public-linux-installed-user-smoke`
- `Public Windows Installed-User Contract / public-windows-installed-user-contract`

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

Retain a governed three-lane public admission matrix:

- `Public Source Package Preview`
  - owns `npm run compile`
  - owns `npm run test:design-contract`
  - owns preview VSIX packaging and artifact upload
- `Public Linux Installed-User Smoke`
  - owns Docker Linux engine verification
  - owns `npm run public:smoke:linux`
  - owns retained smoke-evidence upload
- `Public Windows Installed-User Contract`
  - owns `npm run public:contract:windows-installed-user`
  - owns Windows `vihs` launcher and runtime-settings CLI contract proof
  - owns retained Windows contract-evidence upload

Retain these trigger rules for all three workflows:

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

- the three required public GitHub checks now have stable owned responsibilities
- public workflow trigger changes become requirement/ADR-visible changes
- GitHub CI churn is reduced because unrelated pushes no longer run public
  workflow lanes while still representing Linux and Windows installed-user truth

Costs:

- the workflow matrix must stay aligned across YAML, sustainment docs, SRS,
  RTM, and the test plan
- future workflow refactors must update this ADR instead of silently evolving
  by implementation drift

## Follow-On

- keep workflow trigger boundaries and concurrency aligned in all three public
  workflow files
- keep the workflow-responsibility matrix explicit in sustainment rules,
  PROGRAM-0004, ISSUE-0409, SRS, RTM, and test-plan coverage
- treat future additions, removals, or role swaps in the public GitHub
  admission matrix as governed ADR-impacting changes
