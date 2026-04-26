# Exact Release Readiness Assessment - 2026-04-26

## Purpose

Assess the current GitLab `develop` line for the next exact-release promotion
decision without opening a release branch, creating an exact tag, mutating
public GitHub, or mutating VS Code Marketplace.

This assessment uses the latest merged `develop` line after the Linux Docker
provider-lane release-control packet was merged. Windows installed-user
LabVIEW proof remains community/deferred because no new external Windows host
evidence exists for the `1.3.10` line.

## Verdict

| Field | Decision |
| --- | --- |
| Exact-release readiness | `blocked` |
| Current admissible claim | Linux/Docker validated preview only |
| Candidate package line | `1.3.10` |
| Exact release branch | not open |
| Exact tag | not admitted |
| Public GitHub exact mutation | not admitted and not performed |
| VS Code Marketplace exact mutation | not admitted and not performed |
| Windows installed-user LabVIEW proof | community/deferred |

The current `develop` line is healthy as a Linux/Docker validated preview and
community-validation package line. It is not ready to promote as an exact
release because the repo does not retain native Windows installed-user
LabVIEW proof for `1.3.10`.

## Authority Snapshot

| Field | Value |
| --- | --- |
| Authority repo | `https://gitlab.com/svelderrainruiz/vi-history-suite` |
| Branch assessed | `develop` |
| Assessed commit | `42d1f581874c9fad8f6dcbc96c8827bb07e3b508` |
| Assessed pipeline | `2480212103` / `success` |
| Assessed pipeline URL | `https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2480212103` |
| Package version on `develop` | `1.3.10` |
| Retained exact release baseline | `v1.3.9` |
| Retained exact release status | GitLab authority, public GitHub, and VS Code Marketplace regular release closed |
| Active Marketplace preview | `1.3.10` community-validation pre-release |

## Pipeline Evidence

| Stage | Job | Job ID | Status | Runner |
| --- | --- | --- | --- | --- |
| admission | `ubuntu_docker_runner_admission` | `14091956342` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| docs | `docs_link_check` | `14091956343` | `success` | GitLab SaaS Linux runner |
| docs | `docs_continuous_integration` | `14091956344` | `success` | GitLab SaaS Linux runner |
| docs | `docs_public_continuous_integration` | `14091956345` | `success` | GitLab SaaS Linux runner |
| docs | `docs_internal_continuous_integration` | `14091956346` | `success` | GitLab SaaS Linux runner |
| assurance | `assurance_release_gate` | `14091956347` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_26514_authority` | `14091956348` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_requirements_quality` | `14091956349` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_external_user_information` | `14091956350` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_audit_packet` | `14091956351` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| test | `test_extension` | `14091956352` | `success` | GitLab SaaS Linux runner |
| test | `public_exact_pretag_proof` | `14091956353` | `success` | GitLab SaaS Linux runner |
| test | `linux_docker_provider_lane` | `14091956354` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| package | `package_extension_preview` | `14091956355` | `success` | GitLab SaaS Linux runner |

No `governed_runner_admission` or `windows_private_release_acceptance` job was
created for this `develop` pipeline because `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED`
was not set to `true`.

## Passed Readiness Evidence

| Gate | Evidence | Decision |
| --- | --- | --- |
| GitLab `develop` pipeline | Pipeline `2480212103` on commit `42d1f581874c9fad8f6dcbc96c8827bb07e3b508` | pass |
| Ubuntu Docker runner admission | Job `14091956342`, Docker OSType `linux`, Docker `29.4.1`, Node `v24.15.0`, npm `11.12.1` | pass |
| Linux Docker provider lane | Job `14091956354`, `runtimeProvider=linux-container`, `runtimeEngine=labview-cli`, `runtimeValidationOutcome=ready`, `runtimeBlockedReason=<none>` | pass |
| Public exact pre-tag proof | Job `14091956353` | pass |
| Extension tests | Job `14091956352` | pass |
| Preview package artifact | Job `14091956355`, `preview-evidence/vi-history-suite-1.3.10.vsix`, SHA-256 `f516b8ebec261c854e9e6d048a92ce8cb6f67a04114b9da945b916e37b0621a6` | pass for preview only |
| Retained exact baseline | `v1.3.9` remains the regular exact release across GitLab authority, public GitHub, and VS Code Marketplace | pass |

