# Runtime Settings CLI Validation Proof-Out File Emission Bridge Readiness

Recorded: `2026-05-19T10:05:14Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/52`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`runtime-settings-cli-validation-proof-out-file-emission-v1` is bridge-ready
for public MIT import and Spec Kit admission planning, but implementation is
not admitted by this record.

The candidate IAU is
`IAU-runtime-settings-cli-validation-proof-out-file-emission-v1`. It covers the
narrow file-emission step for `vihs --validate --proof-out <dir>` after the
public MIT proof-out adapter has already produced ready artifact payload facts.
The unit may create a public-safe target directory, write exactly
`vihs-validation-proof.json` and `vihs-validation-issue.md`, and return
deterministic write-result facts.

This record does not admit runtime validation execution, compare execution,
LabVIEWCLI execution, Docker command execution or orchestration, live terminal
proof, package/bin publication, launcher/profile mutation, Marketplace work,
or source copying.

## Why This Is The Next Unit

The MIT authority now has the materialized terminal entrypoint, prompt loop,
terminal I/O adapter, validation readback contract, validation proof-artifact
contract, and pure validation proof-out adapter. The next smallest installed
user proof step is bounded filesystem emission from those already generated
adapter facts.

Keeping this lane separate prevents file writing from quietly becoming runtime
validation, LabVIEWCLI, Docker, compare, release, or live-terminal proof work.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-validation-proof-out-file-emission-v1` |
| Future slice ID | `runtime-settings-cli-validation-proof-out-file-emission-v1` |
| Imported requirement IDs | `VHS-REQ-546` |
| Prerequisite requirement IDs | `VHS-REQ-537`, `VHS-REQ-544`, `VHS-REQ-545` |
| Supporting test ID | `TEST-UNIT-392` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `31810efff02ba5fe38c0642e6b2175f511ee12fa` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `016009d5972c4c588ae549a3edfb4cfeebf2b9cc` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement ID `VHS-REQ-546`
- prerequisite references to the already implemented terminal entrypoint,
  prompt-loop, terminal I/O adapter, validation readback, validation
  proof-artifact, and validation proof-out adapter slices
- supporting public test expectation `TEST-UNIT-392`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs --validate --proof-out <dir>`
- artifact names `vihs-validation-proof.json` and
  `vihs-validation-issue.md`
- bounded write-result facts for the two emitted artifacts
- fail-closed reasons for missing or unready adapter facts, unsupported output
  targets, unavailable artifact payloads, and I/O failures
- no-hidden-partial-success behavior when one write cannot complete
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- private proof packets or private issue templates
- raw OS-specific terminal-driver implementation details
- new validation fact generation or runtime validation execution
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- live already-running VS Code session uptake proof or live terminal proof
- package/bin publication, launcher/profile mutation, Marketplace publication,
  or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-validation-proof-out-file-emission-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-validation-proof-out-file-emission-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving a ready proof-out adapter writes exactly the two public
  artifact files
- add tests proving deterministic proof JSON and issue Markdown file content
  matches the adapter payload facts
- add tests proving the target directory is created only for supported
  public-safe targets
- add tests proving missing or unready adapter facts and unsupported targets
  fail closed before writing
- add tests proving I/O failures return deterministic failure facts without
  hidden partial success
- add tests proving runtime validation, compare, LabVIEWCLI, Docker, live
  proof, package/bin publication, launcher/profile mutation, Marketplace, and
  source-copying side effects remain blocked
- implement the minimum public MIT file-emission adapter around ready proof-out
  adapter facts

Still blocked:

- runtime validation execution
- new validation fact generation
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
and Spec Kit feature for
`runtime-settings-cli-validation-proof-out-file-emission-v1`. Then run
redaction and bridge artifact validation. Only after a public preflight record
has `status: pass` may implementation of
`IAU-runtime-settings-cli-validation-proof-out-file-emission-v1` start.
