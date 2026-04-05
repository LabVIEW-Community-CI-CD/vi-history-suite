# ADR-0016: GitLab Authority And GitHub Linux Experiment Lane

## Status

Accepted

## Context

`vi-history-suite` now has three distinct repository surfaces that future
sessions could easily confuse:

- the private GitLab source repo
- the public GitHub facade repo
- the private GitHub experiment mirror for Linux performance iteration

The current high-friction benchmark question is not public distribution. It is
whether the deep `lv_icon.vi` dashboard pair-preparation path can run faster on
the Linux comparison-report runtime than on the current Windows host baseline,
while GitHub-hosted Linux iteration stays cheap enough to run frequently.

If that experiment lane is modeled weakly, future sessions will risk at least
three failures:

- treating the public GitHub facade as the source experiment repo
- treating GitHub experiment results as authority truth
- rediscovering the Linux benchmark command and target VI from chat memory

## Decision

The repo keeps this authority split:

1. Private GitLab remains the authority source repo and release-control
   surface.
2. The public GitHub facade remains public release/setup/support only.
3. A separate private GitHub experiment mirror runs non-authoritative Linux
   benchmark workflows.
4. The GitHub-hosted benchmark workflow shall default to
   `HARNESS-VHS-001` / `Tooling/deployment/VIP_Pre-Install Custom Action.vi`.
5. The canonical deep-history Linux benchmark target remains
   `HARNESS-VHS-002` / `resource/plugins/lv_icon.vi`, and that deep benchmark
   is owned by Sergio's canonical Windows 11 host lane.
6. The GitHub experiment lane shall pin
   `nationalinstruments/labview:2026q1-linux` and run through a derived
   benchmark/source-experiment container that adds Node/Git/headless-X tooling
   without changing the pinned NI runtime base.
7. That derived container shall be published as a dedicated experiment image so
   benchmark runs can reuse it by digest instead of rebuilding ad hoc on every
   iteration.
8. Linux host-native `LVCompare` experiments shall run headlessly through the
   derived image rather than assuming an interactive X display exists.
9. Sergio's canonical Windows 11 host shall expose an in-IDE benchmark-status
   surface that reads the retained Windows baseline plus the retained host
   Linux benchmark launch/log/summary state, mirrors active host Linux
   benchmark progress into a VS Code status-bar indicator and the same live VS
   Code progress surface used by the Windows lane, including pair-preparation
   progress messages, defaults each host run to the current published benchmark
   image tag unless explicitly overridden, and can launch or stop the host
   Linux benchmark without requiring detached shell-only observation.
10. Benchmark outputs from the GitHub experiment lane are retained diagnostic
   evidence only. They do not replace GitLab authority or Windows installed-user
   proof.
11. The authority repo retains the prepared benchmark workflow, CLI, harness,
    expected remote, and container recipe as the governed source for the
    experiment lane, while the private GitHub mirror remains non-authoritative.
12. Host-machine Linux benchmark evidence and private GitHub experiment
    evidence shall only be compared when the same authority commit has been
    pushed to both GitLab authority and the private GitHub experiment mirror,
    both lanes are using the same published benchmark-image contract, and the
    comparison is truthful about whether it is using the hosted canonical
    harness or the host-owned deep-history harness.
13. The Linux benchmark lane shall enforce a governed per-pair execution
    budget, emit heartbeat progress while the runtime is active, retain a
    machine-readable per-pair failure receipt when the runtime times out or
    fails, and write a terminal latest summary even for partial or failed runs.

## Consequences

Positive:

- GitHub can absorb cheap Linux runtime iteration without rewriting the public
  facade model
- the GitHub-hosted experiment lane stays cheaper by default while the deep
  benchmark target remains aligned with the real long-running `lv_icon.vi`
  dashboard path on the canonical Windows host
- the maintainer can see and control the host Linux benchmark from inside VS
  Code, and that host benchmark now resolves the canonical `vi-history-suite`
  authority workspace even when the current VI History target lives in a
  different repo, stages that authority workspace into a fresh Windows-local
  benchmark workspace instead of depending on stale experiment-mirror state or
  brittle WSL/UNC Docker mounts, excludes repo-local transient/test-runtime
  artifacts such as `.vscode-test` from that staged workspace, defaults to the
  current published benchmark image tag rather than inheriting the last launch
  receipt image by accident, filters raw `npm warn` noise out of the
  front-facing progress surface, surfaces live pair-preparation progress in the
  same VS Code progress channel used by the Windows lane instead of only in
  retained receipts, fails closed when a stale launch receipt remains but no
  live host Linux benchmark container exists, and keeps active benchmark
  progress visible through a status-bar indicator instead of only a panel
  refresh
- future sessions can tell authority, experiment, and public distribution
  surfaces apart deterministically

Tradeoffs:

- the program now carries another governed repo surface
- GitHub experiment evidence must be interpreted carefully because it is not
  authority proof and its hosted default harness is intentionally shallower
- the experiment lane adds a derived Docker image to maintain alongside the
  pinned NI Linux runtime image
- headless Linux runtime proof now depends on a maintained Xvfb-capable
  experiment image instead of only the pinned NI base image
- the canonical-host extension now owns one more maintainer-only control
  surface that must stay hidden from noncanonical installs
- the liveness contract is now implemented, so deep-host Linux runs fail
  truthfully instead of stalling indefinitely; however, the deep lane remains
  characterization-only until the Linux runtime dependency gap is closed well
  enough to produce comparable completed runs

## Evidence

- `src/harness/canonicalHarnesses.ts`
- `src/cli/runGitHubLinuxDashboardBenchmark.ts`
- `src/benchmark/benchmarkStatus.ts`
- `src/benchmark/benchmarkStatusAction.ts`
- `src/benchmark/hostLinuxBenchmarkRunner.ts`
- `.github/workflows/linux-runtime-benchmark-experiment.yml`
- `docker/github-linux-dashboard-benchmark/Dockerfile`
- `docker/github-linux-dashboard-benchmark/run-benchmark.sh`
- `docs/product/program-repo-jump-map.json`
- `tests/unit/benchmarkStatus.test.ts`
- `tests/unit/runGitHubLinuxDashboardBenchmarkCli.test.ts`
- `tests/unit/githubLinuxBenchmarkWorkflow.test.ts`
