# Windows Installed-User Release-Claim Ledger - 2026-05-14

## Purpose

This ledger records the Windows proof boundary for the current retained
`v1.3.16` installed-user claim without mutating public GitHub, VS Code
Marketplace, Git tags, release branches, or retained evidence.

The admitted claim is deliberately narrow: installed users on native Windows
with local LabVIEW 2026 x64 and the installed LabVIEWCLI launcher can generate
the canonical `HARNESS-VHS-002` comparison report through the host-native
LabVIEWCLI path.

## Admitted Evidence

| Evidence | State | Receipt | Required facts |
| --- | --- | --- | --- |
| Windows host LabVIEW 2026 x64 | admitted | `.cache/windows-host-labview-capability-proof/20260513T161541Z/fixture-proof/vihs-fixture-validation-proof.json` | `classification=validation-success`; `runtimeExecutionState=succeeded`; `runtimeProvider=host-native`; `runtimeEngine=labview-cli`; `generatedReportExists=true` |
| Exact VSIX installed-user proof | admitted | `.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json` | `status=passed`; `productionMutationAttempted=false`; `packageVersion=1.3.16`; `tag=v1.3.16`; VSIX SHA-256 verified; isolated `vihs --validate` returns `ready` |

The x64 host proof uses:

- LabVIEW: `C:\Program Files\National Instruments\LabVIEW 2026\LabVIEW.exe`
- LabVIEWCLI: `C:\Program Files (x86)\National Instruments\Shared\LabVIEW CLI\LabVIEWCLI.exe`

The installed x86 LabVIEWCLI surface is the canonical installed LabVIEWCLI
launcher and is valid for this retained x64 LabVIEW 2026 host proof.

## Blocked Evidence

| Evidence | State | Receipt | Observed facts |
| --- | --- | --- | --- |
| Windows Docker Desktop Windows-container proof | blocked, not admitted | `.cache/windows-docker-desktop-proof-blocker/20260513T154353Z/windows-docker-desktop-proof-blocker.json` | Docker OSType `windows`; server `29.4.3`; NI Windows image manifest reachable; layer pull ends with `unauthorized: authentication required` |
| Canonical Docker proof attempt | validation failure, not admitted | `vihs-fixture-proof/vihs-fixture-validation-proof.json` | `runtimeProvider=windows-container`; `runtimeEngine=labview-cli`; `runtimeExecutionState=failed`; `runtimeFailureReason=command-timed-out`; `generatedReportExists=false` |

Docker Desktop proof can only be admitted when a Windows-container proof receipt
shows `runtimeExecutionState=succeeded`, `runtimeProvider=windows-container`,
`runtimeEngine=labview-cli`, and `generatedReportExists=true`. Host proof must
not be substituted for that Docker proof.

## Gates

The host-only installed-user gate is:

```bash
npm run acceptance:windows:installed-user-host
```

It invokes `scripts/runWindowsPrivateReleaseAcceptance.js --scope host-only`
and retains `windows-installed-user-host-evidence/`. This gate does not run or
admit Docker proof.

The stricter aggregate private-release gate remains:

```bash
npm run acceptance:windows:private-release
```

That default full scope still requires both host-native and Windows-container
lanes to succeed.

The retained-claim assertion gate is:

```bash
npm run proof:windows-installed-user-claim:assert
```

It reads the tracked JSON ledger plus retained receipts and fails closed if the
host proof, exact VSIX proof, Docker blocker, Docker failure receipt, or
mutation boundary no longer match this claim.

## Mutation Boundary

| Surface | State |
| --- | --- |
| Public GitHub release | not performed |
| Public GitHub source | not performed |
| VS Code Marketplace | not performed |
| Git tags | not performed |
| Release branches | not deleted |
| Retained evidence deletion | false |
| GitHub Codespace creation | false |

## Retained Evidence

Preserve these evidence roots:

- `.cache/windows-host-labview-capability-proof/20260513T161541Z/`
- `.cache/windows-exact-vsix-install-proof/latest/`
- `.cache/windows-docker-desktop-proof-blocker/20260513T154353Z/`
- `vihs-fixture-proof/`
- `windows-installed-user-host-evidence/`
- `.cache/windows-installed-user-release-claim-assertion/latest/`
