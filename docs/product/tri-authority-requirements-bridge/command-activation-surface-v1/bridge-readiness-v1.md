# Command Activation Surface Bridge Readiness

Recorded: `2026-05-18T04:06:53Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/40`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`IAU-candidate-command-activation-surface-v1` is **bridge-ready** for the MIT
Spec Kit authority.

Create a public MIT import and Spec Kit feature for
`command-activation-surface-v1` before any implementation begins. The import
should carry `VHS-REQ-594` only and should lock the command activation contract
for the MIT product surface.

This decision does not admit implementation.

## Why Advance

The GitLab governed authority already implements and tests the command
activation contract in the Suite manifest. The MIT authority currently has
package identity metadata only; it does not yet have a public requirement,
Spec Kit feature, activation-event contract, command contribution contract, or
implementation admission for command activation.

This is the right next public bridge unit because it is small, public-safe,
environment-independent, and necessary before MIT can become a real VS Code
extension surface.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate | `IAU-candidate-command-activation-surface-v1` |
| Future slice ID | `command-activation-surface-v1` |
| Imported requirement IDs | `VHS-REQ-594` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `54a9e713bcd788bd91d6893f3c6550716691b7d4` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `d357776e232b67b79060c315882fb8a2cf5cbcfd` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement ID `VHS-REQ-594`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- activation event IDs:
  - `onCommand:labviewViHistory.open`
  - `onCommand:labviewViHistory.openDocumentation`
  - `onCommand:labviewViHistory.prepareLocalRuntimeSettingsCli`
- command IDs:
  - `labviewViHistory.open`
  - `labviewViHistory.openDocumentation`
  - `labviewViHistory.prepareLocalRuntimeSettingsCli`
- display titles:
  - `VI History`
  - `Open Documentation`
  - `Prepare Local Runtime Settings CLI`
- Marketplace-disabled posture
- blocked scope for runtime handlers, execution, publishing, and source reuse

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- Marketplace publication or release automation
- runtime command-handler implementation
- LabVIEWCLI command execution
- Docker command execution or orchestration

## Recommended Public Import

| Field | Value |
| --- | --- |
| Public import path | `docs/requirements/imports/command-activation-surface-v1/` |
| Spec Kit path | `.specify/specs/command-activation-surface-v1/` |
| Public target branch | `develop` |
| Public issue title | `Import command activation surface requirements` |
| Implementation admitted by import | `false` |

## Candidate IAU Shape

A later implementation unit may be named
`IAU-command-activation-manifest-contract-v1`, but it is not admitted now.

Likely future tasks:

- manifest activation-event contract tests
- manifest `contributes.commands` contract tests
- package identity and Marketplace-disabled contract tests
- minimal manifest metadata update only after preflight

Still blocked:

- command handler implementation
- documentation panel implementation
- runtime settings CLI materialization
- compare execution
- Marketplace publication
- VSIX release automation

## Next Gate

Create the public MIT import packet and Spec Kit feature. Then validate
redaction and artifact consistency. Only after that may a separate IAU
preflight decide whether manifest-contract implementation can start.
