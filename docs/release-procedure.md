# Release Procedure

## Trigger

- Release from a SemVer tag matching `vX.Y.Z`.

## Steps

1. Ensure `main` is in a governed baseline state.
2. Run compile, test, and coverage generation through GitLab CI.
3. Retain release evidence under `release-evidence/`.
4. Review the generated release record before any downstream distribution step.

## Retained Evidence

- `release-evidence/coverage/`
- `release-evidence/coverage.xml`
- `release-evidence/release-record.md`

## Current Limitation

- Marketplace publishing is not active in the first baseline.

