# Runtime Settings CLI Terminal Entrypoint Bridge Readiness

Recorded: `2026-05-18T13:56:30Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/48`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`runtime-settings-cli-terminal-entrypoint-v1` is bridge-ready for public MIT
import and Spec Kit admission planning, but implementation is not admitted by
this record.

The first candidate IAU is
`IAU-runtime-settings-cli-terminal-entrypoint-materialization-v1`. It covers
the public contract for a materialized bare `vihs` terminal entrypoint, runtime
lookup/recovery facts, and user-scope admission state. It does not admit raw
terminal prompt loops, compare execution, LabVIEWCLI execution, Docker command
execution, proof expansion, packaging, Marketplace behavior, or source copying.

## Why This Is The Next Unit

The MIT authority now has public contracts for command activation, command
handler shells, runtime-settings preparation, settings write, validation
readback, validation proof artifacts, and pure interactive selection state. The
next useful installed-user capability is making the terminal entrypoint itself
explicit: what gets materialized, what runtime it intends to use, how supported
terminal sessions are admitted, and how stale or missing launchers fail closed.

This is deliberately split from the full no-argument prompt loop. A process
prompt loop adds stdin/TTY behavior and confirmation flow risk. The terminal
entrypoint shell should be admitted first so the later prompt-loop IAU has a
stable public command surface to build on.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-terminal-entrypoint-materialization-v1` |
| Later IAU | `IAU-runtime-settings-cli-terminal-prompt-loop-v1` |
| Future slice ID | `runtime-settings-cli-terminal-entrypoint-v1` |
| Imported requirement IDs | `VHS-REQ-537`, `VHS-REQ-544`, `VHS-REQ-545`, `VHS-REQ-546` |
| Supporting test IDs | `TEST-UNIT-345`, `TEST-UNIT-352`, `TEST-UNIT-353`, `TEST-UNIT-354`, `TEST-INTEG-009`, `TEST-INTEG-010`, `TEST-INTEG-011` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `3716d35a7ba57031464a81902f37862128f53681` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `baa6048b0d918c829e4b64372d71130d8fb38de7` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement IDs `VHS-REQ-537`, `VHS-REQ-544`, `VHS-REQ-545`, and
  `VHS-REQ-546`
- supporting public test expectations for terminal entrypoint materialization,
  runtime recovery, no-argument discoverability, and validation handoff
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs`
- user-scope terminal entrypoint admission facts for supported installed-user
  shells
- rules that no hidden path reconstruction, manual shell-profile editing,
  admin elevation, machine-wide install doctrine, or prebuilt external CLI
  payload is required
- runtime lookup order facts, including standard VS Code runtime on Windows
  before global Node fallback or explicit override
- stale or missing launcher recovery guidance through the governed repair or
  refresh path
- no-argument discoverability fields that may print the current
  provider/platform/LabVIEW version/LabVIEW bitness bundle and exact copyable
  next commands
- validation handoff semantics for a later prompt-loop IAU, reusing the
  existing public `vihs --validate` contract
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- private proof packets or private issue templates
- raw prompt-loop stdin handling before a later IAU
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- live already-running VS Code session uptake proof
- Windows PowerShell Marketplace install/bootstrap behavior
- VSIX packaging, Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-terminal-entrypoint-materialization-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-terminal-entrypoint-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving a materialized `vihs` terminal entrypoint is represented
  without requiring hidden-path reconstruction, profile editing, admin
  elevation, machine-wide install doctrine, or a prebuilt external CLI payload
- add tests proving supported terminal-session admission records stay
  user-scoped and expose the intended entrypoint state
- add tests proving runtime lookup and recovery facts prefer the standard VS
  Code runtime on Windows before global Node fallback or explicit override
- add tests proving stale or missing launchers fail closed with one stable
  actionable recovery instruction
- implement the minimum public MIT materialized-entrypoint contract as pure
  command-surface facts and command plans, without invoking a runtime process

Still blocked:

- raw terminal prompt loops and stdin/TTY handling
- no-argument confirmation flow beyond already implemented pure selection-state
  facts
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- proof-out file writing beyond already admitted proof artifact contracts
- live already-running VS Code session uptake proof
- Windows PowerShell Marketplace install/bootstrap behavior
- VSIX packaging
- Marketplace publication
- source copying from GitLab or GitHub Suite

## Later IAU

After the materialized-entrypoint IAU is imported, admitted, implemented, and
closed, the bridge may admit
`IAU-runtime-settings-cli-terminal-prompt-loop-v1`. That later unit may bind
the already public pure interactive-selection contract to process-level
no-argument `vihs` prompt behavior, Enter-through confirmation, guided
selection, and validation handoff. It must still keep compare execution,
LabVIEWCLI execution, Docker orchestration, packaging, and Marketplace behavior
separate.

## Next Gate

Create the public MIT import packet and Spec Kit feature for
`runtime-settings-cli-terminal-entrypoint-v1`. Then run redaction and artifact
validation. Only after a public preflight record has `status: pass` may
implementation of
`IAU-runtime-settings-cli-terminal-entrypoint-materialization-v1` start.
