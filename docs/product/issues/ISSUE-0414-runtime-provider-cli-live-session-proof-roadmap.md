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

- `feature/runtime-provider-live-session-history-safe-restore-completeness-assert` (in progress)

Most recently merged branch:

- `feature/runtime-provider-live-session-history-count-integrity-assert`

## Roadmap (Feature Branch Sequence)

1. `feature/runtime-provider-live-session-probe-command` (merged)
- Add one governed probe surface that captures persisted provider/version/bitness
  facts against live in-session runtime settings facts and reports drift.

2. `feature/runtime-provider-live-session-safe-restore` (merged)
- Add fail-closed restore behavior so probe runs do not leave mutated user
  settings behind when a probe fails partway through.

3. `feature/runtime-provider-live-session-proof-packet` (merged)
- Emit one retained packet format (JSON + Markdown) for probe runs so live
  proof outcomes are reviewable without terminal logs.

4. `feature/runtime-provider-live-session-local-gate` (merged)
- Add one local-first admission command that runs the probe and fails closed on
  missing packet or malformed outcome fields.

5. `feature/runtime-provider-live-session-doc-sync` (merged)
- Align `PROGRAM-0005`, `ISSUE-0412`, current-state, and user support docs to
  the exact new probe contract and residual boundaries.

6. `feature/runtime-provider-live-session-gate-decision` (merged)
- Re-evaluate `VHS-REQ-542` wording and either:
- keep the reload contract as active truth with stronger evidence, or
- replace it with a narrower residual warning only where proof still fails.
- decision on this branch: keep the reload-or-restart contract active while
  direct live uptake of CLI-written settings in an already-running VS Code
  session remains unproven, and strengthen the retained evidence contract with
  the landed probe packet plus local gate

7. `feature/runtime-provider-live-session-uptake-receipt` (merged)
- Retain one explicit packet-level live-uptake observation receipt that
  classifies each probe run as in-session-updated versus reload-required, with
  fail-closed local gate validation for that classification.

8. `feature/runtime-provider-live-session-history-receipt` (merged)
- Add one retained history-receipt command that summarizes all retained probe
  runs into one policy-facing stance (`live-uptake-not-proven`,
  `candidate-live-uptake-observed`, or `insufficient-evidence`).

9. `feature/runtime-provider-live-session-policy-boundary-assert` (merged)
- Add one fail-closed policy-boundary assertion command that enforces the
  retained `VHS-REQ-542` evidence stance before merge and forces explicit
  re-evaluation when retained history no longer supports unconditional reload
  guidance.

10. `feature/runtime-provider-live-session-packet-history-stance` (merged)
- Add one cumulative history-stance receipt directly on each retained probe
  packet so every packet carries both point-in-time drift facts and retained
  policy evidence context.

11. `feature/runtime-provider-live-session-provider-selection-coverage` (merged)
- Extend retained history and policy-boundary assertions so merge admission also
  requires retained bidirectional provider-selection coverage (`host` and
  `docker` mutation targets), proving the CLI provider-selection path was
  exercised both directions while live uptake remains explicitly not fully proven.

12. `feature/runtime-provider-live-session-not-fully-proven-receipt` (merged)
- Add one explicit retained proof-status receipt (`not-fully-proven` vs
  `re-evaluation-required`) onto packet/history/policy surfaces so the current
  CLI live-session boundary is machine-readable rather than only implied.

13. `feature/runtime-provider-live-session-target-alignment-receipt` (merged)
- Add one explicit retained mutation-target alignment receipt
  (`mutationTargetPersistedMatch`) and fail-closed policy/history admission when
  retained probe runs do not show that requested provider selection actually
  became the persisted provider.

14. `feature/runtime-provider-live-session-latest-alignment-assert` (merged)
- Tighten the local latest-packet gate so admission fails when
  `mutationTargetPersistedMatch` is not explicitly `true`, making latest
  retained probe evidence fail closed when requested provider selection did not
  take effect.

15. `feature/runtime-provider-live-session-latest-proof-status-assert` (merged)
- Tighten the local latest-packet gate so admission also fails when latest
  retained packet proof status becomes `re-evaluation-required`, keeping the
  "CLI live-session seam is not fully proven" boundary explicit at latest-packet
  admission time.

16. `feature/runtime-provider-live-session-baseline-switch-receipt` (merged)
- Add one explicit retained baseline-switch receipt
  (`mutationTargetBaselineChanged`) and fail-closed latest/history/policy
  admission when retained probe evidence does not show that mutation changed
  persisted provider truth from baseline to target.

17. `feature/runtime-provider-live-session-latest-observation-assert` (merged)
- Tighten latest-packet and policy-boundary admission so the latest retained
  probe observation must remain `reload-required`; `in-session-updated` latest
  evidence now fails closed and forces explicit re-evaluation.

18. `feature/runtime-provider-live-session-history-uptake-assert` (merged)
- Tighten latest-packet and policy-boundary admission so retained history must
  contain zero `in-session-updated` observations while this line keeps the
  `not-fully-proven` / reload-required boundary active.

19. `feature/runtime-provider-live-session-history-observation-completeness-assert` (merged)
- Tighten latest-packet and policy-boundary admission so retained history must
  also contain zero unknown live-uptake observations while this line keeps the
  `not-fully-proven` / reload-required boundary active.

20. `feature/runtime-provider-live-session-latest-history-stance-assert` (merged)
- Tighten latest-packet admission so latest retained packet history stance must
  remain `live-uptake-not-proven`, forcing explicit re-evaluation before local
  admission when latest retained stance drifts to another value.

21. `feature/runtime-provider-live-session-history-count-integrity-assert` (merged)
- Tighten latest-packet admission so retained `historyTotalRuns` must exactly
  equal the sum of retained observation-class counts, preventing hidden
  unclassified remainder from passing local admission.

22. `feature/runtime-provider-live-session-history-safe-restore-completeness-assert` (in progress)
- Tighten policy-boundary admission so retained history must show
  safe-restore verification on every retained run before merge.

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
