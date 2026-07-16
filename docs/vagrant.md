# Optional Vagrant

Vagrant is retained as an optional isolation helper for maintainers who already
have a compatible Windows/LabVIEW box. It is not part of required CI and is not
a release gate. The maintainer Windows/LabVIEW self-hosted runner is the normal
local installed-user validation lane once it is available.

Validate the Vagrantfile:

```bash
npm run vagrant:validate
```

Start the VM manually:

```bash
cd vagrant
vagrant up
```

Expected host prerequisites:

- Vagrant
- VirtualBox
- a registered Windows 11 plus LabVIEW 2026 box named by `VIHS_VAGRANT_BOX`

## 32-bit LabVIEW 2026 host-native headless lane (VHS-REQ-665)

The Vagrant VM runs host-native **32-bit** LabVIEW 2026 only; it never uses
Docker. Because a Vagrant WinRM session has no interactive desktop, the runtime
must prelaunch LabVIEW `--headless` before the LabVIEWCLI connects (otherwise the
CLI fails with the `-350000` VI Server connect error). Enable the opt-in toggle
and drive the shipped comparison primitives via the maintainer driver:

```powershell
$env:LV_RTE_WIN_HOSTNATIVE_HEADLESS = '1'
$env:WIN_PROVIDER = 'host'
$env:WIN_LV_BITNESS = 'x86'
$env:WIN_REPO_ROOT = 'C:\repos\labview-icon-editor'
$env:WIN_VI_PATH = 'resource/plugins/lv_icon.vi'
$env:WIN_BASE = '5376833'; $env:WIN_SELECTED = 'fc09736'
node scripts\windows-compare-driver.cjs
```

This mirrors the authoritative windows-container headless launch technique
(prelaunch, LabVIEWCLI.ini connect-window tuning, single cold-launch retry) but
targets 32-bit LabVIEW, the bitness the x64-only windows-container provider
cannot exercise. The toggle is opt-in and default-off; the default interactive
host-native path is unchanged. This lane is a local maintainer helper and never a
CI gate.

Keep any evidence produced by local Vagrant testing outside release claims
unless a future plan explicitly promotes it. Use
[docs/maintainer-operations.md](./maintainer-operations.md) for the current
maintainer validation model.
