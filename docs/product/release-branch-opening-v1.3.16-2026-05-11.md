# Release Branch Opening v1.3.16 - 2026-05-11

## Purpose

Retain the governed opening of `release/1.3.16` from protected `develop`
after the `v1.3.16` candidate-opening merge landed and protected `develop`
pipeline `2516180885` passed.

This packet records only the release-branch opening and branch-CI evidence. It
does not create an exact tag, publish a public GitHub release, mutate VS Code
Marketplace, admit Windows Docker Desktop Windows-container proof, promote
`main`, or delete any release branch.

## Verdict

| Field | Decision |
| --- | --- |
| Release branch opening | `performed-and-retained` |
| Release branch | `release/1.3.16` |
| Source branch | `develop` |
| Source commit | `2443e601c2b1aa78122af785516376b9905ba43f` |
| Release branch pipeline | `2516207722` / `success` |
| Package version | `1.3.16` |
| Exact tag | not admitted and not created |
| Public GitHub exact mutation | not admitted and not performed |
| VS Code Marketplace exact mutation | not admitted and not performed |
| Windows Docker Desktop Windows-container proof | community/deferred |
| `main` promotion | not admitted and not performed |

## Branch Pipeline Evidence

| Stage | Job | Job ID | Status | Runner |
| --- | --- | --- | --- | --- |
| admission | `ubuntu_docker_runner_admission` | `14309562370` | `success` | `local-linux-docker-assurance` |
| docs | `docs_link_check` | `14309562371` | `success` | GitLab SaaS Linux runner |
| docs | `docs_continuous_integration` | `14309562372` | `success` | GitLab SaaS Linux runner |
| docs | `docs_public_continuous_integration` | `14309562373` | `success` | GitLab SaaS Linux runner |
| docs | `docs_internal_continuous_integration` | `14309562374` | `success` | GitLab SaaS Linux runner |
| assurance | `assurance_release_gate` | `14309562375` | `success` | `local-linux-docker-assurance` |
| assurance | `assurance_26514_authority` | `14309562376` | `success` | `local-linux-docker-assurance` |
| assurance | `assurance_requirements_quality` | `14309562377` | `success` | `local-linux-docker-assurance` |
| assurance | `assurance_external_user_information` | `14309562378` | `success` | `local-linux-docker-assurance` |
| assurance | `assurance_audit_packet` | `14309562379` | `success` | `local-linux-docker-assurance` |
| test | `test_extension` | `14309562381` | `success` | GitLab SaaS Linux runner |
| test | `public_exact_pretag_proof` | `14309562382` | `success` | GitLab SaaS Linux runner |
| test | `linux_docker_provider_lane` | `14309562383` | `success` | `local-linux-docker-assurance` |
| test | `vagrant_windows_vsix_acceptance` | `14309562384` | `success` | `local-vagrant-windows-acceptance` |
| package | `package_extension_preview` | `14309562385` | `success` | GitLab SaaS Linux runner |

The branch pipeline URL is
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2516207722`.
The `release_extension` job did not run because no exact `vX.Y.Z` tag exists.

## Preview Artifact Evidence

- Package preview job: `14309562385`
- Manifest path: `preview-evidence/preview-manifest.json`
- VSIX path: `preview-evidence/vi-history-suite-1.3.16.vsix`
- VSIX SHA-256:
  `84ff12e25793406a29ca1ce23a670e6aab8b3519594ef0019605564034f964da`
- VSIX size: `1015904` bytes
- Artifact role: release-branch preview evidence only; not an exact release
  artifact, public GitHub exact asset, or Marketplace publication artifact

## Vagrant VSIX Acceptance Evidence

- Vagrant job: `14309562384`
- Assertion receipt:
  `vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json`
- Assertion receipt status: `passed`
- Vagrant manifest: `vagrant/evidence/20260511-070846/manifest.json`
- Manifest generated at: `2026-05-11T07:09:03.6874782-07:00`
- LabVIEW startup receipt: `vagrant/evidence/labview-startup.json`
- Generated report:
  `vagrant/evidence/20260511-070846/harness-report/comparison-report-smoke.html`
- Generated report SHA-256:
  `d98a1d5271ee451b61f798af51cb845b37286d382d950b2f7053c587697939ae`
- Generated report size: `6926` bytes

Validated Vagrant facts: `HARNESS-VHS-002`, selected hash
`8741bb08026c104100720c0ef48621e4ab7762fd`, base hash
`c188cdec606aac3b17d8b17274baa19eef3e4017`, LabVIEW `2026` / `x86`,
`proofExitCode=0`, `runtimeProvider=host-native`,
`runtimeEngine=labview-cli`, `runtimeBitness=x86`,
`runtimeExecutionState=succeeded`, `generatedReportExists=true`, and the
cold-start markers `LabVIEW not running. Launching via scheduled task...` plus
`LabVIEW VI Server ready on port 3363.`

The retained `labview-startup.json` proves scheduled task
`vihs-lv-prelaunch`, `LabVIEW.exe` from
`C:\Program Files (x86)\National Instruments\LabVIEW 2026\LabVIEW.exe` in
session `1`, Explorer in session `1`, and VI Server listening on
`0.0.0.0:3363`.

The proof run used
`--allow-existing-windows-host-runtime`, which is scoped to installed-user host
compare and does not relax clean-host proof or benchmark lanes.

## Remaining Gates

- Release-branch readiness: must be reassessed on `release/1.3.16` before any
  exact tag or main-promotion action.
- Selected exact authority VSIX: not selected or retained by this packet.
- Windows exact-VSIX install proof: still required for the selected exact VSIX
  before any later Marketplace exact publication.
- Public GitHub exact release: not admitted by this packet.
- VS Code Marketplace exact publication: still blocked until public GitHub
  exact verification and Windows exact-VSIX install proof are retained.
- Windows Docker Desktop Windows-container proof: remains community/deferred
  through public issue #65 and ISSUE-0415.
- Release branch deletion: not admitted.

## Next Admitted Action

`reassess-release-1.3.16-branch-readiness-before-exact-tag`
