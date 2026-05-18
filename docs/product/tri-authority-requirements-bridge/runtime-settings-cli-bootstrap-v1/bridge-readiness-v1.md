# Runtime Settings CLI Bootstrap Bridge Readiness

Recorded: `2026-05-18T11:15:08Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/43`

Public MIT issue:
`https://github.com/svelderrainruiz/vi-history/issues/43`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`IAU-runtime-settings-cli-prepare-command-shell-v1` is the next **candidate**
for the MIT Spec Kit authority, but implementation is not admitted by this
record.

Create a public MIT import and Spec Kit feature for
`runtime-settings-cli-bootstrap-v1` before code starts. This is a
bootstrap/prepare-command slice, not a settings-mutation slice and not compare
execution.

## Why This Is The Next Unit

The MIT authority now has a primary command shell and a documentation command
shell. The next smallest useful command path is
`Prepare Local Runtime Settings CLI`, but only as a bootstrap shell that reports
launcher materialization and recovery facts.

Settings writes, `vihs --validate`, runtime validation, compare execution,
LabVIEWCLI execution, Docker execution, packaging, and Marketplace publication
carry different requirements and proof risks. They remain separate future IAUs.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-prepare-command-shell-v1` |
| Future slice ID | `runtime-settings-cli-bootstrap-v1` |
| Imported requirement IDs | `VHS-REQ-537`, `VHS-REQ-544`, `VHS-REQ-594` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `ff950d6b7401fe31c5a12aea28bcad9099b254f1` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `ff7049e72416ae36158971ddb6724cc80e939490` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement IDs `VHS-REQ-537`, `VHS-REQ-544`, and `VHS-REQ-594`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command ID `labviewViHistory.prepareLocalRuntimeSettingsCli`
- activation event ID
  `onCommand:labviewViHistory.prepareLocalRuntimeSettingsCli`
- display title `Prepare Local Runtime Settings CLI`
- bare `vihs` terminal-surface concept
- prepare-command behavior that reports launcher materialization and recovery
  facts
- explicit runtime dependency and stale-launcher recovery wording
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- provider/version/bitness settings mutation behavior
- JSONC settings rewrite implementation details
- `vihs --validate` runtime validation behavior
- compare execution, LabVIEWCLI execution, Docker execution, or orchestration
- VSIX packaging, Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-prepare-command-shell-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-bootstrap-v1` |
| Public issue | `svelderrainruiz/vi-history#43` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving the Prepare Local Runtime Settings CLI command is
  registered as a separate handler
- add tests proving a public prepare-command shell reports launcher
  materialization and recovery facts without mutating settings
- implement the minimum prepare-command shell without settings writes,
  validation, compare execution, LabVIEWCLI execution, Docker execution,
  packaging, or Marketplace behavior

Still blocked:

- provider/version/bitness settings mutation
- JSONC settings rewrite
- `vihs --validate` runtime validation
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- VSIX packaging
- Marketplace publication
- source copying from GitLab or GitHub Suite

## Next Gate

Create the public MIT import packet and Spec Kit feature for
`runtime-settings-cli-bootstrap-v1`. Then run redaction and artifact
validation. Only after a public preflight record has `status: pass` may
implementation of `IAU-runtime-settings-cli-prepare-command-shell-v1` start.
