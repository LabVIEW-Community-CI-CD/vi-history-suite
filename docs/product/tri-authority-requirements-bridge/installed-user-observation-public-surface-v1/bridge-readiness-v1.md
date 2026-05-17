# Installed-User Observation Public Surface Bridge Readiness

Recorded: `2026-05-17T14:00:43Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/34`

Machine-readable packet:
[bridge-readiness-v1.json](./bridge-readiness-v1.json)

## Purpose

This packet evaluates `IAU-candidate-installed-user-observation-public-surface-v1`
for the MIT Spec Kit authority. It decides whether the governed installed-user
observation cadence can become a sanitized public requirements import without
starting implementation.

## Decision

The candidate is **bridge-ready**, but **not implementation-admitted**.

The next authorized move is to create a public MIT import packet and Spec Kit
feature for `installed-user-observation-public-surface-v1`. The feature should
model observation fact buckets, routing, blocked scope, and public reporting
semantics. It must not start code, Copilot implementation, LabVIEWCLI command
execution, Docker orchestration, Marketplace behavior, or Windows Docker
Desktop proof promotion.

## Governed Source

| Field | Value |
| --- | --- |
| Candidate | `IAU-candidate-installed-user-observation-public-surface-v1` |
| Future slice ID | `installed-user-observation-public-surface-v1` |
| Imported requirement IDs | `VHS-REQ-595` |
| Source baseline | `v1.3.16` |
| Source commit evaluated | `00d004bc8d475086f907b5052adc961dd0791600` |
| Target authority | GitHub MIT Spec Kit authority |
| Target repository | `https://github.com/svelderrainruiz/vi-history` |
| Target branch flow | `develop` integration, `main` release |
| Target baseline observed | `bba32566c5909ef89ddf8ee2fac0422b9db45d49` |

## Public Signal

GitHub Suite issue
`https://github.com/svelderrainruiz/vi-history-suite/issues/98` remains open.
Live readback on `2026-05-17` found labels `installed-user-ux`, `user-docs`,
and `public-facade`, plus one owner comment linking it into the governed public
sibling runtime-contract audit. The issue remains feedback input, not release
proof and not an implementation gate by itself.

## Public-Safe Export Shape

The public MIT import may contain:

- requirement ID `VHS-REQ-595`
- public issue URL and issue number for feedback correlation
- event triggers for observation cycles
- fact bucket names and meanings: `observed`, `deferred`, `blocked`
- routing decisions for user docs, bundled docs, video-plan candidates,
  sustainment-only recommendations, or future issue creation
- explicit statement that Marketplace publication and exact VSIX installation
  are release evidence, not first-time installed-user acceptance proof
- explicit Windows Docker Desktop boundary as a separate proof gate
- public-safe blocked scope for LabVIEWCLI execution, Docker orchestration,
  Marketplace mutation, and proof promotion

The public MIT import must not contain:

- private evidence roots or local filesystem paths
- private control-plane instructions
- private credentials, token names, or release credentials
- private tooling names
- source-copying instructions from the governed implementation
- retained authority runner details
- claims that public feedback proves release readiness by itself

## Candidate Spec Kit Feature

Recommended feature path:
`.specify/specs/installed-user-observation-public-surface-v1/`

Recommended public import path:
`docs/requirements/imports/installed-user-observation-public-surface-v1/`

The Spec Kit feature should answer:

- What counts as an observation fact?
- How are `observed`, `deferred`, and `blocked` facts represented?
- Which public feedback fields are retained?
- How is repeated confusion routed to docs or video planning?
- How is the default SemVer recommendation recorded?
- Which proof and release claims are explicitly blocked?

## Admission Boundary

This packet promotes the candidate from `candidate` to `bridge-ready` only.

It does not admit:

- MIT implementation
- Copilot handoff
- public MIT issue creation before import/spec planning
- LabVIEWCLI execution
- Docker execution or orchestration
- Windows Docker Desktop proof claims
- Marketplace publication

Implementation can start only after:

1. the public import packet exists,
2. Spec Kit `spec.md`, `plan.md`, and `tasks.md` are committed,
3. clarification/checklist/analyze gates do not contain critical blockers,
4. public redaction and bridge artifact validation pass, and
5. a named IAU has a preflight record with `status: "pass"`.

## Next Gate

Open a public MIT import/spec branch from `develop` only after this GitLab
readiness packet merges. The branch should create requirements and Spec Kit
artifacts only. It should not create implementation tasks beyond a blocked
future IAU candidate unless the Spec Kit plan makes the boundary explicit.

## Validation

This readiness packet is governed documentation. It should be validated with:

- `npm run docs:gate:core`
- `npm run docs:ci:core`
- `npm run check`
- `npm test`
- requirements quality check
- external user-information check
- Spec Kit CLI capability check
- `git diff --check`
