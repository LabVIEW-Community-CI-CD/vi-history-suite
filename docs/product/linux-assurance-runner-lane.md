# Linux Assurance Runner Lane

## Purpose

Retain the governed GitLab Linux shell-runner lane for external standards
assurance and the active Linux/Docker validated preview line.

This lane is separate from the deferred Windows private-release proof lane.
Linux assurance owns standards checks plus Linux/Docker preview admission; it
does not claim native Windows LabVIEW proof, installed-user Windows runtime
validation, or the `HARNESS-VHS-002` host/container compare scenario.

## Governing Surfaces

- fail-fast GitLab admission job before the assurance lanes:
  `ubuntu_docker_runner_admission`
- blocking Linux Docker provider proof before package lanes:
  `linux_docker_provider_lane`
- deferred Windows/LabVIEW admission job:
  `governed_runner_admission`
- GitLab jobs:
  - `assurance_release_gate`
  - `assurance_26514_authority`
  - `assurance_requirements_quality`
  - `assurance_external_user_information`
  - `assurance_audit_packet`
  - `linux_docker_provider_lane`
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

The governed runner split for the active Linux/Docker preview sequence is:

- Deferred Windows proof lane:
  [windows-private-release-runner-lane.md](./windows-private-release-runner-lane.md)
  retains the canonical `resource/plugins/lv_icon.vi` host-native and
  Windows-container acceptance evidence when a real Windows/LabVIEW runner is
  available and `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`
- Linux assurance lane:
  this document retains the external standards-validation lane and the active
  Linux/Docker admission lane that block preview packaging on the protected
  sequence

## Runner Identity

Governed registration contract:

- description: `local-linux-docker-assurance`
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
- top-level runner concurrency: `concurrent = 2`
- per-runner request concurrency: `request_concurrency = 2`
- admitted host user: `sergio`
- steady-state lifecycle owner: user-mode `systemd`
- admitted service unit: `gitlab-runner.service`
- admitted runner binary: `/home/sergio/.local/bin/gitlab-runner`

The governed recovery model after a host reboot is to let the `sergio`
user-mode `gitlab-runner.service` own steady-state restart and keep-alive for
both local runner entries. The Vagrant and Linux assurance lanes remain separate
by runner authentication token and tag set, while top-level `concurrent = 2`
allows one Vagrant job and one Docker assurance job to make progress at the same
time. The lane shall not depend on a long-lived interactive
`gitlab-runner run` shell or on a fire-and-forget detached helper.

## Repo-Owned Host Assets

The governed host asset pack for this lane is versioned in the repo:

- Linux apply/update script:
  `scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh`
- Linux helper script:
  `scripts/gitlab-runner/linux/start-linux-assurance.sh`
- Linux doctor script:
  `scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh`
- Linux service unit:
  `scripts/gitlab-runner/linux/vihs-linux-assurance-runner.service`
- Linux drift assertion script:
  `scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh`
- Cross-lane doctor wrapper from the admitted Windows host:
  `scripts/doctorGovernedRunnerLanes.js` via `npm run gitlab:runner:doctor`
- Cross-lane wrapper from the admitted Windows host:
  `scripts/assertGovernedRunnerLanes.js` via `npm run gitlab:runner:assert`
- latest retained startup receipt:
  `$HOME/.gitlab-runner/receipts/linux-assurance-startup/latest.json`

The Linux apply script is the repo-owned update surface for the admitted
service contract. It first normalizes `~/.gitlab-runner/config.toml` to retain
both `concurrent = 2` and `request_concurrency = 2`, then copies the helper,
installs the user-mode service unit, reloads `systemd`, enables and starts the
service, and fails closed unless the configuration is normalized and the
service finishes `enabled` and `active`.

The Linux assertion surface is the repo-owned live drift check for the
admitted direct-host contract. It fails closed unless
`~/.gitlab-runner/config.toml` still contains `concurrent = 2` plus
`request_concurrency = 2`, user-mode `gitlab-runner.service` remains `enabled`
and `active`, its `ExecStart` still uses the admitted runner binary and config
path, and exactly one configured runner process is live.

