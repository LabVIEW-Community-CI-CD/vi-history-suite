# Release Branch Opening v1.3.14 - 2026-05-08

## Purpose

Retain the governed opening of `release/1.3.14` from the admitted `develop`
candidate line after the `2026-05-08` exact-release readiness assessment made
release-branch opening admissible as a separate action.

This packet records only the branch-opening and branch-CI evidence. It does
not create an exact tag, publish a public GitHub release, mutate VS Code
Marketplace, admit Windows Docker Desktop Windows-container proof, or promote
`main`.

## Verdict

| Field | Decision |
| --- | --- |
| Release branch opening | `performed-and-retained` |
| Release branch | `release/1.3.14` |
| Source branch | `develop` |
| Source commit | `50bec3391ea823739c2e8baddb33b77c283a37eb` |
| Release branch pipeline | `2511168302` / `success` |
| Package version | `1.3.14` |
| Exact tag | not admitted and not created |
| Public GitHub exact mutation | not admitted and not performed |
| VS Code Marketplace exact mutation | not admitted and not performed |
| Windows Docker Desktop Windows-container proof | community/deferred |
| `main` promotion | not admitted and not performed |

## Branch Pipeline Evidence

| Stage | Job | Job ID | Status | Runner |
| --- | --- | --- | --- | --- |
| admission | `ubuntu_docker_runner_admission` | `14284865636` | `success` | `local-linux-docker-assurance` |
| docs | `docs_link_check` | `14284865637` | `success` | GitLab SaaS Linux runner |
| docs | `docs_continuous_integration` | `14284865638` | `success` | GitLab SaaS Linux runner |
| docs | `docs_public_continuous_integration` | `14284865639` | `success` | GitLab SaaS Linux runner |
| docs | `docs_internal_continuous_integration` | `14284865640` | `success` | GitLab SaaS Linux runner |
| assurance | `assurance_release_gate` | `14284865641` | `success` | `local-linux-docker-assurance` |
| assurance | `assurance_26514_authority` | `14284865642` | `success` | `local-linux-docker-assurance` |
| assurance | `assurance_requirements_quality` | `14284865643` | `success` | `local-linux-docker-assurance` |
| assurance | `assurance_external_user_information` | `14284865644` | `success` | `local-linux-docker-assurance` |
| assurance | `assurance_audit_packet` | `14284865645` | `success` | `local-linux-docker-assurance` |
| test | `test_extension` | `14284865646` | `success` | GitLab SaaS Linux runner |
| test | `public_exact_pretag_proof` | `14284865647` | `success` | GitLab SaaS Linux runner |
| test | `linux_docker_provider_lane` | `14284865648` | `success` | `local-linux-docker-assurance` |
| test | `vagrant_windows_vsix_acceptance` | `14284865649` | `success` | `local-vagrant-windows-acceptance` |
| package | `package_extension_preview` | `14284865650` | `success` | GitLab SaaS Linux runner |

The branch pipeline URL is
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2511168302`.
The `release_extension` job did not run because no exact `vX.Y.Z` tag exists.

## Preview Artifact Evidence

- Package preview job: `14284865650`
- Manifest path: `preview-evidence/preview-manifest.json`
- VSIX path: `preview-evidence/vi-history-suite-1.3.14.vsix`
- VSIX SHA-256:
  `d5208f9092bd7e3c7b7c075c91fc8fbf08851e116df7bedbf1f6279985dd4f91`
- VSIX size: `1011702` bytes
- Artifact role: release-branch preview evidence only; not an exact release
  artifact, public GitHub exact asset, or Marketplace publication artifact

## Vagrant VSIX Acceptance Evidence

- Vagrant job: `14284865649`
- Assertion receipt:
  `vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json`
- Assertion receipt recorded at: `2026-05-08T19:11:29.285Z`
- Vagrant manifest: `vagrant/evidence/20260508-121101/manifest.json`
- Manifest generated at: `2026-05-08T12:11:28.8437222-07:00`
- Harness report JSON:
  `vagrant/evidence/20260508-121101/harness-report/comparison-report-smoke.json`
- Generated report:
  `vagrant/evidence/20260508-121101/harness-report/workspace-storage/reports/c93467a8997c/b9efa479cf1e/diff-report-lv_icon.vi.html`
- Generated report SHA-256:
  `0df0027e2386543bd3e4b4ba54186b382430e0b95c8663d2a3609829c42b3800`
- Generated report size: `4841` bytes

Validated Vagrant facts: `HARNESS-VHS-002`, selected hash
`8741bb08026c104100720c0ef48621e4ab7762fd`, base hash
`c188cdec606aac3b17d8b17274baa19eef3e4017`, LabVIEW `2026` / `x86`,
`proofExitCode=0`, `runtimeProvider=host-native`,
`runtimeEngine=labview-cli`, `runtimeExecutionState=succeeded`,
`generatedReportExists=true`, and the cold-start markers
`LabVIEW not running. Launching via scheduled task...` plus
`LabVIEW VI Server ready on port 3363.`

## Remaining Gates

- Release-branch readiness: must be reassessed on `release/1.3.14` before any
  exact tag.
- Selected exact authority VSIX: not selected or retained by this packet.
- Windows exact-VSIX install proof: still required for the selected exact VSIX
  before any later Marketplace exact publication.
- Public GitHub exact release: still requires the asset-first exact-release
  controller after release-branch readiness closes.
- VS Code Marketplace exact publication: still blocked until public GitHub
  exact verification and Windows exact-VSIX install proof are retained.
- Windows Docker Desktop Windows-container proof: remains community/deferred
  through public issue #65.

## Next Admitted Action

`reassess-release-1.3.14-branch-readiness-before-exact-tag`