## Blocking Or Deferred Evidence

| Gate | State | Exact-Release Impact |
| --- | --- | --- |
| Release branch | not open | exact release cannot proceed until a governed `release/*` branch is opened and validated |
| Exact tag | not admitted | no `v1.3.10` exact tag can be cut from this assessment |
| Windows installed-user LabVIEW proof for `1.3.10` | community/deferred | blocks any Windows installed-user proof claim for the `1.3.10` exact line |
| Native Windows installed extension behavior | missing for `1.3.10` | blocks exact Windows installed-user readiness |
| Native Windows LabVIEW host execution | missing for `1.3.10` | blocks exact Windows/LabVIEW readiness |
| Docker Desktop Windows-container execution | missing for `1.3.10` | blocks any Windows-container proof claim |
| `governed_runner_admission` | absent from pipeline `2480212103` | remains deferred until a real Windows/LabVIEW runner exists |
| `windows_private_release_acceptance` | absent from pipeline `2480212103` | remains deferred until `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true` on a capable host |
| Windows exact VSIX install proof | retained only for `v1.3.9` | must be rerun for the selected exact `1.3.10` authority VSIX before Marketplace exact promotion |
| Public GitHub exact release | not admitted | must use the asset-first exact-release controller only after exact candidate readiness closes |
| VS Code Marketplace exact release | not admitted | blocked until public GitHub exact release plus Windows exact VSIX install proof are retained |

## Artifact Evidence

The latest `develop` preview package artifact is:

- job: `14091956355`
- manifest path: `preview-evidence/preview-manifest.json`
- VSIX path: `preview-evidence/vi-history-suite-1.3.10.vsix`
- package version: `1.3.10`
- commit: `42d1f581874c9fad8f6dcbc96c8827bb07e3b508`
- VSIX SHA-256:
  `f516b8ebec261c854e9e6d048a92ce8cb6f67a04114b9da945b916e37b0621a6`
- VSIX size: `998988` bytes

This artifact is preview evidence only. It is not an exact release artifact,
not a public GitHub exact release asset, and not Windows installed-user proof.

## Deferred Windows Proof Requirements

The exact-release line remains blocked until external Windows/LabVIEW evidence
is retained for the selected exact VSIX:

- native Windows installed extension behavior
- native Windows LabVIEW host execution
- Docker Desktop Windows-container execution, if claimed
- `governed_runner_admission`
- `windows_private_release_acceptance`
- `npm run vscode:marketplace:install-proof` against the selected exact VSIX
- receipt readback into GitLab authority docs before any Windows installed-user
  or Marketplace exact claim is made

## No-Mutation Boundary

This assessment did not mutate public GitHub or VS Code Marketplace.

The already published public GitHub community-validation intake and already
published VS Code Marketplace `1.3.10` community-validation pre-release remain
separate retained publication events. They do not satisfy the exact-release
Windows installed-user proof gate.

## Next Admitted Actions

1. Keep `1.3.10` as a community-validation pre-release while external reports
   are triaged.
2. Collect external Windows/LabVIEW installed-user proof for the exact VSIX
   before any Windows installed-user claim.
3. Open a governed `release/*` branch only after the exact claim boundary is
   selected and the missing proof obligations are accepted or satisfied.
4. Use the asset-first public GitHub exact-release controller only after exact
   candidate readiness closes.
5. Run Marketplace exact publication only after public GitHub exact release
   verification and Windows exact VSIX install proof are retained.

