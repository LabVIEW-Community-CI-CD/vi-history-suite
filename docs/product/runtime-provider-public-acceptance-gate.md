# Runtime-Provider Public Acceptance Gate

## Purpose

Retain the next governed public-acceptance boundary for the host-default
Windows local `LabVIEWCLI` installed contract without pretending the earlier
Docker-only public closeout is still active implementation work.

## Governing Control Plane

- gate state: `open`
- historical public closeout: `TRANCHE-010` / `ISSUE-0407` / `PROGRAM-0002`
- active implementation direction: `TRANCHE-016` / `ISSUE-0412` /
  `PROGRAM-0005`
- exact released public baseline: `v1.2.2` Docker-only installed-user contract
- retained branch-transition packet:
  [issue-0412-promotion-and-publication-handoff.md](./issue-0412-promotion-and-publication-handoff.md)

## Historical Boundary

- `PROGRAM-0002` and `ISSUE-0407` remain closed on the Docker-only public
  contract
- the retained Gate D preflight, hosted smoke, and human acceptance packets
  remain historical evidence for that closed Docker-only public line
- the host-default provider work on `develop` does not reopen the earlier
  Docker-only public closeout as active feature work

## Already Satisfied Admission Inputs

- generated settings CLI persists provider, LabVIEW version, and bitness
- default compare preflight on supported Windows surfaces is now
  runtime-backed instead of settings-only
- live-session guidance is explicit: reload or restart when Code is already
  open and settings have changed
- JSONC comments and trailing commas are now governed settings-target inputs
- generated launcher surfaces now fail closed on missing `node` or stale
  launcher state
- prepare-command trust and settings-target governance is explicit
- governed CLI validation/readback is retained for the persisted
  provider/version/bitness bundle
- host operation-matrix proof is retained with the remaining 2026 prerequisite
  seams explicit
- direct x64 and x86 host-native `CreateComparisonReport` blocker packets are
  retained with `ready-for-runtime` admission facts and timeout receipts
- runtime-doctor and packet/dashboard surfaces now use provider-based
  wording instead of stale `executionMode` narration

## Remaining Gate Criteria

- publication-alignment slices must promote truthful maintained public
  candidate surfaces for the host-default contract
- bundled docs, public GitHub source, public GitHub wiki, and Marketplace
  reader surfaces shall stay on the exact released Docker-only baseline until
  the maintained public candidate actually carries the host-default contract
- the maintained public candidate heads shall be retained in
  `docs/product/public-release-candidate.{md,json}`
- the governed public acceptance rerun shall execute against those published
  candidate heads and retain pass-or-blocked evidence before `review-ready`
  advances
- the gate closes only after the host-default installed contract is both
  truthfully published and accepted on the governed public surface

## Non-Criteria

- reopening `PROGRAM-0002` or `ISSUE-0407` as active feature work
- treating local authority-green proof as equivalent to public acceptance
- rewriting public or bundled installed-user surfaces ahead of truthful
  candidate publication

## Next Move

- `feature/runtime-provider-publication-alignment`

