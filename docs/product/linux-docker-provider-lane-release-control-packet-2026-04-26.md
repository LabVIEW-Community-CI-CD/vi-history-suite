# Linux Docker Provider Lane Release-Control Packet - 2026-04-26

## Purpose

Retain the post-merge `develop` evidence for the governed Linux Docker
Desktop/Docker Engine provider lane after MR `!174` merged the provider-lane
fixes into the GitLab authority line.

This packet is release-control evidence for the GitLab authority integration
line. It does not open an exact release, tag, public GitHub release/source
mutation, or VS Code Marketplace publication act.

## Authority Snapshot

| Field | Value |
| --- | --- |
| Authority repo | `https://gitlab.com/svelderrainruiz/vi-history-suite` |
| Branch | `develop` |
| Merge request | `!174` - `Govern Linux Docker provider lane` |
| Merge commit | `21774a91710b71c6b63629cc0cf3cf37ce9abc0a` |
| Source commit | `231d1ab05fd1ec218ce367e1a1936997cfb9fa36` |
| Develop pipeline | `2480195741` |
| Develop pipeline status | `success` |
| Develop pipeline URL | `https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2480195741` |
| Current package version | `1.3.10` |
| Active release claim | Linux/Docker validated preview |
| Windows proof state | Windows installed-user LabVIEW proof community/deferred |

## Claim Boundary

| Surface | Release-Control Decision |
| --- | --- |
| Linux Docker provider lane | Admitted through successful `linux_docker_provider_lane` job `14091891709`. |
| Ubuntu runner admission | Admitted through successful `ubuntu_docker_runner_admission` job `14091891697` before docs, assurance, test, and package stages. |
| Preview VSIX artifact | Admitted as Linux/Docker validated preview evidence only. |
| Windows installed-user LabVIEW proof | Community/deferred until native Windows installed extension, native Windows LabVIEW host, and Docker Desktop Windows-container evidence is retained. |
| Windows private release acceptance | Retained as an opt-in proof lane only when `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`. |
| Public GitHub facade | Not admitted by this packet and not mutated. |
| VS Code Marketplace | Not admitted by this packet and not mutated. |
| Exact tag or release branch | Not admitted; no exact release candidate is opened by this packet. |

## Pipeline Evidence

| Stage | Job | Job ID | Status | Runner |
| --- | --- | --- | --- | --- |
| admission | `ubuntu_docker_runner_admission` | `14091891697` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| docs | `docs_link_check` | `14091891698` | `success` | GitLab SaaS Linux runner |
| docs | `docs_continuous_integration` | `14091891699` | `success` | GitLab SaaS Linux runner |
| docs | `docs_public_continuous_integration` | `14091891700` | `success` | GitLab SaaS Linux runner |
| docs | `docs_internal_continuous_integration` | `14091891701` | `success` | GitLab SaaS Linux runner |
| assurance | `assurance_release_gate` | `14091891702` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_26514_authority` | `14091891703` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_requirements_quality` | `14091891704` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_external_user_information` | `14091891705` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_audit_packet` | `14091891706` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| test | `test_extension` | `14091891707` | `success` | GitLab SaaS Linux runner |
| test | `public_exact_pretag_proof` | `14091891708` | `success` | GitLab SaaS Linux runner |
| test | `linux_docker_provider_lane` | `14091891709` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| package | `package_extension_preview` | `14091891710` | `success` | GitLab SaaS Linux runner |

No `governed_runner_admission` or `windows_private_release_acceptance` job was
created for this `develop` pipeline because `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED`
was not set to `true`.

## Admission Artifact Evidence

The retained Ubuntu/Docker admission artifact is:

- job: `14091891697`
- path: `governed-runner-admission-evidence/ubuntu-docker-runner-admission.json`
- schema: `vi-history-suite/ubuntu-docker-runner-admission@v2`
- claim scope: `linux-docker-validated-preview`
- generated at: `2026-04-26T05:11:25.962Z`
- runner: `ghostshadow-ubuntu-linux-assurance`
- Docker: `linux` / `29.4.1`
- Node: `v24.15.0`
- npm: `11.12.1`
- Windows/LabVIEW proof included: `false`
- Windows installed-user proof deferred: `true`
- Windows/LabVIEW proof required for this preview: `false`
- Windows/LabVIEW proof required before Windows installed-user claim: `true`

