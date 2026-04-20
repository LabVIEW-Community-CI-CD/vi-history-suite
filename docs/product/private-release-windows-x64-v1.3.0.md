# Windows x64 Private-Release Packet `v1.3.0`

## Purpose

Retain the governed Windows-only private-release packet and published private
GitLab release for the current `develop` package line `1.3.0` without
claiming an exact/public release, Marketplace publication, or Linux support.
The current branch extension adds the tagged GitLab Windows runner lane that
retains this same scenario under `windows-private-release-evidence/` plus the
repo-owned `npm run gitlab:private-release:publish` surface that packages and
publishes the controlled Windows-only install asset.

## Governing Sequence

- docs-only branch merged first: `feature/windows-private-release-docs-26514`
  at `376dd881ecbe0ab9f474500c20f7719f84d72d85`
- current private-release publication branch:
  `feature/windows-private-release-publication-governance`
- published private-release source commit:
  `7f7a6c85cf476d2454ada2464704a4b82c2de921`
- next deferred branch after this prep slice merges: `feature/linux-runtime-variant`

## Scope

- supported claim: Windows x64 private release only
- supported proof lanes on this machine:
  - native Windows host LabVIEW
  - Docker Desktop in Windows-container mode
- runtime-provider CLI expectation:
  - `host` for native Windows LabVIEW
  - `docker` for the bounded expert Windows-container lane

## Explicit Non-Scope

- Linux installed-user support
- Linux proof as part of the active private-release claim
- Windows x86 / 32-bit LabVIEW release support
- WSL as part of the active user or proof contract
- exact SemVer tagging
- VS Code Marketplace publication
- `main` promotion

## Package Evidence

- package line: `1.3.0`
- retained package path: `preview-evidence/vi-history-suite-1.3.0.vsix`
- retained package SHA-256:
  `D9715C82A5DA955F32F4CF96AD036E61113A07E506E258A57CD25473692F6448`
- retained package size: `501486` bytes

## Private Release Publication

- publish command: `npm run gitlab:private-release:publish`
- release channel: GitLab private release
- release tag: `private-v1.3.0-windows-x64`
- release name: `Windows x64 Private Release v1.3.0`
- release URL:
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64`
- published source branch:
  `feature/windows-private-release-publication-governance`
- published source commit:
  `7f7a6c85cf476d2454ada2464704a4b82c2de921`
- VSIX direct asset URL:
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64/downloads/private-releases/windows-x64/vi-history-suite-1.3.0.vsix`
- SHA-256 direct asset URL:
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64/downloads/private-releases/windows-x64/vi-history-suite-1.3.0.vsix.sha256`
- retained publish receipt:
  `.cache/private-release-publish/latest/private-release-publish.json`

## Proved Scenario

- harness: `HARNESS-VHS-002`
- upstream repo: `https://github.com/ni/labview-icon-editor.git`
- target VI: `resource/plugins/lv_icon.vi`
- selected hash: `8741bb08026c104100720c0ef48621e4ab7762fd`
- base hash: `c188cdec606aac3b17d8b17274baa19eef3e4017`
- staged repo head: `778ab99a485342f992d169261d5d30b828b00736`

## Retained Proof Summary

| Lane | Status | Generated At | Runtime Provider | Runtime Engine | Runtime Executable | INI Path | Port | Retained Root |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Windows host x64 | succeeded | `2026-04-19T05:52:06.961Z` | `host-native` | `labview-cli` | `C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.exe` | `C:\Program Files\National Instruments\LabVIEW 2026\LabVIEW.ini` | `3363` | `.cache/private-release/1.3.0/windows-x64-host/` |
| Windows container x64 | succeeded | `2026-04-19T05:40:59.691Z` | `windows-container` | `labview-cli` | `powershell.exe` | `C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.ini` | `3363` | `.cache/private-release/1.3.0/windows-x64-container/` |

## Retained Provider-Selection Evidence

- host settings write:
  `.cache/private-release/1.3.0/windows-x64-host/settings-write.txt`
- host proof run:
  `.cache/private-release/1.3.0/windows-x64-host/proof-run.txt`
- container settings write:
  `.cache/private-release/1.3.0/windows-x64-container/settings-write.txt`
- container settings validate:
  `.cache/private-release/1.3.0/windows-x64-container/settings-validate.txt`
- container proof run:
  `.cache/private-release/1.3.0/windows-x64-container/proof-run.txt`

## Governed Runner Lane

- GitLab job: `windows_private_release_acceptance`
- governed CLI: `npm run acceptance:windows:private-release`
- governed script: `scripts/runWindowsPrivateReleaseAcceptance.js`
- runner-lane contract:
  [windows-private-release-runner-lane.md](./windows-private-release-runner-lane.md)
- retained artifact root: `windows-private-release-evidence/`
- expected machine-readable receipt:
  `windows-private-release-evidence/manifest.json`
