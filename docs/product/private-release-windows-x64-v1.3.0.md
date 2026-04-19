# Windows x64 Private-Release Packet `v1.3.0`

## Purpose

Retain the governed Windows-only private-release-prep packet for the current
`develop` package line `1.3.0` without claiming an exact/public release,
Marketplace publication, or Linux support. The current branch extension adds
the tagged GitLab Windows runner lane that retains this same scenario under
`windows-private-release-evidence/`.

## Governing Sequence

- docs-only branch merged first: `feature/windows-private-release-docs-26514`
  at `376dd881ecbe0ab9f474500c20f7719f84d72d85`
- current prep branch: `feature/windows-private-release-prep`
- package-audit baseline commit: `1d10b52a9c2b5081c621e91379985a6da2626bdc`
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
- WSL as part of the active user or proof contract
- exact SemVer tagging
- VS Code Marketplace publication
- `main` promotion

## Package Evidence

- package line: `1.3.0`
- retained package path: `preview-evidence/vi-history-suite-1.3.0.vsix`
- retained package SHA-256:
  `3092C9B740F13AC31FDEABCE00822FBDA13A3C7C6AEF0261D92EA38051751ACA`
- retained package size: `497392` bytes
- package-audit baseline commit:
  `1d10b52a9c2b5081c621e91379985a6da2626bdc`

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
  - host install and runner registration remain manual Windows admin work
  - no secret runner token is retained in the repo

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
- Linux remains a later branch concern and is not part of this packet.

## Next Move

- install and register the tagged Windows runner manually
- retain the first `windows_private_release_acceptance` receipt on the
  admitted Windows host
- keep Linux deferred until the Windows runner lane is green
