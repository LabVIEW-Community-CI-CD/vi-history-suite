# ADR-0037: Expert-Agent Review Gate For Public Candidates

## Status

Accepted

## Context

The active public-candidate closeout flow was still retaining Sergio's manual
review as the gating surface between `review-ready` publication and exact tag
eligibility. That was too operator-specific for an iterative release-control
loop that now already depends on findings-first agent reviews of the published
public repo and wiki surfaces.

The missing boundary was not public publication itself. `ADR-0035` already
made publication and retained published heads explicit. The remaining gap was
the identity of the review gate after publication:

- the gate was still modeled as a human rerun instead of a retained expert
  review surface
- the exact published public repo/wiki heads under review were not tied to one
  named reusable skill
- exact tagging could still feel like it was waiting on a person instead of on
  a repeatable no-findings verdict

## Decision

For active public candidate lines:

- keep `review-ready` as the fail-closed publication boundary from `ADR-0035`
- replace the active post-publication human review gate with an expert-agent
  review gate
- require that gate to use the retained skill
  `vi-history-suite-expert-agent-reviewer`
- run that skill against the exact published public `develop` candidate head
  and exact published public wiki head retained in
  `docs/product/public-release-candidate.{md,json}`
- retain the latest expert-agent verdict, finding count, and reviewed public
  heads in the same candidate package
- keep exact tagging and Marketplace publication blocked until the latest
  retained expert-agent review returns no findings

Historical human reruns that closed older exact lines remain historical
evidence. They are not the active exact-tag gate for later candidate lines.

## Consequences

Positive:

- exact-tag eligibility now depends on a repeatable retained review surface
  instead of operator prompting
- the exact published public heads under review are explicit and auditable
- future agent reruns can iterate findings cleanly until a no-findings verdict
  exists

Costs:

- the control plane now has to retain skill identity and latest agent-review
  verdicts explicitly
- future sessions must keep the skill usable and aligned with the authority
  candidate package

## Follow-On

- retain this gate in the SRS, RTM, test plan, sustainment rules, release
  procedure, current-state, and public release-candidate package
- keep the skill name and the exact reviewed public heads explicit in the
  candidate package
- keep optional product-owner exploratory review separate from the exact-tag
  gate
