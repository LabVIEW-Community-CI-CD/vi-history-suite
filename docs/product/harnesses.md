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
