# Windows Hardening Host — Provisioning Checklist (VHS-REQ-713)

This is the reproducible provisioning procedure for the **real Windows hardening
host** that validates the `vi-history-suite` comparison runtime across the full
LabVIEW version × bitness grid (2020/2025/2026 × x86/x64) **and** both Docker
container modes (Linux and Windows containers). It closes the gap left by the
single Vagrant x86/2026 track (which stays a separate machine — see
[docs/vagrant.md](./vagrant.md) — and is **not** replaced by this host). It
supersedes the closed **#1316** (Windows host-native + windows-container +
bitness matrix).

> This host uses **Docker**; Docker and Vagrant/VirtualBox contend for the
> hypervisor, so this host does **not** run the Vagrant release-attestation box
> (VHS-REQ-666). Docker Desktop **switches** between Linux and Windows container
> modes (they are switchable, never concurrent).

## Content digest

The machine-readable provisioning descriptor is the fenced block delimited by
`provisioning-descriptor:begin` / `:end` below. Its content digest binds this
checklist to an exact host shape, mirroring the Vagrant box attestation pattern
(`vagrant/box-manifest.json`).

- Descriptor schema: `vi-history-suite/windows-hardening-host@v1`
- Descriptor SHA-256: `837c341ae24b14c718610a1da63225b0e5eac207aea438c681b43394e32c44e0`

Recompute the digest after editing the descriptor block (from the repo root):

```powershell
node -e "const fs=require('fs');const t=fs.readFileSync('docs/windows-hardening-host.md','utf8');const m=t.match(/provisioning-descriptor:begin -->\r?\n([\s\S]*?)\r?\n<!-- provisioning-descriptor:end/);const b=m[1].replace(/\r\n/g,'\n');console.log(require('crypto').createHash('sha256').update(b,'utf8').digest('hex'));"
```

## Part A — Provision the environment

### A1. Docker Desktop (both container modes)

1. Install Docker Desktop for Windows.
2. Enable **Linux containers** (WSL2 backend) and confirm **Windows containers**
   mode works (tray → *Switch to Windows containers*). Prefer **Hyper-V
   isolation** for Windows containers; Windows-container process isolation needs
   a matching host build (Windows Server 2022 / `ltsc2022`-compatible base).
3. Verify the daemon-mode probe the product itself uses (VHS-REQ-649/650):
   `docker info --format "{{.OSType}}"` returns `linux` in Linux mode and
   `windows` after switching.
4. Pull-test each mode:
   - Linux mode: `docker pull nationalinstruments/labview:2026q1-linux`
   - Windows mode: `docker pull nationalinstruments/labview:2026q1-windows`
   - Also `2025q3-linux` / `2025q3-windows`.
   - **LabVIEW 2020 has no container image** (NI tags are year-quarter, e.g.
     `2025q3`, `2026q1`); 2020 is **host-native only**.

### A2. Host-native LabVIEW grid (six installs)

