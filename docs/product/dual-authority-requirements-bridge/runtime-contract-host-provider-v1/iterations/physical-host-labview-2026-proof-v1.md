# Physical-Host LabVIEW 2026 Proof Bridge Iteration

## Purpose

This is the first governed runtime-contract bridge iteration after the
`runtime-contract-host-provider-v1` public import landed. It binds GitLab work
item #24 to the imported requirement slice instead of treating the bridge as
static scaffolding.

## Slice

- Slice: `runtime-contract-host-provider-v1`
- Target feature: `runtime-contract-host-provider`
- Governed work item:
  <https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/24>
- Primary imported requirements:
  - `VHS-SYS-REQ-006`
  - `VHS-SYS-REQ-007`
  - `VHS-REQ-588`
  - `VHS-REQ-589`
  - `VHS-REQ-590`

## Observation

The governed requirements and retained benchmark packets say Linux host LabVIEW
2026 Community x64 proof is admitted as a distinct evidence class from Windows
installed-user proof. The current physical-host inspection retained in #24 says
the host is Ubuntu 26.04, the available NI package source is the Ubuntu 24.04
`noble` repository, and `LabVIEWCLI` is not discoverable on the physical host.

That does not yet prove a source defect in either authority. It proves the
current claim needs a governed clarification: either #24 refreshes the
physical-host proof, or the requirement and release/user surfaces must distinguish
retained historical Linux host proof from current physical-host proof.

## Bug-Oracle Classification

- Initial classification: `requirement-clarification-candidate`
- Current classification: `implementation-defect-candidate`
- Current status: `physical-host-proof-admitted-with-headless-follow-up`
- Why not `requirement-defect-candidate`: the same wrong behavior has not been
  observed in both authorities.
- Why `implementation-defect-candidate`: physical-host LabVIEW proof passed
  through non-headless `LabVIEWCLI CreateComparisonReport`, while the GitLab
  Linux host `validate-fixture` headless wrapper timed out after cloning and
  staging the correct fixture pair.

## Preflight Outcome: 2026-05-16

Codex ran the physical-host preflight without performing a system mutation. The
preflight confirmed:

- Host: `sergio-ThinkPad-P16-Gen-3`
- Kernel: `Linux 7.0.0-14-generic x86_64 GNU/Linux`
- OS: Ubuntu `26.04 LTS`, codename `resolute`
- Installed NI repository package:
  `ni-labview-2026-noble-community 26.1.1.49170-0+f18`
- Available NI package candidates:
  - `ni-labview-2026-community 26.1.1.49170-0+f18`
  - `ni-labview-command-line-interface 26.1.0.49328-0+f176`
  - `labview-2026-community-exe 26.1.1.49170-0+f18`
  - `labview-2026-rte 26.1.1.49170-0+f18`
  - `ni-labview-vicompare 26.1.0.49387-0+f235`
- Download SHA-256 values still match the #24 inspected inputs.
- `LabVIEWCLI` is not discoverable.
- No `LabVIEWCLI` or `LabVIEW` binary was found under the searched `/usr` or
  `/usr/local` roots.

The install attempt is blocked before mutation because `sudo -n true` returns
`interactive authentication is required`. The next operator action is to open a
local terminal on the physical host, authenticate `sudo`, and run the retained
#24 install/proof command block there.

## Install Outcome: 2026-05-16

After operator authorization, Codex installed the NI LabVIEW 2026 Community x64
package set from the NI `noble` repository on the physical Ubuntu 26.04 host.
No LabVIEW activation was attempted by Codex.

Retained local evidence under `.cache/physical-host-labview-2026-proof/` records:

- `apt-get update`: exit `0`
- `apt-get -s install ni-labview-2026-community
  ni-labview-command-line-interface ni-labview-vicompare`: exit `0`
- `apt-get install`: exit `0`
- downloaded archive size: `861 MB`
- newly installed packages: `40`
- installed package highlights:
  - `ni-labview-2026-community 26.1.1.49170-0+f18`
  - `ni-labview-command-line-interface 26.1.0.49328-0+f176`
  - `ni-labview-vicompare 26.1.0.49387-0+f235`
- discovered executable paths:
  - `/usr/local/bin/LabVIEWCLI`
  - `/usr/local/natinst/LabVIEW-2026-64/labview`
  - `/usr/local/bin/LVCompare`

