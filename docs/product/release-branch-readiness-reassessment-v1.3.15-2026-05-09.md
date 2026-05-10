# Release Branch Readiness Reassessment v1.3.15 - 2026-05-09

## Purpose

Reassess the opened `release/1.3.15` branch after the governed branch-opening
packet was retained on protected `develop` and both the merge-request and
protected `develop` pipelines passed.

This packet determines the next governed action only. It does not create an
exact tag, publish a public GitHub release, mutate VS Code Marketplace, admit
Windows Docker Desktop Windows-container proof, promote `main`, or delete the
release branch.

## Verdict

| Field | Decision |
| --- | --- |
| Release-branch readiness | `blocked-main-not-ancestor-topology-refresh-required` |
| Release branch | `release/1.3.15` |
| Release branch commit | `67c2c3a188666eaad3cab2695092991c42f33470` |
| Release branch pipeline | `2513019603` / `success` |
| Protected develop retention commit | `801349167499b9d03b8244c42b03d88e15098034` |
| Protected develop retention pipeline | `2513063788` / `success` |
| Package version | `1.3.15` |
| Main topology | `main` is not yet an ancestor of `release/1.3.15` |
| Main promotion | blocked until topology refresh is retained; not performed |
| Exact tag | not admitted before topology refresh, protected `main` promotion, and green `main` pipeline |
| Public GitHub exact mutation | not admitted and not performed |
| VS Code Marketplace exact mutation | not admitted and not performed |
| Windows Docker Desktop Windows-container proof | community/deferred |

The release branch evidence is green, but main-promotion preflight is not yet
admissible because protected `main` commit
`2a08e94f819a34d54b4fdcb4ded24f85f8c7dbaa` is not an ancestor of
`release/1.3.15`. The merge base between `main` and `release/1.3.15` is
`50bec3391ea823739c2e8baddb33b77c283a37eb`; the later `v1.3.14` main merge
commit is therefore absent from the active release branch.

`release/1.3.15` is an ancestor of protected `develop`
`801349167499b9d03b8244c42b03d88e15098034`, so the retained packet/control-plane
update is downstream of the opened branch. The missing edge is only
`main -> release/1.3.15`.

## Release Branch Evidence

| Stage | Job | Job ID | Status |
| --- | --- | --- | --- |
| admission | `ubuntu_docker_runner_admission` | `14293424500` | `success` |
| docs | `docs_link_check` | `14293424501` | `success` |
| docs | `docs_continuous_integration` | `14293424502` | `success` |
| docs | `docs_public_continuous_integration` | `14293424503` | `success` |
| docs | `docs_internal_continuous_integration` | `14293424504` | `success` |
| assurance | `assurance_release_gate` | `14293424505` | `success` |
| assurance | `assurance_26514_authority` | `14293424506` | `success` |
| assurance | `assurance_requirements_quality` | `14293424507` | `success` |
| assurance | `assurance_external_user_information` | `14293424508` | `success` |
| assurance | `assurance_audit_packet` | `14293424509` | `success` |
| test | `test_extension` | `14293424510` | `success` |
| test | `public_exact_pretag_proof` | `14293424511` | `success` |
| test | `linux_docker_provider_lane` | `14293424512` | `success` |
| test | `vagrant_windows_vsix_acceptance` | `14293424513` | `success` |
| package | `package_extension_preview` | `14293424514` | `success` |

