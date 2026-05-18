# Installed-User Documentation Command Bridge Readiness

Recorded: `2026-05-18T10:55:00Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/42`

Public MIT issue:
`https://github.com/svelderrainruiz/vi-history/issues/39`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`IAU-documentation-command-panel-shell-v1` is the next **candidate** for the
MIT Spec Kit authority, but implementation is not admitted by this record.

Create a public MIT import and Spec Kit feature for
`installed-user-documentation-command-v1` before code starts. This is a
documentation-command slice, not a continuation of the already-closed
entrypoint-shell IAU.

## Why This Is The Next Unit

The MIT authority now has explicit command activation metadata and a primary
entrypoint shell. The next smallest useful user-facing command path is
`Open Documentation`, because it can improve installed-user orientation without
starting runtime settings materialization, compare execution, LabVIEWCLI,
Docker, packaging, or Marketplace behavior.

The governed source requirements for actual documentation behavior are broader
than the previous command-handler slice. The public import must therefore carry
the documentation requirements explicitly instead of stretching
`VHS-REQ-594`.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-documentation-command-panel-shell-v1` |
| Future slice ID | `installed-user-documentation-command-v1` |
| Imported requirement IDs | `VHS-REQ-368`, `VHS-REQ-369`, `VHS-REQ-489`, `VHS-REQ-594` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `47f5b67ae35d5bb8b18c2bd2db12e0e7f835313d` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `29c470eb98538e33218917d5568e2e7751f7736e` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement IDs `VHS-REQ-368`, `VHS-REQ-369`, `VHS-REQ-489`, and
  `VHS-REQ-594`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command ID `labviewViHistory.openDocumentation`
- activation event ID `onCommand:labviewViHistory.openDocumentation`
- display title `Open Documentation`
- curated bundled documentation concept for extension-user pages
- public-safe documentation payload rules that exclude private authority
  preambles, private links, standards-only requirements content, and private
  evidence
- documentation command behavior that can open a local bundled documentation
  surface without repository access
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- private authority navigation or private links in public bundled docs
- standards-only control-plane pages in installed-user bundled docs
- source-copying instructions from another VI History authority
- runtime settings CLI implementation details
- compare execution, LabVIEWCLI execution, Docker execution, or orchestration
- VSIX packaging, Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-documentation-command-panel-shell-v1` |
| Status | `not-admitted` |
| Parent slice | `installed-user-documentation-command-v1` |
| Public issue | `svelderrainruiz/vi-history#39` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving the Open Documentation command is registered as a separate
  handler from the primary VI History command
- add tests proving a curated bundled documentation manifest/page contract
  exists and is public-safe
- implement the minimum documentation command shell that opens or reports the
  local bundled documentation surface without Git, LabVIEWCLI, Docker,
  packaging, or Marketplace behavior

Still blocked:

- runtime settings CLI materialization
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- VSIX packaging
- Marketplace publication
- source copying from GitLab or GitHub Suite

## Next Gate

Create the public MIT import packet and Spec Kit feature for
`installed-user-documentation-command-v1`. Then run redaction and artifact
validation. Only after a public preflight record has `status: pass` may
implementation of `IAU-documentation-command-panel-shell-v1` start.
