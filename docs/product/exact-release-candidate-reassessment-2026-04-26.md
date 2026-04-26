# Exact Release Candidate Reassessment - 2026-04-26

## Purpose

Reassess the `1.3.10` exact-release candidate path from GitLab `develop`
commit `14243fd0ee647736124b06edb5a9947eae178d38` after the
Windows/LabVIEW community proof intake checklist was merged.

This reassessment selects the community-deferred Windows/LabVIEW claim path
because no admitted external Windows/LabVIEW proof has arrived. It does not
open a release branch, create an exact tag, mutate public GitHub, or mutate
VS Code Marketplace.

Machine-readable companion:

- `docs/product/exact-release-candidate-reassessment-2026-04-26.json`

## Verdict

| Field | Decision |
| --- | --- |
| Reassessment status | `prepared` |
| Candidate package line | `1.3.10` |
| Source branch | `develop` |
| Source commit | `14243fd0ee647736124b06edb5a9947eae178d38` |
| Source pipeline | `2480546719` / `success` |
| Selected candidate path | `community-deferred-windows-labview-claim` |
| Windows installed-user LabVIEW proof claim | not made |
| Current admissible candidate claim | Linux/Docker validated exact-candidate source with Windows/LabVIEW selectable as community/deferred |
| Release branch opening | admissible as next governed action |
| Exact release branch | not opened by this reassessment |
| Exact tag | not admitted |
| Public GitHub exact mutation | gated and not performed |
| VS Code Marketplace exact mutation | gated and not performed |

The blocked readiness assessment is converted into a release-branch-opening
candidate path only by narrowing the claim. Windows/LabVIEW provider, year,
and bitness choices may remain selectable for community validation, but this
candidate does not claim maintainer-proven Windows installed-user LabVIEW
behavior.

## Authority Snapshot

| Field | Value |
| --- | --- |
| Authority repo | `https://gitlab.com/svelderrainruiz/vi-history-suite` |
| Branch assessed | `develop` |
| Reassessed commit | `14243fd0ee647736124b06edb5a9947eae178d38` |
| Reassessed pipeline | `2480546719` / `success` |
| Reassessed pipeline URL | `https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2480546719` |
| Package version on `develop` | `1.3.10` |
| Retained exact release baseline | `v1.3.9` |
| Active Marketplace preview | `1.3.10` community-validation pre-release |
| Source blocked assessment | `docs/product/exact-release-readiness-assessment-2026-04-26.md` |
| Selected-path checklist | `docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.md` |

## Pipeline Evidence

