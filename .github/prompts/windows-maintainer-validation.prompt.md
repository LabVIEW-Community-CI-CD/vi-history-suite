---
name: Windows Maintainer Validation
description: "Use when running the trusted Windows LabVIEW maintainer validation and runtime-conflict matrix on the self-hosted Windows runner, including readiness checks, dispatch, monitoring, and triage."
argument-hint: "Optionally name a track (matrix | maintainer | all) and/or a scenario (version-A, port-A, steady-A, all)"
agent: "agent"
---

Run real-hardware LabVIEW validation on this **self-hosted Windows runner**. This
prompt is self-contained: assume no memory of prior sessions. Verify state from
the machine rather than trusting these notes, but use them to orient quickly.

## Context (expected state; verify, do not assume)

- The repo lives on a partition shared with this machine's Linux boot, so it is
  the same working tree under a Windows drive letter (e.g. `D:\...\vi-history-suite`).
- Extension version is `1.27.x`; the maintainer-workflow CI defects (runner
  evidence recreate, guard summary, `Tee-Object` append) were fixed in v1.27.1
  and are on `main`.
- Two independent validation tracks run here:
  - **Runtime-conflict matrix** ([.github/workflows/windows-runtime-matrix.yml](../workflows/windows-runtime-matrix.yml)) — drives `vihs --validate`; needs LabVIEW + LabVIEW CLI but **no VS Code**.
  - **Maintainer validation** ([.github/workflows/windows-labview-maintainer.yml](../workflows/windows-labview-maintainer.yml)) — additionally runs the VS Code integration host, so it needs VS Code installed where the runner account can see it.
- Both workflows are `workflow_dispatch`-only and fail closed unless dispatched on
  `main`, a `release/vX.Y.Z` branch, or an exact `vX.Y.Z` tag. **Always dispatch
  on `main`.**

## Step 0 — Confirm the environment

1. `gh auth status` — confirm authenticated; if not, `gh auth login`.
2. Confirm you are in the repo working tree and on a clean tree.
3. Confirm the GitHub Actions runner application is registered and **running**
   on this box (dispatched jobs only execute while the runner process is up).
   Per [docs/maintainer-operations.md](../../docs/maintainer-operations.md), run
   it **interactively** (`run.cmd`), not as a service.

## Step 1 — Validate runner readiness (do this first, every time)

Run the prerequisite doctor and read its consolidated report:

```
node scripts/checkMaintainerRunnerPrerequisites.js
```

- Exit 0 → all required host prerequisites present; proceed.
- Exit 1 → it lists every missing prerequisite with remediation. Fix them all
  before dispatching (this avoids burning a long job to rediscover one gap).

**Known gotcha — VS Code install scope.** The maintainer validation needs VS Code
visible to the runner account. A service-account runner (e.g. `NetworkService`)
**cannot see a user-scoped install** under `%LOCALAPPDATA%`. If the doctor flags
`vscode` missing while a user-scoped VS Code exists, either:
- run the runner interactively as the user that owns the VS Code install
  (preferred; inherits the user-scoped `code.cmd` and gives LabVIEW a real
  desktop session), or
- install VS Code **system-wide** at `C:\Program Files\Microsoft VS Code`.

The runtime-matrix track does **not** need VS Code, so it can run even while this
is unresolved.

## Step 2 — VI Server port for the matrix `port-A` scenario (self-derived)

`port-A` asserts that the selected install's configured VI Server port is
admitted (`blockedReason=none`) and observed in the proof. The matrix harness
([scripts/runWindowsRuntimeMatrix.js](../../scripts/runWindowsRuntimeMatrix.js))
**self-derives** the expected port from the selected install's own `LabVIEW.ini`
(`server.tcp.port`; unset means the `3363` default) — the same parse the product
uses — and additionally asserts the proof's `hostLabviewIniPath` matches that
selected install. You no longer pass a port, so there is nothing to false-pass
against, and the assertion stays correct for whatever port the operator has
configured (and proves the product read the selected install, not the
latest-used one).

You do not need to supply or reconfigure anything for `port-A` to run. Optionally
confirm the install is on a **non-default** port if you want the run to exercise
the non-default direction specifically (the evidence records an
`isNonDefaultPort` flag): read `server.tcp.port` from the selected install's
`LabVIEW.ini`. As of the last check this host's LabVIEW 2026 x64 was on **3366**
(non-default).

> Note: the self-derivation reaches the maintainer runner with the release that
> carries #525. Until then the runner still runs the previous harness (built-in
> expected `3380`), so a `port-A` dispatch on `main` before that release expects
> `3380` and the legacy `host_tcp_port` input still applies.

## Step 3 — Dispatch

Pick the track from the user's argument (`matrix`, `maintainer`, or `all`).

**Runtime-conflict matrix** (no VS Code required):

```
gh workflow run windows-runtime-matrix.yml --ref main -f scenario=version-A
gh workflow run windows-runtime-matrix.yml --ref main -f scenario=port-A
gh workflow run windows-runtime-matrix.yml --ref main -f scenario=all
```

- `steady-A`/`steady-B` assert `windows-host-bitness-conflict`.
- `version-A`/`version-B` assert `windows-host-version-conflict` (need LabVIEW 2025 and 2026 at the scenario bitness).
- `port-A` asserts admit (`blockedReason=none`) + the port derived from the selected install's `LabVIEW.ini` (and that the product read that ini).

**Maintainer validation** (needs VS Code per Step 1):

```
gh workflow run windows-labview-maintainer.yml --ref main
```

## Step 4 — Monitor and collect evidence

List runs for the **workflow you dispatched in Step 3** — the `matrix` and
`maintainer` tracks use different workflows, so filtering on the wrong one shows
no matching run (or the wrong one). Use `windows-runtime-matrix.yml` for the
`matrix` track, `windows-labview-maintainer.yml` for the `maintainer` track, and
both for `all`:

```
gh run list --workflow=windows-runtime-matrix.yml --limit 3
gh run list --workflow=windows-labview-maintainer.yml --limit 3
```

Then watch and download the specific run you dispatched:

```
gh run watch <run-id> --exit-status
gh run download <run-id> -D ./run-evidence
```

Inspect step conclusions and the uploaded `runner-evidence/**` plus matrix
proofs / maintainer summary.

## Step 5 — Triage failures (classify before fixing)

For any failure, download the evidence and classify:

- **Repo defect** (wrong assertion, bad path, code bug): fix it on a
  `feature/<issue#>-*` branch off `develop`, with unit tests and full PR gates
  (`bash .github/skills/testing-automation/scripts/run-pr-gates.sh --skip-install`),
  open a PR to `develop`. Workflow fixes only take effect on `main`, so a
  workflow-step repair needs a release/hotfix to reach the maintainer runner —
  flag that explicitly.
- **Runner provisioning gap** (missing/misinstalled prerequisite): it is an
  operator action on this box, not a code change. Re-run Step 1's doctor to
  confirm the fix, then re-dispatch.

Use the prior-step `Capture Environment Summary` / doctor output as ground truth
for what the runner actually has.

## Step 6 — Closeout

- Summarize per-scenario outcomes factually (pass / expected-block / failure)
  with the concrete evidence (blocked reason, observed port, report shape).
- Post real-hardware evidence to the umbrella validation issue **#378**.
- File a new issue for any genuine repo defect or newly discovered provisioning
  gap; do not silently absorb it.
- Capture any durable lesson (a new failure mode, a runner fact) so the next
  session starts ahead of where this one did.
