# ADR-0029: Develop Integration, Main Release, And Required Checks

## Status

Accepted

## Context

`v1.0.2` burned after immutable publication because the authority repo still
contained a stale docs/manifest contract. The public tag and GitHub release
were already live when GitLab `main` and tag pipelines failed on
`packageManifest.test.ts`.

That failure was not a runtime mystery. It was a release-governance failure:

- work landed without a protected branch model
- release promotion still depended too heavily on operator memory
- required checks were not treated as the admission control for protected
  branches

The public product already needed `develop` as the governed public Codespaces
evaluation branch. The authority repo also needs an explicit integration branch
instead of allowing release work to collapse straight into `main`.

## Decision

Adopt this branch and release model:

- `develop` is the integration branch
- `main` is the release branch
- exact SemVer tags are cut from `main` only
- protected-branch promotion shall use required checks
- a burned exact release shall never be reused as the green release baseline

Required checks now mean:

- GitLab `docs_continuous_integration`
- GitLab `docs_public_continuous_integration`
- GitLab `docs_internal_continuous_integration`
- GitLab `test_extension`
- GitLab `package_extension_preview`
- GitHub `Public Facade Package Preview / package-preview`
- GitHub `Public Facade Linux Smoke / public-facade-linux-smoke`

## Consequences

Positive:

- release publication now has an explicit integration-to-release promotion path
- exact tags are no longer justified by “local confidence” alone
- future sessions have a stable answer for which branch a fork owner or
  maintainer should use
- burned releases stay visible in retained truth instead of being silently
  overwritten

Costs:

- branch management is now a first-class control-plane concern
- future release work must respect required checks before promotion
- post-release docs must preserve both the current exact line and any burned
  exact line

## Follow-On

- keep the branch model explicit in release procedure and sustainment rules
- protect `develop` and `main` with required checks on their respective hosting
  surfaces
- retain burned exact releases in the control plane instead of treating them as
  successful baselines
