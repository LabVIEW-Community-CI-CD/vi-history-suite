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

## Governed Operator Model

The admitted operator contract for the current Linux assurance host is:

- runner config path: `~/.gitlab-runner/config.toml`
- per-runner request concurrency: `request_concurrency = 2`
- steady-state lifecycle owner: Ubuntu `systemd`
- admitted service unit: `vihs-linux-assurance-runner.service`

The governed recovery model after a host reboot is to restore Ubuntu and let
`vihs-linux-assurance-runner.service` own restart and keep-alive. The lane
shall not depend on a long-lived interactive `gitlab-runner run` shell.

## Repo-Owned Host Assets

The governed host asset pack for this lane is versioned in the repo:

- Linux apply/update script:
  `scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh`
- Linux helper script:
  `scripts/gitlab-runner/linux/start-linux-assurance.sh`
- Linux service unit:
  `scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service`
- Linux drift assertion script:
  `scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh`
- Cross-lane wrapper from the admitted Windows host:
  `scripts/assertGovernedRunnerLanes.js` via `npm run gitlab:runner:assert`

The Linux apply script is the repo-owned update surface for the admitted
service contract. It copies the helper, installs the service unit, reloads
`systemd`, enables and starts the service, and fails closed unless the service
finishes `enabled` and `active`.

The Linux assertion surface is the repo-owned live drift check for the
admitted helper/service contract. It fails closed unless the installed helper
and service unit still match the repo source, `~/.gitlab-runner/config.toml`
still contains `request_concurrency = 2`, the admitted service fragment path,
user, and working directory remain exact, and exactly one configured runner
process is live.

The helper script remains the bounded cross-OS recovery surface invoked from
the Windows logon bootstrap. The service unit remains the admitted steady-state
lifecycle owner on the Linux host.

## Apply Or Update On The Admitted Host

From the repo root inside the admitted Ubuntu host:

```bash
bash ./scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh
```

The admitted first host shape is the Ubuntu user `sveld`, so the repo-owned
service unit intentionally retains `/home/sveld` and `User=sveld`. If the
admitted host user or home path changes later, update the repo-owned asset,
the hosted-governance package, and this lane contract together.

## Assert Live Host Drift

From the repo root inside the admitted Ubuntu host:

```bash
bash ./scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh
```

From the admitted Windows host, the combined wrapper can assert this Linux
lane by running:

```powershell
npm run gitlab:runner:assert -- --surface linux
```

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
