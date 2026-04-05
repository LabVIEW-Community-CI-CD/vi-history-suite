# ADR-0018: Windows Benchmark Image Lane

## Status

Accepted

## Context

The deep `HARNESS-VHS-002` / `resource/plugins/lv_icon.vi` benchmark currently
has two asymmetric truths:

- the canonical Windows 11 host exposes the real VS Code UX and human-review
  surface
- the Linux benchmark lane already has a pinned benchmark-image contract

That asymmetry weakens Windows benchmark repeatability. A host-only Windows
baseline can drift with maintainer-machine state, while a benchmark image can
be pinned, published, and rerun deterministically.

## Decision

The repo adopts a separate Windows benchmark-image lane.

1. The canonical Windows 11 host remains the installed-user UX truth and
   Sergio-owned human-review gate.
2. A dedicated Windows benchmark image becomes the repeatable deep benchmark
   baseline for `HARNESS-VHS-002`.
3. The Windows benchmark image shall pin
   `nationalinstruments/labview:2026q1-windows`.
4. The repo shall retain a dedicated Windows benchmark CLI, Dockerfile, runner
   script, and image-publication workflow for that lane.
5. Hosted Windows benchmark execution shall remain explicitly
   not-yet-governed until runner proof exists; the image-publication scaffold
   may land before hosted benchmark execution is claimed.

## Consequences

Positive:

- Windows benchmark timing can be repeated from a pinned image instead of only
  from an evolving host machine
- benchmark repeatability is separated from UX truth
- the deep `lv_icon.vi` benchmark can be compared across Windows host, Windows
  benchmark image, and Linux benchmark image lanes more cleanly

Tradeoffs:

- the benchmark program now carries another image recipe and workflow contract
- hosted Windows execution still needs future proof before it can be claimed
- the host lane remains necessary for UX truth even after the Windows image
  exists

## Evidence

- `src/cli/runGitHubWindowsDashboardBenchmark.ts`
- `package.json`
- `docker/github-windows-dashboard-benchmark/Dockerfile`
- `docker/github-windows-dashboard-benchmark/run-benchmark.ps1`
- `.github/workflows/windows-runtime-benchmark-image.yml`
- `docs/product/harnesses.md`
- `tests/unit/runGitHubWindowsDashboardBenchmarkCli.test.ts`
- `tests/unit/githubWindowsBenchmarkWorkflow.test.ts`
