# Windows/LabVIEW Community Proof Intake Checklist - 2026-04-26

## Purpose

Prepare the external Windows/LabVIEW community proof intake checklist for
turning the blocked `1.3.10` exact-release readiness assessment into a later
admissible exact-release candidate decision.

This checklist is a release-control intake surface. It does not approve an
exact release, open a release branch, create an exact tag, mutate public
GitHub, or mutate VS Code Marketplace.

Machine-readable companion:

- `docs/product/windows-labview-community-proof-intake-checklist-2026-04-26.json`

## Authority Anchor

| Field | Value |
| --- | --- |
| Authority repo | `https://gitlab.com/svelderrainruiz/vi-history-suite` |
| Checklist prepared from `develop` commit | `3c0404a5cc51f3e131dfb29474fb36a338aec4ec` |
| Source readiness assessment | `docs/product/exact-release-readiness-assessment-2026-04-26.md` |
| Source readiness assessment JSON | `docs/product/exact-release-readiness-assessment-2026-04-26.json` |
| Source assessed commit | `42d1f581874c9fad8f6dcbc96c8827bb07e3b508` |
| Source assessed pipeline | `2480212103` / `success` |
| Candidate package line | `1.3.10` |
| Current admissible claim | Linux/Docker validated preview only |
| Current exact-release readiness | blocked |
| Blocking reason | missing native Windows installed-user LabVIEW proof for `1.3.10` |
| Active Marketplace publication | `1.3.10` community-validation pre-release |
| Preview VSIX SHA-256 | `f516b8ebec261c854e9e6d048a92ce8cb6f67a04114b9da945b916e37b0621a6` |

The source assessment remains the controlling evidence: `develop` is
Linux/Docker preview-valid, but it does not yet retain native Windows
installed-user LabVIEW proof for the `1.3.10` line.

## Claim Boundary

Community reports are useful validation signals. They do not automatically
become maintainer proof.

Two exact-release candidate paths are admitted for later reassessment:

| Path | Candidate Claim | Required Before Candidate Admission |
| --- | --- | --- |
| Windows-proof claim | The exact release claims Windows installed-user LabVIEW behavior as maintainer-proven. | Complete external report, maintainer reproduction or retained admitted proof, `governed_runner_admission`, `windows_private_release_acceptance`, Windows exact VSIX install proof for the selected exact VSIX, release-branch pipeline success, and release-control readback. |
| Community-deferred claim | The exact release keeps Windows/LabVIEW choices selectable but explicitly says Windows installed-user LabVIEW proof is community/deferred. | Exact claim narrowed in release-control state, user-facing proof-status wording retained, traceability matrix updated, `vihs --validate` proof-status disclosure retained, release-branch pipeline success, and no Windows installed-user proof claim. |

Linux/Docker evidence must not be used as proof of native Windows/LabVIEW
installed-user behavior.

## External Report Checklist

Every external Windows/LabVIEW community report should include:

### Reporter And Installation

- public report link or issue id
- reporter handle or contact route
- VS Code version from `code --version`
- installed extension line from `code --list-extensions --show-versions`
- install route: Marketplace pre-release, VSIX, or another route
- confirmation that the installed extension is
  `svelderrainruiz.vi-history-suite` `1.3.10`

### Windows Host Facts

- Windows edition, version, and build
- CPU architecture
- PowerShell version
- whether VS Code was launched as a normal user or elevated process
- whether corporate endpoint controls, antivirus, or restricted execution
  policies affected the run

### LabVIEW Facts

- LabVIEW year/version and bitness
- whether LabVIEW is licensed and launchable by the same Windows user
- `LabVIEWCLI.exe` discovery result, with private paths redacted if needed
- selected VI History Suite provider, LabVIEW year, and bitness
- whether the validation path used host LabVIEW, Docker Desktop, or both

### Required Commands

Run and retain complete text output for:

```powershell
code --version
code --list-extensions --show-versions
Get-Command code
Get-Command vihs
where.exe code
where.exe vihs
vihs
vihs --validate
```

When host LabVIEW is selected, also retain:

```powershell
Get-Command LabVIEWCLI.exe
where.exe LabVIEWCLI.exe
```

When Docker Desktop is selected, also retain:

```powershell
docker version
docker info --format '{{.OSType}}'
docker context show
```

The Docker report must say whether Docker Desktop was in Linux-container mode,
Windows-container mode, or unavailable.

### Workflow Evidence

- trusted test repository shape, without proprietary source disclosure
- tracked `.vi`, `.ctl`, or `.vit` file used for validation
- two selected revisions or a minimal reproduction recipe
- compare preflight result
- compare execution result
- retained `vihs --validate` proof-status lines
- screenshots or transcripts only after secrets and proprietary details are
  redacted

### Outcome Classification

Classify the report as one of:

- success
- failure
- blocked by missing runtime
- blocked by install or PATH issue
- Docker acquisition or mode issue
- documentation mismatch
- feature/version request

## Proof Status Ladder