The helper script remains the bounded Linux recovery surface, and can still be
invoked from a future Windows logon bootstrap when that deferred host exists. It
fails closed unless the admitted config still retains both concurrency facts and
the paired `systemd` service reports `enabled`, `active`, and exactly one
configured runner process before declaring the lane healthy. It now also
reconciles the live config back to the admitted dual-concurrency contract when
post-reset drift is observed and writes a machine-readable startup receipt under
`$HOME/.gitlab-runner/receipts/linux-assurance-startup/` before declaring the
Linux assurance surface healthy. The service unit remains the admitted
steady-state lifecycle owner on the Linux host.

The Linux doctor script is the repo-owned non-destructive readback surface for
the admitted lane. It reports the live user-service state, runner binary,
configured concurrency, runner-process count, optional startup-receipt facts,
and any drift issues without mutating host state. The combined wrapper can run
that same doctor surface from the admitted Windows host and fail closed when
requested.

## Apply Or Update On The Admitted Host

From the repo root inside the admitted Linux assurance distro:

```bash
bash ./scripts/gitlab-runner/linux/apply-linux-assurance-runner.sh
```

The admitted direct host shape is Ubuntu under user `sergio`, so the live
doctor/assert surfaces default to user-mode `gitlab-runner.service`,
`/home/sergio/.local/bin/gitlab-runner`, and
`/home/sergio/.gitlab-runner/config.toml`. If the admitted host service, user,
or home path changes later, update the repo-owned asset, the hosted-governance
package, and this lane contract together.

## Assert Live Host Drift

From the repo root inside the admitted Linux assurance distro:

```bash
bash ./scripts/gitlab-runner/linux/assert-linux-assurance-runner.sh
```

From the admitted Windows host, the combined wrapper can assert this Linux
lane by running:

```powershell
npm run gitlab:runner:assert -- --surface linux
```

## Diagnose Live Host State

From the repo root inside the admitted Linux assurance distro:

```bash
bash ./scripts/gitlab-runner/linux/doctor-linux-assurance-runner.sh
```

From the admitted Windows host, the combined wrapper can diagnose this Linux
lane or both lanes by running:

```powershell
npm run gitlab:runner:doctor -- --surface linux
npm run gitlab:runner:doctor -- --surface all --fail-on-drift --evidence-dir governed-runner-admission-evidence
```

The Linux/Docker fail-fast admission surface retained in GitLab is
`ubuntu_docker_runner_admission`. The package-blocking provider surface is
`linux_docker_provider_lane`, which runs
`npm run linux:docker:provider:lane`, retains
`linux-docker-provider-lane-evidence/`, and proves the `docker` / `2026` /
`x64` settings bundle validates as `linux-container` / `labview-cli` on the
Linux Docker Desktop/Docker Engine host. The combined Windows/LabVIEW doctor
command is deferred behind `VIHS_WINDOWS_LABVIEW_PROOF_ENABLED=true`.

## Manual Registration Pack

Do not commit the runner authentication token. Manual host registration uses a
placeholder only.

Runner creation:

```bash
curl --request POST \
  --header "PRIVATE-TOKEN: <operator-pat>" \
  --data "runner_type=project_type" \
  --data "project_id=<project-id>" \
  --data-urlencode "description=local-linux-docker-assurance" \
  --data-urlencode "tag_list=linux,x64,docker,assurance,private-release" \
  --data "run_untagged=false" \
  --data "locked=true" \
  --data "maximum_timeout=7200" \
  https://gitlab.com/api/v4/user/runners
```

Local registration with the returned runner authentication token:

```bash
gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.com/" \
  --token "<runner-auth-token>" \
  --executor "shell" \
  --shell "bash" \
  --description "local-linux-docker-assurance"
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

Post-reset operator receipts and doctor evidence are retained separately:

- Linux startup receipt:
  `$HOME/.gitlab-runner/receipts/linux-assurance-startup/latest.json`
- GitLab fail-fast admission evidence:
  `governed-runner-admission-evidence/runner-doctor.json`
- GitLab fail-fast admission summary:
  `governed-runner-admission-evidence/runner-doctor.md`

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
