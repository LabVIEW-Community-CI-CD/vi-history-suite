# Runtime Settings CLI Validation Command Contract Proposal

Recorded: `2026-05-19T04:16:00-07:00`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/54`

Machine-readable packet:
[proposal-v1.json](./proposal-v1.json)

## Decision Requested

Approve `runtime-settings-cli-validation-command-contract-v1` as the next
governed bridge-readiness target for the public MIT `vi-history` authority.

If approved, the next MR should create a bridge-readiness packet for candidate
IAU `IAU-runtime-settings-cli-validation-command-contract-v1`. This proposal
does not admit public import, public admission, or implementation by itself.

## Approval Decision

Approved: `2026-05-19T04:27:37-07:00`

Approval outcome:

- `runtime-settings-cli-validation-command-contract-v1` is the next governed
  bridge-readiness target.
- Candidate IAU name:
  `IAU-runtime-settings-cli-validation-command-contract-v1`.
- The first bridge-readiness packet should include proof-out file emission only
  through the already admitted proof-out file-emission contract when a target is
  supplied.
- `validate-plan-only` remains deferred unless bridge review proves it is
  needed for the first IAU.
- The approval does not admit public import, public admission, MIT
  implementation, runtime execution, publication, or source copying.

## Recommended Direction

The next lane should define the command-level public contract for
`vihs --validate`:

`createRuntimeSettingsValidationCommandResult(input = {})`

The contract should compose already implemented MIT facts into one
deterministic command result:

- persisted settings facts
- supplied public-safe runtime selection facts
- `createRuntimeSettingsValidationRuntimeOutcome(input = {})`
- `readRuntimeSettingsValidation(input = {})`
- optional proof artifact, proof-out adapter, and proof-out file-emission facts
  when a proof-out target is supplied

The product promise is:

> Given public-safe settings and runtime selection facts, `vihs --validate`
> returns one deterministic validation command result and, when requested,
> proof-out write facts through already admitted proof contracts, without
> discovering or executing a runtime.

## Why This Is The Next Product Step

The MIT authority now has the pieces of the validation path, but callers still
assemble the journey manually. The latest completed lane added runtime outcome
fact generation, which removed the need for hand-written `runtimeOutcome`
objects. The next smallest useful step is to model the command-level truth
table that a future real `vihs --validate` entrypoint can call.

This lane gives the product a validation spine before opening any execution
surface. It keeps the user-facing command model coherent while preserving the
clean-room ladder:

1. shape supplied selection facts into runtime outcome facts
2. read persisted settings and validation facts
3. optionally compose proof-out facts
4. later, in separate governed lanes, wire actual terminal/bin/runtime behavior

## Proposed Slice And IAU

| Field | Proposed value |
| --- | --- |
| Future slice ID | `runtime-settings-cli-validation-command-contract-v1` |
| Candidate IAU | `IAU-runtime-settings-cli-validation-command-contract-v1` |
| Public contract name | `createRuntimeSettingsValidationCommandResult` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Requirement import basis | `VHS-REQ-546` |
| Prerequisite references | `VHS-REQ-537`, `VHS-REQ-543`, `VHS-REQ-544`, `VHS-REQ-545` |
| Supporting test signal | `TEST-UNIT-392` |
| Source baseline tag | `v1.3.16` |
| Governed proposal baseline | `263e378a3781e2122d7f850998c4c07e2786078a` |
| MIT implemented baseline observed | `213bfab62614035a08f41db0cab4114a7976b5cc` |

## Proposed Command Modes

| Mode | Behavior |
| --- | --- |
| `validate-only` | Return command identity, normalized runtime outcome facts, validation readback facts, non-interactive guidance, and blocked side-effect facts. |
| `validate-with-proof-out-ready` | Compose validation through proof artifact, proof-out adapter, and already admitted file emission when a proof-out target is supplied. |
| `validate-blocked` | Return one stable blocked command result when settings facts, runtime selection facts, runtime outcome mapping, validation readback, proof-out target, or file emission cannot proceed. |
| `validate-plan-only` | Return intended proof-out target and artifact facts without file writes when the caller asks for planning rather than emission. |

The bridge-readiness MR should decide whether `validate-plan-only` belongs in
the first IAU or remains a later refinement. The recommended default is to
include only the behavior needed to prove "no proof-out target means no file
writes" and "proof-out target means exactly the already admitted two-file write
path."

## Proposed IAU Scope

The candidate IAU should allow only:

- parsing and representing a supplied validation command request
- composing supplied settings content or settings facts into validation readback
- deriving runtime outcome facts from supplied runtime selection facts
- returning a deterministic command result for ready and blocked validation
- composing optional `--proof-out <dir>` through the already admitted proof
  artifact, proof-out adapter, and file-emission contracts
- returning copyable non-interactive guidance
- retaining requirement IDs and blocked side-effect facts

## Explicitly Blocked Scope

The proposal keeps these out of scope:

- OS inspection
- runtime locator invocation
- private path discovery
- runtime validation execution
- compare execution
- LabVIEWCLI execution
- Docker command execution or orchestration
- raw terminal process wiring
- live terminal proof
- package/bin publication
- launcher/profile mutation
- VSIX packaging
- Marketplace publication
- release automation
- source copying from GitLab or GitHub Suite

## Proposed Public-Safe Export Shape

The later bridge packet may export:

- `VHS-REQ-546`
- prerequisite references to `VHS-REQ-537`, `VHS-REQ-543`, `VHS-REQ-544`, and
  `VHS-REQ-545`
- supporting signal `TEST-UNIT-392`
- command terms `vihs --validate` and `vihs --validate --proof-out <dir>`
- contract name `createRuntimeSettingsValidationCommandResult`
- result fields for command identity, request mode, validation status,
  runtime outcome, proof-out result, guidance, blocked reason, blocked
  side-effect facts, and requirement IDs
- Marketplace-disabled posture
- corrected Docker wording: Docker provider selection means latest supported NI
  LabVIEW image family, 64-bit-only by image/platform, with no user-facing
  Docker bitness choice

The later public packet must not export private evidence roots, credentials,
local machine paths, source-copying instructions, runtime locator internals, or
implementation source.

## Proposed Tests For The Later MIT Implementation

If this proposal is approved and later admitted, the MIT implementation should
add focused tests for:

- ready `vihs --validate` command composition
- missing or invalid persisted settings failure
- missing runtime selection failure before ready validation
- unknown runtime blocked-reason fallback
- proof-out target composition into exactly `vihs-validation-proof.json` and
  `vihs-validation-issue.md`
- no proof-out target means no file writes
- unsupported proof-out target means no hidden partial success
- non-interactive copyable guidance
- blocked side effects: no OS inspection, no runtime locator, no runtime
  execution, no compare, no LabVIEWCLI, no Docker, no publication, no release,
  no Marketplace, and no source copying

## Approval Questions

Approval should answer:

1. Is `runtime-settings-cli-validation-command-contract-v1` the right next
   governed bridge lane?
2. Is `IAU-runtime-settings-cli-validation-command-contract-v1` the right IAU
   name?
3. Should the first IAU include actual proof-out file emission through the
   already admitted writer when a target is supplied?
4. Should `validate-plan-only` be included in the first IAU or deferred?
5. Are any additional governed requirement IDs needed beyond `VHS-REQ-546`
   with prerequisite references to `VHS-REQ-537`, `VHS-REQ-543`,
   `VHS-REQ-544`, and `VHS-REQ-545`?

## Recommended Approval Outcome

Approve the lane with this boundary:

- create a later bridge-readiness packet for
  `runtime-settings-cli-validation-command-contract-v1`
- keep the imported requirement slice minimal around `VHS-REQ-546`
- include proof-out file emission only through the already admitted file
  emission contract
- defer `validate-plan-only` unless bridge review proves it is needed for the
  first command contract
- keep runtime execution and publication blocked until separate governed lanes
