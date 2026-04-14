# ISSUE-0414: Runtime-Provider CLI Live-Session Proof Roadmap

## Goal

Close the remaining `TRANCHE-016` proof gap by turning the runtime-provider CLI
live-session seam into explicit governed implementation slices, while keeping
the already-landed host-versus-docker provider-selection contract stable.

## Status

Active roadmap issue for post-`ISSUE-0412` proof hardening.

This issue does not reopen settled provider-contract decisions. It only drives
proof depth and operator confidence for:

- CLI-selected `host` vs `docker` persistence
- runtime-provider preflight truth under an already-running VS Code session
- bounded explicit statement of what is still not proven end to end

## Why This Exists

`ISSUE-0412` already retained the branch truth that the generated settings CLI
can switch provider intent between `host` and `docker`, and that compare
preflight/runtime-doctor surfaces carry reload guidance.

The unresolved seam remains explicit:

- direct live mutation of the active real user-profile VS Code settings target
  while Code is already running is not yet retained as an end-to-end proof
  packet
- governed live-session probe support is now landed for persisted-versus-live
  drift detection, retained packet output, and fail-closed local packet
  validation

Current implementation branch:

- `feature/runtime-provider-live-session-doc-sync` (in progress)

Most recently merged branch:

- `feature/runtime-provider-live-session-local-gate`

## Roadmap (Feature Branch Sequence)

1. `feature/runtime-provider-live-session-probe-command` (merged)
- Add one governed probe surface that captures persisted provider/version/bitness
  facts against live in-session runtime settings facts and reports drift.

2. `feature/runtime-provider-live-session-safe-restore` (pending)
- Add fail-closed restore behavior so probe runs do not leave mutated user
  settings behind when a probe fails partway through.

3. `feature/runtime-provider-live-session-proof-packet` (merged)
- Emit one retained packet format (JSON + Markdown) for probe runs so live
  proof outcomes are reviewable without terminal logs.

4. `feature/runtime-provider-live-session-local-gate` (merged)
- Add one local-first admission command that runs the probe and fails closed on
  missing packet or malformed outcome fields.

5. `feature/runtime-provider-live-session-doc-sync` (in progress)
- Align `PROGRAM-0005`, `ISSUE-0412`, current-state, and user support docs to
  the exact new probe contract and residual boundaries.

6. `feature/runtime-provider-live-session-gate-decision` (pending)
- Re-evaluate `VHS-REQ-542` wording and either:
- keep the reload contract as active truth with stronger evidence, or
- replace it with a narrower residual warning only where proof still fails.

## Admission Rules

- Local demonstration remains primary for this sequence; CI remains merge
  hygiene, not the sole proof authority.
- Every branch in this sequence must keep provider-selection behavior
  deterministic: no silent fallback from explicit `docker` request to `host`.
- Branches merge to `develop` only with protected-branch pipeline success.

## Completion Condition

This issue closes when one retained live-session packet proves the admitted
probe contract end to end and all affected docs/requirements surfaces are
truth-aligned to that exact proof scope.
