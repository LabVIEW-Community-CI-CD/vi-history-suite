# Runtime Settings CLI Terminal I/O Adapter Bridge Readiness

Recorded: `2026-05-19T08:44:50Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/50`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`runtime-settings-cli-terminal-io-adapter-v1` is bridge-ready for public MIT
import and Spec Kit admission planning, but implementation is not admitted by
this record.

The candidate IAU is
`IAU-runtime-settings-cli-terminal-io-adapter-v1`. It covers the public
terminal session adapter around the already admitted `vihs` terminal
entrypoint and implemented pure prompt-loop contract. The unit may adapt
terminal-session facts into Enter-through confirmation, guided host selection,
Docker provider selection, non-interactive copyable guidance, EOF/cancel
handling, and validation handoff facts.

This record does not admit compare execution, LabVIEWCLI execution, Docker
command execution or orchestration, proof-out expansion, live-session proof,
package/bin publication, launcher/profile mutation, Marketplace work, or
source copying.

## Why This Is The Next Unit

The MIT authority now has the materialized terminal entrypoint, the pure
interactive-selection contract, and the pure terminal prompt-loop contract.
PR #76 also corrected the public wording so Docker is not presented as a
user-facing `2026` / `x64` bitness choice.

The next useful installed-user capability is the narrow adapter between a
terminal session and that pure prompt-loop contract. The adapter should be
testable without raw OS TTY wiring: inputs are terminal/session facts and
prompt-line outcomes; outputs are transcript lines, selected bundle facts,
non-interactive guidance, fail-closed reasons, and validation handoff facts.

Docker provider selection must use the latest supported NI LabVIEW Docker image
family. The current Docker Hub source check lists
`nationalinstruments/labview:latest-linux` and
`nationalinstruments/labview:2026q1patch2-linux` as `linux/amd64`, and
`nationalinstruments/labview:latest-windows` and
`nationalinstruments/labview:2026q1patch2-windows` as `windows/amd64`.
Therefore Docker is 64-bit-only by image/platform; the adapter must not expose
a separate Docker bitness prompt or command choice.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-terminal-io-adapter-v1` |
| Future slice ID | `runtime-settings-cli-terminal-io-adapter-v1` |
| Imported requirement IDs | `VHS-REQ-545`, `VHS-REQ-546` |
| Prerequisite requirement IDs | `VHS-REQ-537`, `VHS-REQ-544` |
| Supporting test IDs | `TEST-UNIT-353`, `TEST-UNIT-354` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `bb795ace470bcb17d9436fd34c59344077c37777` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `07383b619777bd0134175971d110701fd5aee841` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement IDs `VHS-REQ-545` and `VHS-REQ-546`
- prerequisite references to the already admitted and implemented
  `runtime-settings-cli-terminal-entrypoint-v1` and
  `runtime-settings-cli-terminal-prompt-loop-v1` work
- supporting public test expectations `TEST-UNIT-353` and `TEST-UNIT-354`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs`
- deterministic terminal-session adapter facts for no-argument `vihs`
- interactive Enter confirmation modeled through supplied prompt-line facts
- guided host selection for supported LabVIEW 2025, LabVIEW 2026, and newer
  local host choices when the selected installation and bitness are present
- Docker provider selection through the latest supported NI LabVIEW Docker image
  family, with the current Linux default mapping to LabVIEW 2026
- the fact that NI LabVIEW Docker images are 64-bit-only by image/platform and
  do not expose a user-facing Docker bitness choice
- non-interactive copyable guidance instead of a hanging prompt
- EOF/cancel and unsupported-input fail-closed behavior
- validation handoff facts through the already public `vihs --validate`
  readback contract
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- private proof packets or private issue templates
- raw OS-specific stdin/TTY process-driver implementation details
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- proof-out file writing beyond already admitted proof artifact contracts
- live already-running VS Code session uptake proof
- package/bin publication, launcher/profile mutation, Marketplace publication,
  or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-terminal-io-adapter-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-terminal-io-adapter-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving Enter confirmation is adapted from terminal input into the
  existing prompt-loop validation handoff
- add tests proving guided host selection feeds the already admitted host
  selection contract
- add tests proving Docker provider selection uses the latest supported NI
  LabVIEW Docker image family without a Docker bitness prompt
- add tests proving non-TTY sessions return copyable guidance instead of
  prompting
- add tests proving unsupported input, EOF, and cancel fail closed without
  side effects
- implement the minimum public MIT terminal I/O adapter as pure session/input
  facts around the existing prompt-loop contract

Still blocked:

- compare execution
- LabVIEWCLI execution
- Docker execution or orchestration
- proof-out expansion
- live-session proof
- package/bin publication
- launcher/profile mutation
- Marketplace work
- source copying from GitLab or GitHub Suite

## Next Gate

After this bridge readiness record merges, create the public MIT import packet
and Spec Kit feature for `runtime-settings-cli-terminal-io-adapter-v1`. Then
run redaction and bridge artifact validation. Only after a public preflight
record has `status: pass` may implementation of
`IAU-runtime-settings-cli-terminal-io-adapter-v1` start.
