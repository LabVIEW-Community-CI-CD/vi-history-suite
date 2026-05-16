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
