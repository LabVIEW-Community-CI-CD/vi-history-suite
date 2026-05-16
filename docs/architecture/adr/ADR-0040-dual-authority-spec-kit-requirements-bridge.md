# ADR-0040: Dual-Authority Spec Kit Requirements Bridge

## Status

Accepted on 2026-05-16.

## Context

The historical model treated GitLab as the governed authority and GitHub as a
curated public facade for source, issue intake, public release assets, and
Marketplace-facing user surfaces. That model closed the `v1.3.16` publication
line, but it is no longer the intended architecture for future work.

Starting after the retained `v1.3.16` baseline, GitHub and GitLab become
sibling product authorities. They may use different development engines, issue
systems, automation, evidence packets, and SemVer lines. This is intentional:
if two independently executed engines work from related requirements and both
produce the same wrong behavior, that convergence is evidence that the
requirement itself may be defective rather than only one implementation.

## Decision

1. `v1.3.16` is the shared split baseline.
2. GitHub keeps the public product identity:
   `svelderrainruiz.vi-history-suite`, display name `VI History Suite`.
3. GitHub starts its first independent post-split feature line at `1.4.0`.
4. GitLab becomes the governed sibling product:
   `svelderrainruiz.vi-history`, display name `VI History`.
5. GitLab starts its first governed sibling release line at `0.1.0`.
6. GitLab releases the governed sibling through GitLab Releases with VSIX,
   checksum, and evidence assets. Marketplace publication remains owned by the
   GitHub product identity unless a later ADR admits a separate Marketplace
   identity.
7. The two authorities relate through a slice-based requirements-core export,
   not source promotion.
8. GitHub imports requirement slices under
   `docs/requirements/imports/<slice-id>/` and may commit Spec Kit feature
   artifacts under `.specify/specs/<feature>/`.
9. Imported requirement IDs remain immutable baseline references. GitHub may
   add GitHub-local requirement IDs for divergent requirements.
10. Implementation/code changes do not flow automatically between the repos.
    Only docs/requirements bridge information crosses the authority boundary
    unless a later issue explicitly opens a porting action.

## Bridge Rules

The private/local bridge may use governed assurance tooling to export a
requirements slice, but public GitHub imports must be sanitized. A public import
pack must not require private paths, private GitLab credentials, local
workbench state, or repo-local assurance scripts to be useful.

Each import slice shall retain:

- `manifest.json`
- `syrs.md`
- `srs.md`
- `rtm.csv`
- `test-plan.md`

Each governed export slice shall retain:

- source baseline tag and source commit
- imported requirement IDs
- redaction status
- target feature
- public import path
- private evidence and mapping needed to reproduce the export decision

## Bug Oracle

- Same wrong behavior in both repos: create a requirement-defect candidate.
- Wrong behavior in one repo only: create an implementation-defect candidate.
- Ambiguous behavior or inconsistent fit criteria: create a
  requirement-clarification candidate.

## Supersession

ADR-0027, ADR-0028, and ADR-0032 remain retained historical records for the
facade/promotion model through `v1.3.16`. For post-split work, this ADR governs
the relationship between GitHub and GitLab.

## Consequences

- Existing facade/promotion documents remain valid historical evidence only.
- Future release procedure work must distinguish GitHub public product releases
  from GitLab governed sibling releases.
- GitHub Spec Kit work must consume imported public requirements rather than
  relying on GitLab-private context.
- GitLab proof packets must not be treated as GitHub proof unless an import or
  adoption record explicitly says how the evidence applies.
