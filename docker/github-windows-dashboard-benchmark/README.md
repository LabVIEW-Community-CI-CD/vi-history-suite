# GitHub Windows Dashboard Benchmark

This directory defines the host-runnable Windows benchmark image for the deep
`HARNESS-VHS-002` / `resource/plugins/lv_icon.vi` benchmark lane.

Current intent:

- pin the NI Windows runtime base image
- add Node and Git so the benchmark workspace can run inside the image
- retain a repeatable Windows benchmark surface that is distinct from Sergio's
  canonical host-machine UX lane

The first governed entrypoint is:

```powershell
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File docker/github-windows-dashboard-benchmark/run-benchmark.ps1
```

The benchmark itself is executed through:

```powershell
node out/cli/runGitHubWindowsDashboardBenchmark.js --harness-id HARNESS-VHS-002
```
