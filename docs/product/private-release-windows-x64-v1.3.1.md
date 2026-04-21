# Windows x64 Private-Release Packet `v1.3.1`

## Purpose

Retain the first published Windows x64 private-release packet for the active
authority `release/1.3.1` slice without claiming exact/public release or
Marketplace publication. This packet now retains the governed preview VSIX,
package fingerprint, first fresh governed Windows host/container acceptance
receipt set, and the controlled GitLab private-release publication act for
`v1.3.1`.

## Governing Sequence

- active authority branch: `release/1.3.1`
- branch head baseline before this draft packet: `3fe766a`
- merged-green `develop` reopening baseline: `0f4db5e`
- merged-green `develop` pipeline: `2468407077` `success`
- release-branch pipeline: `2468432598` `success`
- local build state: authority worktree with uncommitted release-control,
  packet-retention, and governed publish-path updates retained locally for this
  private-release slice
- fresh acceptance manifest:
  `windows-private-release-evidence/manifest.json`
- fresh acceptance manifest generated at: `2026-04-21T14:14:27.778Z`
- retained historical published packet:
  [private-release-windows-x64-v1.3.0.md](./private-release-windows-x64-v1.3.0.md)
- retained historical machine-readable packet:
  [private-release-windows-x64-v1.3.0.json](./private-release-windows-x64-v1.3.0.json)

## Scope

- supported claim: Windows x64 private release only
- supported proof lanes for the intended `v1.3.1` prep route:
  - native Windows host LabVIEW
  - Docker Desktop in Windows-container mode
- first fresh evidence retained in this packet:
  - governed preview VSIX package build
  - SHA-256 and size fingerprint
  - governed Windows host acceptance receipt
  - governed Windows-container acceptance receipt
  - governed GitLab private-release publication receipt

## Explicit Non-Scope

- Linux installed-user support
- Linux proof as part of the active private-release claim
- Windows x86 / 32-bit LabVIEW release support
- WSL as part of the active user or proof contract
- exact SemVer tagging
- VS Code Marketplace publication
- `main` promotion

## Package Evidence

- package line: `1.3.1`
- retained package path: `preview-evidence/vi-history-suite-1.3.1.vsix`
- retained package SHA-256:
  `D211FC16CE9213F005C6DA9C6ED4FD14F8B298648C1446A3891B2BD697A0CFC5`
- retained package size: `495214` bytes
- retained package timestamp: `2026-04-21T14:06:14.4953320Z`
- governed build command:
  `npm run package -- --out "preview-evidence/vi-history-suite-1.3.1.vsix"`

## Private Release Publication

- publication status: `published-for-v1.3.1`
- publish command: `npm run gitlab:private-release:publish -- --skip-package --allow-dirty`
- release channel: GitLab private release
- release tag: `private-v1.3.1-windows-x64`
- release name: `Windows x64 Private Release v1.3.1`
- release URL:
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.1-windows-x64`
- direct VSIX asset URL:
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.1-windows-x64/downloads/private-releases/windows-x64/vi-history-suite-1.3.1.vsix`
- direct checksum asset URL:
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.1-windows-x64/downloads/private-releases/windows-x64/vi-history-suite-1.3.1.vsix.sha256`
- publish receipt:
  `.cache/private-release-publish/latest/private-release-publish.json`
- retained historical prior-line private-release tag: `private-v1.3.0-windows-x64`
- retained historical prior-line private-release URL:
  `https://gitlab.com/svelderrainruiz/vi-history-suite/-/releases/private-v1.3.0-windows-x64`
- interpretation:
  - the controlled `v1.3.1` Windows x64 private GitLab release is now the
    current private install surface for this line
  - the retained historical `v1.3.0` private GitLab release remains prior-line
    evidence only

## Retained Proof Scenario

- status: `retained-from-governed-v1.3.1-acceptance-run`
- harness: `HARNESS-VHS-002`
- upstream repo: `https://github.com/ni/labview-icon-editor.git`
- target VI: `resource/plugins/lv_icon.vi`
- selected hash baseline:
  `8741bb08026c104100720c0ef48621e4ab7762fd`
- base hash baseline:
  `c188cdec606aac3b17d8b17274baa19eef3e4017`
- staged repo head baseline:
  `778ab99a485342f992d169261d5d30b828b00736`

## Retained Proof Lanes

