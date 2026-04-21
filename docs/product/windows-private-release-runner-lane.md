# Windows Private-Release Runner Lane

## Purpose

Retain the governed GitLab Windows shell-runner lane for the active Windows x64
private-release contract on `develop`.

This lane does not claim exact/public release readiness by itself. It exists so
the repo can retain one repeatable Windows-host receipt for the canonical
installed-user-equivalent compare scenario on `resource/plugins/lv_icon.vi`
without depending on ad hoc local desktop memory.

It is intentionally separate from the Linux assurance runner lane documented in
[linux-assurance-runner-lane.md](./linux-assurance-runner-lane.md).

## Governing Surfaces

- GitLab job: `windows_private_release_acceptance`
- governed CLI: `npm run acceptance:windows:private-release`
- governed script: `scripts/runWindowsPrivateReleaseAcceptance.js`
- retained artifact root: `windows-private-release-evidence/`
- tracked scenario packet:
  [private-release-windows-x64-v1.3.0.md](./private-release-windows-x64-v1.3.0.md)
- hosted governance package:
  [hosted-ci-governance.md](./hosted-ci-governance.md)
- separate standards lane:
  [linux-assurance-runner-lane.md](./linux-assurance-runner-lane.md)

## Active Scenario

The lane retains the Windows x64 private-release scenario already admitted in
the tracked packet:

- harness: `HARNESS-VHS-002`
- upstream repo: `https://github.com/ni/labview-icon-editor.git`
- target VI: `resource/plugins/lv_icon.vi`
- selected hash: `8741bb08026c104100720c0ef48621e4ab7762fd`
- base hash: `c188cdec606aac3b17d8b17274baa19eef3e4017`
- provider-selection contract:
  - host lane: generated settings CLI writes `host` / `2026` / `x64`
  - container lane: generated settings CLI writes and validates
    `docker` / `2026` / `x64`

This lane is the governed CLI equivalent of the installed-user Windows compare
flow:

1. prepare or refresh provider settings
2. target `lv_icon.vi`
3. resolve the exact selected/base pair
4. execute the compare path on native Windows host and Windows container
5. retain the exact report packet and runtime receipts

It does not script literal mouse input. It proves the same admitted
selected/base compare scenario through repo-owned CLI surfaces rather than a
parallel UI-automation stack.

## Runner Identity

Tracked project runner metadata:

- runner id: `52775990`
- description: `ghost`
- tags:
  - `windows`
  - `x64`
  - `labview-host`
  - `docker-windows`
  - `private-release`
- locked: `true`
- run untagged: `false`
- maximum timeout: `7200`

## Supported Host Shape

The first admitted runner shape is:

- native Windows host
- PowerShell 7 shell executor
- signed-in user context, not `LocalSystem`
- Docker Desktop available on the same signed-in user session
- Docker engine switchable to Windows-container mode
- LabVIEW 2026 x64 host bundle plus the canonical installed x86
  `LabVIEWCLI.exe` surface on the same machine

The first admitted operating mode is a current-user shell runner because Docker
Desktop and the host LabVIEW proof path depend on the signed-in Windows user
context. A service wrapper can be added later, but it is not the first governed
admission shape.

Current host activation state:

- registered on the project as runner `ghost` (`52775990`)
- launched at user logon by scheduled task `VIHS Governed Runner Lanes`
- scheduled task bootstrap surface:
  `C:\GitLab-Runner\start-governed-runner-lanes.ps1`
- admitted runner config path: `C:\GitLab-Runner\config.toml`
- per-runner request concurrency: `request_concurrency = 2`
- startup script collapses duplicate `gitlab-runner.exe` manager processes for
  the same config before ensuring exactly one current-user manager remains
- on each logon bootstrap, the same script wakes the admitted Ubuntu distro,
  retries the repo-owned Linux assurance helper up to `12` times with `10`
  second pauses, and fails closed unless that helper proves the paired
  `vihs-linux-assurance-runner.service` is `enabled`, `active`, and singular
- on cold admission, the startup script clears stale `LabVIEW`,
  `LabVIEWCLI`, and `LVCompare` processes before the current-user runner
  starts with bounded `Stop-Process`, `taskkill /PID /T /F`, and
  `taskkill /IM /T /F`, and it fails closed if any remain
- Windows service installation is not active for this admitted lane

## Repo-Owned Host Assets

The governed host asset pack for this lane is versioned in the repo:

