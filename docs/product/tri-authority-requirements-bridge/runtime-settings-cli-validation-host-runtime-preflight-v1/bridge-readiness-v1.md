# Runtime Settings CLI Validation Host Runtime Preflight Bridge Readiness

Recorded: `2026-05-19T13:54:50Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/57`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`runtime-settings-cli-validation-host-runtime-preflight-v1` is bridge-ready
for public MIT import and Spec Kit admission planning, but implementation is
not admitted by this record.

The candidate IAU is
`IAU-runtime-settings-cli-validation-host-runtime-preflight-v1`. It covers a
pure host runtime preflight facts contract for `vihs --validate`:

`createRuntimeSettingsValidationHostRuntimePreflight(input = {})`

The contract receives already-produced, public-safe persisted selection facts
and supplied host candidate facts, then returns deterministic ready or blocked
runtime selection facts for the existing validation runtime outcome, readback,
proof-artifact, proof-out adapter, file-emission, and plan-only contracts.

This record admits only fact normalization and fail-closed host preflight
rules. It does not admit OS scanning, private path discovery, runtime locator
invocation, runtime validation execution, compare execution, LabVIEWCLI
execution, Docker command execution or orchestration, raw terminal process
wiring, live proof, file writes, package/bin publication, launcher/profile
mutation, VSIX packaging, Marketplace work, release automation, or source
copying.

## Why This Is The Next Unit

The MIT authority now has the complete non-mutating validation command chain:
readback, runtime outcome, proof artifact, proof-out adapter, file emission,
command composition, and non-writing plan-only facts. The remaining validation
gap is that callers still need to hand-write runtime outcome facts.

The next useful clean-room unit is a host runtime preflight facts adapter. It
is smaller than a real host locator because it accepts supplied public-safe
candidate facts instead of inspecting the current machine. It is also smaller
than runtime validation because it never starts LabVIEWCLI or compare work.

Keeping this lane separate lets the public MIT implementation prove the
governed Windows mixed-bitness host rule: a requested `host` / `2026` / `x64`
bundle can be ready when the supplied host candidate is LabVIEW 2026 x64 plus
the canonical installed x86 LabVIEWCLI surface. That rule must not be confused
with Docker image selection or a user-facing Docker bitness choice.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-validation-host-runtime-preflight-v1` |
| Future slice ID | `runtime-settings-cli-validation-host-runtime-preflight-v1` |
| Imported requirement IDs | `VHS-REQ-532`, `VHS-REQ-546`, `VHS-REQ-550` |
| Prerequisite requirement IDs | `VHS-REQ-537`, `VHS-REQ-543`, `VHS-REQ-544`, `VHS-REQ-545` |
| Supporting test IDs | `TEST-UNIT-342`, `TEST-UNIT-354`, `TEST-UNIT-355`, `TEST-UNIT-392` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `331b6eab04068299b85405d36bf0ba033dbd9b26` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `d7035f8a6476ab196891254f9432945bd690b7c8` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement IDs `VHS-REQ-532`, `VHS-REQ-546`, and `VHS-REQ-550`
- prerequisite references to the already implemented settings write, terminal
  entrypoint, interactive selection, terminal I/O, validation readback,
  validation runtime outcome, proof artifact, proof-out adapter, proof-out
  file-emission, validation command, and validation plan-only slices
- supporting public test expectations `TEST-UNIT-342`, `TEST-UNIT-354`,
  `TEST-UNIT-355`, and `TEST-UNIT-392`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs --validate`
- pure contract name
  `createRuntimeSettingsValidationHostRuntimePreflight(input = {})`
- supplied selection facts for provider, platform, LabVIEW version, and
  LabVIEW bitness
- supplied host candidate facts that identify public roles such as
  `labview-executable` and `canonical-labview-cli`, candidate version,
  candidate bitness, CLI bitness, candidate count, and availability
- deterministic ready runtime selection facts for the existing runtime outcome
  contract: provider `host-native`, engine `labview-cli`, and no blocked reason
- deterministic fail-closed blocked reasons for missing selection,
  non-host provider, missing host candidates, ambiguous candidates, LabVIEW
  version mismatch, LabVIEW bitness mismatch, missing LabVIEW executable,
  missing canonical LabVIEWCLI, and contaminated host surfaces
- the governed Windows mixed-bitness rule: Windows LabVIEW 2026 x64 may pair
  with the canonical installed x86 LabVIEWCLI surface for host validation
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
- file writes
- live already-running VS Code session uptake proof or live terminal proof
- package/bin publication, launcher/profile mutation, VSIX packaging,
  Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-validation-host-runtime-preflight-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-validation-host-runtime-preflight-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests for accepted host persisted selection facts and supplied host
  candidate facts
- add tests that Windows `host` / `2026` / `x64` accepts LabVIEW 2026 x64
  plus the canonical installed x86 LabVIEWCLI surface
- add tests for missing selection, unsupported provider, missing candidate,
  ambiguous candidate, version mismatch, bitness mismatch, missing LabVIEW
  executable, missing canonical LabVIEWCLI, and contaminated host surface
  fail-closed outcomes
- add tests proving the adapter returns runtime selection facts consumable by
  `createRuntimeSettingsValidationRuntimeOutcome`
- add tests proving composition into validation readback, proof artifact,
  proof-out adapter, file emission, and plan-only command results without
  redesigning those output shapes
- add tests proving the adapter performs no OS scan, runtime locator
  invocation, private path discovery, LabVIEWCLI execution, Docker execution,
  compare execution, file writes, package/bin publication, Marketplace work, or
  source copying
- implement the minimum host runtime preflight fact adapter

Still blocked:

- OS scanning or private path discovery
- runtime locator invocation
- runtime validation execution
- compare execution
- LabVIEWCLI execution
- Docker execution or orchestration
- raw terminal process wiring
- live terminal proof
- file writes by the preflight adapter
- package/bin publication
- launcher/profile mutation
- VSIX packaging
- Marketplace work
- release automation
- source copying from GitLab or GitHub Suite

## Next Gate

After this bridge readiness record merges, create the public MIT import packet
and Spec Kit feature for
`runtime-settings-cli-validation-host-runtime-preflight-v1`. Then run redaction
and bridge artifact validation. Only after a public preflight record has
`status: pass` may implementation of
`IAU-runtime-settings-cli-validation-host-runtime-preflight-v1` start.
