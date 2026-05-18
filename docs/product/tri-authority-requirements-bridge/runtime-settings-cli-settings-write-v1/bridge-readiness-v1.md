# Runtime Settings CLI Settings-Write Bridge Readiness

Recorded: `2026-05-18T11:52:00Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/44`

Public MIT issue:
`https://github.com/svelderrainruiz/vi-history/issues/47`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`IAU-runtime-settings-cli-settings-write-contract-v1` is the next
**candidate** for the MIT Spec Kit authority, but implementation is not admitted
by this record.

Create a public MIT import and Spec Kit feature for
`runtime-settings-cli-settings-write-v1` before code starts. This is a
settings-write contract slice, not `vihs --validate`, runtime validation,
compare execution, or runtime execution.

## Why This Is The Next Unit

The MIT authority now has the command metadata, entrypoint shell, documentation
command shell, and runtime-settings prepare-command shell. The next smallest
useful command-path step is the settings-write contract: provider, LabVIEW
version, and LabVIEW bitness persistence with an explicit settings target.

Validation, live-session proof, compare execution, LabVIEWCLI execution, Docker
execution, packaging, and Marketplace publication carry different proof risks.
They remain separate future IAUs.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-settings-write-contract-v1` |
| Future slice ID | `runtime-settings-cli-settings-write-v1` |
| Imported requirement IDs | `VHS-REQ-537`, `VHS-REQ-543` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `110bf8e0a98478d141244ae0c53240e4cf93a790` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `ee6660f80d035abd8ba45572478fe9f744acd78a` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement IDs `VHS-REQ-537` and `VHS-REQ-543`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command ID `labviewViHistory.prepareLocalRuntimeSettingsCli`
- bare `vihs` terminal-surface concept
- provider, LabVIEW version, and LabVIEW bitness as governed settings facts
- explicit effective settings target
- preservation of unrelated settings content
- a rule that only `viHistorySuite.runtimeProvider`,
  `viHistorySuite.labviewVersion`, and `viHistorySuite.labviewBitness` are
  updated
- fail-closed behavior for unsupported settings target shapes
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- `vihs --validate` runtime validation behavior
- no-argument interactive selection behavior
- live already-running VS Code session uptake proof
- compare execution, LabVIEWCLI execution, Docker execution, or orchestration
- VSIX packaging, Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-settings-write-contract-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-settings-write-v1` |
| Public issue | `svelderrainruiz/vi-history#47` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests for writing only provider, LabVIEW version, and LabVIEW bitness
  facts
- add tests for preserving unrelated settings content and making the effective
  settings target explicit
- add tests for JSONC comments or trailing commas if admitted by the public spec
- implement a pure public MIT settings-write contract without runtime
  validation or command execution

Still blocked:

- `vihs --validate` runtime validation
- no-argument interactive selection
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- live already-running VS Code session uptake proof
- VSIX packaging
- Marketplace publication
- source copying from GitLab or GitHub Suite

## Next Gate

Create the public MIT import packet and Spec Kit feature for
`runtime-settings-cli-settings-write-v1`. Then run redaction and artifact
validation. Only after a public preflight record has `status: pass` may
implementation of `IAU-runtime-settings-cli-settings-write-contract-v1` start.
