# Public Release Candidate

- Version line: `1.0.0`
- Recorded at: `2026-04-07T04:06:58.998Z`
- Authority green baseline: commit `6bbdc62`, pipeline `2433349023`
- Published public source commit: `d787f2d`
- Published public wiki head: `a7e30cd`

## Readiness

- Authority baseline: passed
- Local installed VSIX: passed
- Local public devcontainer: passed
- Local public fixture helper: passed
- Public Codespace: passed
- Gate D public acceptance: passed

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

## Hosted Proof

- GitHub Codespace `novacula` now passes the hosted public smoke on the
  published public source commit `4a8b27b`.
- Retained hosted smoke was recorded at `2026-04-07T03:39:45.470Z` under
  `.cache/public-codespace/novacula/`.
- The hosted proof now covers Debian bootstrap, xauth/Xvfb availability, Docker
  Linux image cold pull, and containerized `CreateComparisonReport`
  reachability on the public product surface.
- The retained hosted smoke still uses the synthetic integration fixture, so it
  is supporting hosted proof rather than the final semantic Gate D acceptance.

## Human Review Proof

- The latest retained human review submission is a real
  `passed-human-review` at `2026-04-07T04:06:58.998Z` on
  `resource/plugins/lv_icon.vi`.
- Reviewer note: `Comparison report is as expected.`
- This is the governed canonical Gate D pass on the public Docker-only
  product, not just supporting evidence.

## Remaining Blockers

- None. The canonical Docker Linux cold-pull human pass is now retained on
  `resource/plugins/lv_icon.vi`, so the exact `v1.0.0` public release is
  cleared on the authority proof surfaces.
