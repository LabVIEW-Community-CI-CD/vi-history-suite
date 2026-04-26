# Windows/LabVIEW Installed-User Proof Handoff - 2026-04-25

## Purpose

Prepare the deferred Windows/LabVIEW installed-user proof path without opening
an exact release, mutating public GitHub, or mutating VS Code Marketplace.

This handoff uses the evidence-anchored `developPreview` model. The active
preview state retains the Linux/Docker packet evidence plus the later Linux
host LabVIEW 2026 proof anchor; it does not persist the moving live `develop`
head as Windows proof.

## Current Authority Boundary

| Field | Value |
| --- | --- |
| Authority repo | `https://gitlab.com/svelderrainruiz/vi-history-suite` |
| Integration branch | `develop` |
| Handoff prepared from `develop` commit | `21774a91710b71c6b63629cc0cf3cf37ce9abc0a` |
| Handoff prepared from `develop` pipeline | `2480195741` / `success` |
| Active preview classification | Linux/Docker and Linux host LabVIEW validated preview |
| Preview state role | retained provider-lane and Linux host packet evidence |
| Head tracking policy | read live `develop` head and pipeline state from GitLab when needed |
| Retained preview packet | `docs/product/linux-docker-provider-lane-release-control-packet-2026-04-26.md` |
| Preview evidence commit | `21774a91710b71c6b63629cc0cf3cf37ce9abc0a` |
| Packet evidence pipeline | `2480195741` / `success` |
| Packet merge tracking policy | packet file retention is governed by Git history and CI instead of a moving merge-commit field |
| Preview VSIX evidence | `preview-evidence/vi-history-suite-1.3.10.vsix` |
| Preview VSIX SHA-256 | `bbe08e60d3d9a0275e5f734b002d115e648ab1a75b5b2641f34d7cf9f33a2c02` |
| Linux Docker provider lane | `npm run linux:docker:provider:lane` / GitLab `linux_docker_provider_lane` job `14091891709` |
| Linux Docker provider evidence | `linux-docker-provider-lane-evidence/` with schema `vi-history-suite/linux-docker-provider-lane@v1` |
| Linux Docker provider facts | Docker OSType `linux`; `runtimeProvider=linux-container`; `runtimeEngine=labview-cli`; `runtimeBlockedReason=<none>` |
| Linux host LabVIEW proof packet | `docs/product/benchmark-packets/HARNESS-VHS-002-linux-host-labview-2026-create-comparison-proof-2026-04-26.md` |
| Linux host LabVIEW proof facts | `/usr/local/natinst/LabVIEW-2026-64/labview`; `VIHS_OK`; `runtimeProvider=host-native`; `runtimeEngine=labview-cli`; `CreateComparisonReport operation succeeded.` |

The preview VSIX is Linux/Docker and Linux host LabVIEW authority validated.
It is not Windows installed-user proof and is not a Marketplace publication
candidate by itself.

## No-Mutation Boundary

No public GitHub or VS Code Marketplace mutation is admitted by this handoff.

Allowed by this handoff:

- GitLab authority documentation and merge-request evidence
- non-production readback of GitLab branch, pipeline, and retained packet state
- future external Windows/LabVIEW proof execution on a properly admitted host

Not allowed by this handoff:

- public GitHub source promotion
- public GitHub release creation, edit, asset upload, or deletion
- VS Code Marketplace publish, unpublish, asset mutation, or version bump
- treating Ubuntu/Linux Docker evidence as Windows installed-user proof

## Required External Host Shape

This Ubuntu/Docker machine cannot satisfy the deferred Windows proof. The
deferred proof requires an external Windows/LabVIEW host with:

- native supported Windows host under a signed-in user session
- PowerShell 7 shell executor for the GitLab runner
- GitLab Runner registered as a current-user shell runner, not `LocalSystem`
- runner tags:
  `windows,x64,labview-host,docker-windows,private-release`
- `run-untagged=false`, locked runner scope, and maximum timeout `7200`
- Docker Desktop available in the same signed-in user session
- Docker Desktop switchable to Windows-container mode
- LabVIEW 2026 x64 host bundle available
- canonical `LabVIEWCLI.exe` surface available for installed-user compare proof
- repository checkout with Node/npm and compiled CLI surfaces available

The first admitted shape remains the current-user scheduled-task model
documented in
[windows-private-release-runner-lane.md](./windows-private-release-runner-lane.md).
A Windows service runner is not admitted for this proof because Docker Desktop
and host LabVIEW execution depend on the signed-in user session.

## Operator Setup Prerequisites

Before any Windows installed-user proof claim can be made, the external host
operator must complete these prerequisites from the authority repo checkout:

1. Register the Windows runner with the governed tag set:
   `windows,x64,labview-host,docker-windows,private-release`.
