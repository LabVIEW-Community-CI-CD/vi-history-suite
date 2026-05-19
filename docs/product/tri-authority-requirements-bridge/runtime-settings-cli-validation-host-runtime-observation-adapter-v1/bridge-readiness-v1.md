# Runtime Settings CLI Validation Host Runtime Observation Adapter Bridge Readiness

Recorded: `2026-05-19T16:11:07Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/60`

Public sequencing marker:
`https://github.com/svelderrainruiz/vi-history/issues/126`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`runtime-settings-cli-validation-host-runtime-observation-adapter-v1` is
bridge-ready for public MIT import and Spec Kit admission planning, but
implementation is not admitted by this record.

The candidate IAU is
`IAU-runtime-settings-cli-validation-host-runtime-observation-adapter-v1`. It
covers a bounded host runtime observation adapter for `vihs --validate`:

`createRuntimeSettingsValidationHostRuntimeObservation(input = {})`

The adapter may produce public-safe observation facts for the existing host
runtime discovery contract:

`createRuntimeSettingsValidationHostRuntimeDiscovery(input = {})`

It may normalize supplied observation dependencies into source-class
identifiers, candidate availability booleans, sanitized LabVIEW executable
role/version/bitness facts, sanitized canonical LabVIEWCLI role/bitness facts,
and deterministic blocked reasons that the existing discovery contract can
consume without retaining raw private paths or raw registry output.

This record admits only public-safe observation fact shaping and fail-closed
observation classification. It does not admit raw private path disclosure, raw
registry output retention, arbitrary filesystem walking beyond the admitted
bounded observation policy, PATH probing, environment probing, runtime
validation execution, compare execution, LabVIEWCLI execution, Docker command
execution or orchestration, raw terminal process wiring, live proof,
proof-out expansion, file writes, package/bin publication, launcher/profile
mutation, VSIX packaging, Marketplace work, release automation, or source
copying.

## Why This Is The Next Unit

The MIT authority now has host runtime discovery, host runtime preflight, and
validation command composition over public-safe facts. The Windows proof for
public issue #124 showed the admitted discovery chain can report a ready host
bundle after implementation, but the next product seam is still smaller than
runtime execution: callers need a governed way to create sanitized discovery
observations without exposing local host paths or raw registry output.

The next smallest useful unit is therefore an observation adapter. It should
sit before host runtime discovery, produce only the public-safe observation
facts that discovery already expects, and fail closed when observation facts
are missing, ambiguous, incompatible, malformed, or contaminated.

Keeping this lane separate lets the public MIT implementation advance the
installed-user validation path without opening runtime validation execution,
compare execution, LabVIEWCLI execution, Docker orchestration, terminal
process wiring, proof-out expansion, package publication, release work,
Marketplace work, or source copying.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-validation-host-runtime-observation-adapter-v1` |
| Future slice ID | `runtime-settings-cli-validation-host-runtime-observation-adapter-v1` |
| Imported requirement IDs | `VHS-REQ-095`, `VHS-REQ-096`, `VHS-REQ-532`, `VHS-REQ-546`, `VHS-REQ-550` |
| Prerequisite requirement IDs | `VHS-REQ-537`, `VHS-REQ-543`, `VHS-REQ-544`, `VHS-REQ-545` |
| Supporting test IDs | `TEST-UNIT-063`, `TEST-UNIT-064`, `TEST-UNIT-342`, `TEST-UNIT-354`, `TEST-UNIT-355`, `TEST-UNIT-392` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `4f4211edc824c92f3d9aa4c39cafa928d59c5ce3` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `79be300ef5bb5018cd2d0e18a25a2028e45feb8c` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement IDs `VHS-REQ-095`, `VHS-REQ-096`, `VHS-REQ-532`,
  `VHS-REQ-546`, and `VHS-REQ-550`
- prerequisite references to the already implemented settings write, terminal
  entrypoint, interactive selection, terminal I/O, validation readback,
  validation runtime outcome, proof artifact, proof-out adapter,
  proof-out file-emission, validation command, validation plan-only, host
  runtime preflight, host preflight command composition, and host runtime
  discovery slices
- supporting public test expectations `TEST-UNIT-063`, `TEST-UNIT-064`,
  `TEST-UNIT-342`, `TEST-UNIT-354`, `TEST-UNIT-355`, and `TEST-UNIT-392`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs --validate`
