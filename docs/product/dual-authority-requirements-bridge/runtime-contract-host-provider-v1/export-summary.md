# Runtime Contract Host Provider Export

## Purpose

This packet is the first dual-authority requirements-core export after the
`v1.3.16` split baseline. It prepares the runtime-provider contract for the
GitHub sibling product to consume through Spec Kit without depending on GitLab
private context or local assurance tooling.

## Source

- Source authority: GitLab governed sibling product
- Source repo: `https://gitlab.com/svelderrainruiz/vi-history-suite`
- Split baseline: `v1.3.16`
- Export commit: `31add781bd04cc832d9fb55aa821a69305a91a37`
- Target public import path:
  `docs/requirements/imports/runtime-contract-host-provider-v1/`

## Imported Requirement IDs

- `VHS-SYS-REQ-004`
- `VHS-SYS-REQ-005`
- `VHS-SYS-REQ-006`
- `VHS-SYS-REQ-007`
- `VHS-SYS-REQ-008`
- `VHS-REQ-094`
- `VHS-REQ-095`
- `VHS-REQ-138`
- `VHS-REQ-141`
- `VHS-REQ-144`
- `VHS-REQ-146`
- `VHS-REQ-148`
- `VHS-REQ-194`
- `VHS-REQ-588`
- `VHS-REQ-589`
- `VHS-REQ-590`

## Redaction Boundary

The public import may describe a sibling authority and the `v1.3.16` split
baseline. It must not require private filesystem paths, private GitLab
credentials, local assurance-script names, or local standards-review tooling.

The public import is intentionally requirements-only. No implementation source
files, proof packets, or GitLab release credentials cross this boundary.

## Bug Oracle

- Same wrong runtime behavior in GitHub and GitLab indicates a
  requirement-defect candidate.
- Wrong runtime behavior in one authority only indicates an
  implementation-defect candidate.
- Ambiguous runtime expectations indicate a requirement-clarification
  candidate.

## Governed Iteration 1

- Iteration: `physical-host-labview-2026-proof-v1`
- Work item:
  <https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/24>
- Classification: `implementation-defect-candidate`
- Current status: `physical-host-proof-admitted-with-headless-follow-up`
- Retained packet:
  `docs/product/dual-authority-requirements-bridge/runtime-contract-host-provider-v1/iterations/physical-host-labview-2026-proof-v1.json`

The first live bridge loop uses #24 to clarify whether the retained Linux host
LabVIEW 2026 proof remains the current physical-host claim on the Ubuntu 26.04
maintainer machine. The public import remains unchanged unless the governed
proof result changes the imported requirement semantics.

The 2026-05-16 preflight initially found no discoverable LabVIEWCLI binary and
confirmed that `sudo` required interactive operator authentication. After
operator authorization, Codex installed the NI LabVIEW 2026 Community x64
package set from the NI `noble` repository. `LabVIEWCLI` is now discoverable at
`/usr/local/bin/LabVIEWCLI`, LabVIEW is installed at
`/usr/local/natinst/LabVIEW-2026-64/labview`, and Sergio completed LabVIEW
Community activation.

Post-activation proof admitted the physical host after two compatibility
repairs: install `libglu1-mesa` for GUI launch and clear the executable-stack
flag on `/usr/local/lib64/LabVIEW-2026-64/liblvrt.so.26.1.1` for glibc `2.43`.
`vihs --validate` passed with `runtimeValidationOutcome=ready` and
`errorCode=VIHS_OK`.

The packaged headless `validate-fixture` route cloned `ni/labview-icon-editor`
and staged both `lv_icon.vi` revisions, but timed out after `300000 ms` with
the retained `linux-headless-recursive-load` diagnostic. The admitted proof uses
the prior Linux-host proof shape instead: non-headless `LabVIEWCLI
CreateComparisonReport` against the same cloned fixture pair. That run exited
`0`, generated a `414111` byte HTML report plus `361` image assets, and closed
LabVIEW cleanly afterward. The headless timeout is retained as implementation
follow-up #25; it does not change the public imported requirement semantics.
