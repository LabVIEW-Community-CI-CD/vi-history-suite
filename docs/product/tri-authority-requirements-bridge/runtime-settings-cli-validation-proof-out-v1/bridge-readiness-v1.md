# Runtime Settings CLI Validation Proof-Out Adapter Bridge Readiness

Recorded: `2026-05-19T09:23:14Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/51`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`runtime-settings-cli-validation-proof-out-v1` is bridge-ready for public MIT
import and Spec Kit admission planning, but implementation is not admitted by
this record.

The candidate IAU is
`IAU-runtime-settings-cli-validation-proof-out-v1`. It covers the narrow CLI
adapter for `vihs --validate --proof-out <dir>` over the already admitted
validation readback and validation proof-artifact contracts. The unit may
represent the proof-out request, write deterministic
`vihs-validation-proof.json` and `vihs-validation-issue.md` artifacts from
supplied validation/proof facts, provide copyable non-interactive guidance, and
fail closed when required validation facts or output-target facts are missing
or unsupported.

This record does not admit runtime validation execution, compare execution,
LabVIEWCLI execution, Docker command execution or orchestration, live terminal
proof, package/bin publication, launcher/profile mutation, Marketplace work,
or source copying.

## Why This Is The Next Unit

The MIT authority now has the materialized terminal entrypoint, pure prompt
loop, terminal I/O adapter, validation readback contract, and pure validation
proof-artifact contract. The next smallest installed-user proof step is the
file-output adapter that binds `--proof-out <dir>` to those existing public
contracts without discovering, executing, or orchestrating runtime behavior.

Keeping this lane separate prevents `vihs --validate --proof-out` from quietly
inheriting LabVIEWCLI, Docker, compare, release, or live-terminal proof work.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-validation-proof-out-v1` |
| Future slice ID | `runtime-settings-cli-validation-proof-out-v1` |
| Imported requirement IDs | `VHS-REQ-546` |
| Prerequisite requirement IDs | `VHS-REQ-537`, `VHS-REQ-544`, `VHS-REQ-545` |
| Supporting test ID | `TEST-UNIT-392` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `087b08493c4f0f4fea55aca379a585a2110c5b63` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `d1666dc542779d0a1297b8479f8f286da72dbbb6` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement ID `VHS-REQ-546`
- prerequisite references to the already implemented terminal entrypoint,
  prompt-loop, terminal I/O adapter, validation readback, and validation
  proof-artifact slices
- supporting public test expectation `TEST-UNIT-392`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs --validate --proof-out <dir>`
- output artifact names `vihs-validation-proof.json` and
  `vihs-validation-issue.md`
- deterministic proof-out target facts that identify a supplied public-safe
  output directory without exposing private host paths
- public-safe proof JSON and issue-body emission from supplied validation
  proof facts
- fail-closed reasons for missing validation facts, missing proof facts,
  unsupported proof-out target shape, and unavailable artifact content
- copyable guidance for non-interactive or blocked sessions
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- private proof packets or private issue templates
- raw OS-specific terminal-driver implementation details
- runtime validation execution
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- live already-running VS Code session uptake proof or live terminal proof
- package/bin publication, launcher/profile mutation, Marketplace publication,
  or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-validation-proof-out-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-validation-proof-out-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving `--proof-out <dir>` request facts resolve to the two
  public artifact filenames
- add tests proving deterministic proof JSON and issue Markdown come from the
  already admitted validation proof-artifact contract
- add tests proving missing validation/proof facts and unsupported output-target
  shapes fail closed without writes
- add tests proving non-interactive guidance is copyable and does not wait for
  terminal input
- add tests proving runtime validation, compare, LabVIEWCLI, Docker, live proof,
  packaging, Marketplace, launcher/profile mutation, and source-copying side
  effects remain blocked
- implement the minimum public MIT proof-out adapter around supplied validation
  and proof facts

Still blocked:

- runtime validation execution
- compare execution
- LabVIEWCLI execution
- Docker execution or orchestration
- live terminal proof
- package/bin publication
- launcher/profile mutation
- Marketplace work
- source copying from GitLab or GitHub Suite

## Next Gate

After this bridge readiness record merges, create the public MIT import packet
and Spec Kit feature for `runtime-settings-cli-validation-proof-out-v1`. Then
run redaction and bridge artifact validation. Only after a public preflight
record has `status: pass` may implementation of
`IAU-runtime-settings-cli-validation-proof-out-v1` start.