The bridge iteration stopped at the activation boundary until Sergio completed
LabVIEW Community activation on the physical host. Codex did not activate
LabVIEW or provide NI account credentials.

## Activation, Compatibility, and Proof Outcome: 2026-05-16

After activation, Codex repaired and proved the host runtime in three steps.

First, LabVIEW GUI launch required `libGLU.so.1`. Codex installed
`libglu1-mesa 9.0.2-1.1build2`, relaunched LabVIEW, and observed the activation
dialog. The local LabVIEW config was backed up before launch troubleshooting at
`/home/sergio/natinst/.config/LabVIEW-2026/labview.conf.bak-20260516T140508Z`.

Second, `LabVIEWCLI` initially failed to load
`/usr/local/lib64/liblvrt.so.26.0` on this Ubuntu 26.04 host because glibc
`2.43` rejected the library's executable-stack request. The compatibility
repair was:

- install `patchelf 0.18.0-1.4build1` and `pax-utils 1.3.10-1`
- back up `/usr/local/lib64/LabVIEW-2026-64/liblvrt.so.26.1.1`
- run `patchelf --clear-execstack` on that library
- verify `patchelf --print-execstack` reports `-`

Third, `vihs --validate --settings-file /home/sergio/.config/Code/User/settings.json
--proof-out ./.cache/physical-host-labview-2026-proof/latest` passed:

- proof status: `ready`
- implementation status: `implemented`
- runtime validation outcome: `ready`
- runtime provider: `host-native`
- runtime engine: `labview-cli`
- error code: `VIHS_OK`

Codex then tested the cloned `ni/labview-icon-editor` fixture. The packaged
`validate-fixture` route cloned the repository and staged both `lv_icon.vi`
revisions, but the headless `CreateComparisonReport` command timed out after
`300000 ms`. Retained diagnostics report `linux-headless-recursive-load` with
recursive LEIF loads while opening `GSW_MainPanel.vi`. This was not a missing
clone or missing `lv_icon.vi` intermediate step; the cloned fixture and staged
left/right VI files were present in the proof tree.

The physical-host proof was admitted by rerunning the prior admitted Linux-host
proof shape: non-headless `LabVIEWCLI CreateComparisonReport` against the same
cloned and staged `lv_icon.vi` pair. That run passed:

- command exit: `0`
- report:
  `.cache/physical-host-labview-2026-proof/20260516T111227Z/manual-create-comparison-after-activation/diff-report-lv_icon.vi.html`
- report size: `414111` bytes
- report SHA-256:
  `bb1586a22f6948b2be434fb3df974576b0fd90b0b1338aed9d96596606767813`
- report asset count: `361`
- report asset bytes: `3514474`
- LabVIEWCLI log SHA-256:
  `74299170f16fe2f7093d233f383a73e89ebfaaf7cc5ac24a8be73007f10b42a1`
- old fixture VI SHA-256:
  `2cac4ad195978f5424b08a8c63796c6a3d6193fb54bca4bfab3b645220c4ec98`
- new fixture VI SHA-256:
  `1419b180fe2d6aa68507f46775578c73822cad122b255b353e0922a81edf49d6`

`CloseLabVIEW` completed after the manual proof, and no LabVIEW or LabVIEWCLI
process remained. Work item #24 is therefore an admitted physical-host Linux
LabVIEW 2026 Community x64 proof refresh, not a Linux Vagrant substitute. The
separate headless
`validate-fixture` timeout is tracked by work item #25 as an implementation
follow-up for the fixture proof wrapper on this host, not a requirement
semantics change.

## Next Actions

1. Close #24 as physical-host Linux LabVIEW 2026 Community x64 proof admitted.
2. Do #25 for Linux host `validate-fixture` headless execution on Ubuntu 26.04.
3. Keep the GitHub Spec Kit import unchanged unless the follow-up changes
   imported requirement semantics.

## Public Boundary

No public GitHub import mutation is required in this iteration. The public import
already says Linux host proof remains distinct from Windows proof, and the public
Spec Kit task list already requires bug-oracle classification for observed
defects. Private install transcripts, physical-host proof packets, and local
control-plane evidence remain on the governed GitLab side.
