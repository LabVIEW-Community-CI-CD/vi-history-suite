# Command Handler Entrypoint Shell Bridge Readiness

Recorded: `2026-05-18T05:38:00Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/41`

Public MIT issue:
`https://github.com/svelderrainruiz/vi-history/issues/36`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`IAU-command-handler-entrypoint-shell-v1` is the next **candidate** for the MIT
Spec Kit authority, but implementation is not admitted by this record.

Create a public MIT import/spec/admission update for
`command-handler-entrypoint-shell-v1` before any code starts. The public packet
should narrow the remaining command-activation work to a handler entrypoint
shell and keep documentation rendering, runtime-settings CLI materialization,
compare execution, packaging, and Marketplace publication blocked.

## Why Split T013 From T014-T015

The completed `command-activation-surface-v1` import carried `VHS-REQ-594`
only. That requirement was enough for manifest activation and command
contribution metadata, but it is not enough to implement command handlers,
documentation rendering, or runtime-settings CLI materialization.

The next safe unit is therefore not `T013` through `T015` together. It is a
smaller entrypoint-shell candidate that evaluates command registration and
fail-closed activation behavior without starting user-facing runtime features.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-command-handler-entrypoint-shell-v1` |
| Future slice ID | `command-handler-entrypoint-shell-v1` |
| Parent public feature | `command-activation-surface-v1` |
| Candidate task scope | `T013` only |
| Imported requirement IDs | `VHS-REQ-082`, `VHS-REQ-083`, `VHS-REQ-594` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `01ff907ad878ca335e402b37cdf0929d09c17caf` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `5731edaebdb5ed6d1d3345bb9bd182abed5d3b5e` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement IDs `VHS-REQ-082`, `VHS-REQ-083`, and `VHS-REQ-594`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command IDs:
  - `labviewViHistory.open`
  - `labviewViHistory.openDocumentation`
  - `labviewViHistory.prepareLocalRuntimeSettingsCli`
- activation event IDs:
  - `onCommand:labviewViHistory.open`
  - `onCommand:labviewViHistory.openDocumentation`
  - `onCommand:labviewViHistory.prepareLocalRuntimeSettingsCli`
- no-startup-activation rule
- no manifest-level Git activation rule
- entrypoint-shell/fail-closed boundary for command handlers
- Marketplace-disabled posture
- blocked scope for documentation rendering, runtime settings CLI
  materialization, compare execution, packaging, publishing, and source reuse

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- documentation panel implementation details
- runtime settings CLI implementation details
- compare execution, LabVIEWCLI execution, Docker execution, or orchestration
- VSIX packaging, Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-command-handler-entrypoint-shell-v1` |
| Status | `not-admitted` |
| Parent slice | `command-handler-entrypoint-shell-v1` |
| Public issue | `svelderrainruiz/vi-history#36` |
| Candidate tasks | `T013` only |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later preflight passes:

- add tests proving extension activation registers the admitted command
  entrypoints without startup activation
- add tests proving handler registration does not initialize runtime discovery,
  LabVIEWCLI, Docker, packaging, or Marketplace behavior
- implement the minimum public MIT entrypoint shell needed to satisfy those
  tests

Still blocked:

- `T014`: documentation panel rendering
- `T015`: runtime settings CLI materialization
- `T016`: compare execution
- `T017`: packaging or Marketplace publication

## Next Gate

Create the public MIT import/spec/admission update for
`command-handler-entrypoint-shell-v1`. Then run redaction and artifact
validation. Only after a public preflight record has `status: pass` may
implementation of `IAU-command-handler-entrypoint-shell-v1` start.

