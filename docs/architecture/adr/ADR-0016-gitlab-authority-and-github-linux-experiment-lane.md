# ADR-0016: GitLab Authority And GitHub Linux Experiment Lane

## Status

Accepted

## Context

`vi-history-suite` now has three distinct repository surfaces that future
sessions could easily confuse:

- the private GitLab source repo
- the public GitHub facade repo
- a desired cheap GitHub experiment lane for Linux performance iteration

The current high-friction benchmark question is not public distribution. It is
whether the `lv_icon.vi` dashboard pair-preparation path can run faster on the
Linux comparison-report runtime than on the current Windows host baseline.

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
3. A separate private GitHub experiment mirror may run non-authoritative Linux
   benchmark workflows.
4. The canonical high-history Linux benchmark target is
   `HARNESS-VHS-002` / `resource/plugins/lv_icon.vi`.
5. The GitHub experiment lane shall pin
   `nationalinstruments/labview:2026q1-linux` and run through a derived
   benchmark container that adds Node/Git tooling without changing the pinned
   NI runtime base.
6. Benchmark outputs from the GitHub experiment lane are retained diagnostic
   evidence only. They do not replace GitLab authority or Windows installed-user
   proof.
7. Until that private GitHub mirror is actually created, the authority repo
   retains the prepared benchmark workflow, CLI, harness, expected remote, and
   container recipe as the governed source for the experiment lane.

## Consequences

Positive:

- GitHub can absorb cheap Linux runtime iteration without rewriting the public
  facade model
- the benchmark target stays aligned with the real long-running `lv_icon.vi`
  dashboard path on the canonical Windows host
- future sessions can tell authority, experiment, and public distribution
  surfaces apart deterministically

Tradeoffs:

- the program now carries another governed repo surface
- GitHub experiment evidence must be interpreted carefully because it is not
  authority proof
- the experiment lane adds a derived Docker image to maintain alongside the
  pinned NI Linux runtime image

## Evidence

- `src/harness/canonicalHarnesses.ts`
- `src/cli/runGitHubLinuxDashboardBenchmark.ts`
- `.github/workflows/linux-runtime-benchmark-experiment.yml`
- `docker/github-linux-dashboard-benchmark/Dockerfile`
- `docker/github-linux-dashboard-benchmark/run-benchmark.sh`
- `docs/product/program-repo-jump-map.json`
- `tests/unit/runGitHubLinuxDashboardBenchmarkCli.test.ts`
- `tests/unit/githubLinuxBenchmarkWorkflow.test.ts`