## Linux Docker Provider Artifact Evidence

The retained Linux Docker provider lane artifact is:

- job: `14091891709`
- path: `linux-docker-provider-lane-evidence/linux-docker-provider-lane.json`
- schema: `vi-history-suite/linux-docker-provider-lane@v1`
- recorded at: `2026-04-26T05:13:40.368Z`
- status: `passed`
- host contract: `linux-docker-desktop-or-docker-engine`
- selected provider setting: `docker`
- LabVIEW setting: `2026` / `x64`
- Docker: `ostype=linux server=29.4.1 driver=overlayfs cgroup=systemd`
- runtime validation: `runtimeValidationOutcome=ready`
- runtime provider: `runtimeProvider=linux-container`
- runtime engine: `runtimeEngine=labview-cli`
- runtime blocked reason: `runtimeBlockedReason=<none>`
- Linux image: `nationalinstruments/labview:2026q1-linux`
- Linux image acquisition state:
  `acquisition-required-before-first-compare-run`

The lane validated the provider contract this Ubuntu/Docker machine can supply.
It does not claim native Windows installed-user LabVIEW behavior.

## Preview Artifact Evidence

The retained preview package artifact is:

- job: `14091891710`
- manifest path: `preview-evidence/preview-manifest.json`
- VSIX path: `preview-evidence/vi-history-suite-1.3.10.vsix`
- package version: `1.3.10`
- commit: `21774a91710b71c6b63629cc0cf3cf37ce9abc0a`
- VSIX SHA-256:
  `bbe08e60d3d9a0275e5f734b002d115e648ab1a75b5b2641f34d7cf9f33a2c02`
- VSIX size: `998988` bytes

This preview artifact is Linux/Docker validated only. It is not Windows
installed-user proof and this packet does not publish or republish it to the
VS Code Marketplace.

## Local Standards-Review Toolchain Evidence

Before preparing this packet, the provider-lane slice retained local and CI
evidence for the repo-owned governance path:

- `npm run test` passed after the provider-lane implementation
- `sg docker -c 'npm run docs:workbench:gate'` passed
- the repo-standards-review local dependency preflight passed
- the repo-standards-review requirements-quality check passed
- the docs workbench gate detected `docker/docs-authoring/Dockerfile` and
  `docs/documentation-workbench.md`
- `npm run branch:governance:assert` passed
- `git diff --check` passed

## Deferred Proof

This packet does not cover:

- native Windows installed extension behavior
- native Windows LabVIEW host execution
- Docker Desktop Windows-container execution
- `governed_runner_admission`
- `windows_private_release_acceptance`
- `npm run test:integration:windows`
- Windows exact VSIX installed-user proof for this preview line
- VS Code Marketplace proof as Windows proof

Those obligations remain required before any Windows installed-user LabVIEW
proof claim can be made.

## Public And Marketplace Boundary

No public GitHub or Marketplace mutation was performed for this packet.

The already published public GitHub community-validation intake and the already
published VS Code Marketplace `1.3.10` community-validation pre-release remain
separate retained publication events. This packet only records the later
GitLab authority `develop` provider-lane evidence from pipeline `2480195741`.

## Release-Control Classification

- Promotion class: governed `develop` provider-lane release-control packet
- Authority branch: `develop`
- Evidence packet branch:
  `feature/linux-docker-provider-lane-release-control-packet`
- Evidence commit: `21774a91710b71c6b63629cc0cf3cf37ce9abc0a`
- Evidence pipeline: `2480195741` / `success`
- Public GitHub mutation: not performed
- Marketplace mutation: not performed
- Exact tag: not admitted
- Windows installed-user claim: not admitted
- Residual gate: retain native Windows/LabVIEW host plus Docker Desktop
  Windows-container evidence before any Windows installed-user proof claim