| Stage | Job | Job ID | Status | Runner |
| --- | --- | --- | --- | --- |
| admission | `ubuntu_docker_runner_admission` | `14093348390` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| docs | `docs_link_check` | `14093348391` | `success` | GitLab SaaS Linux runner |
| docs | `docs_continuous_integration` | `14093348392` | `success` | GitLab SaaS Linux runner |
| docs | `docs_public_continuous_integration` | `14093348393` | `success` | GitLab SaaS Linux runner |
| docs | `docs_internal_continuous_integration` | `14093348394` | `success` | GitLab SaaS Linux runner |
| assurance | `assurance_release_gate` | `14093348395` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_26514_authority` | `14093348396` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_requirements_quality` | `14093348397` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_external_user_information` | `14093348398` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| assurance | `assurance_audit_packet` | `14093348399` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| test | `test_extension` | `14093348400` | `success` | GitLab SaaS Linux runner |
| test | `public_exact_pretag_proof` | `14093348401` | `success` | GitLab SaaS Linux runner |
| test | `linux_docker_provider_lane` | `14093348402` | `success` | `ghostshadow-ubuntu-linux-assurance` |
| package | `package_extension_preview` | `14093348403` | `success` | GitLab SaaS Linux runner |

No `governed_runner_admission` or `windows_private_release_acceptance` job was
created for this `develop` pipeline because `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED`
was not set to `true`.

## Candidate Source Artifact

The `develop` package artifact retained by the source pipeline is candidate
source evidence only:

- job: `14093348403`
- manifest path: `preview-evidence/preview-manifest.json`
- VSIX path: `preview-evidence/vi-history-suite-1.3.10.vsix`
- package version: `1.3.10`
- commit: `14243fd0ee647736124b06edb5a9947eae178d38`
- VSIX SHA-256:
  `afb9a78ccd4ef73f588deb8dbb0a73f1465431d3510db5d4a8a1b7a2f90b2783`
- VSIX size: `998988` bytes

This artifact proves the source commit can package the `1.3.10` preview. It
is not the selected exact release artifact. A governed `release/*` branch must
retain the selected exact authority VSIX and checksum before exact public
GitHub or Marketplace publication can be considered.

## Linux/Docker Evidence

The `linux_docker_provider_lane` job `14093348402` retained
`linux-docker-provider-lane-evidence/` with schema
`vi-history-suite/linux-docker-provider-lane@v1`.

Retained facts:

- Docker OSType: `linux`
- Docker server version: `29.4.1`
- selected provider setting: `docker`
- selected LabVIEW year: `2026`
- selected bitness: `x64`
- runtime provider: `linux-container`
- runtime engine: `labview-cli`
- runtime validation outcome: `ready`
- runtime blocked reason: `<none>`
- Windows/LabVIEW proof included: false
- Windows/LabVIEW proof state: community/deferred

## External Windows Proof Check

No admitted external Windows/LabVIEW proof was found for this reassessment:

- no `governed_runner_admission` job in pipeline `2480546719`
- no `windows_private_release_acceptance` job in pipeline `2480546719`
- no retained `windows-private-release-evidence/` receipt for `1.3.10`
- no retained `governed-runner-admission-evidence/` receipt for `1.3.10`
- no retained Windows exact VSIX install proof for a selected `1.3.10` exact
  authority VSIX
- read-only public GitHub issue queries for `community-validation`,
  `windows-labview`, `proof:reported`, `proof:reproduced`, and
  `marketplace-preview` returned no issue reports

Community reports remain admissible intake signals when they arrive, but they
do not become maintainer proof until retained through the authority proof
lanes described by the checklist.

## Selected Community-Deferred Claim

For the next exact-release candidate reassessment, the selected claim is:

> `1.3.10` is eligible for a governed release-branch opening as a
> Linux/Docker validated exact-candidate source. Windows/LabVIEW installed-user
> host and Docker Desktop combinations remain selectable for community
> validation with proof-status disclosure, but they are not claimed as
> maintainer-proven for this candidate.

This selected path satisfies the claim-boundary decision required by the
community proof intake checklist. It does not waive later exact release branch,
exact artifact, public GitHub, or Marketplace gates.

## Publication Gates

| Gate | State | Impact |
| --- | --- | --- |
| Governed release branch | not opened | next admitted action only |
| Selected exact authority VSIX | not retained | must be produced by release-branch evidence |
| Exact tag `v1.3.10` | not admitted | no tag may be cut from this reassessment |
| Public GitHub exact release | gated | must use asset-first controller after release-branch readiness closes |
| VS Code Marketplace exact release | gated | remains blocked until public GitHub exact release verification and the Marketplace exact publication gate are satisfied |
| Windows installed-user LabVIEW proof claim | not made | can be added only after admitted proof receipts arrive |
| Community-deferred Windows/LabVIEW wording | selected | must remain visible in user-facing proof-status and traceability surfaces |

## Next Admitted Actions

1. Open a governed `release/1.3.10` branch from
   `14243fd0ee647736124b06edb5a9947eae178d38` only if the community-deferred
   claim remains the selected release claim.
2. Run the release-branch pipeline and retain the selected exact authority
   VSIX, checksum, job ids, and proof-status wording.
3. Reassess exact-release readiness from the release branch before creating an
   exact tag.
4. Use the asset-first public GitHub exact-release controller only after
   release-branch readiness closes.
5. Keep VS Code Marketplace exact publication gated until public GitHub exact
   release verification and Marketplace exact publication prerequisites close.
6. If admitted Windows/LabVIEW proof arrives before release-branch closeout,
   rerun this reassessment through the Windows-proof claim path instead.

## No-Mutation Boundary

This reassessment did not mutate public GitHub or VS Code Marketplace.

Not performed:

- public GitHub source mutation
- public GitHub release creation, edit, asset upload, or tag mutation
- public GitHub wiki mutation
- VS Code Marketplace publish, unpublish, metadata, or version mutation
- exact tag creation
- release branch creation

