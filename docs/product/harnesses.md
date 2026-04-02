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

