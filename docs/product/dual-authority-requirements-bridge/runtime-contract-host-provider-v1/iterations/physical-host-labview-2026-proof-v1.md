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
- Why not `requirement-defect-candidate`: the same wrong behavior has not been
  observed in both authorities.
- Why not `implementation-defect-candidate`: no single-authority implementation
  defect has been isolated; the gap is claim scope versus current host evidence.

## Next Actions

1. Run #24 as the physical-host proof item, not a Linux Vagrant substitute.
2. If #24 passes, retain the fresh physical-host proof packet and close this
   iteration as an evidence-refresh outcome.
3. If #24 fails because Ubuntu 26.04 cannot admit the NI `noble` package path,
   update governed requirement wording and release/user surfaces to distinguish
   retained historical proof from current-host proof.
4. Open a GitHub Spec Kit refresh only if the imported requirement semantics
   change after the governed proof clarification.

## Public Boundary

No public GitHub import mutation is required in this iteration. The public import
already says Linux host proof remains distinct from Windows proof, and the public
Spec Kit task list already requires bug-oracle classification for observed
defects. Private install transcripts, physical-host proof packets, and local
control-plane evidence remain on the governed GitLab side.
