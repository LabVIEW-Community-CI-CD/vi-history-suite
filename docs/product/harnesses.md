# Harness Definitions

## HARNESS-VHS-001: Canonical Real-History Repository

- Source repository: `https://github.com/ni/labview-icon-editor`
- Acquisition rule: clone on demand; do not vendor the repository into
  `vi-history-suite`
- Purpose: provide real commit history for content-detected LabVIEW VIs

### Initial Target File

- `Tooling/deployment/VIP_Pre-Install Custom Action.vi`

### Why This Harness Exists

- it provides real Git history instead of synthetic fixtures
- it aligns with the broader VI-history program without creating a direct code
  dependency
- it exercises rename/history logic against a real repository

### Initial Acceptance Use

- detect the target file by content, not extension
- prove there are at least two modifying commits
- open the history panel against the selected file

### Local Smoke Path

- command: `npm run harness:smoke`
- clone policy: clone on demand into `.cache/harnesses/`
- retained outputs:
  - `.cache/harness-reports/HARNESS-VHS-001/report.json`
  - `.cache/harness-reports/HARNESS-VHS-001/report.md`
  - `.cache/harness-reports/HARNESS-VHS-001/report.html`

### Local Comparison-Report Smoke Path

- command: `npm run harness:report:smoke`
- parity probe form:
  - `node out/cli/runHarnessReportSmoke.js --harness-id HARNESS-VHS-001 --engine lvcompare`
- purpose: retain a factual report-generation smoke packet for the latest
  comparable revision pair of the canonical VI history target
- retained outputs:
  - `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.json`
  - `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.md`
  - `.cache/harness-reports/HARNESS-VHS-001/comparison-report-smoke.html`

### GitHub-Hosted Linux Benchmark Path

- local command from the authority repo:
  `npm run benchmark:github:linux:canonical`
- GitHub workflow default:
  `.github/workflows/linux-runtime-benchmark-experiment.yml`
- purpose: keep the GitHub-hosted experiment lane on a shallower canonical
  real-history target so hosted iteration stays cheaper than the deep
  maintainer-owned benchmark
- retained outputs:
  - `.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-001/latest-summary.json`
  - `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.json`
  - `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.md`
  - `.cache/harness-reports/HARNESS-VHS-001/dashboard-smoke.html`

### Constraints

- do not vendor `ni/labview-icon-editor` into this repository
- do not rely on comparevi repositories to exercise the first live harness
- use the same core history-model logic for extension runtime and harness smoke
- keep engine-parity probing inside the governed smoke lane instead of relying
  on ad hoc external scripts

## HARNESS-VHS-002: Canonical High-History Benchmark

- Source repository: `https://github.com/ni/labview-icon-editor`
- Acquisition rule: reuse the same clone-on-demand harness root as
  `HARNESS-VHS-001`
- Purpose: provide a governed high-history benchmark target for `lv_icon.vi`
  performance experiments against the Linux comparison-report runtime and the
  repeatable Windows benchmark image lane

### Benchmark Target File

- `resource/plugins/lv_icon.vi`

### Why This Harness Exists

- it matches the concrete Windows host-machine dashboard run that currently
  takes the longest and therefore provides the highest-value before/after
  benchmark target
- it keeps Linux runtime-provider experiments on the same repository and VI
  family instead of comparing a different target
- it gives the prepared GitHub Linux benchmark lane one canonical retained
  target before a private experiment mirror is created

### Experiment Use

- benchmark the same class of dashboard pair preparation that the Windows host
  currently performs on `lv_icon.vi`
- retain machine-readable benchmark summaries under
  `.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-002/` when
  the explicit deep-history lane is invoked
- retain machine-readable benchmark summaries under
  `.cache/github-experiments/windows-dashboard-benchmark/HARNESS-VHS-002/`
  when the Windows benchmark-image lane is invoked
- keep this harness as the owned before/after timing target for the canonical
  Windows 11 host UX lane, the Windows benchmark image, and the Linux
  benchmark-image lane rather than the default GitHub-hosted workflow target

### Governed Comparable Prefix

- accepted cross-OS comparable window: the first `129` commits / `128` pairs
- retained comparable-prefix packet:
  - `docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.json`
  - `docs/product/benchmark-packets/HARNESS-VHS-002-comparable-prefix.md`
- current retained last comparable pair id: `87792a7b6545`
- current retained Linux full-window blocker:
  `pair 135 / 138 :: command-exited-nonzero (linux-headless-recursive-load)`
- the full 139-commit / 138-pair window remains the deep Windows benchmark
  target; the bounded comparable prefix is the governed cross-OS timing scope
  until the latest official NI Linux runtime truth changes

### Host-Owned Deep Benchmark Path

- local explicit deep benchmark command from the authority repo:
  `npm run benchmark:github:linux:lv-icon`
- local explicit deep Windows benchmark command from the authority repo:
  `npm run benchmark:github:windows:lv-icon`
- canonical-host in-IDE path: `Open benchmark status` -> `Run host Linux benchmark`
- GitHub-hosted workflow default remains `HARNESS-VHS-001`; do not treat
  `HARNESS-VHS-002` as the hosted default
- pinned runtime image: `nationalinstruments/labview:2026q1-linux`
- derived benchmark container:
  `docker/github-linux-dashboard-benchmark/Dockerfile`
- pinned Windows benchmark runtime image:
  `nationalinstruments/labview:2026q1-windows`
- Windows benchmark container scaffold:
  `docker/github-windows-dashboard-benchmark/Dockerfile`

### Constraints

- do not claim GitHub benchmark results as product truth or release truth
- do not claim the private GitHub experiment mirror already exists before it is
  actually created
- keep the benchmark lane distinct from the public GitHub facade repo
- keep the benchmark window large enough to characterize the real high-history
  path instead of a toy three-commit slice
- do not make the GitHub-hosted workflow default to `HARNESS-VHS-002`; the
  canonical host owns the deep-history benchmark lane