Install each LabVIEW with its **LabVIEW CLI** and a **distinct VI Server port**
(`server.tcp.port` in that install's `LabVIEW.ini`) so port-admission and
multi-install selection are exercised (the matrix self-derives the expected port
from each install's `LabVIEW.ini`):

| Version | x86 (32-bit) | x64 (64-bit) |
|---|---|---|
| 2020 | `C:\Program Files (x86)\National Instruments\LabVIEW 2020` | `C:\Program Files\National Instruments\LabVIEW 2020` |
| 2025 | `C:\Program Files (x86)\National Instruments\LabVIEW 2025` | `C:\Program Files\National Instruments\LabVIEW 2025` |
| 2026 | `C:\Program Files (x86)\National Instruments\LabVIEW 2026` | `C:\Program Files\National Instruments\LabVIEW 2026` |

Prefer **LabVIEW Community** (free; same features as Professional) wherever
licensing allows. If a cell genuinely does not exist (NI dropped 32-bit for a
year), record it **N/A** in the evidence — that is not a gap.

> **Known runtime finding (2020 host-native compare):** comparison reports are
> currently gated to LabVIEW **2025 or newer**
> (`MINIMUM_COMPARISON_REPORT_LABVIEW_YEAR` in
> [src/reporting/runtime/labviewVersionSelection.ts](../src/reporting/runtime/labviewVersionSelection.ts)).
> A host-native **2020** *comparison* is therefore rejected end-to-end today.
> The runtime-conflict matrix still exercises 2020 as a **selected** version in
> the `version` family (the older-VI convert path) because a version conflict is
> detected before the minimum-year gate. Lowering the minimum to admit a real
> 2020 `CreateComparisonReport` is a product change that must be validated on
> this host before it ships, not assumed.

### A3. Repo + fixture setup

```powershell
git clone https://github.com/LabVIEW-Community-CI-CD/vi-history-suite C:\repos\vi-history-suite
cd C:\repos\vi-history-suite
git checkout develop
npm ci
npm run compile
git clone https://github.com/ni/labview-icon-editor C:\repos\labview-icon-editor
```

## Part B — Run the validation matrix

All drivers run **from the repo root after `npm run compile`** (they load
`.\out`). Evidence lands under `win-validation\` (gitignored). Fixture:
`resource/plugins/lv_icon.vi`, base `5376833`, selected `fc09736`.

### B1. Host-native compare — the present cells

Use [scripts/windows-compare-driver.cjs](../scripts/windows-compare-driver.cjs)
once per cell (env-var contract in its header). Example (host-native x64 2026):

```powershell
$env:WIN_REPO_ROOT='C:\repos\labview-icon-editor'
$env:WIN_VI_PATH='resource/plugins/lv_icon.vi'
$env:WIN_BASE='5376833'; $env:WIN_SELECTED='fc09736'
$env:WIN_PROVIDER='host'; $env:WIN_LV_VERSION='2026'; $env:WIN_LV_BITNESS='x64'
$env:WIN_LABEL='WB-host-2026-x64'
node scripts/windows-compare-driver.cjs
```

Repeat for `WIN_LV_VERSION` in {2025, 2026} × `WIN_LV_BITNESS` in {x86, x64}.
Expect `runtimeState=succeeded`, `reportExists=true`. For 2020 see the runtime
finding above.

### B2. Docker container compare — Linux and Windows

```powershell
# Linux mode
$env:WIN_PROVIDER='docker'; $env:WIN_LV_BITNESS='x64'
$env:WIN_CONTAINER_IMAGE='nationalinstruments/labview:2026q1-linux'
$env:WIN_LABEL='WC-linux-2026'; node scripts/windows-compare-driver.cjs
# Switch Docker to Windows containers, then:
$env:WIN_CONTAINER_IMAGE='nationalinstruments/labview:2026q1-windows'
$env:WIN_LABEL='WC-windows-2026'; node scripts/windows-compare-driver.cjs
```

Also do `2025q3-linux` / `2025q3-windows`. `docker` requires **x64** (there is
no x86 container).

### B3. Runtime-conflict matrix (no VS Code needed)

The matrix driver
[scripts/runWindowsRuntimeMatrix.js](../scripts/runWindowsRuntimeMatrix.js) is a
**30-row scenario manifest** (VHS-REQ-713) across four families:

| Family | Rows | Host vs Selected | Expected `runtimeBlockedReason` |
|---|---|---|---|
| `bitness` | 6 | same year, opposite bitness | `windows-host-bitness-conflict` |
| `version` | 12 | same bitness, different year (both directions, incl. 2020 convert path) | `windows-host-version-conflict` |
| `match` | 6 | host == selected, default port | `none` |
| `port` | 6 | host == selected, non-default ini-derived port | `none` |

```powershell
# Full grid (30 rows):
node scripts/runWindowsRuntimeMatrix.js --scenario all
# Lighter CI tier (~14 rows, every cell in at least one conflict + one admit):
node scripts/runWindowsRuntimeMatrix.js --scenario light
# A single cell or a legacy alias still works:
node scripts/runWindowsRuntimeMatrix.js --scenario bitness-2026-x64x86
node scripts/runWindowsRuntimeMatrix.js --scenario steady-A
```

Legacy ids `steady-A`/`steady-B`/`version-A`/`version-B`/`port-A` resolve to
their canonical manifest row so existing prompts and dispatch keep working. The
harness launches/stops the correct Host install per row and asserts the expected
blocked reason from a real `vihs --validate --proof-out` proof.

## Part C — Record evidence in the ledger

Record **only genuine passing runs** — never fabricate ledger evidence. For each
validated host-native cell and each validated Windows-container image, record a
track into [docs/requirements/runtime-validation-ledger.json](./requirements/runtime-validation-ledger.json):

```powershell
npm run runtime:validation:record -- --track winhost-2026-x64 --version <build-version> --commit <sha> --evidence "issue:#2335"
```

Proposed track ids (all `platform: windows`, `linuxExecutable: false`):

- Host-native: `winhost-2020-x86` … `winhost-2026-x64` (`provider: host-native`).
- Windows container: `windows-container-2025q3`, `windows-container-2026q1`
  (mirror the existing `linux-container-*` track shape).

These Windows tracks are `linuxExecutable: false`, so the risk ledger's
Linux-executable runtime-fidelity dimension does not surface them; they document
real-hardware coverage without being release-gating (only the Vagrant
`releaseGating: true` track gates a marketplace release — VHS-REQ-666).

<!-- provisioning-descriptor:begin -->
```json
{
  "schema": "vi-history-suite/windows-hardening-host@v1",
  "supersedes": 1316,
  "issue": 2335,
  "requirement": "VHS-REQ-713",
  "docker": {
    "linuxContainers": {
      "backend": "wsl2",
      "osTypeProbe": "linux",
      "images": [
        "nationalinstruments/labview:2026q1-linux",
        "nationalinstruments/labview:2025q3-linux"
      ]
    },
    "windowsContainers": {
      "isolation": "hyperv",
      "osTypeProbe": "windows",
      "hostBuild": "ltsc2022",
      "images": [
        "nationalinstruments/labview:2026q1-windows",
        "nationalinstruments/labview:2025q3-windows"
      ]
    }
  },
  "hostNativeGrid": [
    { "version": "2020", "bitness": "x86", "root": "C:\\Program Files (x86)\\National Instruments\\LabVIEW 2020", "note": "compare gated by MINIMUM_COMPARISON_REPORT_LABVIEW_YEAR=2025; convert-path selected only" },
    { "version": "2020", "bitness": "x64", "root": "C:\\Program Files\\National Instruments\\LabVIEW 2020", "note": "compare gated by MINIMUM_COMPARISON_REPORT_LABVIEW_YEAR=2025; convert-path selected only" },
    { "version": "2025", "bitness": "x86", "root": "C:\\Program Files (x86)\\National Instruments\\LabVIEW 2025" },
    { "version": "2025", "bitness": "x64", "root": "C:\\Program Files\\National Instruments\\LabVIEW 2025" },
    { "version": "2026", "bitness": "x86", "root": "C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026" },
    { "version": "2026", "bitness": "x64", "root": "C:\\Program Files\\National Instruments\\LabVIEW 2026" }
  ],
  "fixture": {
    "repo": "https://github.com/ni/labview-icon-editor",
    "vi": "resource/plugins/lv_icon.vi",
    "base": "5376833",
    "selected": "fc09736"
  },
  "matrix": {
    "driver": "scripts/runWindowsRuntimeMatrix.js",
    "canonicalRows": 30,
    "families": { "bitness": 6, "version": 12, "match": 6, "port": 6 },
    "legacyAliases": {
      "steady-A": "bitness-2026-x64x86",
      "steady-B": "bitness-2026-x86x64",
      "version-A": "version-2025-2026-x64",
      "version-B": "version-2026-2025-x64",
      "port-A": "port-2026-x64"
    }
  },
  "ledgerTracks": {
    "hostNative": ["winhost-2020-x86", "winhost-2020-x64", "winhost-2025-x86", "winhost-2025-x64", "winhost-2026-x86", "winhost-2026-x64"],
    "windowsContainer": ["windows-container-2025q3", "windows-container-2026q1"]
  }
}
```
<!-- provisioning-descriptor:end -->

## References

- [AGENTS.md](../AGENTS.md) — agent operating guide, gates, board.
- [.github/prompts/windows-maintainer-validation.prompt.md](../.github/prompts/windows-maintainer-validation.prompt.md) — Windows maintainer validation runbook.
- [scripts/windows-compare-driver.cjs](../scripts/windows-compare-driver.cjs) — host-native/container compare driver.
- [scripts/runWindowsRuntimeMatrix.js](../scripts/runWindowsRuntimeMatrix.js) — the runtime-conflict matrix harness.
- [docs/requirements/runtime-validation-ledger.json](./requirements/runtime-validation-ledger.json) — the evidence ledger.
- [scripts/recordRuntimeValidation.js](../scripts/recordRuntimeValidation.js) — records a track's validation.
- [docs/vagrant.md](./vagrant.md) — the separate Vagrant release-attestation host.
