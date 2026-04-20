# ISSUE-0412 Promotion And Publication Handoff

## Purpose

Retain the next governed move after the active branch reached clean external
compliance under the historical released `repo-standards-review` `v0.2.9`
closeout, while the current outer assurance lane has moved to the published
`repo-standards-review` assurance-workbench `:main` image and the latest
tagged release remains `v0.2.18`.

This packet now exists so future sessions do not reopen completed standards
work when the remaining work is really historical branch-transition context,
public/bundled truth alignment at publication time, and the explicit
runtime-provider public-acceptance gate.

## Baseline

- issue: `ISSUE-0412`
- tranche: `TRANCHE-016`
- program: `PROGRAM-0005`
- branch baseline before this packet uplift: `adf6c95`
- released compliance closeout packet:
  [repo-standards-review-v0.2.9-pass-8-closeout.md](./repo-standards-review-v0.2.9-pass-8-closeout.md)

## What Is Already Complete

- generated provider-selection CLI persists provider, LabVIEW version, and
  bitness
- Windows installed compare resolves one exact version+bitness local
  `LabVIEWCLI` runtime or fails closed
- explicit compare preflight is the active branch workflow
- authority/internal control-plane surfaces now reflect the host-default plus
  bounded expert Docker doctrine truthfully
- the retained `repo-standards-review` `v0.2.9` closeout still documents the
  historical compliance uplift on this branch
- the current outer assurance lane for fresh audits is the published
  `repo-standards-review` assurance-workbench `:main` image on the separate
  self-hosted Linux assurance runner lane, while `v0.2.18` remains the latest
  tagged release
- the branch has already been promoted into `develop`

## Remaining Work After Compliance Closeout

The remaining work is not a released-skill compliance blocker.

It is:

1. truthful bundled/public reader-surface promotion only when the replacement
   contract is actually ready to be published
2. explicit runtime-provider public-acceptance gating after that publication
   boundary is real

The next public gate is now retained explicitly in:

- [runtime-provider-public-acceptance-gate.md](./runtime-provider-public-acceptance-gate.md)
- [runtime-provider-public-acceptance-gate.json](./runtime-provider-public-acceptance-gate.json)

## Immediate Next Move

1. keep the exact released `v1.2.2` Docker-only installed-user bundle and
   public surfaces unchanged until the replacement contract is the truthful
   candidate
2. once the replacement contract becomes the truthful candidate, open the next
   SemVer candidate line on `develop` before packaged/public promotion resumes
3. drive the published acceptance rerun through the explicit runtime-provider
   public-acceptance gate
4. treat this packet as retained branch-transition context, not as the live
   gate record

## Current Review-Ready Branch Packet

- branch: `feature/wip-wiki-and-cli-usability`
- remote state: pushed and in sync with
  `origin/feature/wip-wiki-and-cli-usability`
- reviewable commit stack:
  1. `e0bff69` `docs: retain runtime-settings CLI usability draft`
  2. `392ca23` `docs: promote runtime-settings CLI usability contract`
  3. `b52063b` `docs: harden docs workbench and wiki refresh flow`
  4. `d67488d` `docs: retain issue-0412 review handoff packet`

The commit stack is intentionally split this way:

- commit 1 keeps the draft artifact separate from governed-surface promotion
- commit 2 promotes the finalized runtime-settings CLI decisions into the
  information-for-users package, SRS, RTM, and test plan
- commit 3 hardens the docs-workbench dependency-isolation and wiki-refresh
  control plane
- commit 4 retains this exact review handoff packet on the branch so the
  reviewer-facing packet is carried by repo history instead of chat memory

The current review packet was validated locally before push with:

- requirement-quality check: `pass`
- focused requirements/docs/workbench/wiki tests: `pass`
- `node scripts/runDocsWorkbenchDocker.js gate`: `pass`
- `python3 scripts/run_assurance.py . --profile release-gate`: `pass`

After this handoff packet was added, the branch also passed:

- `node scripts/run-docs-gate.js --skip-links`: `pass`

Non-blocking caveats:

- the draft file remains in the branch intentionally as retained iteration
  context, while the promoted governed truth is carried by the later commits
- host-local `node scripts/run-docs-gate.js` still depends on local `lychee`;
  the governed Docker-first docs-workbench gate remains the authoritative
  fallback when that host binary is absent

## Stop Rule

Do not reopen standards-debt work on this branch unless a later released-skill
audit fails. Until then, treat follow-on work here as product/promotion work.
