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
- Windows service installation is not active for this admitted lane

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
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "C:\GitLab-Runner\start-governed-runner-lanes.ps1"
```

Direct foreground recovery, if the scheduled bootstrap surface is unavailable:

```powershell
gitlab-runner.exe run --config C:\GitLab-Runner\config.toml
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
- `windows-private-release-evidence/host/harness-report/**`
- `windows-private-release-evidence/container/settings-file.json`
- `windows-private-release-evidence/container/settings-write.txt`
- `windows-private-release-evidence/container/settings-validate.txt`
- `windows-private-release-evidence/container/proof-run.txt`
- `windows-private-release-evidence/container/harness-report/**`

The machine-readable manifest is the first recovery surface. Future sessions
should not reconstruct runner-lane truth from job logs alone.

## Stop Rules

The runner lane fails closed when:

- the runner is not a native Windows host
- compiled CLI surfaces are missing
- provider settings cannot be written or validated
- the canonical host or container compare path fails for the admitted pair
- the harness report root is missing after a claimed compare run
- the machine-readable manifest is not retained
