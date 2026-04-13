# ISSUE-0412 Promotion And Publication Handoff

## Purpose

Retain the next governed move after the active branch reached clean external
compliance under released `repo-standards-review` `v0.2.9`.

This packet exists so future sessions do not reopen completed standards work
when the remaining work is really branch promotion, public/bundled truth
alignment at publication time, and the later public acceptance rerun.

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
- released `repo-standards-review` `v0.2.9` passes cleanly on this branch

## Remaining Work After Compliance Closeout

The remaining work is not a released-skill compliance blocker.

It is:

1. merge/promotion planning for `feature/local-labviewcli-selection-and-explicit-compare`
   into `develop`
2. truthful bundled/public reader-surface promotion only when the replacement
   contract is actually ready to be published
3. explicit handoff into `PROGRAM-0002` for the next public acceptance rerun
   after that publication boundary is real

## Immediate Next Move

1. queue the feature-branch merge into `develop`
2. keep the exact released `v1.2.2` Docker-only installed-user bundle and
   public surfaces unchanged until the replacement contract is the truthful
   candidate
3. once the replacement contract becomes the truthful candidate, reopen the
   packaged/public promotion slice and hand the published acceptance rerun to
   `PROGRAM-0002`

## Stop Rule

Do not reopen standards-debt work on this branch unless a later released-skill
audit fails. Until then, treat follow-on work here as product/promotion work.
