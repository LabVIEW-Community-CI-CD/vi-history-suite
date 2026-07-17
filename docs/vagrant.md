# Vagrant

Vagrant is a maintainer-run local Windows/LabVIEW isolation helper. It is never
wired into hosted CI (no workflow invokes it and hosted CI needs no hypervisor —
VHS-REQ-599), but it is **not optional for a marketplace release**: kicking off a
release requires a fresh local Vagrant validation attestation for the exact
release version (VHS-REQ-666). The maintainer runs the lane, records the
attestation into the committed runtime-validation ledger, and the
`Marketplace Release` workflow fails closed (before publish) unless that
attestation matches the release version. See
[Mandatory release attestation](#mandatory-release-attestation-vhs-req-666)
below and the [Release Flow](./maintainer-operations.md#release-flow).

Validate the Vagrantfile:

```bash
npm run vagrant:validate
```

Check host readiness before the heavy `vagrant up` (verifies the Vagrant and
VirtualBox CLIs, the `Vagrantfile`, and that the expected box is registered):

```bash
npm run vagrant:preflight
```

Report the current VM lifecycle state:

```bash
npm run vagrant:status
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

## Mandatory release attestation (VHS-REQ-666)

A marketplace release cannot be published without a fresh local Vagrant
validation attestation for the exact release version. Produce it with:

```bash
npm run vagrant:validate:release
```

This brings the guest up (self-healing its account at boot), runs the shipped
comparison primitives in-guest against the icon-editor `lv_icon.vi` fixture
(x86 host-native headless, VHS-REQ-665), and — only on a passing comparison —
records a release-gating attestation into
`docs/requirements/runtime-validation-ledger.json` (track
`vagrant-win-x86-hostnative`) via `scripts/recordRuntimeValidation.js`. Commit
the updated ledger.

Verify the gate locally before opening the release PR:

```bash
npm run release:readiness:gate   # node scripts/checkReleaseReadiness.js --strict --require-release-attestation
```

It exits nonzero (and prints `Verdict: ATTENTION`) until the gating track's
`lastValidatedVersion` equals the release version. The `Marketplace Release`
workflow runs this same gate before publishing and reads the committed ledger,
so enforcement needs no hypervisor in hosted CI and the workflow YAML never
names Vagrant. Default advisory `npm run release:readiness` is unchanged (it
does not enable the gate).

## Host recovery and the box store

The box artifact is large (~49 GB) and may live on an external drive. If the
lane stops working after a host reboot or a VirtualBox config corruption, check
these first (all observed at least once on the maintainer host):

- A zeroed `~/.config/VirtualBox/VirtualBox.xml` or golden `*.vbox` file —
  restore from the `*-prev` sibling VirtualBox keeps.
- `~/.vagrant.d/boxes` pointing at an unmounted drive — mount the box-store
  drive, then confirm with `vagrant box list`.
- Make the box-store mount persistent (an `fstab` entry with
  `nofail,x-systemd.automount`) so `vagrant box list` triggers an automount
  instead of failing after a reboot.

`npm run vagrant:preflight` surfaces a missing box or missing CLI as a `FAIL`
line so you can catch these before spending time on `vagrant up`.

## Box integrity manifest and durability

The golden box is a large single binary that cannot live in git and is rebuilt
by hand, so a disk failure or a silently corrupted copy would take the whole
Windows-validation capability with it. A small committed fingerprint
(`vagrant/box-manifest.json`, schema `vi-history-suite/vagrant-box-manifest@v1`)
records the box's SHA-256, size, and provenance so a restored, copied, or
archived box can be confirmed intact and identical to the box the recorded
attestations were produced on. The manifest is produced and checked with a
maintainer helper (`scripts/verifyVagrantBox.cjs`, a `.cjs` outside the
`scripts/*.js` traceability glob, never CI/VSIX):

```bash
# After rebuilding the golden box: fingerprint it and commit the manifest.
node scripts/verifyVagrantBox.cjs --generate "/path/to/vihs-selfheal.box"

# After restoring/copying/archiving a box: fail closed unless it matches.
node scripts/verifyVagrantBox.cjs --verify "/path/to/vihs-selfheal.box"

# Inspect the committed fingerprint.
node scripts/verifyVagrantBox.cjs --print
```

Durability checklist for the golden box:

- Keep at least two copies on **different physical drives** (the maintainer host
  keeps the provisioned box and the self-heal box on separate drives).
- Archive one copy to durable off-host storage, then run `--verify` against the
  archived copy so a future restore is trustworthy.
- Re-run `--generate` and commit the refreshed manifest whenever the box is
  rebuilt; the manifest's `recordedForVersion` notes the build it was fingerprinted
  against.
- The rebuild recipe is the `bootstrap`/self-heal provisioning in
  [`vagrant/provision/`](../vagrant/provision) plus the packaging steps; verify a
  rebuilt box with `--verify` (expect a new hash after a rebuild) and re-run the
  release attestation (`npm run vagrant:validate:release`) on it before trusting
  it for a release.

## WinRM handshake and the restricted `vagrant` account

A packaged box can boot to the Windows 11 desktop while the WinRM handshake
never completes — `vagrant up` loops on `Authentication failure. Retrying...`.
The usual root cause is guest-side: the local `vagrant` account is **restricted
from logon** (disabled, expired password, missing logon right, logon-hours
restriction, or "must change password at next logon"). VirtualBox guest-control
reports the same underlying problem as:

```
The specified user account on the guest is RESTRICTED and can't be used to logon
(VBOX_E_IPRT_ERROR 0x80bb0005)
```

Because both WinRM and guest-control are blocked, this cannot be fixed from the
host automation lane. Fix it interactively:

1. Boot the VM with a GUI console (`VBoxManage startvm <vm> --type gui`, or open
   VirtualBox and start the VM), and log in at the lock screen as `vagrant` or a
   local administrator. You will need to type the account password directly in
   the VM console.
2. Open an elevated PowerShell and run the repair provisioner:

   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\vihs-workspace\vagrant\provision\repair-vagrant-account.ps1
   ```

   It activates the account, clears logon-hours and password-expiry
   restrictions, ensures local-administrator membership, grants the interactive
   and network logon rights, re-asserts autologon, and enables the WinRM
   listener. It is idempotent and only touches the local `vagrant` account.
3. Sign out and back in once so the cleared logon flags take effect, then re-run
   `vagrant up` (or `vagrant reload --provision`) from the host.

Once WinRM is working again, the same script can be re-applied non-interactively
with `vagrant provision --provision-with repair-account`.

### Automatic boot-time self-heal

The `bootstrap` provisioner installs a `VIHSVagrantSelfHeal` scheduled task that
runs `repair-vagrant-account.ps1` as `SYSTEM` at every startup, before the WinRM
handshake. This means a freshly imported box repairs a restricted `vagrant`
account on its own — the interactive console fix above is only needed to recover
a box that predates the self-heal task (or if the task itself is removed). The
task and its script live under `C:\vagrant-selfheal\` in the guest.

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