- Windows apply/update script:
  `scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1`
- Windows bootstrap script:
  `scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1`
- Windows drift assertion script:
  `scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1`
- Windows proof runtime recovery script:
  `scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1`
- Windows proof runtime recovery rehearsal wrapper:
  `scripts/runWindowsProofRuntimeRecoveryRehearsal.js` via
  `npm run gitlab:runner:windows:recovery:rehearse`
- Linux apply/update script:
  `scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh`
- Linux helper invoked by that bootstrap:
  `scripts/gitlab-runner/linux/start-linux-assurance.sh`
- Cross-lane wrapper from the admitted Windows host:
  `scripts/assertGovernedRunnerLanes.js` via `npm run gitlab:runner:assert`

The Windows apply script is the repo-owned update surface for the admitted
scheduled task contract. It copies the repo-owned bootstrap to
`C:\GitLab-Runner`, registers the task action as
`powershell.exe -NoLogo -NoProfile -File "C:\GitLab-Runner\start-governed-runner-lanes.ps1"`,
starts that task immediately, and fails closed unless exactly one configured
runner manager remains after apply.

The Windows bootstrap script remains the repo-owned source of truth for
duplicate collapse, cold-admission runtime cleanup, current-user runner
launch, and bounded WSL wake-up plus Linux-assurance readiness recovery on
user logon.

The Windows assertion surface is the repo-owned live drift check for the
admitted scheduled-task/bootstrap contract. It fails closed unless the
installed bootstrap hash still matches the repo source, the scheduled task
retains the exact
`powershell.exe -NoLogo -NoProfile -File "C:\GitLab-Runner\start-governed-runner-lanes.ps1"`
action plus its logon trigger, `C:\GitLab-Runner\config.toml` still contains
`request_concurrency = 2`, and exactly one configured runner manager is live.

The host-native proof path inside `npm run acceptance:windows:private-release`
uses the same bounded cleanup family before and after host execution, so
mid-session `LabVIEW.exe` contamination blocks the lane immediately instead of
waiting for the next logon bootstrap. When that shared cleanup fails before the
host-native proof begins, the acceptance wrapper retains the first failed proof
transcript as `windows-private-release-evidence/host/proof-run-pre-recovery.txt`,
runs the repo-owned Windows proof runtime recovery script
`scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1`,
retains its transcript as
`windows-private-release-evidence/host/proof-runtime-recovery.txt`, waits
`5000` ms, reruns the same host-native proof once, and fails closed if that
repo-owned recovery step plus single retry still cannot restore a clean host
surface.

The operator-only recovery rehearsal surface is
`scripts/runWindowsProofRuntimeRecoveryRehearsal.js` via
`npm run gitlab:runner:windows:recovery:rehearse`. It fails closed unless the
admitted Windows host starts clean, resolves the governed host-native LabVIEW
`2026` `x64` executable, seeds one headless LabVIEW contamination, runs the
same repo-owned recovery script, and proves the host is clean again after that
recovery. The latest rehearsal receipt is retained at
`.cache/windows-proof-runtime-recovery-rehearsal/latest.json`.

## Apply Or Update On The Admitted Host

From the repo root on the admitted Windows host:

```powershell
powershell.exe -NoLogo -NoProfile -File .\scripts\gitlab-runner\windows\apply-governed-runner-lanes.ps1
```

That repo-owned apply surface requires the admitted `C:\GitLab-Runner`
registration baseline to exist already: `gitlab-runner.exe`,
`config.toml`, and the governed current-user Windows runner registration.

It keeps the scheduled-task action on the ambient PowerShell execution policy
instead of `ExecutionPolicy Bypass`.

The admitted Linux helper path consumed by the bootstrap remains:

```powershell
wsl.exe -d Ubuntu bash -lc '$HOME/gitlab-runner/start-linux-assurance.sh'
```

The repo-owned Windows bootstrap now treats that Linux helper as a bounded
readiness gate instead of a fire-and-forget launch. It retries the helper up
to `12` times with `10` second pauses and fails closed unless the helper exits
`0` after confirming the paired Linux assurance service is `enabled`,
`active`, and singular.

The bootstrap only performs stale-runtime cleanup before cold runner
admission. If no governed current-user runner manager is active, it forcibly
clears `LabVIEW`, `LabVIEWCLI`, and `LVCompare` with bounded
`Stop-Process`, `taskkill /PID /T /F`, and `taskkill /IM /T /F`; if any of
those processes remain afterward, the lane fails closed and the runner is not
started.

