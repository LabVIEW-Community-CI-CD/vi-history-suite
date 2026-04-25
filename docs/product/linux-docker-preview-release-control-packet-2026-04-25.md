# Linux/Docker Preview Release-Control Packet - 2026-04-25

## Purpose

Retain the post-merge `develop` evidence for the governed Linux/Docker
validated preview claim after Windows installed-user proof was explicitly
deferred.

This packet is release-control evidence for the GitLab authority integration
line. It does not open an exact release, tag, public GitHub production
mutation, or VS Code Marketplace publication act.

## Authority Snapshot

| Field | Value |
| --- | --- |
| Authority repo | `https://gitlab.com/svelderrainruiz/vi-history-suite` |
| Branch | `develop` |
| Merge request | `!164` - `Downgrade governed release claim to Linux/Docker preview` |
| Merge commit | `5c85f0595065d62d4b2679a3df4bb21ba749d71a` |
| Source commit | `662097ca267d70265a9f3e0300b47d08b11d2875` |
| Develop pipeline | `2479854355` |
| Develop pipeline status | `success` |
| Develop pipeline URL | `https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2479854355` |
| Current package version | `1.3.9` |
| Active release claim | Linux/Docker validated preview |
| Windows proof state | Windows installed-user proof deferred |

## Claim Boundary

| Surface | Release-Control Decision |
| --- | --- |
| Linux/Docker preview | Admitted from the successful `develop` pipeline. |
| Ubuntu runner admission | Admitted through `ubuntu_docker_runner_admission` before docs, assurance, test, and package stages. |
| Windows installed-user proof | Deferred until a real Windows/LabVIEW host retains native host and Docker Desktop Windows-container evidence. |
| Windows private release acceptance | Retained as an opt-in proof lane only when `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`. |
| Public GitHub facade | Not admitted by this packet and not mutated. |
| VS Code Marketplace | Not admitted by this packet and not mutated. |
| Exact tag or release branch | Not admitted; no SemVer release candidate is open. |

## Pipeline Evidence

| Stage | Job | Job ID | Status | Runner |
| --- | --- | --- | --- | --- |
| admission | `ubuntu_docker_runner_admission` | `14090503645` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| docs | `docs_link_check` | `14090503646` | `success` | GitLab SaaS Linux runner |
| docs | `docs_continuous_integration` | `14090503647` | `success` | GitLab SaaS Linux runner |
| docs | `docs_public_continuous_integration` | `14090503648` | `success` | GitLab SaaS Linux runner |
| docs | `docs_internal_continuous_integration` | `14090503649` | `success` | GitLab SaaS Linux runner |
| assurance | `assurance_release_gate` | `14090503650` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_26514_authority` | `14090503651` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_requirements_quality` | `14090503652` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_external_user_information` | `14090503653` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_audit_packet` | `14090503654` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| test | `test_extension` | `14090503655` | `success` | GitLab SaaS Linux runner |
| test | `public_exact_pretag_proof` | `14090503656` | `success` | GitLab SaaS Linux runner |
| package | `package_extension_preview` | `14090503657` | `success` | GitLab SaaS Linux runner |

No `governed_runner_admission` or `windows_private_release_acceptance` job was
created for this `develop` pipeline because `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED`
was not set to `true`.

## Admission Artifact Evidence

The retained Ubuntu/Docker admission artifact is:

- job: `14090503645`
- path: `governed-runner-admission-evidence/ubuntu-docker-runner-admission.json`
- schema: `vi-history-suite/ubuntu-docker-runner-admission@v2`
- claim scope: `linux-docker-validated-preview`
- generated at: `2026-04-25T21:57:19.127Z`
- runner: `ghostshadow-ubuntu-linux-assurance`
- Docker: `linux` / `29.4.1`
- Node: `v24.15.0`
- npm: `11.12.1`
- Windows/LabVIEW proof included: `false`
- Windows installed-user proof deferred: `true`
- Windows/LabVIEW proof required for this preview: `false`
- Windows/LabVIEW proof required before Windows installed-user claim: `true`

## Preview Artifact Evidence

The retained preview package artifact is:

- job: `14090503657`
- manifest path: `preview-evidence/preview-manifest.json`
- VSIX path: `preview-evidence/vi-history-suite-1.3.9.vsix`
- package version: `1.3.9`
- commit: `5c85f0595065d62d4b2679a3df4bb21ba749d71a`
- VSIX SHA-256: `7179df117c5b3c9032afbacb0b7c4a24f81229f3fbc0fd99f3ac0ed66a4c7470`
- VSIX size: `997943` bytes

This preview artifact is Linux/Docker validated only. It is not Windows
installed-user proof and it is not a Marketplace publication candidate by
itself.

## Local Standards-Review Toolchain Evidence

Before preparing this packet, the local standards-review preflight passed with
the standards corpus resolved at `/home/ghostshadow/Documents/design/standards`,
and the target repo was detected as a supported docs-workbench repo with:

- docs workbench Dockerfile:
  `docker/docs-authoring/Dockerfile`
- docs workbench guide:
  `docs/documentation-workbench.md`
- GitLab CI file:
  `.gitlab-ci.yml`
- docs gate:
  `node scripts/run-docs-gate.js`

## Deferred Proof

This packet does not cover:

- native Windows installed extension behavior
- native Windows LabVIEW host execution
- Docker Desktop Windows-container execution
- `windows_private_release_acceptance`
- `npm run test:integration:windows`
- `npm run vscode:marketplace:install-proof`
- VS Code Marketplace readback for a new publication

Those obligations remain required before any Windows installed-user proof claim
or Marketplace mutation can be made.

## Public And Marketplace Boundary

No public GitHub or Marketplace mutation was performed for this packet.

The public GitHub checkout at
`/home/ghostshadow/Public/repos/vi-history-suite-github` was inspected only and
retained its pre-existing local dirty state:

- `tests/integration/runTests.ts`
- `artifacts/`

## Release-Control Classification

- Promotion class: governed `develop` preview evidence packet
- Authority branch: `develop`
- Evidence packet branch: `feature/linux-docker-preview-release-control-packet`
- Public GitHub production mutation: not admitted
- Marketplace production mutation: not admitted
- Exact tag: not admitted
- Windows installed-user claim: not admitted
- Residual gate: retain native Windows/LabVIEW host plus Docker Desktop
  Windows-container evidence before any Windows installed-user or Marketplace
  proof claim

