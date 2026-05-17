# ADR-0041: MIT Spec Kit Implementation Authority

## Status

Accepted on 2026-05-17.

## Context

ADR-0040 replaced the historical public-facade model with two sibling product
authorities after the shared `v1.3.16` split baseline. That model remains valid
for the governed GitLab authority and the public Marketplace-continuity GitHub
authority.

`https://github.com/svelderrainruiz/vi-history` now exists as a public MIT
repository. It is not a fork and is not a replacement for either existing
authority. Its purpose is to provide a clean-room, Spec Kit-first implementation
line that consumes locked public requirements slices and then implements from
those specifications.

## Decision

1. Admit `https://github.com/svelderrainruiz/vi-history` as the MIT Spec Kit
   implementation authority.
2. Keep GitLab `https://gitlab.com/svelderrainruiz/vi-history-suite` as the
   governed authority for retained evidence, release governance, and the
   governed `svelderrainruiz.vi-history` release line.
3. Keep GitHub `https://github.com/svelderrainruiz/vi-history-suite` as the
   public Marketplace-continuity authority for `svelderrainruiz.vi-history-suite`.
4. The MIT authority reserves package name `vi-history`, display name
   `VI History`, publisher `svelderrainruiz`, extension id
   `svelderrainruiz.vi-history`, and first bootstrap version `0.1.0`.
5. Marketplace publication for the MIT authority is disabled initially. A later
   ADR must admit any separate Marketplace listing, release channel, or
   publication automation.
6. The MIT authority uses `develop` as integration branch and `main` as the
   default/release branch.
7. Requirements may cross into the MIT authority only through sanitized import
   packets and committed Spec Kit artifacts.
8. Implementation source, private evidence, PolyForm-licensed source files,
   private scripts, and release credentials do not cross into the MIT authority.

## Bridge Rules

The first admitted MIT authority slice is
`runtime-contract-host-provider-v1`. It keeps the same imported requirement IDs
and semantics as the existing public runtime-contract slice, but it receives a
fresh governed export record that targets `svelderrainruiz/vi-history`.

The MIT repo must remain useful from public artifacts alone:

- `docs/requirements/imports/<slice-id>/manifest.json`
- `docs/requirements/imports/<slice-id>/syrs.md`
- `docs/requirements/imports/<slice-id>/srs.md`
- `docs/requirements/imports/<slice-id>/rtm.csv`
- `docs/requirements/imports/<slice-id>/test-plan.md`
- `.specify/specs/<slice-id>/spec.md`
- `.specify/specs/<slice-id>/plan.md`
- `.specify/specs/<slice-id>/tasks.md`

Implementation work in the MIT authority remains blocked until the relevant
Spec Kit `spec.md`, `plan.md`, and `tasks.md` are committed and internally
consistent.

## Three-Authority Bug Oracle

- Same wrong behavior across independent implementations is a
  requirement-defect candidate.
- Wrong behavior in one implementation only is an implementation-defect
  candidate.
- Ambiguous behavior or inconsistent fit criteria is a
  requirement-clarification candidate.

## Consequences

- ADR-0040 continues to govern the two-authority split between GitLab and
  GitHub `vi-history-suite`.
- This ADR adds a third authority without reviving source promotion.
- The MIT repo can validate the quality of locked requirements because it is
  not protected by implementation history.
- Any future Marketplace publication for `svelderrainruiz.vi-history` requires
  a separate decision and proof lane.
