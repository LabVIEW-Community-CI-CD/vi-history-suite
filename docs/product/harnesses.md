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
  performance experiments against the Linux comparison-report runtime

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
  `.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-002/`
- use GitHub as an experiment lane only; GitLab and Windows proof remain the
  authority surfaces

### Local And GitHub Benchmark Path

- local command from the authority repo: `npm run benchmark:github:linux:lv-icon`
- GitHub workflow:
  `.github/workflows/linux-runtime-benchmark-experiment.yml`
- pinned runtime image: `nationalinstruments/labview:2026q1-linux`
- derived benchmark container:
  `docker/github-linux-dashboard-benchmark/Dockerfile`

### Constraints

- do not claim GitHub benchmark results as product truth or release truth
- do not claim the private GitHub experiment mirror already exists before it is
  actually created
- keep the benchmark lane distinct from the public GitHub facade repo
- keep the benchmark window large enough to characterize the real high-history
  path instead of a toy three-commit slice