## Assert Live Host Drift

From the repo root on the admitted Windows host:

```powershell
powershell.exe -NoLogo -NoProfile -File .\scripts\gitlab-runner\windows\assert-governed-runner-lanes.ps1
npm run gitlab:runner:assert
```

The direct PowerShell assertion checks only the admitted Windows lane. The
repo-owned wrapper defaults to both lanes on the admitted Windows host: it
runs the Windows assertion directly and the Linux assertion through WSL, so
future sessions can prove the current scheduled-task/bootstrap state and the
paired Linux assurance service state in one command.

## Rehearse Governed Recovery

From the repo root on the admitted Windows host:

```powershell
npm run gitlab:runner:windows:recovery:rehearse
```

That governed rehearsal surface is native Windows only. It fails closed unless
the host is already clean before the run starts, then seeds one headless
LabVIEW contamination, runs
`scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1`,
retains a timestamped receipt root under
`.cache/windows-proof-runtime-recovery-rehearsal/`, and refreshes
`.cache/windows-proof-runtime-recovery-rehearsal/latest.json`.

## Manual Registration Pack

Do not commit the runner authentication token. Manual host registration uses a
placeholder only.

Registration:

```powershell
gitlab-runner.exe register `
  --non-interactive `
  --url "https://gitlab.com/" `
  --token "<runner-auth-token>" `
  --executor "shell" `
  --shell "pwsh" `
  --description "ghost" `
  --tag-list "windows,x64,labview-host,docker-windows,private-release" `
  --locked="true" `
  --run-untagged="false" `
  --maximum-timeout 7200
```

Governed current-user startup:

```powershell
powershell.exe -NoLogo -NoProfile -File "C:\GitLab-Runner\start-governed-runner-lanes.ps1"
```

Direct foreground recovery, if the scheduled bootstrap surface is unavailable:

```powershell
gitlab-runner.exe run --config C:\GitLab-Runner\config.toml
```

Governed mid-session Windows proof runtime recovery from the repo root:

```powershell
powershell.exe -NoLogo -NoProfile -File .\scripts\gitlab-runner\windows\recover-windows-proof-runtime-surface.ps1
```

The lane shall continue to preserve the same signed-in user context needed for
Docker Desktop Windows-container access and host LabVIEW proof. Do not replace
that contract with a `LocalSystem` service.

## Retained Evidence Contract

The job shall retain:

- `windows-private-release-evidence/manifest.json`
- `windows-private-release-evidence/host/settings-file.json`
- `windows-private-release-evidence/host/settings-write.txt`
- `windows-private-release-evidence/host/proof-run.txt`
- when bounded mid-session contamination recovery fires:
  `windows-private-release-evidence/host/proof-run-pre-recovery.txt`
  and `windows-private-release-evidence/host/proof-runtime-recovery.txt`
- operator-only recovery rehearsal receipts under
  `.cache/windows-proof-runtime-recovery-rehearsal/<timestamp>/`, including
  `proof-runtime-recovery.txt`
- the latest operator-only recovery rehearsal receipt at
  `.cache/windows-proof-runtime-recovery-rehearsal/latest.json`
- `windows-private-release-evidence/host/harness-report/**`
- `windows-private-release-evidence/container/settings-file.json`
- `windows-private-release-evidence/container/settings-write.txt`
- `windows-private-release-evidence/container/settings-validate.txt`
- `windows-private-release-evidence/container/proof-run.txt`
- `windows-private-release-evidence/container/harness-report/**`

The machine-readable manifest is the first recovery surface. When the bounded
host-native retry path is used, it records `proofAttemptCount` plus
`boundedRecovery`, including the repo-owned recovery script path and retained
recovery transcript, so future sessions do not have to reconstruct that
recovery from job logs alone.

The governed recovery rehearsal receipt is the second recovery surface. It
records the headless LabVIEW contamination seed, the repo-owned recovery
transcript path, and the preflight plus post-recovery runtime snapshots so
future sessions do not need ad hoc manual contamination steps to prove that
the recovery contract still works.

## Stop Rules

The runner lane fails closed when:

- the runner is not a native Windows host
- compiled CLI surfaces are missing
- provider settings cannot be written or validated
- the canonical host or container compare path fails for the admitted pair
- the harness report root is missing after a claimed compare run
- the machine-readable manifest is not retained
