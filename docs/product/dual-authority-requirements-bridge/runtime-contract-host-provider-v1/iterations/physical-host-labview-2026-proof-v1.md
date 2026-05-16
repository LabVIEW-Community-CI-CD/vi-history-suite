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

- Classification: `requirement-clarification-candidate`
- Current status: `blocked-awaiting-operator-sudo-session`
- Why not `requirement-defect-candidate`: the same wrong behavior has not been
  observed in both authorities.
- Why not `implementation-defect-candidate`: no single-authority implementation
  defect has been isolated; the gap is claim scope versus current host evidence.

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

## Next Actions

1. Open a local terminal on the physical host and authenticate `sudo`.
2. Run #24 as the physical-host proof item, not a Linux Vagrant substitute.
3. If #24 passes, retain the fresh physical-host proof packet and close this
   iteration as an evidence-refresh outcome.
4. If #24 fails because Ubuntu 26.04 cannot admit the NI `noble` package path,
   update governed requirement wording and release/user surfaces to distinguish
   retained historical proof from current-host proof.
5. Open a GitHub Spec Kit refresh only if the imported requirement semantics
   change after the governed proof clarification.

## Public Boundary

No public GitHub import mutation is required in this iteration. The public import
already says Linux host proof remains distinct from Windows proof, and the public
Spec Kit task list already requires bug-oracle classification for observed
defects. Private install transcripts, physical-host proof packets, and local
control-plane evidence remain on the governed GitLab side.