- pure contract name
  `createRuntimeSettingsValidationHostRuntimeObservation(input = {})`
- existing discovery contract name
  `createRuntimeSettingsValidationHostRuntimeDiscovery(input = {})`
- selected host facts for provider, platform, LabVIEW version, and LabVIEW
  bitness
- public source class identifiers for admitted observation sources
- candidate availability booleans and candidate count facts
- sanitized LabVIEW executable role, LabVIEW version, and LabVIEW bitness facts
- sanitized canonical LabVIEWCLI role and CLI bitness facts
- deterministic observation facts that can feed the existing host runtime
  discovery contract without output-shape redesign
- fail-closed blocked reasons for missing selection, unsupported provider,
  unsupported platform, unsupported version, missing observation dependency,
  malformed registry observation, malformed documented-root observation,
  missing candidate, ambiguous candidate, missing LabVIEW executable, missing
  canonical LabVIEWCLI, incompatible bitness, contaminated host surface, and
  private-path disclosure attempts
- the governed Windows mixed-bitness rule: Windows LabVIEW 2026 x64 may pair
  with the canonical installed x86 LabVIEWCLI surface for host validation
- corrected Docker wording as an out-of-scope reminder: Docker provider
  selection means the latest supported NI LabVIEW image family, 64-bit-only by
  image/platform, with no user-facing Docker bitness choice
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- raw registry output or exact private installed paths in retained public facts
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- private proof packets or private issue templates
- arbitrary filesystem walking beyond the admitted bounded observation policy
- PATH probing or environment probing
- invocation of the existing compare runtime locator as an implementation
  shortcut
- runtime validation execution
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- raw terminal process wiring or live terminal proof
- proof-out expansion beyond existing contracts
- file writes
- package/bin publication, launcher/profile mutation, VSIX packaging,
  Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-validation-host-runtime-observation-adapter-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-validation-host-runtime-observation-adapter-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving selected host facts drive public-safe observation shaping
  without arbitrary filesystem walking
- add tests proving registry observations are reduced to source-class and
  candidate facts without retaining raw registry output or private paths
- add tests proving documented-root observations are reduced to public-safe
  availability, executable-role, version, and bitness facts
- add tests proving Windows `host` / `2026` / `x64` can observe LabVIEW 2026
  x64 plus the canonical installed x86 LabVIEWCLI surface as sanitized facts
- add tests for missing selection, unsupported provider/platform/version,
  missing observation dependencies, malformed observations, missing
  candidates, ambiguous candidates, incompatible candidates, contaminated host
  surface, and private-path disclosure attempts
- add tests proving generated observation facts compose into
  `createRuntimeSettingsValidationHostRuntimeDiscovery(input = {})` and the
  existing validation command chain without output-shape redesign
- add tests proving no runtime validation execution, compare execution,
  LabVIEWCLI execution, Docker execution, raw terminal process wiring,
  proof-out expansion, file writes, package/bin publication,
  launcher/profile mutation, Marketplace work, release automation, or source
  copying
- implement the minimum host runtime observation facts adapter

Still blocked:

- raw private path disclosure
- raw registry output retention
- arbitrary filesystem walking beyond the admitted bounded observation policy
- PATH probing or environment probing
- invocation of the existing compare runtime locator as an implementation
  shortcut
- runtime validation execution
- compare execution
- LabVIEWCLI execution
- Docker execution or orchestration
- raw terminal process wiring
- live terminal proof
- proof-out expansion
- file writes
- package/bin publication
- launcher/profile mutation
- VSIX packaging
- Marketplace work
- release automation
- source copying from GitLab or GitHub Suite

## Next Gate

After this bridge readiness record merges, create the public MIT import packet
and Spec Kit feature for
`runtime-settings-cli-validation-host-runtime-observation-adapter-v1`. Then run
redaction and bridge artifact validation. Only after a public preflight record
has `status: pass` may implementation of
`IAU-runtime-settings-cli-validation-host-runtime-observation-adapter-v1`
start.
