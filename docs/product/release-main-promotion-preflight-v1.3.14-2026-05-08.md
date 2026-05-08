# Release Main Promotion Preflight v1.3.14 - 2026-05-08

## Purpose

Prepare the governed `release/1.3.14` to `main` promotion path after the
release-branch readiness reassessment was retained on protected `develop`.

This preflight determines the next governed action only. It does not open a
release-to-main merge request, merge `release/1.3.14` to `main`, create an
exact tag, publish a public GitHub release, mutate VS Code Marketplace, admit
Windows Docker Desktop Windows-container proof, or delete the release branch.

## Verdict

| Field | Decision |
| --- | --- |
| Main-promotion preflight | `protected-main-promotion-merge-request-opening-admissible` |
| Source branch | `release/1.3.14` |
| Source commit | `50bec3391ea823739c2e8baddb33b77c283a37eb` |
| Source branch pipeline | `2511168302` / `success` |
| Target branch | `main` |
| Target commit | `2f86063a35926fa67963af5ccd47e971157927c6` |
| Main ancestry | `main` is an ancestor of `release/1.3.14` |
| Protected develop retention commit | `3557031442cbf85641544e07f9d75af59fe092d7` |
| Protected develop retention pipeline | `2511333533` / `success` |
| Release-readiness MR | `!196` / merged |
| Open release-to-main MR | none at inspection time |
| Exact tag | not admitted before protected `main` promotion and green `main` pipeline |
| Public GitHub exact mutation | not admitted and not performed |
| VS Code Marketplace exact mutation | not admitted and not performed |
| Windows Docker Desktop Windows-container proof | community/deferred |
| Release branch deletion | not admitted |

The next governed action may open a protected merge request from
`release/1.3.14` to `main`, with source-branch deletion disabled. The merge
itself remains a later protected action after that MR is opened and green.

## Source And Target Topology

- `origin/main`: `2f86063a35926fa67963af5ccd47e971157927c6`
- `origin/release/1.3.14`:
  `50bec3391ea823739c2e8baddb33b77c283a37eb`
- `origin/develop`: `3557031442cbf85641544e07f9d75af59fe092d7`
- `git merge-base origin/main origin/release/1.3.14`:
  `2f86063a35926fa67963af5ccd47e971157927c6`
- `git merge-base origin/release/1.3.14 origin/develop`:
  `50bec3391ea823739c2e8baddb33b77c283a37eb`

This means the retained release branch is ahead of `main`, and the protected
`develop` line retains the release branch plus later governance packets. The
release-to-main promotion candidate is therefore structurally clean, while the
governance packets remain retained on `develop` as the control-plane evidence.

## Release Branch Evidence

| Stage | Job | Job ID | Status |
| --- | --- | --- | --- |
| admission | `ubuntu_docker_runner_admission` | `14284865636` | `success` |
| docs | `docs_link_check` | `14284865637` | `success` |
| docs | `docs_continuous_integration` | `14284865638` | `success` |
| docs | `docs_public_continuous_integration` | `14284865639` | `success` |
| docs | `docs_internal_continuous_integration` | `14284865640` | `success` |
| assurance | `assurance_release_gate` | `14284865641` | `success` |
| assurance | `assurance_26514_authority` | `14284865642` | `success` |
| assurance | `assurance_requirements_quality` | `14284865643` | `success` |
| assurance | `assurance_external_user_information` | `14284865644` | `success` |
| assurance | `assurance_audit_packet` | `14284865645` | `success` |
| test | `test_extension` | `14284865646` | `success` |
| test | `public_exact_pretag_proof` | `14284865647` | `success` |
| test | `linux_docker_provider_lane` | `14284865648` | `success` |
| test | `vagrant_windows_vsix_acceptance` | `14284865649` | `success` |
| package | `package_extension_preview` | `14284865650` | `success` |

Release branch preview artifact:

- VSIX path: `preview-evidence/vi-history-suite-1.3.14.vsix`
- VSIX SHA-256:
  `d5208f9092bd7e3c7b7c075c91fc8fbf08851e116df7bedbf1f6279985dd4f91`
- VSIX size: `1011702` bytes
- Role: release-branch preview evidence only; not a selected exact authority
  VSIX

