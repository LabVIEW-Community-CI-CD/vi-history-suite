# Runtime Settings CLI Validation Host Preflight Command Composition Bridge Readiness

Recorded: `2026-05-19T14:43:38Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/58`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`runtime-settings-cli-validation-host-preflight-command-composition-v1` is
bridge-ready for public MIT import and Spec Kit admission planning, but
implementation is not admitted by this record.

The candidate IAU is
`IAU-runtime-settings-cli-validation-host-preflight-command-composition-v1`. It
covers a narrow command-composition increment for `vihs --validate`:

`createRuntimeSettingsValidationCommandResult(input = {})`

The command contract may consume already-admitted host runtime preflight facts
or supplied public-safe host selection/candidate facts, compose them through
`createRuntimeSettingsValidationHostRuntimePreflight(input = {})`, and then use
the resulting runtime selection facts with the existing validation runtime
outcome, readback, proof-artifact, proof-out adapter, proof-out file-emission,
and validate-plan-only contracts.

This record admits only command-level composition over supplied public-safe
facts and already implemented contracts. It does not admit OS scanning, private
path discovery, runtime locator invocation, runtime validation execution,
compare execution, LabVIEWCLI execution, Docker command execution or
orchestration, raw terminal process wiring, live proof, package/bin
publication, launcher/profile mutation, VSIX packaging, Marketplace work,
release automation, or source copying.

## Why This Is The Next Unit

The MIT authority now has a pure host runtime preflight adapter and a complete
validation command chain. The command-result contract still requires callers to
thread `preflight.runtimeSelection` into `runtimeSelection` themselves. That is
awkward for the installed-user validation path and keeps the product one step
away from a clean no-argument or `vihs --validate` validation composition.

The next smallest useful unit is not OS discovery or runtime execution. It is a
pure command-composition bridge: given the same public-safe facts the preflight
adapter already accepts, the command-result contract should generate the
runtime outcome and continue through the admitted validation chain without
redesigning output shapes.

Keeping this lane separate preserves the public boundary:
`VHS-REQ-532` and `VHS-REQ-550` remain already-satisfied host preflight
prerequisites, while this slice imports only the governed validation command
behavior from `VHS-REQ-546`.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-validation-host-preflight-command-composition-v1` |
| Future slice ID | `runtime-settings-cli-validation-host-preflight-command-composition-v1` |
| Imported requirement IDs | `VHS-REQ-546` |
| Prerequisite requirement IDs | `VHS-REQ-532`, `VHS-REQ-537`, `VHS-REQ-543`, `VHS-REQ-544`, `VHS-REQ-545`, `VHS-REQ-550` |
| Supporting test IDs | `TEST-UNIT-342`, `TEST-UNIT-354`, `TEST-UNIT-355`, `TEST-UNIT-392` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `b5ed9e5a77a096c342fc74c42e3e901d6bad041f` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `16273d184ab46ec3a3b69ae1bb242d244f7d7163` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement ID `VHS-REQ-546`
- prerequisite references to the already implemented settings write, terminal
  entrypoint, interactive selection, terminal I/O, validation readback,
  validation runtime outcome, proof artifact, proof-out adapter, proof-out
  file-emission, validation command, validation plan-only, and host runtime
  preflight slices
- supporting public test expectations `TEST-UNIT-342`, `TEST-UNIT-354`,
  `TEST-UNIT-355`, and `TEST-UNIT-392`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command terms `vihs --validate`, `vihs --validate --proof-out <dir>`, and
  validate-plan-only request mode
- existing contract names
  `createRuntimeSettingsValidationCommandResult(input = {})` and
  `createRuntimeSettingsValidationHostRuntimePreflight(input = {})`
- supplied public-safe host selection and candidate facts already admitted by
  the host runtime preflight slice
- ready command composition facts showing that host preflight runtime selection
  facts feed runtime outcome, validation readback, proof artifact, proof-out
  adapter, file-emission, and validate-plan-only outputs without output-shape
  redesign
- blocked command composition facts when host preflight is missing, unavailable,
  ambiguous, incompatible, contaminated, or malformed
- the governed Windows mixed-bitness prerequisite wording: Windows LabVIEW
  2026 x64 may pair with the canonical installed x86 LabVIEWCLI surface when
  supplied as the admitted host candidate
- corrected Docker wording as an out-of-scope reminder: Docker provider
  selection means the latest supported NI LabVIEW image family, 64-bit-only by
  image/platform, with no user-facing Docker bitness choice
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- private proof packets or private issue templates
- raw OS scanner implementation details
- runtime locator invocation, filesystem walking, registry probing, PATH
  probing, environment probing, or private path discovery
- runtime validation execution
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- raw terminal process wiring or live terminal proof
- package/bin publication, launcher/profile mutation, VSIX packaging,
  Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-validation-host-preflight-command-composition-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-validation-host-preflight-command-composition-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving command result consumes a ready host runtime preflight
  result when `runtimeSelection` is not supplied separately
- add tests proving command result can compose supplied public-safe host
  selection/candidate facts through the host runtime preflight adapter
- add tests proving blocked host preflight facts fail closed through the
  command result with stable runtime outcome and validation facts
- add tests proving `validate-only`, `validate-with-proof-out-ready`, and
  `validate-plan-only` continue to use existing output shapes
- add tests proving proof-out file writes occur only through the already
  admitted command/file-emission path and never from host preflight itself
- add tests proving no OS scan, runtime locator invocation, private path
  discovery, runtime execution, compare execution, LabVIEWCLI execution,
  Docker execution, raw terminal process wiring, publication, Marketplace
  work, release automation, launcher/profile mutation, or source copying
- implement the minimum command-composition branch in
  `createRuntimeSettingsValidationCommandResult(input = {})`

Still blocked:

- OS scanning or private path discovery
- runtime locator invocation
- runtime validation execution
- compare execution
- LabVIEWCLI execution
- Docker execution or orchestration
- raw terminal process wiring
- live terminal proof
- file writes from the host preflight adapter
- package/bin publication
- launcher/profile mutation
- VSIX packaging
- Marketplace work
- release automation
- source copying from GitLab or GitHub Suite

## Next Gate

After this bridge readiness record merges, create the public MIT import packet
and Spec Kit feature for
`runtime-settings-cli-validation-host-preflight-command-composition-v1`. Then
run redaction and bridge artifact validation. Only after a public preflight
record has `status: pass` may implementation of
`IAU-runtime-settings-cli-validation-host-preflight-command-composition-v1`
start.
