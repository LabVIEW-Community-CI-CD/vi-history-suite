# MIT Spec Kit Runtime-Contract Export

## Purpose

This packet admits the first requirements slice for the public MIT Spec Kit
implementation authority at `https://github.com/svelderrainruiz/vi-history`.
It reuses the locked `runtime-contract-host-provider-v1` requirement IDs and
semantics while retaining a fresh governed export record for the MIT target.

## Source And Target

- Source authority: GitLab governed authority
- Source repo: `https://gitlab.com/svelderrainruiz/vi-history-suite`
- Split baseline: `v1.3.16`
- Export commit: `31add781bd04cc832d9fb55aa821a69305a91a37`
- Target authority: GitHub MIT Spec Kit implementation authority
- Target repo: `https://github.com/svelderrainruiz/vi-history`
- Target import path:
  `docs/requirements/imports/runtime-contract-host-provider-v1/`
- Target Spec Kit path:
  `.specify/specs/runtime-contract-host-provider-v1/`

## Boundary

The MIT repo receives sanitized requirements and Spec Kit artifacts only. It
does not receive PolyForm source files, private evidence, private filesystem
paths, release credentials, or GitLab-only tooling instructions.

Marketplace publication for `svelderrainruiz.vi-history` is disabled until a
later ADR admits a release channel.

## Implementation Admission

The bridge records the foundation and explicit-compare IAUs as implemented for
the MIT authority. The current user-story IAU is
`IAU-runtime-contract-runtime-facts-v1`, limited to `T016` through `T021`, and
its explicit preflight records `status: pass`.
Later Docker and proof-intake implementation tasks remain blocked until the
runtime-facts IAU merges.

The released GitLab extension is treated as a requirement-maturity signal. It
does not grant permission to copy source, private evidence, private scripts, or
release-control material into the MIT authority.

## Imported Requirement IDs

- `VHS-SYS-REQ-004`
- `VHS-SYS-REQ-005`
- `VHS-SYS-REQ-006`
- `VHS-SYS-REQ-007`
- `VHS-SYS-REQ-008`
- `VHS-REQ-094`
- `VHS-REQ-095`
- `VHS-REQ-138`
- `VHS-REQ-141`
- `VHS-REQ-144`
- `VHS-REQ-146`
- `VHS-REQ-148`
- `VHS-REQ-194`
- `VHS-REQ-588`
- `VHS-REQ-589`
- `VHS-REQ-590`

## Bug Oracle

- Same wrong behavior across independent implementations indicates a
  `requirement-defect-candidate`.
- Wrong behavior in one authority only indicates an
  `implementation-defect-candidate`.
- Ambiguous behavior indicates a `requirement-clarification-candidate`.

## Initial Public Issue Set

The MIT authority bootstrap uses public GitHub issues because the repo is
public and intended to be web-agent friendly:

1. Bootstrap MIT Spec Kit authority.
2. Import `runtime-contract-host-provider-v1`.
3. Lock Spec Kit `spec.md`, `plan.md`, and `tasks.md`.
4. Implement runtime contract after spec lock.
5. Decide future Marketplace publication posture.
