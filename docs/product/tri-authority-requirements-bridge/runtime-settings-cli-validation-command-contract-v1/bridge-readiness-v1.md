# Runtime Settings CLI Validation Command Contract Bridge Readiness

Recorded: `2026-05-19T11:41:14Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/55`

Approval proposal:
[proposal-v1.md](./proposal-v1.md)

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`runtime-settings-cli-validation-command-contract-v1` is bridge-ready for
public MIT import and Spec Kit admission planning, but implementation is not
admitted by this record.

The candidate IAU is
`IAU-runtime-settings-cli-validation-command-contract-v1`. It covers a pure
command-level contract for `vihs --validate`:

`createRuntimeSettingsValidationCommandResult(input = {})`

The contract composes already admitted settings readback, validation runtime
outcome, validation proof-artifact, proof-out adapter, and proof-out
file-emission facts into one deterministic command result. When a proof-out
target is supplied, file writing is allowed only through the already admitted
proof-out file-emission contract. `validate-plan-only` remains deferred unless
the later public admission review proves it is required for the first IAU.

This record does not admit OS inspection, runtime locator invocation, private
path discovery, runtime validation execution, compare execution, LabVIEWCLI
execution, Docker command execution or orchestration, raw terminal process
wiring, live terminal proof, package/bin publication, launcher/profile
mutation, VSIX packaging, Marketplace work, release automation, or source
copying.

## Why This Is The Next Unit

The MIT authority now has the materialized terminal entrypoint, prompt loop,
terminal I/O adapter, validation readback contract, validation proof-artifact
contract, proof-out adapter, proof-out file emission, and validation runtime
outcome fact generation. Those pieces can prove slices of `vihs --validate`,
but callers still have to assemble the command-level journey manually.

This lane defines the validation command spine before any runtime execution
lane opens. It makes the future installed-user command behavior testable as a
pure result contract while preserving the clean-room ladder:

1. read or accept public-safe persisted settings facts
2. derive runtime outcome facts from supplied public-safe selection facts
3. compose validation readback and optional proof-out facts
4. report copyable non-interactive guidance and blocked side effects
5. leave actual runtime discovery and execution for later governed lanes

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-validation-command-contract-v1` |
| Future slice ID | `runtime-settings-cli-validation-command-contract-v1` |
| Imported requirement IDs | `VHS-REQ-546` |
| Prerequisite requirement IDs | `VHS-REQ-537`, `VHS-REQ-543`, `VHS-REQ-544`, `VHS-REQ-545` |
| Supporting test ID | `TEST-UNIT-392` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `7b3d15af11df545de21501106c9b62734fb177f5` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `213bfab62614035a08f41db0cab4114a7976b5cc` |
| Approval record | work item `#54`, MR `!284`, approved `2026-05-19T04:27:37-07:00` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement ID `VHS-REQ-546`
- prerequisite references to the already implemented terminal entrypoint,
  prompt loop, terminal I/O adapter, settings write, validation readback,
  validation proof-artifact, proof-out adapter, proof-out file-emission, and
  validation runtime-outcome slices
- supporting public test expectation `TEST-UNIT-392`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command terms `vihs --validate` and `vihs --validate --proof-out <dir>`
- pure contract name `createRuntimeSettingsValidationCommandResult`
- result fields for command identity, request mode, validation status,
  persisted settings facts, runtime outcome facts, proof-out result facts,
  non-interactive guidance, blocked reason, blocked side effects, and
  requirement IDs
- command modes `validate-only`, `validate-with-proof-out-ready`, and
  `validate-blocked`
- the decision that `validate-plan-only` is deferred for the first IAU unless
  public admission review proves it is required
- corrected Docker wording: Docker provider selection means the latest
  supported NI LabVIEW image family, 64-bit-only by image/platform, with no
  user-facing Docker bitness choice
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- private proof packets or private issue templates
- raw OS-specific terminal-driver implementation details
- OS inspection, runtime locator invocation, private path discovery, or
  environment probing behavior
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
| IAU ID | `IAU-runtime-settings-cli-validation-command-contract-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-validation-command-contract-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving ready `vihs --validate` command composition
- add tests proving missing or invalid persisted settings fail closed
- add tests proving missing runtime selection facts fail before ready validation
- add tests proving unknown runtime blocked-reason fallback remains stable
- add tests proving `--proof-out <dir>` composes through exactly
  `vihs-validation-proof.json` and `vihs-validation-issue.md`
- add tests proving no proof-out target means no file writes
- add tests proving unsupported proof-out targets and I/O failures do not
  produce hidden partial success
- add tests proving non-interactive guidance is copyable and deterministic
- add tests proving OS probing, locators, runtime execution, compare,
  LabVIEWCLI, Docker, live proof, package/bin publication, launcher/profile
  mutation, Marketplace, release, and source-copying side effects remain
  blocked
- implement the minimum pure validation command-result contract

Still blocked:

- OS inspection and runtime locator invocation
- private path discovery
- runtime validation execution
- compare execution
- LabVIEWCLI execution
- Docker execution or orchestration
- raw terminal process wiring
- live terminal proof
- package/bin publication
- launcher/profile mutation
- VSIX packaging
- Marketplace work
- release automation
- source copying from GitLab or GitHub Suite
- `validate-plan-only` unless a later public admission decision explicitly
  admits it

## Next Gate

After this bridge readiness record merges, create the public MIT import packet
and Spec Kit feature for
`runtime-settings-cli-validation-command-contract-v1`. Then run redaction and
bridge artifact validation. Only after a public preflight record has
`status: pass` may implementation of
`IAU-runtime-settings-cli-validation-command-contract-v1` start.
