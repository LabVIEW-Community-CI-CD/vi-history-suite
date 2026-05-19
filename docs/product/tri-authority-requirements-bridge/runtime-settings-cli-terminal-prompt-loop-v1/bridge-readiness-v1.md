# Runtime Settings CLI Terminal Prompt Loop Bridge Readiness

Recorded: `2026-05-19T05:44:07Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/49`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`runtime-settings-cli-terminal-prompt-loop-v1` is bridge-ready for public MIT
import and Spec Kit admission planning, but implementation is not admitted by
this record.

The candidate IAU is
`IAU-runtime-settings-cli-terminal-prompt-loop-v1`. It covers the public
contract for deterministic no-argument `vihs` prompt-loop transcript and state
behavior that binds the already implemented materialized-entrypoint and pure
interactive-selection contracts to Enter-through confirmation, guided
selection, and validation handoff.

This record does not admit OS-specific raw stdin/TTY drivers, compare
execution, LabVIEWCLI execution, Docker command execution or orchestration,
proof expansion, live-session proof, packaging, Marketplace behavior, or
source copying.

## Why This Is The Next Unit

The MIT authority now has public contracts for command activation, command
handler shells, runtime-settings preparation, settings write, validation
readback, validation proof artifacts, pure interactive selection state, and the
materialized bare `vihs` terminal entrypoint. PR #70 normalized that closeout:
the current public ledger has no active IAU after PR #68 implemented the
materialized-entrypoint work.

The next useful installed-user capability is the bounded prompt conversation
behind no-argument `vihs`: Enter-through confirmation of the current governed
bundle, guided host or Docker selection, and validation handoff after
confirmation. This is deliberately still a clean-room prompt transcript/state
contract. It should not widen into a real terminal process driver, runtime
execution, proof writing, packaging, or Marketplace behavior.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-terminal-prompt-loop-v1` |
| Future slice ID | `runtime-settings-cli-terminal-prompt-loop-v1` |
| Imported requirement IDs | `VHS-REQ-545`, `VHS-REQ-546` |
| Prerequisite requirement IDs | `VHS-REQ-537`, `VHS-REQ-544` |
| Supporting test IDs | `TEST-UNIT-353`, `TEST-UNIT-354` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `913f840a9dd23319d91d5fcf5862be9615d5b8d0` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `a61ed88a259e0cc9286c54e11b206145bc82d697` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement IDs `VHS-REQ-545` and `VHS-REQ-546`
- prerequisite references to the already admitted and implemented
  `runtime-settings-cli-terminal-entrypoint-v1` materialized-entrypoint work
- supporting public test expectations `TEST-UNIT-353` and `TEST-UNIT-354`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs`
- the governed default selection `host/windows/2026/x86`
- public selection fields for provider, platform, LabVIEW version, and
  LabVIEW bitness
- deterministic prompt transcript/state behavior for no-argument `vihs`
- Enter-through confirmation that preserves the current governed selection
- guided host selection for supported LabVIEW 2025, LabVIEW 2026, and newer
  local host choices when the selected installation and bitness are present
- Docker selection constrained to `2026` / `x64`
- validation handoff after confirmation through the already public
  `vihs --validate` readback contract
- stable fail-closed reasons for unsupported years, host/platform mismatch,
  missing selected bitness, unsupported Docker bitness, unsupported Docker
  year, unsupported Linux host paths, and not-yet-implemented paths
- exact copyable non-interactive next-command guidance
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- private proof packets or private issue templates
- OS-specific raw stdin/TTY process-driver implementation details
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- proof-out file writing beyond already admitted proof artifact contracts
- live already-running VS Code session uptake proof
- Windows PowerShell Marketplace install/bootstrap behavior
- VSIX packaging, Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-terminal-prompt-loop-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-terminal-prompt-loop-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving no-argument `vihs` produces a deterministic prompt
  transcript from the already materialized entrypoint facts
- add tests proving Enter-through confirmation preserves the current governed
  provider/platform/version/bitness bundle and requests validation handoff
- add tests proving guided host selection accepts supported local host choices
  and fails closed for unsupported years, host/platform mismatches, or missing
  selected bitness
- add tests proving Docker selection remains bounded to `2026` / `x64`
- implement the minimum public MIT terminal prompt-loop contract as pure prompt
  state and output facts, without OS terminal I/O drivers or runtime execution

Still blocked:

- OS-specific raw stdin/TTY process drivers or spawned terminal I/O handling
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- proof-out file writing beyond already admitted proof artifact contracts
- live already-running VS Code session uptake proof
- Windows PowerShell Marketplace install/bootstrap behavior
- VSIX packaging
- Marketplace publication
- source copying from GitLab or GitHub Suite

## Next Gate

Create the public MIT import packet and Spec Kit feature for
`runtime-settings-cli-terminal-prompt-loop-v1`. Then run redaction and artifact
validation. Only after a public preflight record has `status: pass` may
implementation of `IAU-runtime-settings-cli-terminal-prompt-loop-v1` start.
