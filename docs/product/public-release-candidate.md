# Public Release Candidate

- Version line: `1.0.0`
- Recorded at: `2026-04-07T02:30:00.000Z`
- Authority green baseline: commit `6d326c5`, pipeline `2433201421`
- Published public source commit: `bf0cb2d`
- Published public wiki head: `e28491c`

## Readiness

- Authority baseline: passed
- Local installed VSIX: passed
- Local public devcontainer: passed
- Local public fixture helper: passed
- Public Codespace: pending
- Gate D public acceptance: pending human judgment

## Local Proof

- The public devcontainer now passes on this machine from a Windows-hosted
  checkout under Docker Desktop Linux engine at
  `C:\Users\sveld\AppData\Local\Temp\vi-history-suite.public-devcontainer-candidate-20260407-0225`.
- The repo-owned blocker was `.devcontainer/devcontainer.json` forcing
  `overrideCommand=false`; that let the base Node image exit and killed
  `postCreateCommand` before `npm ci` could finish.
- The WSL-path bind-mount failure was classified separately as a
  machine-surface mismatch between the broken Linux Docker CLI and Windows
  `docker.exe`, not as a public-repo defect.
- The updated public candidate now completes `npm ci`, `npm run compile`, and
  `npm run test:design-contract` inside the devcontainer on this machine.

## Tester Fixture Strategy

- Decision: optional governed helper
- Command: `npm run public:fixture:icon-editor`
- Target path: `.cache/public-fixtures/labview-icon-editor`
- Rationale: keep `ni/labview-icon-editor` easy for testers without making a
  third-party clone a mandatory startup side effect for every devcontainer or
  Codespace session

## Remaining Blockers

- Public Codespace proof on the updated public source commit is still pending.
- Gate D Docker Linux cold-pull acceptance on the canonical fixture workspace
  is still pending fresh human judgment.
