# Post-Publication Installed-User Observation Cadence

Date: 2026-05-16

## Scope

This cadence turns the one-time post-publication installed-user acceptance
campaign into a recurring observation loop. It does not publish another
artifact. It decides when the next installed-user observation cycle runs, how
facts are classified, and where repeated user confusion flows.

Source work item: `#22`

Predecessor campaign: `#10`

Public feedback intake:
<https://github.com/svelderrainruiz/vi-history-suite/issues/98>

Current public-intake readback on 2026-05-16: issue `#98` is open with labels
`installed-user-ux`, `user-docs`, and `public-facade`, and has zero comments.

## Cadence Rule

Run a new installed-user observation cycle when any of these happens:

- a new exact VS Code Marketplace publication closes
- public feedback intake receives a new installed-user report or confusion
  signal
- a support request repeats the same installed-user confusion already seen in a
  prior cycle
- a planned first-time video slot receives real observation evidence
- before opening any SemVer candidate that changes installed-user onboarding,
  validation, compare, docs, or proof claims
- no later than 2026-06-14 while the public feedback intake remains open

## Fact Buckets

| Bucket | Meaning |
| --- | --- |
| observed | Retained evidence from Marketplace listing readback, exact VSIX install proof, public feedback, clean install observations, validation receipts, compare receipts, or user review notes. |
| deferred | Planned observations that have not run yet and do not block the current exact release truth. |
| blocked | Observations that cannot proceed until a missing host, missing proof lane, or separate admitted gate is available. |

Each cycle must keep observed, deferred, and blocked facts separate from
publication proof. Marketplace publication and exact VSIX install proof remain
release evidence; they do not by themselves prove first-time installed-user
acceptance.

## Routing Rules

- Repeated confusion, first-run dead ends, unclear validation output, or support
  copy gaps become user-doc or bundled-doc work items before a SemVer decision.
- Repeated confusion that is easier to demonstrate than describe becomes a
  first-time Overview video-plan observation.
- Video-plan observations must not add placeholder video URLs, fake thumbnails,
  or dead media embeds.
- Default SemVer recommendation is sustainment-only. Open a patch only for an
  installed-user defect, public-facing documentation correction, or proof gap
  that requires a published package or public source update.
- Public intake observations link back to GitHub issue `#98` or its successor
  without treating the public issue itself as release proof.

## Windows Docker Desktop Boundary

Windows Docker Desktop Windows-container proof remains a separate gate under
`ISSUE-0415`:

`docs/product/issues/ISSUE-0415-windows-docker-desktop-launch-gate.md`

Do not admit that proof through this observation cadence unless a later
explicit `ISSUE-0415` decision says so.

## Mutation Boundary

- No public GitHub release mutation.
- No VS Code Marketplace mutation.
- No release branch deletion.
- No claim that Marketplace publication itself proves first-time installed-user
  acceptance.

## Required Cycle Outputs

Each future cycle should retain:

- observed facts
- deferred facts
- blocked facts
- documentation candidates
- video-plan candidates
- SemVer recommendation
- Windows Docker Desktop gate reference

## Proving Commands

```bash
npm run docs:gate:core
VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:release-gate -- --evidence-dir /tmp/vihs-assurance-release-22
VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514-22
python3 /home/sergio/repos/gl/repo-standards-review/scripts/requirements_quality_check.py . --json
python3 /home/sergio/repos/gl/repo-standards-review/scripts/external_user_information_check.py . --json
npm exec -- vitest run tests/unit/postPublicationInstalledUserAcceptanceCampaign.test.ts tests/unit/firstTimeOverviewVideoPlan.test.ts tests/unit/postReleaseSustainmentRulesDocs.test.ts
```