Release branch Vagrant evidence:

- Vagrant job: `14284865649`
- Assertion receipt:
  `vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json`
- Vagrant manifest: `vagrant/evidence/20260508-121101/manifest.json`
- Generated report SHA-256:
  `0df0027e2386543bd3e4b4ba54186b382430e0b95c8663d2a3609829c42b3800`
- Generated report size: `4841` bytes

## Protected Develop Retention Evidence

MR `!196` retained the release-branch readiness reassessment on protected
`develop` as merge commit `3557031442cbf85641544e07f9d75af59fe092d7`.
Pipeline `2511333533` passed all governed lanes.

| Stage | Job | Job ID | Status |
| --- | --- | --- | --- |
| admission | `ubuntu_docker_runner_admission` | `14285909235` | `success` |
| docs | `docs_link_check` | `14285909236` | `success` |
| docs | `docs_continuous_integration` | `14285909237` | `success` |
| docs | `docs_public_continuous_integration` | `14285909238` | `success` |
| docs | `docs_internal_continuous_integration` | `14285909239` | `success` |
| assurance | `assurance_release_gate` | `14285909240` | `success` |
| assurance | `assurance_26514_authority` | `14285909241` | `success` |
| assurance | `assurance_requirements_quality` | `14285909242` | `success` |
| assurance | `assurance_external_user_information` | `14285909243` | `success` |
| assurance | `assurance_audit_packet` | `14285909244` | `success` |
| test | `test_extension` | `14285909245` | `success` |
| test | `public_exact_pretag_proof` | `14285909246` | `success` |
| test | `linux_docker_provider_lane` | `14285909247` | `success` |
| test | `vagrant_windows_vsix_acceptance` | `14285909248` | `success` |
| package | `package_extension_preview` | `14285909249` | `success` |

Protected develop preview artifact:

- VSIX path: `preview-evidence/vi-history-suite-1.3.14.vsix`
- VSIX SHA-256:
  `3d377d660af33c0fd5a36ee5f2e98a02204d4e1768e04cb3842f8d16b878005b`
- VSIX size: `1011931` bytes
- Role: protected develop retention preview evidence only

Protected develop Vagrant evidence:

- Vagrant job: `14285909248`
- Assertion recorded at: `2026-05-08T20:54:37.465Z`
- Vagrant manifest: `vagrant/evidence/20260508-135407/manifest.json`
- Manifest generated at: `2026-05-08T13:54:36.9591579-07:00`
- Generated report SHA-256:
  `6abb059f4cbe0fbe808901d0c3c34405a0214738b219965bdf0e9e2d86c83746`
- Generated report size: `6682` bytes
- Validated facts: `HARNESS-VHS-002`, selected hash
  `8741bb08026c104100720c0ef48621e4ab7762fd`, base hash
  `c188cdec606aac3b17d8b17274baa19eef3e4017`, LabVIEW `2026` / `x86`,
  `proofExitCode=0`, `host-native` / `labview-cli`,
  `runtimeExecutionState=succeeded`, `generatedReportExists=true`, and the
  cold-start markers.

## Remaining Gates

- Promotion MR opening: admitted only as a separate protected merge-request
  action from `release/1.3.14` to `main`, with source branch retention.
- Main promotion merge: not performed by this preflight; requires the
  protected promotion MR to be opened and green first.
- Exact tag: not admitted until after protected `main` promotion and green
  protected `main` pipeline.
- Selected exact authority VSIX: not retained yet; the exact tag pipeline must
  produce release evidence before public exact release or Marketplace gates.
- Public GitHub exact release: still requires the asset-first exact-release
  controller after exact authority evidence is retained.
- VS Code Marketplace exact publication: still blocked until public GitHub
  exact verification and Windows exact-VSIX install proof are retained.
- Windows Docker Desktop Windows-container proof: remains community/deferred
  through public issue #65.

## No-Mutation Boundary

This preflight did not open a release-to-main MR, merge `release/1.3.14` to
`main`, create `v1.3.14`, publish a public GitHub release, mutate VS Code
Marketplace, admit Windows Docker Desktop Windows-container proof, or delete
the release branch.

## Next Admitted Action

`open-protected-release-1.3.14-to-main-merge-request-with-source-branch-retained`