- current branch interpretation:
  - the repo-controlled runner lane is defined on this branch
  - the repo-controlled host asset pack and apply surfaces are versioned under
    `scripts/gitlab-runner/`
  - the admitted runner on this host is `ghost` (`52775990`)
  - the runner is launched at user logon by scheduled task
    `VIHS Governed Runner Lanes`
  - the governed Windows apply surface is
    `scripts/gitlab-runner/windows/apply-governed-runner-lanes.ps1`
  - the governed Windows bootstrap asset is
    `scripts/gitlab-runner/windows/start-governed-runner-lanes.ps1`
  - the governed Windows drift assertion surface is
    `scripts/gitlab-runner/windows/assert-governed-runner-lanes.ps1`
  - the governed Windows proof runtime recovery surface is
    `scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1`
  - the governed Windows proof runtime recovery rehearsal surface is
    `scripts/runWindowsProofRuntimeRecoveryRehearsal.js` via
    `npm run gitlab:runner:windows:recovery:rehearse`
  - the admitted scheduled-task action stays
    `powershell.exe -NoLogo -NoProfile -File "C:\GitLab-Runner\start-governed-runner-lanes.ps1"`
    without `ExecutionPolicy Bypass`, and the apply surface fails closed
    unless exactly one configured runner manager remains after apply
  - the governed Windows drift assertion fails closed unless the installed
    bootstrap still matches the repo source, that exact task action plus its
    logon trigger remain intact, `C:\GitLab-Runner\config.toml` still contains
    `request_concurrency = 2`, and exactly one configured runner manager is
    live
  - that Windows bootstrap clears stale `LabVIEW`, `LabVIEWCLI`, and
    `LVCompare` before cold runner admission with bounded `Stop-Process`,
    `taskkill /PID /T /F`, and `taskkill /IM /T /F`, and fails closed if
    contamination remains
  - when the host-native proof exits on that same cleanup seam, the acceptance
    wrapper preserves the first failed proof transcript as
    `windows-private-release-evidence/host/proof-run-pre-recovery.txt`, runs
    the repo-owned Windows proof runtime recovery script
    `scripts/gitlab-runner/windows/recover-windows-proof-runtime-surface.ps1`,
    retains `windows-private-release-evidence/host/proof-runtime-recovery.txt`,
    waits `5000` ms, reruns the host-native proof once, and fails closed if
    the repo-owned recovery step plus retry still fails
  - the admitted Windows host also retains one controlled headless LabVIEW
    contamination rehearsal via
    `scripts/runWindowsProofRuntimeRecoveryRehearsal.js` /
    `npm run gitlab:runner:windows:recovery:rehearse`, with the latest receipt
    refreshed at `.cache/windows-proof-runtime-recovery-rehearsal/latest.json`
  - the governed Linux apply/helper/service surfaces are
    `scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh`,
    `scripts/gitlab-runner/linux/start-linux-assurance.sh`, and
    `scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service`
  - the governed Linux drift assertion surface is
    `scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh`
  - the admitted Windows-host wrapper across both lanes is
    `scripts/assertGovernedRunnerLanes.js` via
    `npm run gitlab:runner:assert`
  - that Linux drift assertion fails closed unless the installed helper and
    service unit still match the repo source, `~/.gitlab-runner/config.toml`
    still contains `request_concurrency = 2`, the admitted service
    fragment/user and working directory remain exact, and exactly one
    configured runner process is live
  - no secret runner token is retained in the repo

## First Retained Runner Receipt

| Field | Value |
| --- | --- |
| Merge request | `!91` |
| Pipeline | `2463649610` |
| Job | `13988738012` |
| Commit | `d154a47bf1211d9a9fe8bc4c10352989780d1810` |
| Status | `success` |
| Queued duration | `0.51449` seconds |
| Duration | `257.909998` seconds |
| Finished at | `2026-04-19T15:12:02.212Z` |
| Job URL | `https://gitlab.com/svelderrainruiz/vi-history-suite/-/jobs/13988738012` |
| Artifacts file | `artifacts.zip` |
| Artifacts size | `1729689` bytes |

The first governed `windows_private_release_acceptance` receipt is now
retained on `develop`, so this packet no longer depends on an unproven runner
lane.

The operator-only recovery rehearsal stays separate from that CI receipt. It
exists to prove the repo-owned Windows recovery path under one controlled
headless LabVIEW contamination without waiting for a real job failure.

## Validation Pack

The prep branch is considered ready only when these pass:

1. `npm run design:gate`
2. `py -3 C:\Users\sveld\.codex\skills\repo-standards-review\scripts\run_assurance.py . --profile release-gate`
3. `npm run package:audit`
4. `npm run package -- --out "preview-evidence/vi-history-suite-1.3.0.vsix"`

## Interpretation

- The active `1.3.0` private-release claim is now bound to one tracked packet
  instead of to ignored `.cache` roots and chat memory alone.
- The package and proof packet stay Windows-only and x64-only for this prep
  sequence.
- The governed GitLab Windows runner lane has produced its first retained
  receipt, and the governed private GitLab release now packages that same
  Windows-only claim for controlled install testing.
- Linux remains a later branch concern and is not part of this packet.

## Next Move

- use the published `private-v1.3.0-windows-x64` GitLab release as the
  controlled Windows-only install surface for `1.3.0` feedback
- keep exact SemVer/public release, Marketplace publication, and `main`
  promotion on the later governed `release/* -> main -> develop` path
- keep Linux deferred until the exact/public `1.3.0` line closes, and open
  Linux LabVIEW 64-bit only on the next release after `1.3.0`
- keep Windows x86 / 32-bit LabVIEW out of scope for the active `v1.3.0`
  release claim and treat any retained x86 evidence as later non-blocking
  characterization only
