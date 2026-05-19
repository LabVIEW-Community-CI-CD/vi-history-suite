# Runtime Settings CLI Validation Plan-Only Bridge Readiness

Recorded: `2026-05-19T12:58:59Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/56`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`runtime-settings-cli-validation-plan-only-v1` is bridge-ready for public MIT
import and Spec Kit admission planning, but implementation is not admitted by
this record.

The candidate IAU is
`IAU-runtime-settings-cli-validation-plan-only-v1`. It covers a pure
`validate-plan-only` request mode for `vihs --validate` over the already
implemented validation command contract:

`createRuntimeSettingsValidationCommandResult(input = {})`

The plan-only mode returns deterministic proof-out target and artifact plan
facts from already admitted validation readback, runtime outcome,
proof-artifact, and proof-out adapter contracts. It must not write proof files.
It must not invoke runtime locators, inspect the OS, discover private paths, or
execute validation.

This record does not admit runtime locator invocation, OS inspection, private
path discovery, runtime validation execution, compare execution, LabVIEWCLI
execution, Docker command execution or orchestration, raw terminal process
wiring, live terminal proof, package/bin publication, launcher/profile
mutation, VSIX packaging, Marketplace work, release automation, or source
copying.

## Why This Is The Next Unit

The MIT authority now has a complete pure validation command contract for
`vihs --validate` and `--proof-out <dir>` composition. The prior bridge
explicitly deferred `validate-plan-only` so the first implementation could
close the command spine without widening scope.

The next useful step is the smallest remaining pure command-result behavior:
let a caller ask for proof-out planning facts without file emission. This keeps
the chain non-mutating and testable before any runtime locator, OS probing,
execution, terminal/bin, or release lane opens.

Keeping this lane separate prevents a planning request from quietly becoming
runtime discovery, validation execution, proof writing, CLI process wiring, or
publication work.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-validation-plan-only-v1` |
| Future slice ID | `runtime-settings-cli-validation-plan-only-v1` |
| Imported requirement IDs | `VHS-REQ-546` |
| Prerequisite requirement IDs | `VHS-REQ-537`, `VHS-REQ-543`, `VHS-REQ-544`, `VHS-REQ-545` |
| Supporting test ID | `TEST-UNIT-392` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `93177a013b5294c0e05745f5af67b866e9b15568` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `be3afc802922e94e70502a546867ee60251bed81` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement ID `VHS-REQ-546`
- prerequisite references to the already implemented settings write,
  validation readback, validation runtime outcome, validation proof-artifact,
  proof-out adapter, proof-out file-emission, and validation command-contract
  slices
- supporting public test expectation `TEST-UNIT-392`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs --validate`
- option term `--proof-out <dir>` as an already admitted proof-out target
  shape
- request mode `validate-plan-only`
- pure contract name `createRuntimeSettingsValidationCommandResult`
- proof-out target facts, artifact file facts, proof JSON facts, issue
  Markdown facts, non-interactive guidance, blocked reason, blocked side
  effects, and requirement IDs
- the decision that plan-only is a non-writing mode over existing adapter
  facts, not a terminal/bin publication or runtime execution feature
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
- file writes for the plan-only mode
- live already-running VS Code session uptake proof or live terminal proof
- package/bin publication, launcher/profile mutation, VSIX packaging,
  Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-validation-plan-only-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-validation-plan-only-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving `validate-plan-only` is accepted only as a bounded request
  mode over `vihs --validate`
- add tests proving plan-only requires ready validation facts and a supported
  proof-out target
- add tests proving plan-only composes through the existing proof artifact and
  proof-out adapter contracts without calling the file-emission writer
- add tests proving plan-only returns exactly the planned
  `vihs-validation-proof.json` and `vihs-validation-issue.md` artifact facts
- add tests proving no file writes occur and file-system adapters are not
  called
- add tests proving missing validation facts, unsupported proof-out targets,
  and malformed inputs fail closed without hidden success
- add tests proving deterministic non-interactive guidance and blocked side
  effects
- implement the minimum plan-only branch in the existing validation command
  result contract

Still blocked:

- runtime locator invocation
- OS inspection or private path discovery
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

## Next Gate

After this bridge readiness record merges, create the public MIT import packet
and Spec Kit feature for `runtime-settings-cli-validation-plan-only-v1`. Then
run redaction and bridge artifact validation. Only after a public preflight
record has `status: pass` may implementation of
`IAU-runtime-settings-cli-validation-plan-only-v1` start.