| Lane | Status | Generated At | Runtime Provider | Runtime Engine | Runtime Executable | INI Path | Port | Retained Root |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Windows host x64 | `succeeded` | `2026-04-21T14:13:42.907Z` | `host-native` | `labview-cli` | `C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.exe` | `C:\Program Files\National Instruments\LabVIEW 2026\LabVIEW.ini` | `3363` | `windows-private-release-evidence/host/` |
| Windows container x64 | `succeeded` | `2026-04-21T14:14:27.725Z` | `windows-container` | `labview-cli` | `powershell.exe` | `C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.ini` | `3363` | `windows-private-release-evidence/container/` |

## Retained Receipt Set

- machine-readable manifest:
  `windows-private-release-evidence/manifest.json`
- host settings file:
  `windows-private-release-evidence/host/settings-file.json`
- host settings write transcript:
  `windows-private-release-evidence/host/settings-write.txt`
- host proof transcript:
  `windows-private-release-evidence/host/proof-run.txt`
- host copied harness report root:
  `windows-private-release-evidence/host/harness-report/`
- host comparison-report smoke JSON:
  `windows-private-release-evidence/host/harness-report/comparison-report-smoke.json`
- host comparison-report smoke Markdown:
  `windows-private-release-evidence/host/harness-report/comparison-report-smoke.md`
- host comparison-report smoke HTML:
  `windows-private-release-evidence/host/harness-report/comparison-report-smoke.html`
- container settings file:
  `windows-private-release-evidence/container/settings-file.json`
- container settings write transcript:
  `windows-private-release-evidence/container/settings-write.txt`
- container settings validate transcript:
  `windows-private-release-evidence/container/settings-validate.txt`
- container proof transcript:
  `windows-private-release-evidence/container/proof-run.txt`
- container copied harness report root:
  `windows-private-release-evidence/container/harness-report/`
- container comparison-report smoke JSON:
  `windows-private-release-evidence/container/harness-report/comparison-report-smoke.json`
- container comparison-report smoke Markdown:
  `windows-private-release-evidence/container/harness-report/comparison-report-smoke.md`
- container comparison-report smoke HTML:
  `windows-private-release-evidence/container/harness-report/comparison-report-smoke.html`
- bounded recovery transcripts retained: none; both lanes completed on the
  first attempt

## Governed Runner Lane

- GitLab job: `windows_private_release_acceptance`
- governed CLI: `npm run acceptance:windows:private-release`
- governed script: `scripts/runWindowsPrivateReleaseAcceptance.js`
- runner-lane contract:
  [windows-private-release-runner-lane.md](./windows-private-release-runner-lane.md)
- retained artifact root: `windows-private-release-evidence/`
- expected machine-readable receipt:
  `windows-private-release-evidence/manifest.json`
- interpretation:
  - the runner-lane contract is already retained and historically admitted on
    the `v1.3.0` packet
  - the first fresh local `v1.3.1` runner receipt is now retained at
    `windows-private-release-evidence/manifest.json`
  - bounded recovery did not trigger; both lanes completed on the first attempt

## Validation Pack

The `v1.3.1` private-release packet is considered publication-baselined when
these pass:

1. `npm run package -- --out "preview-evidence/vi-history-suite-1.3.1.vsix"`
2. `Get-FileHash preview-evidence\vi-history-suite-1.3.1.vsix -Algorithm SHA256`
3. `npm run acceptance:windows:private-release`
4. `npm run design:gate`
5. `py -3 C:\Users\sveld\.codex\skills\repo-standards-review\scripts\run_assurance.py . --profile release-gate`
6. `npm run gitlab:private-release:publish -- --skip-package --allow-dirty`

The wider exact-release slice still remains open until these later governed
surfaces happen separately for `v1.3.1`:

1. protected `main` promotion
2. exact SemVer tagging
3. public GitHub exact release publication
4. VS Code Marketplace publication

## Interpretation

- The first fresh retained `v1.3.1` private-release evidence now includes the
  governed preview VSIX, package fingerprint, governed Windows host/container
  acceptance receipt set, governed prep gates, and the published GitLab
  private-release act.
- The retained `v1.3.1` private-release packet is now the current concrete
  published private-release packet/evidence surface.
- Exact tag, public GitHub exact release, and Marketplace acts remain separate
  later acts and are not claimed by this packet.

## Next Move

- keep the published `private-v1.3.1-windows-x64` GitLab release as the
  controlled Windows x64 install surface for this line
- retain exact-tag, public GitHub exact release, and Marketplace acts as
  separate later steps
