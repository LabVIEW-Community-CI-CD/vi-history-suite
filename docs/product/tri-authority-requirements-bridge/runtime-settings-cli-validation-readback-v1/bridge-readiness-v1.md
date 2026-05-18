# Runtime Settings CLI Validation Readback Bridge Readiness

Recorded: `2026-05-18T12:17:58Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/45`

Public MIT issue:
`https://github.com/svelderrainruiz/vi-history/issues/51`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`IAU-runtime-settings-cli-validation-readback-contract-v1` is the next
**candidate** for the MIT Spec Kit authority, but implementation is not admitted
by this record.

Create a public MIT import and Spec Kit feature for
`runtime-settings-cli-validation-readback-v1` before code starts. This is a
validation readback/result contract slice, not no-argument interactive
selection, proof-out file generation, compare execution, LabVIEWCLI execution,
Docker execution, or runtime orchestration.

## Why This Is The Next Unit

The MIT authority now has the runtime-settings prepare-command shell and the
settings-write contract. The next smallest useful command-path step is a pure
`vihs --validate` readback contract: report the persisted provider, LabVIEW
version, LabVIEW bitness, effective settings target, and bounded runtime
outcome facts without reopening provider pickers or executing a runtime.

No-argument interactive selection depends on the validation contract, but it
adds input-mode and defaulting concerns. Proof-out files add artifact-generation
concerns. Runtime execution adds environment proof concerns. Those remain
separate future IAUs.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-validation-readback-contract-v1` |
| Future slice ID | `runtime-settings-cli-validation-readback-v1` |
| Imported requirement IDs | `VHS-REQ-543`, `VHS-REQ-546` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `72c9a700da501eba23e16e3d35b385ec8d8d6808` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `d27483cbbfea0b5aa322c575c6a26f51ea1b2f56` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement IDs `VHS-REQ-543` and `VHS-REQ-546`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs --validate`
- persisted provider, LabVIEW version, and LabVIEW bitness facts
- explicit effective settings target facts
- runtime validation outcome facts such as outcome, provider, engine, blocked
  reason, error code, proof status, and implementation status
- a rule that validation readback does not reopen path-picking, image-family
  selection, or panel-side provider picking
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- no-argument interactive selection behavior
- `--proof-out` file generation
- live already-running VS Code session uptake proof
- compare execution, LabVIEWCLI execution, Docker execution, or orchestration
- VSIX packaging, Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-validation-readback-contract-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-validation-readback-v1` |
| Public issue | `svelderrainruiz/vi-history#51` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests for readback of persisted provider, LabVIEW version, and LabVIEW
  bitness facts from a governed settings object
- add tests for explicit effective settings target reporting
- add tests for runtime outcome facts without LabVIEWCLI, Docker, compare, or
  proof-out file execution
- add tests for fail-closed validation output when persisted settings are
  missing or unsupported
- implement a pure public MIT validation readback/result contract

Still blocked:

- no-argument interactive `vihs` selection and confirmation
- `--proof-out` file generation
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- live already-running VS Code session uptake proof
- VSIX packaging
- Marketplace publication
- source copying from GitLab or GitHub Suite

## Next Gate

Create the public MIT import packet and Spec Kit feature for
`runtime-settings-cli-validation-readback-v1`. Then run redaction and artifact
validation. Only after a public preflight record has `status: pass` may
implementation of `IAU-runtime-settings-cli-validation-readback-contract-v1`
start.
