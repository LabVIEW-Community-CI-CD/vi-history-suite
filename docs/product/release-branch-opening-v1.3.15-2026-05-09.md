# Release Branch Opening v1.3.15 - 2026-05-09

## Purpose

Retain the governed opening of `release/1.3.15` from protected `develop`
after the installed-user stable patch line landed and protected `develop`
pipeline `2512993895` passed.

This packet records only the release-branch opening and branch-CI evidence. It
does not create an exact tag, publish a public GitHub release, mutate VS Code
Marketplace, admit Windows Docker Desktop Windows-container proof, promote
`main`, or delete any release branch.

## Verdict

| Field | Decision |
| --- | --- |
| Release branch opening | `performed-and-retained` |
| Release branch | `release/1.3.15` |
| Source branch | `develop` |
| Source commit | `67c2c3a188666eaad3cab2695092991c42f33470` |
| Release branch pipeline | `2513019603` / `success` |
| Package version | `1.3.15` |
| Exact tag | not admitted and not created |
| Public GitHub exact mutation | not admitted and not performed |
| VS Code Marketplace exact mutation | not admitted and not performed |
| Windows Docker Desktop Windows-container proof | community/deferred |
| `main` promotion | not admitted and not performed |

## Duplicate Pipeline Note

The branch was created through the GitLab API. The branch pipeline was not
visible immediately, so operator-triggered API pipeline `2513019188` was started
on the same ref and SHA. GitLab then surfaced the delayed branch-created `push`
pipeline `2513019603` on the same `release/1.3.15` ref and
`67c2c3a188666eaad3cab2695092991c42f33470` SHA.

Both pipelines passed. This packet treats `2513019603` as the canonical
release-branch opening pipeline because it is the branch-created `push`
pipeline. Pipeline `2513019188` remains retained as a duplicate operator
validation receipt and is not used to broaden any release boundary.

## Branch Pipeline Evidence

| Stage | Job | Job ID | Status | Runner |
| --- | --- | --- | --- | --- |
| admission | `ubuntu_docker_runner_admission` | `14293424500` | `success` | `local-linux-docker-assurance` |
| docs | `docs_link_check` | `14293424501` | `success` | GitLab SaaS Linux runner |
| docs | `docs_continuous_integration` | `14293424502` | `success` | GitLab SaaS Linux runner |
| docs | `docs_public_continuous_integration` | `14293424503` | `success` | GitLab SaaS Linux runner |
| docs | `docs_internal_continuous_integration` | `14293424504` | `success` | GitLab SaaS Linux runner |
| assurance | `assurance_release_gate` | `14293424505` | `success` | `local-linux-docker-assurance` |
| assurance | `assurance_26514_authority` | `14293424506` | `success` | `local-linux-docker-assurance` |
| assurance | `assurance_requirements_quality` | `14293424507` | `success` | `local-linux-docker-assurance` |
| assurance | `assurance_external_user_information` | `14293424508` | `success` | `local-linux-docker-assurance` |
| assurance | `assurance_audit_packet` | `14293424509` | `success` | `local-linux-docker-assurance` |
| test | `test_extension` | `14293424510` | `success` | GitLab SaaS Linux runner |
| test | `public_exact_pretag_proof` | `14293424511` | `success` | GitLab SaaS Linux runner |
| test | `linux_docker_provider_lane` | `14293424512` | `success` | `local-linux-docker-assurance` |
| test | `vagrant_windows_vsix_acceptance` | `14293424513` | `success` | `local-vagrant-windows-acceptance` |
| package | `package_extension_preview` | `14293424514` | `success` | GitLab SaaS Linux runner |

The branch pipeline URL is
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2513019603`.
The `release_extension` job did not run because no exact `vX.Y.Z` tag exists.

## Preview Artifact Evidence

- Package preview job: `14293424514`
- Manifest path: `preview-evidence/preview-manifest.json`
- VSIX path: `preview-evidence/vi-history-suite-1.3.15.vsix`
- VSIX SHA-256:
  `bf5b15c944536a2e23872ebcf993e64351f01ed35e56793ae3e5005a520e0a14`
- VSIX size: `1014754` bytes
- Artifact role: release-branch preview evidence only; not an exact release
  artifact, public GitHub exact asset, or Marketplace publication artifact

Duplicate operator pipeline `2513019188` also retained a preview VSIX at the
same source SHA with SHA-256
`ae2305cf4a08eceb207e15db4d2a3f2e589f5a664ecf5d8197b2eba5a5184fe0`.
The duplicate artifact is informational only.

## Vagrant VSIX Acceptance Evidence

- Vagrant job: `14293424513`
- Assertion receipt:
  `vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json`
- Assertion receipt status: `passed`
- Vagrant manifest: `vagrant/evidence/20260509-171233/manifest.json`
- Manifest generated at: `2026-05-09T17:13:28.3899871-07:00`
- LabVIEW startup receipt: `vagrant/evidence/labview-startup.json`
- Generated report:
  `vagrant/evidence/20260509-171233/harness-report/comparison-report-smoke.html`
- Generated report SHA-256:
  `39e42c208e518382a4d7870b9d132796ad61195e319575f6b9534080914c17a9`
- Generated report size: `6737` bytes

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

The trace also records the retained stale `viHistorySuite.labviewBitness=x64`
setting followed immediately by the forced generated `vihs` launcher update to
`viHistorySuite.labviewBitness=x86`; the assertion passed after the forced x86
settings write.

## Remaining Gates

- Release-branch readiness: must be reassessed on `release/1.3.15` before any
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

`reassess-release-1.3.15-branch-readiness-before-exact-tag`
