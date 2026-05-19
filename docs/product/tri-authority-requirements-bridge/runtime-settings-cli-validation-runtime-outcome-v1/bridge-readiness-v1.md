# Runtime Settings CLI Validation Runtime Outcome Bridge Readiness

Recorded: `2026-05-19T10:42:46Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/53`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`runtime-settings-cli-validation-runtime-outcome-v1` is bridge-ready for public
MIT import and Spec Kit admission planning, but implementation is not admitted
by this record.

The candidate IAU is
`IAU-runtime-settings-cli-validation-runtime-outcome-v1`. It covers a pure
runtime-outcome facts adapter for `vihs --validate` so the already implemented
MIT validation readback, proof artifact, proof-out adapter, and proof-out
file-emission contracts can consume generated runtime outcome facts without
hand-written `runtimeOutcome` objects.

This record does not admit runtime validation execution, compare execution,
LabVIEWCLI execution, Docker command execution or orchestration, live terminal
proof, package/bin publication, launcher/profile mutation, Marketplace work,
release automation, or source copying.

## Why This Is The Next Unit

The MIT authority now has the materialized terminal entrypoint, prompt loop,
terminal I/O adapter, validation readback contract, validation proof-artifact
contract, validation proof-out adapter, and proof-out file emission from ready
adapter facts. The remaining gap before any runtime execution lane is a small
fact-shaping contract that maps supplied public-safe runtime selection facts to
the stable validation outcome fields used by the existing proof chain.

Keeping this lane separate prevents runtime outcome normalization from quietly
becoming OS probing, LabVIEWCLI, Docker, compare execution, CLI/bin exposure,
release, Marketplace, or live-terminal proof work.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-validation-runtime-outcome-v1` |
| Future slice ID | `runtime-settings-cli-validation-runtime-outcome-v1` |
| Imported requirement IDs | `VHS-REQ-546` |
| Prerequisite requirement IDs | `VHS-REQ-537`, `VHS-REQ-543`, `VHS-REQ-544`, `VHS-REQ-545` |
| Supporting test ID | `TEST-UNIT-392` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `567157f4a77536c4efa07ba72eea3314083ccde2` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `d8543004d5682ef793961433fba14b7ee10c8d06` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement ID `VHS-REQ-546`
- prerequisite references to the already implemented settings write,
  validation readback, validation proof, proof-out adapter, and proof-out
  file-emission slices
- supporting public test expectation `TEST-UNIT-392`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs --validate`
- pure contract name `createRuntimeSettingsValidationRuntimeOutcome`
- runtime outcome fields `runtimeValidationOutcome`, `runtimeProvider`,
  `runtimeEngine`, `runtimeBlockedReason`, `runtimeErrorCode`,
  `runtimeProofStatus`, and `runtimeImplementationStatus`
- deterministic mappings for ready, blocked, not-implemented, and unknown
  blocked-reason inputs
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- private proof packets or private issue templates
- raw OS-specific terminal-driver implementation details
- OS inspection, runtime locator invocation, or environment probing behavior
- runtime validation execution
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- live already-running VS Code session uptake proof or live terminal proof
- package/bin publication, launcher/profile mutation, VSIX packaging,
  Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-validation-runtime-outcome-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-validation-runtime-outcome-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving ready runtime selection facts map to `VIHS_OK`, `ready`,
  `ready`, and `implemented`
- add tests proving invalid or missing provider facts fail closed
- add tests proving Docker not-implemented and platform/provider unsupported
  facts map to `runtimeImplementationStatus: not-implemented`
- add tests proving LabVIEW not-found facts and unknown blocked reasons produce
  stable public error/status facts
- add tests proving the generated `runtimeOutcome` composes into the existing
  readback, proof artifact, proof-out adapter, and file-emission contracts
- add tests proving OS probing, locators, runtime execution, compare,
  LabVIEWCLI, Docker, live proof, package/bin publication, launcher/profile
  mutation, Marketplace, release, and source-copying side effects remain
  blocked
- implement the minimum pure runtime outcome facts adapter

Still blocked:

- runtime validation execution
- compare execution
- LabVIEWCLI execution
- Docker execution or orchestration
- live terminal proof
- package/bin publication
- launcher/profile mutation
- Marketplace work
- release automation
- source copying from GitLab or GitHub Suite

## Next Gate

After this bridge readiness record merges, create the public MIT import packet
and Spec Kit feature for
`runtime-settings-cli-validation-runtime-outcome-v1`. Then run redaction and
bridge artifact validation. Only after a public preflight record has
`status: pass` may implementation of
`IAU-runtime-settings-cli-validation-runtime-outcome-v1` start.
