# Windows Docker Desktop Proof Intake v1.3.13

Status: prepared in GitLab authority for public issue #65 intake. This packet
does not admit Windows Docker Desktop proof by itself; it defines the evidence
required to promote a community report into retained proof.

## Objective

Turn public issue #65 into a repeatable proof lane for the Marketplace
pre-release `1.3.13` Windows Docker Desktop Windows-container variant while
keeping existing Linux/Docker, Linux host, and Windows host proof boundaries
distinct.

## Prerequisites

- Windows 10 or Windows 11 installed user environment.
- VS Code with Marketplace pre-release `1.3.13` installed.
- Docker Desktop installed and switched to Windows containers.
- `docker info --format "{{.OSType}} {{.OperatingSystem}}"` reports
  `windows`.
- No platform simulation, WSL-only run, Linux Docker Engine run, or private VI
  fixture substitution.

## Canonical Command

Run from PowerShell after `VI History: Prepare Local Runtime Settings CLI` has
materialized the `vihs` command:

```powershell
vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof --runtime-timeout-ms 300000
```

The canonical fixture remains:

- Repository: `https://github.com/ni/labview-icon-editor`
- VI: `resource/plugins/lv_icon.vi`
- Old commit: `ab94f6c4b375062492036c63a6dab7ea8824748a`
- New commit: `8741bb08026c104100720c0ef48621e4ab7762fd`
- Governed Windows Docker image family:
  `nationalinstruments/labview:2026q1-windows`

## Admissible Success

An admissible success report must attach or paste the redacted
`vihs-fixture-validation-proof.json` facts showing:

- `selectedVariant.platform=win32`
- `selectedVariant.provider=docker`
- `selectedVariant.labviewVersion=2026`
- `selectedVariant.labviewBitness=x64`
- `result.runtimeProvider=windows-container`
- `result.runtimeEngine=labview-cli`
- `result.runtimeExecutionState=succeeded`
- `result.generatedReportExists=true`

It should also attach or name the generated harness Markdown/HTML and confirm
the Docker OSType output was `windows`.

## Admissible Non-Success

Fail-closed reports are still valuable when they include:

- the stable `VIHS_E_*` code or `runtimeBlockedReason`
- `docker version`
- `docker info --format "{{.OSType}} {{.OperatingSystem}}"`
- `vihs-fixture-validation-proof.json`
- `vihs-fixture-validation-issue.md`
- any redacted `runtime-stdout.txt`, `runtime-stderr.txt`, or diagnostic log
  references produced by the proof packet

Use the dedicated public template:
`public-github-source/.github/ISSUE_TEMPLATE/windows-docker-desktop-validation.yml`.

## Not Admissible For Issue #65

- Linux Docker Engine or Linux Docker Desktop containers.
- Docker Desktop running Linux containers on Windows.
- WSL-only execution.
- Windows host LabVIEW provider proof.
- Platform-injected or simulated `win32` unit tests.
- Private or proprietary VI fixtures.
- Reports without a proof packet or without Docker OSType evidence.

## Privacy Boundary

The proof packet may include user paths, Docker context names, and environment
facts needed for diagnosis. Redact PATs, access tokens, proprietary directory
names, confidential screenshots, private repository URLs, and private VI
contents before posting.

## Triage Loop

1. Confirm the report targets public issue #65 and Marketplace pre-release
   `1.3.13`.
2. Confirm Docker Desktop OSType is `windows`.
3. Confirm the canonical fixture and exact command were used.
4. Classify success, failure, prerequisite block, or feature-not-implemented.
5. Apply `proof:reported` when the packet is complete.
6. Apply `proof:reproduced` only after maintainer reproduction or a retained
   authority packet exists.
7. Keep Marketplace unchanged unless a later governed release slice explicitly
   changes packaged behavior or listing text.

## Current Boundary

- Linux/Docker `2026` `x64`: admitted.
- Linux host LabVIEW `2026` `x64`: admitted on the maintainer Ubuntu host.
- Windows host LabVIEW `2026` `x64`: admitted from retained Windows 11
  VirtualBox installed-user proof.
- Windows Docker Desktop Windows containers: community/deferred until a public
  issue #65 packet clears this intake.

## Public Facade Promotion Closeout

- GitLab authority MR: `https://gitlab.com/svelderrainruiz/vi-history-suite/-/merge_requests/189`
- GitLab authority develop commit:
  `1e0a69a666213e3513f22ce0fe6d82ccc1170ce0`
- GitLab develop pipeline: `2481415396` / success
- Public GitHub PR:
  `https://github.com/svelderrainruiz/vi-history-suite/pull/68`
- Public `main` commit:
  `220111eae3ac214e99f2233e2bfe6b320edf383d`
- Post-merge public checks:
  - Public Source Package Preview `24977951913` / success
  - Public Windows Installed-User Contract `24977951923` / success
  - Public Linux Installed-User Smoke `24977951904` / success
- Public issue comments:
  - `https://github.com/svelderrainruiz/vi-history-suite/issues/65#issuecomment-4324381378`
  - `https://github.com/svelderrainruiz/vi-history-suite/issues/48#issuecomment-4324381850`
- Public label applied: `windows-docker-desktop`
- Marketplace mutation: not performed.
