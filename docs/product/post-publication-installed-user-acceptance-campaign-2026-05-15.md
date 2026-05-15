# Post-Publication Installed-User Acceptance Campaign

Date: 2026-05-15

## Scope

This campaign starts after exact `v1.3.16` publication is already closed across
GitLab authority, public GitHub, and VS Code Marketplace. Its job is not to
publish another artifact. Its job is to observe whether the published
Marketplace extension behaves well for a first-time installed user.

GitLab work item: `#10`

Public feedback intake:
<https://github.com/svelderrainruiz/vi-history-suite/issues/98>

## Campaign Boundary

- No public GitHub release mutation.
- No VS Code Marketplace mutation.
- No release branch deletion.
- No claim that Marketplace publication itself proves first-time-user
  acceptance.
- Windows Docker Desktop Windows-container proof remains separate under
  `ISSUE-0415` until a Windows host proves or rejects the launch gate.

## Acceptance Path

| Step | Current State | Evidence Route |
| --- | --- | --- |
| Marketplace listing readback | observed | `docs/product/vscode-marketplace-publication-ledger.md` |
| Exact VSIX install proof | observed | `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json` |
| Clean Windows Marketplace install | deferred | campaign run on a clean Windows profile |
| Quiet extension selection | deferred | first-time installed-user observation |
| Prepare local runtime settings CLI | deferred | first-time installed-user observation |
| `vihs --validate` host runtime validation | deferred | first-time installed-user observation |
| First compare on canonical VI | deferred | first-time installed-user observation |
| Report and evidence review | deferred | first-time installed-user observation |
| Windows Docker Desktop Windows-container proof | separate gate | `docs/product/issues/ISSUE-0415-windows-docker-desktop-launch-gate.md` |

## Video Observation Tie-In

The first-time video slots remain planned-only. The campaign may record where a
user needs a walkthrough, but it must not add placeholder video URLs, fake
thumbnails, or dead media embeds.

Video plan:
`docs/product/first-time-overview-video-plan-2026-05-15.md`

## Next SemVer Decision

Default decision: sustainment-only. Open a patch line only when the campaign
finds a concrete installed-user defect, documentation correction, or proof gap
that needs a published package or public-facing source update.

If Windows Docker Desktop Windows-container proof succeeds repeatably, decide
through `ISSUE-0415` whether it becomes a launch gate. If it fails, retain the
blocked reason and keep Docker Desktop Windows containers deferred/expert.
