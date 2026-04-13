# ADR-0033: Hosted Automation Governance Matrix And Protection Semantics

## Status

Accepted

## Context

The repo already had the right high-level intent for governed `GitFlow`,
SemVer-aware post-release work, and the two public GitHub required checks.
What it still lacked was one retained place that answered the questions future
sessions would otherwise rediscover from live settings and raw YAML:

- which hosted checks are actually required for exact release promotion
- how GitLab protected-branch admission differs from GitHub named required
  checks
- which workflows are release-facing versus characterization-only
- which branch lanes owe preview packaging, publication support, or exact-tag
  release work

That gap already produced drift. The CM plan still claimed `main` was the
working integration branch even though the sustainment package had already
normalized `develop` as the integration branch and `main` as the protected
exact-release line.

## Decision

Retain one governed hosted automation matrix in:

- `docs/product/hosted-ci-governance.md`
- `docs/product/hosted-ci-governance.json`

Retain these protection semantics explicitly:

- GitLab authority uses protected branches plus
  `only_allow_merge_if_pipeline_succeeds=true`
- GitLab does not pretend to have GitHub-style named required checks
- public GitHub uses named required checks `package-preview` and
  `public-facade-linux-smoke`
- GitHub benchmark workflows remain governed characterization lanes, not exact
  release gates

Retain this branch-lane CI responsibility:

- `feature/*` depends on merge-request admission instead of a generic preview
  push lane
- `develop`, `release/*`, `hotfix/*`, and `main` admit direct governed branch
  pipelines where appropriate
- exact SemVer tags retain the exact release evidence lane only after merged
  `main` is green

Retain this anti-drift rule:

- CM plan, sustainment rules, release procedure, current-state, README,
  SRS/RTM/test plan, and affected workflow YAML must agree with the hosted
  automation matrix

## Consequences

Positive:

- future sessions can distinguish GitLab protection from GitHub required-check
  behavior without guessing
- benchmark and experiment workflows stop looking like accidental release gates
- branch-lane CI responsibility is reviewable as product truth instead of
  hidden automation detail

Costs:

- the hosted automation matrix is another governed surface that must be kept in
  sync
- workflow refactors now require requirements/ADR/control-plane updates

## Follow-On

- keep the authority GitLab lane admission rules aligned with the hosted
  matrix, especially the preview-package lane
- keep public README and operator docs clear that `main` is the stable default
  while `develop` carries the next candidate line
- keep future workflow additions classified explicitly as either
  release-facing or characterization-only
