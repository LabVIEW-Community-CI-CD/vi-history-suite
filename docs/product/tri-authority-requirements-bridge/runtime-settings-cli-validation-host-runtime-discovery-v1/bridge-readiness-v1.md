# Runtime Settings CLI Validation Host Runtime Discovery Bridge Readiness

Recorded: `2026-05-19T15:35:49Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/59`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`runtime-settings-cli-validation-host-runtime-discovery-v1` is bridge-ready for
public MIT import and Spec Kit admission planning, but implementation is not
admitted by this record.

The candidate IAU is
`IAU-runtime-settings-cli-validation-host-runtime-discovery-v1`. It covers a
bounded host runtime discovery facts contract for `vihs --validate`:

`createRuntimeSettingsValidationHostRuntimeDiscovery(input = {})`

The contract may derive public-safe host candidate facts from bounded
documented-root and Windows registry observations, then hand those facts to the
already implemented host runtime preflight contract. It may identify whether a
supported LabVIEW executable and canonical LabVIEWCLI surface are present for
the selected provider, platform, LabVIEW version, and bitness.

This record admits only public-safe discovery facts and fail-closed discovery
classification. It does not admit raw private path disclosure, arbitrary
filesystem walking, PATH probing, environment probing, runtime validation
execution, compare execution, LabVIEWCLI execution, Docker command execution or
orchestration, raw terminal process wiring, live proof, file writes,
package/bin publication, launcher/profile mutation, VSIX packaging,
Marketplace work, release automation, or source copying.

## Why This Is The Next Unit

The MIT authority now has host runtime preflight and command composition for
supplied public-safe facts. The remaining installed-user validation gap is that
callers still need to supply host candidate facts by hand before the validation
chain can report whether the configured host bundle is actually discoverable on
the current machine.

The next smallest useful unit is not runtime execution. It is a discovery-facts
adapter: given a selected host bundle, bounded discovery dependencies, and
public documented roots or registry observations, the adapter should produce
the same public-safe candidate facts the preflight contract already consumes.

Keeping this lane separate lets the public MIT implementation cross the
Windows discovery boundary without also opening LabVIEWCLI execution, compare,
Docker, packaging, release, or Marketplace work. A later Windows proof turn can
then exercise the admitted discovery surface once, after admission and
implementation have merged.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-validation-host-runtime-discovery-v1` |
| Future slice ID | `runtime-settings-cli-validation-host-runtime-discovery-v1` |
| Imported requirement IDs | `VHS-REQ-095`, `VHS-REQ-096`, `VHS-REQ-532`, `VHS-REQ-546`, `VHS-REQ-550` |
| Prerequisite requirement IDs | `VHS-REQ-537`, `VHS-REQ-543`, `VHS-REQ-544`, `VHS-REQ-545` |
| Supporting test IDs | `TEST-UNIT-063`, `TEST-UNIT-064`, `TEST-UNIT-342`, `TEST-UNIT-354`, `TEST-UNIT-355`, `TEST-UNIT-392` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `e411ef2bfa74cedf6f9b53d764810f9f4c93a8b0` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `8c7d5ee95026f70902e31561a20c8037cc6608b3` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement IDs `VHS-REQ-095`, `VHS-REQ-096`, `VHS-REQ-532`,
  `VHS-REQ-546`, and `VHS-REQ-550`
- prerequisite references to the already implemented settings write, terminal
  entrypoint, interactive selection, terminal I/O, validation readback,
  validation runtime outcome, proof artifact, proof-out adapter,
  proof-out file-emission, validation command, validation plan-only, host
  runtime preflight, and host preflight command composition slices
- supporting public test expectations `TEST-UNIT-063`, `TEST-UNIT-064`,
  `TEST-UNIT-342`, `TEST-UNIT-354`, `TEST-UNIT-355`, and `TEST-UNIT-392`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs --validate`
- pure contract name
  `createRuntimeSettingsValidationHostRuntimeDiscovery(input = {})`
- existing preflight contract name
  `createRuntimeSettingsValidationHostRuntimePreflight(input = {})`
- selected host facts for provider, platform, LabVIEW version, and LabVIEW
  bitness
- public-safe discovery observations for documented roots, Windows registry
  views, candidate count, candidate source class, availability, LabVIEW
  executable role, LabVIEW version, LabVIEW bitness, canonical LabVIEWCLI role,
  and CLI bitness
- deterministic candidate facts that can feed the existing host runtime
  preflight contract without output-shape redesign
- fail-closed blocked reasons for missing selection, unsupported provider,
  unsupported platform, unsupported version, missing discovery dependency,
  malformed registry output, missing candidate, ambiguous candidate, missing
  LabVIEW executable, missing canonical LabVIEWCLI, incompatible bitness,
  contaminated host surface, and private-path disclosure attempts
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
- arbitrary filesystem walking
- PATH probing or environment probing
- invocation of the existing compare runtime locator as an implementation
  shortcut
- runtime validation execution
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- raw terminal process wiring or live terminal proof
- file writes
- package/bin publication, launcher/profile mutation, VSIX packaging,
  Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-validation-host-runtime-discovery-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-validation-host-runtime-discovery-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving selected host facts drive bounded documented-root
  discovery without arbitrary filesystem walking
- add tests proving Windows registry observations are normalized into
  public-safe candidate facts without retaining raw registry output or private
  paths
- add tests proving Linux documented-root discovery and macOS unavailable
  constraints stay deterministic
- add tests proving Windows `host` / `2026` / `x64` can discover LabVIEW 2026
  x64 plus the canonical installed x86 LabVIEWCLI surface as candidate facts
- add tests for missing selection, unsupported provider/platform/version,
  missing discovery dependencies, malformed observations, missing candidates,
  ambiguous candidates, incompatible candidates, and contaminated host surface
  fail-closed outcomes
- add tests proving generated host candidate facts compose into
  `createRuntimeSettingsValidationHostRuntimePreflight(input = {})` and the
  existing validation command chain without output-shape redesign
- add tests proving no runtime validation execution, compare execution,
  LabVIEWCLI execution, Docker execution, raw terminal process wiring, file
  writes, package/bin publication, launcher/profile mutation, Marketplace
  work, release automation, or source copying
- implement the minimum host runtime discovery facts contract

Still blocked:

- raw private path disclosure
- arbitrary filesystem walking
- PATH probing or environment probing
- invocation of the existing compare runtime locator as an implementation
  shortcut
- runtime validation execution
- compare execution
- LabVIEWCLI execution
- Docker execution or orchestration
- raw terminal process wiring
- live terminal proof
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
`runtime-settings-cli-validation-host-runtime-discovery-v1`. Then run redaction
and bridge artifact validation. Only after a public preflight record has
`status: pass` may implementation of
`IAU-runtime-settings-cli-validation-host-runtime-discovery-v1` start.
