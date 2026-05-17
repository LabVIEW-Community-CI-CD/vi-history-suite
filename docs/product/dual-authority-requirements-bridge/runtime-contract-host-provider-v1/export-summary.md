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
- Current status: `physical-host-proof-admitted-with-validate-fixture-success`
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
LabVIEW cleanly afterward.

#25 then resolved the wrapper defect without changing the public command
contract: Linux host-native `validate-fixture` now runs non-headless by default,
while Linux containers and explicit headless requests stay on the headless path.
The final retained proof exited `0`, generated a `451669` byte HTML report plus
`361` image assets, retained no runtime diagnostic reason, and closed LabVIEW
cleanly afterward. The public imported requirement semantics remain unchanged.

## Governed Iteration 2

- Iteration: `github-develop-runtime-contract-audit-v1`
- Work item:
  <https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/29>
- GitHub umbrella:
  <https://github.com/svelderrainruiz/vi-history-suite/issues/101>
- GitHub child issues:
  <https://github.com/svelderrainruiz/vi-history-suite/issues/102>,
  <https://github.com/svelderrainruiz/vi-history-suite/issues/103>,
  <https://github.com/svelderrainruiz/vi-history-suite/issues/104>
- Classification: `implementation-defect-candidate`
- Current status: `github-develop-audit-merged-with-verification-traceability-fix`
- Retained packet:
  `docs/product/dual-authority-requirements-bridge/runtime-contract-host-provider-v1/iterations/github-develop-runtime-contract-audit-v1.json`

The second live bridge loop used GitHub `develop` as the public sibling target
instead of treating GitHub `main` as the only public authority branch. Before
the audit, the fork/defork guard confirmed
`svelderrainruiz/vi-history-suite`, `isFork=false`, default branch `main`,
visibility `PUBLIC`, and viewer permission `ADMIN`.

PR #105 synchronized GitHub `develop` with `main` before the audit. It targeted
`develop`, merged at `2026-05-17T05:56:25Z`, and recorded merge commit
`99babd2f43309a8188c87fade2d5f8256d3dca40`. The public source package preview,
Linux installed-user smoke, and Windows installed-user contract checks passed.

PR #106 then audited the imported runtime-contract slice on GitHub `develop`.
It merged at `2026-05-17T06:01:33Z` with merge commit
`ab6c600dba01219b31808d150e8927b7e15b738e`. The audit found that public runtime
behavior and public documentation matched the imported requirements, but two
test-plan verification artifacts were missing from the public sibling:
`tests/unit/publicFixtureValidation.test.ts` and
`tests/unit/windowsDockerDesktopProofIntake.test.ts`.

The bridge classifies that result as an `implementation-defect-candidate`
because the wrong behavior was local to the GitHub verification surface. PR #106
added the missing tests, included them in the public `npm test` contract, and
marked the Spec Kit task ledger complete. No requirement semantics changed.

The changed public artifacts were scanned for private paths, private credential
terms, GitLab-only tooling names, and local standards-review tooling. No private
bridge evidence crossed into the public sibling repository. GitHub issues #102,
#103, and #104 were closed explicitly after the `develop` merge because GitHub
default-branch auto-close did not apply. GitHub umbrella #101 remains open until
this GitLab retained closeout merges.
