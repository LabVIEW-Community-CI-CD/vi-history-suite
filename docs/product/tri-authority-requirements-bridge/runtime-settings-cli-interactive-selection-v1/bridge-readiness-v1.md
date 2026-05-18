# Runtime Settings CLI Interactive Selection Bridge Readiness

Recorded: `2026-05-18T13:14:32Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/47`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`IAU-runtime-settings-cli-interactive-selection-contract-v1` is the next
**candidate** for the MIT Spec Kit authority, but implementation is not
admitted by this record.

Create a public MIT import and Spec Kit feature for
`runtime-settings-cli-interactive-selection-v1` before code starts. This is a
no-argument `vihs` interactive selection contract, not compare execution,
LabVIEWCLI execution, Docker command execution or orchestration, live-session
proof, packaging, or Marketplace publication.

## Why This Is The Next Unit

The MIT authority now has the runtime-settings prepare-command shell,
settings-write contract, validation readback contract, and validation proof
artifact contract. The next useful installed-user step is discoverability:
bare `vihs` should explain the current provider/platform/version/bitness
bundle, seed the governed default when needed, and model the supported
interactive choices.

This unit intentionally keeps interactive selection separate from compare and
runtime execution. It may reuse the already admitted validation readback
contract after settings are selected, but it must not widen into proof writing,
LabVIEWCLI command invocation, Docker orchestration, live-session proof,
packaging, or Marketplace behavior.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-interactive-selection-contract-v1` |
| Future slice ID | `runtime-settings-cli-interactive-selection-v1` |
| Imported requirement IDs | `VHS-REQ-545`, `VHS-REQ-546` |
| Supporting test IDs | `TEST-UNIT-353`, `TEST-UNIT-354` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `edb8bfaa53237a8f3b63052573d6bfe728376424` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `3a1bd72ece543d79998561b4873d74714e2f7dce` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement IDs `VHS-REQ-545` and `VHS-REQ-546`
- supporting public test expectations `TEST-UNIT-353` and `TEST-UNIT-354`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs`
- governed default selection `host/windows/2026/x86`
- public selection fields for provider, platform, LabVIEW version, and
  LabVIEW bitness
- supported host selections for LabVIEW 2025, LabVIEW 2026, and newer local
  supported host versions when the selected installation and bitness are
  present
- Docker selection constrained to `2026` / `x64`
- Linux host selection constrained to supported Linux host proof semantics,
  with `x64` only for the first public MIT contract
- exact copyable next-command guidance for non-interactive surfaces
- validation reuse after confirmation through the already public
  `vihs --validate` readback contract
- stable fail-closed reasons for unsupported years, host/platform mismatch,
  missing selected bitness, unsupported Docker bitness, unsupported Docker
  year, and not-yet-implemented paths
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- private proof packets or private issue templates
- proof-out file writing beyond the already implemented pure proof artifact
  contract
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- live already-running VS Code session uptake proof
- VSIX packaging, Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-interactive-selection-contract-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-interactive-selection-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving bare `vihs` seeds missing settings to
  `host/windows/2026/x86` and reports the current provider/platform/version/
  bitness bundle
- add tests proving Enter-through confirmation preserves the current governed
  selection and requests validation through the existing validation readback
  contract
- add tests proving guided host selection accepts supported LabVIEW 2025,
  LabVIEW 2026, and newer local host choices while failing closed for
  unsupported years or missing selected bitness
- add tests proving Docker selection remains bounded to `2026` / `x64`
- implement the minimum public MIT interactive-selection contract as pure
  selection state and output facts, without process stdin loops or runtime
  execution

Still blocked:

- terminal process wiring or raw stdin prompt loops
- proof-out file writing beyond the existing pure proof artifact contract
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- live already-running VS Code session uptake proof
- VSIX packaging
- Marketplace publication
- source copying from GitLab or GitHub Suite

## Next Gate

Create the public MIT import packet and Spec Kit feature for
`runtime-settings-cli-interactive-selection-v1`. Then run redaction and
artifact validation. Only after a public preflight record has `status: pass`
may implementation of
`IAU-runtime-settings-cli-interactive-selection-contract-v1` start.
