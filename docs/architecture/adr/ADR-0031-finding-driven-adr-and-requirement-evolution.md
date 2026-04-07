# ADR-0031: Finding-Driven ADR And Requirement Evolution

## Status

Accepted

## Context

Post-release `vi-history-suite` work no longer changes only implementation
details. Real findings now regularly change:

- public branch expectations
- required-check topology
- SemVer-decision discipline
- fork-owner and Codespaces guidance
- release-control behavior

When those findings are normalized only in queue summaries or one-off control
plane prose, future sessions lose the trigger for when an ADR or the
requirements package must move. That weakens autonomy because the next session
has to rediscover whether a finding is just local diagnosis or a governed
decision change.

## Decision

Adopt a finding-driven governance rule:

- every governed finding is classified for both requirement impact and ADR
  impact before slice closeout
- findings that change architectural boundaries, public/private product
  surfaces, release topology, branch/default-branch policy, runtime-provider
  strategy, required-check posture, or another sustained decision shall update
  an existing ADR or introduce a new ADR in the same slice
- findings that change normative workflow, release, CI, runtime, or
  documentation behavior shall update SRS, RTM, and test-plan coverage in the
  same slice
- if a finding does not change governed requirements or ADR truth, the slice
  shall retain an explicit no-impact rationale in the control plane instead of
  silently skipping the decision review

## Consequences

Positive:

- future sessions get explicit triggers for when to add or refine ADRs
- requirements and ADRs evolve with findings instead of lagging behind them
- autonomy improves because architectural and requirements drift becomes a
  fail-closed condition rather than a memory task

Costs:

- more governance artifacts must be kept in sync per slice
- some findings that previously would have been treated as “just docs” now
  require SRS/RTM/test-plan and ADR scrutiny

## Follow-On

- keep finding-to-requirement and finding-to-ADR discipline explicit in
  sustainment rules, PROGRAM-0004, ISSUE-0409, SRS, RTM, and the test plan
- keep release-governance tests asserting that the requirement package and ADR
  package absorb governed findings instead of leaving them in chat history
