# Runtime Settings CLI Validation Proof Bridge Readiness

Recorded: `2026-05-18T12:42:02Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/46`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Decision

`IAU-runtime-settings-cli-validation-proof-artifact-v1` is the next
**candidate** for the MIT Spec Kit authority, but implementation is not
admitted by this record.

Create a public MIT import and Spec Kit feature for
`runtime-settings-cli-validation-proof-v1` before code starts. This is a pure
validation proof-artifact slice for `vihs --validate --proof-out`, not
no-argument interactive selection, compare execution, LabVIEWCLI execution,
Docker execution, live-session proof, packaging, or Marketplace publication.

## Why This Is The Next Unit

The MIT authority now has a settings-write contract and a validation readback
contract. The next smallest useful proof-integrity step is to retain that
validation result as public-safe proof artifacts: structured JSON plus a
deterministic issue body.

This keeps proof generation separate from runtime execution. It also keeps
interactive provider selection separate from proof output, so a future
interactive IAU cannot quietly inherit artifact or execution behavior.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate IAU | `IAU-runtime-settings-cli-validation-proof-artifact-v1` |
| Future slice ID | `runtime-settings-cli-validation-proof-v1` |
| Imported requirement IDs | `VHS-REQ-546` |
| Supporting test ID | `TEST-UNIT-392` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `f9b2cb74d74c2bc31a8af54ce44c1eec62add04e` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `7808b1f660a5ada6442160b37a2e9c3050415a30` |

## Public-Safe Export Shape

The public MIT import may contain:

- requirement ID `VHS-REQ-546`
- supporting public test expectation `TEST-UNIT-392`
- package identity `vi-history` / `VI History` / `svelderrainruiz` / `MIT`
- command term `vihs --validate --proof-out`
- output artifact names `vihs-validation-proof.json` and
  `vihs-validation-issue.md`
- validation proof fields for runtime outcome, provider, engine, blocked
  reason, error code, proof status, and implementation status
- persisted provider, LabVIEW version, LabVIEW bitness, and effective settings
  target facts already established by the validation readback contract
- deterministic issue-body text targeting the MIT public authority unless a
  later governing decision redirects proof intake
- public-safe host and environment facts with secret-like environment values
  redacted
- Marketplace-disabled posture

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- credentials, token names, or release credentials
- source-copying instructions from another VI History authority
- private proof packets or private issue templates
- no-argument interactive selection behavior
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- live already-running VS Code session uptake proof
- VSIX packaging, Marketplace publication, or release automation

## Candidate IAU Shape

| Field | Value |
| --- | --- |
| IAU ID | `IAU-runtime-settings-cli-validation-proof-artifact-v1` |
| Status | `not-admitted` |
| Parent slice | `runtime-settings-cli-validation-proof-v1` |
| Implementation sharing | `none` |
| Marketplace publication | `disabled` |

Candidate implementation work, only after a later public preflight passes:

- add tests proving a validation result can be retained as structured proof
  JSON without starting runtime execution
- add tests proving secret-like environment values are redacted from public
  proof output
- add tests proving the generated issue body is deterministic and points to the
  MIT public authority
- implement the minimum public MIT proof-artifact writer for supplied
  validation readback facts

Still blocked:

- no-argument interactive `vihs` selection and confirmation
- compare execution
- LabVIEWCLI command invocation
- Docker command invocation or orchestration
- live already-running VS Code session uptake proof
- VSIX packaging
- Marketplace publication
- source copying from GitLab or GitHub Suite

## Next Gate

Create the public MIT import packet and Spec Kit feature for
`runtime-settings-cli-validation-proof-v1`. Then run redaction and artifact
validation. Only after a public preflight record has `status: pass` may
implementation of `IAU-runtime-settings-cli-validation-proof-artifact-v1`
start.