Release branch pipeline URL:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2513019603`.

The `release_extension` job did not run because no exact `vX.Y.Z` tag exists.

## Release Branch Preview Artifact

- Package preview job: `14293424514`
- Manifest path: `preview-evidence/preview-manifest.json`
- VSIX path: `preview-evidence/vi-history-suite-1.3.15.vsix`
- VSIX SHA-256:
  `bf5b15c944536a2e23872ebcf993e64351f01ed35e56793ae3e5005a520e0a14`
- VSIX size: `1014754` bytes
- Artifact role: release-branch preview evidence only; not a selected exact
  authority VSIX, public GitHub exact asset, or Marketplace publication
  artifact

Duplicate operator API pipeline `2513019188` also passed on the same ref and
SHA. It remains retained as duplicate validation only; the canonical branch
opening receipt remains branch-created pipeline `2513019603`.

## Release Branch Vagrant Evidence

- Vagrant job: `14293424513`
- Assertion receipt:
  `vagrant/evidence/assertion/vagrant-vsix-acceptance-assertion.json`
- Vagrant manifest: `vagrant/evidence/20260509-171233/manifest.json`
- LabVIEW startup receipt: `vagrant/evidence/labview-startup.json`
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

## Protected Develop Retention Evidence

MR `!203` retained the branch-opening evidence on protected `develop` as
merge commit `801349167499b9d03b8244c42b03d88e15098034`. Pipeline
`2513063788` passed all governed lanes.

| Stage | Job | Job ID | Status |
| --- | --- | --- | --- |
| admission | `ubuntu_docker_runner_admission` | `14293598027` | `success` |
| docs | `docs_link_check` | `14293598028` | `success` |
| docs | `docs_continuous_integration` | `14293598029` | `success` |
| docs | `docs_public_continuous_integration` | `14293598030` | `success` |
| docs | `docs_internal_continuous_integration` | `14293598031` | `success` |
| assurance | `assurance_release_gate` | `14293598032` | `success` |
| assurance | `assurance_26514_authority` | `14293598033` | `success` |
| assurance | `assurance_requirements_quality` | `14293598034` | `success` |
| assurance | `assurance_external_user_information` | `14293598035` | `success` |
| assurance | `assurance_audit_packet` | `14293598036` | `success` |
| test | `test_extension` | `14293598037` | `success` |
| test | `public_exact_pretag_proof` | `14293598038` | `success` |
| test | `linux_docker_provider_lane` | `14293598039` | `success` |
| test | `vagrant_windows_vsix_acceptance` | `14293598040` | `success` |
| package | `package_extension_preview` | `14293598041` | `success` |

Protected develop pipeline URL:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/pipelines/2513063788`.

Protected develop preview artifact:

- VSIX SHA-256:
  `03699261fc3937b1f0676f60230e4e9b4cbe4b1daff86fba1d3730cb908bcc95`
- VSIX size: `1014773` bytes
- Commit:
  `801349167499b9d03b8244c42b03d88e15098034`
- Artifact role: protected develop retention preview evidence only

Protected develop Vagrant evidence:

- Vagrant job: `14293598040`
- Assertion recorded at: `2026-05-10T00:48:53.705Z`
- Vagrant manifest: `vagrant/evidence/20260509-174735/manifest.json`
- Manifest generated at: `2026-05-09T17:48:52.6846036-07:00`
- Generated report SHA-256:
  `28af59de34ee10f1b549019fd5da4dd9625c48e27ca3aa7221f897b29411e180`
- Generated report size: `6737` bytes
- Validated facts: same `HARNESS-VHS-002`, canonical selected/base hashes,
  LabVIEW `2026` / `x86`, `proofExitCode=0`, `host-native` /
  `labview-cli`, `runtimeBitness=x86`, `runtimeExecutionState=succeeded`,
  and `generatedReportExists=true`
- LabVIEW startup receipt: `vihs-lv-prelaunch`, `LabVIEW.exe` from
  `C:\Program Files (x86)\National Instruments\LabVIEW 2026\LabVIEW.exe`,
  LabVIEW session `1`, Explorer session `1`, and VI Server
  `0.0.0.0:3363`

## Remaining Gates

- Topology refresh: required before main-promotion preflight. Protected
  `main` must become an ancestor of `release/1.3.15`.
- Main promotion: blocked until topology refresh and a green refreshed
  release-branch pipeline are retained; not performed by this reassessment.
- Exact tag: not admitted until after topology refresh, protected `main`
  promotion, and green protected `main` pipeline.
- Selected exact authority VSIX: not retained yet; the exact tag pipeline must
  produce release evidence before public exact release or Marketplace gates.
- Public GitHub exact release: still requires the asset-first exact-release
  controller after exact authority evidence is retained.
- VS Code Marketplace exact publication: still blocked until public GitHub
  exact verification and Windows exact-VSIX install proof are retained.
- Windows Docker Desktop Windows-container proof: remains community/deferred
  through public issue #65 and ISSUE-0415.

## No-Mutation Boundary

This reassessment did not create `v1.3.15`, merge `release/1.3.15` to `main`,
publish a public GitHub release, mutate VS Code Marketplace, admit Windows
Docker Desktop Windows-container proof, or delete the release branch.

## Next Admitted Action

`refresh-release-1.3.15-with-main-before-main-promotion-preflight`
