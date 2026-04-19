# Linux Assurance Runner Lane

## Purpose

Retain the governed GitLab Linux shell-runner lane for external standards
assurance on the active `v1.3.0` Windows x64 private-release line.

This lane is separate from the Windows private-release proof lane. Linux
assurance owns standards checks only; it does not claim LabVIEW proof,
installed-user Windows runtime validation, or the `HARNESS-VHS-002`
host/container compare scenario.

## Governing Surfaces

- GitLab jobs:
  - `assurance_release_gate`
  - `assurance_26514_authority`
  - `assurance_requirements_quality`
  - `assurance_external_user_information`
  - `assurance_audit_packet`
- governed package scripts:
  - `npm run assurance:release-gate`
  - `npm run assurance:26514:authority`
  - `npm run assurance:requirements`
  - `npm run assurance:user-info`
  - `npm run assurance:evidence-pack`
  - `npm run assurance:uplift`
- governed wrapper script: `scripts/runAssuranceAudit.js`
- hosted governance package:
  [hosted-ci-governance.md](./hosted-ci-governance.md)
- release-control procedure:
  [../release-procedure.md](../release-procedure.md)

## Lane Split

The governed runner split for the active private-release sequence is:

- Windows proof lane:
  [windows-private-release-runner-lane.md](./windows-private-release-runner-lane.md)
  retains the canonical `resource/plugins/lv_icon.vi` host-native and
  Windows-container acceptance evidence
- Linux assurance lane:
  this document retains the external standards-validation lane that blocks
  preview and exact packaging on the same protected sequence

## Runner Identity

Governed registration contract:

- description: `local-linux-assurance`
- tags:
  - `linux`
  - `x64`
  - `docker`
  - `assurance`
  - `private-release`
- locked: `true`
- run untagged: `false`
- maximum timeout: `7200`

## Supported Host Shape

The admitted first runner shape is:

- native Linux x64 host
- Bash shell executor
- current Docker CLI and reachable Docker Engine on the same host
- Node.js plus npm available without a repo-local install bootstrap
- authenticated pull access for `registry.gitlab.com`
- ability to pull the latest published
  `registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main`
  image before each assurance job starts

Registry authentication may be satisfied either by:

- protected CI variables `VIHS_ASSURANCE_REGISTRY_USER` and
  `VIHS_ASSURANCE_REGISTRY_PASSWORD`, or
- pre-seeded Docker credential state on the admitted runner host

The first governed path is the protected-variable route retained in
`.gitlab-ci.yml`.

## Manual Registration Pack

Do not commit the runner authentication token. Manual host registration uses a
placeholder only.

Registration:

```bash
gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.com/" \
  --token "<runner-auth-token>" \
  --executor "shell" \
  --shell "bash" \
  --description "local-linux-assurance" \
  --tag-list "linux,x64,docker,assurance,private-release" \
  --locked="true" \
  --run-untagged="false" \
  --maximum-timeout 7200
```

## Evidence Contract

The blocking jobs shall retain:

- `assurance-release-gate-evidence/`
- `assurance-26514-authority-evidence/`
- `assurance-requirements-quality-evidence/`
- `assurance-external-user-information-evidence/`

The advisory job shall retain:

- `assurance-audit-packet-evidence/evidence-pack/`
- `assurance-audit-packet-evidence/uplift/`

Each retained evidence root shall include:

- `lane-manifest.json`
- `command.txt`
- machine-readable outputs such as `evidence.json`, `score.json`, or the
  checker JSON payload
- any lane-specific rendered report such as `release-gate-scorecard.txt`,
  `documentation-proof.txt`, or `risk-register.txt`

## Stop Rules

The lane fails closed when:

- the job is not admitted on the governed Linux assurance tags
- Docker is unavailable or the latest published assurance image cannot be
  pulled
- only one of `VIHS_ASSURANCE_REGISTRY_USER` or
  `VIHS_ASSURANCE_REGISTRY_PASSWORD` is provided
- `scripts/runAssuranceAudit.js` is missing or cannot build the staged target
- the staged `authority-docs` lane includes excluded transient or
  non-authority paths
- any blocking assurance job fails

The advisory `assurance_audit_packet` lane may fail without blocking preview
or exact packaging, but its retained findings still require review before the
next release-facing tranche.