| Status | Meaning | Release-Control Effect |
| --- | --- | --- |
| `community-reported` | A user submitted a report, but the maintainer has not checked completeness. | Signal only. |
| `intake-complete` | Required facts and commands are present and safe to retain. | Eligible for triage and possible reproduction. |
| `needs-more-evidence` | Required facts, commands, or reproduction steps are missing. | Does not change proof state. |
| `maintainer-reproduction-pending` | The report is complete, but no admitted host has reproduced it. | Remains community/deferred. |
| `maintainer-reproduced` | Maintainer reproduced the path on an admitted Windows/LabVIEW setup. | Eligible for authority proof retention. |
| `admitted-proof` | GitLab authority retained the required proof receipts and release-control readback. | Can support a Windows installed-user claim for the exact candidate. |
| `deferred-no-host` | The report appears useful, but no admitted host exists. | Useful community signal only. |
| `rejected-insufficient-evidence` | The report cannot be retained as evidence after follow-up. | No release-control effect. |

## Triage Loop

1. Capture intake.
   Record the public issue/report link, reporter handle, installed version,
   provider, LabVIEW year, bitness, and outcome.

2. Sanitize.
   Remove PATs, access tokens, proprietary VI contents, private GitLab
   material, sensitive paths, and confidential screenshots before retaining
   excerpts in authority docs.

3. Verify completeness.
   Check the required command outputs, host facts, LabVIEW facts, provider
   facts, Docker facts when relevant, and reproduction steps.

4. Classify the execution surface.
   Separate reports into native Windows host LabVIEW, Docker Desktop
   Windows-container, Docker Desktop Linux-container on Windows, install/PATH,
   validation-only, compare-execution, documentation, or unsupported request.

5. Assign proof status.
   Use the proof status ladder. Community reports start at
   `community-reported`; they move to `admitted-proof` only after retained
   authority evidence exists.

6. Decide candidate path.
   Choose either the Windows-proof claim path or the community-deferred claim
   path before reassessing exact-release readiness.

7. Run admitted proof lanes if a Windows claim is selected.
   Enable `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true` only for a capable
   Windows/LabVIEW proof pipeline, then retain `governed_runner_admission`,
   `windows_private_release_acceptance`, and Windows exact VSIX install proof.

8. Update authority docs.
   Update release-publication state, traceability matrix, proof-status docs,
   and exact-release readiness assessment only after the selected candidate
   path has retained evidence.

9. Reassess exact-release readiness.
   The blocked assessment can move to an admissible exact-release candidate
   only after the selected path, exact release branch, selected exact VSIX,
   release-branch pipeline, and no-mutation/publication gates are retained.

## Candidate Admission Checklist

Before a `1.3.10` exact-release candidate can be called admissible, retain:

- governed release branch name and source commit
- selected exact authority VSIX path and SHA-256
- release-branch pipeline id, status, and job list
- Linux/Docker provider-lane status for the selected exact candidate
- public exact pre-tag proof for the selected exact candidate
- current proof-status wording for Windows/LabVIEW
- selected claim path: Windows-proof claim or community-deferred claim
- traceability matrix rows that distinguish proven, selectable, deferred, and
  unsupported paths
- release-publication state update for the selected exact candidate
- explicit statement that public GitHub exact release and Marketplace exact
  publication remain separate mutating gates

If the Windows-proof claim path is selected, also retain:

- admitted Windows/LabVIEW host description
- `governed_runner_admission` success evidence
- `windows_private_release_acceptance` host evidence
- `windows_private_release_acceptance` Docker Desktop Windows-container
  evidence, if claimed
- `npm run vscode:marketplace:install-proof` receipt for the selected exact
  VSIX
- authority readback that links all retained receipts to the exact candidate

If the community-deferred claim path is selected, also retain:

- explicit release claim that Windows/LabVIEW installed-user behavior is not
  maintainer-proven for this exact line
- user-facing wording that selectable provider/year/bitness options are
  community-deferred unless the traceability matrix says otherwise
- validation instructions and public intake route for new reports
- stop rule that no Windows installed-user proof claim may be made from
  Linux/Docker evidence or unreproduced community reports

## Stop Rules

Do not promote the blocked assessment to an admissible exact-release candidate
when any selected-path condition is missing.

Do not retain or request:

- PATs, access tokens, Marketplace PATs, or GitLab project access tokens
- proprietary VI contents
- screenshots that reveal confidential files or internal systems
- private GitLab logs unrelated to the public community report

Do not claim:

- Linux/Docker evidence proves native Windows installed-user LabVIEW behavior
- community-reported evidence is maintainer proof
- a preview VSIX is the selected exact release artifact
- public GitHub or Marketplace exact mutation is admitted by this checklist

## No-Mutation Boundary

This checklist mutates only GitLab authority documentation and tests.

Not performed:

- public GitHub source mutation
- public GitHub release creation, edit, asset upload, or tag mutation
- public GitHub wiki mutation
- VS Code Marketplace publish, unpublish, metadata, or version mutation