2. Apply the repo-owned runner lane:
   `powershell.exe -NoLogo -NoProfile -File .\scripts\gitlab-runner\windows\apply-governed-runner-lanes.ps1`.
3. Verify the scheduled task `VIHS Governed Runner Lanes` launches the
   repo-owned bootstrap at
   `C:\GitLab-Runner\start-governed-runner-lanes.ps1`.
4. Run the non-mutating doctor:
   `npm run gitlab:runner:doctor -- --surface all`.
5. Run the fail-closed drift assertion:
   `npm run gitlab:runner:assert`.
6. Rehearse Windows proof runtime recovery:
   `npm run gitlab:runner:windows:recovery:rehearse`.
7. Confirm Docker Desktop Windows-container mode is available to the same
   signed-in user that owns the runner.
8. Confirm the host-native LabVIEW 2026 x64 execution surface resolves before
   the proof job is enabled.

## Required Retained Evidence

The Windows installed-user proof remains deferred until all of the following
evidence is retained from the external host:

| Evidence | Required receipt |
| --- | --- |
| Windows runner admission | `governed-runner-admission-evidence/runner-doctor.json` |
| Windows runner admission summary | `governed-runner-admission-evidence/runner-doctor.md` |
| Windows startup receipt | `C:\GitLab-Runner\receipts\governed-runner-startup\latest.json` |
| Paired Linux assurance startup receipt | `$HOME/gitlab-runner/receipts/linux-assurance-startup/latest.json` |
| Windows recovery rehearsal | `.cache/windows-proof-runtime-recovery-rehearsal/latest.json` |
| Private-release host/container manifest | `windows-private-release-evidence/manifest.json` |
| Host settings file | `windows-private-release-evidence/host/settings-file.json` |
| Host proof transcript | `windows-private-release-evidence/host/proof-run.txt` |
| Host harness report root | `windows-private-release-evidence/host/harness-report/**` |
| Container settings file | `windows-private-release-evidence/container/settings-file.json` |
| Container proof transcript | `windows-private-release-evidence/container/proof-run.txt` |
| Container harness report root | `windows-private-release-evidence/container/harness-report/**` |
| Exact VSIX installed-user proof | `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json` |

If bounded mid-session recovery fires, these additional receipts must also be
retained:

- `windows-private-release-evidence/host/proof-run-pre-recovery.txt`
- `windows-private-release-evidence/host/proof-runtime-recovery.txt`

## Deferred GitLab Proof Jobs

The Windows proof jobs stay opt-in until the external host exists:

- `governed_runner_admission`
- `windows_private_release_acceptance`

They must run only when `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true` is set for a
pipeline that can reach the admitted Windows/LabVIEW runner. A successful
Ubuntu/Docker preview pipeline is not enough to satisfy those jobs.

## Acceptance Sequence

The first admissible Windows installed-user proof sequence is:

1. Apply and assert the governed Windows runner lane.
2. Retain the recovery rehearsal receipt on the clean Windows host.
3. Enable `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true` only for the intended
   external Windows/LabVIEW proof pipeline.
4. Run and retain `governed_runner_admission` evidence.
5. Run and retain `windows_private_release_acceptance` host evidence.
6. Run and retain `windows_private_release_acceptance` Docker Desktop
   Windows-container evidence.
7. For a future exact release line, run
   `npm run vscode:marketplace:install-proof` on native Windows against the
   exact authority VSIX before any Marketplace mutation is requested.
8. Read the resulting receipts back into the GitLab authority docs before any
   Windows installed-user or Marketplace claim is made.

## Stop Rules

Do not make a Windows installed-user proof claim when any of these conditions
is true:

- no native Windows/LabVIEW host exists
- the runner is a Linux, WSL-only, or Docker-only runner
- Docker Desktop cannot switch to Windows-container mode
- `governed_runner_admission` did not run or did not retain evidence
- `windows_private_release_acceptance` did not run or did not retain host and
  container evidence
- `npm run vscode:marketplace:install-proof` is missing, stale, or points at a
  different exact VSIX than the selected authority line
- the proof depends on public GitHub or Marketplace mutation that has not been
  explicitly admitted

## Handoff Classification

- Handoff class: no-mutation deferred Windows/LabVIEW proof prerequisites
- Active release claim after this handoff: Linux/Docker and Linux host LabVIEW
  validated preview
- Linux host LabVIEW proof state: admitted local maintainer proof
- Linux host LabVIEW proof may prove Windows installed-user behavior: no
- Windows installed-user proof state: deferred
- Public GitHub mutation: not admitted
- VS Code Marketplace mutation: not admitted
- Next admissible action: provision an external Windows/LabVIEW host and retain
  the required GitLab authority evidence before any Windows installed-user
  proof claim
