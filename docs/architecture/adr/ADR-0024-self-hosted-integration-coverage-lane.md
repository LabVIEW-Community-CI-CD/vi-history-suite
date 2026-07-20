# ADR-0024: Self-Hosted Integration-Coverage Lane

- Status: Accepted
- Date: 2026-07-20

> This ADR records the retained design for the self-hosted integration-coverage
> lane under system requirement VHS-SYS-REQ-013 (CI And Developer Environment).
> It is the security-gated final theme of the dev-only-mapping sweep (epic #2159)
> and was approved by the maintainer before build. The requirements package holds
> the authoritative text; this is the design record.

## Context

Six host-runner scripts — `bootstrapLinuxVsCodeHost.js`, the Linux/Windows
integration-host runners, and the public-repo clone/fixture helpers — are excluded
from unit coverage because they require a real VS Code host, integration host, or
git remote to exercise. They were the remainder of the dev-only sweep: the pure
tooling was mapped (VHS-REQ-681/683), and these scripts' pure/injectable
parse/validate/command-plan boundaries are now mapped as a requirement surface
(VHS-REQ-684) and unit-tested, but the scripts' full real execution cannot be
honestly unit-covered.

Running them for real requires a **self-hosted runner**, which introduces a
security posture that must not be decided unilaterally: who can trigger it, what
token scope it has, and whether untrusted PR code can reach the machine. The
maintainer approved the lane with an explicit posture.

## Decision

Ship a **self-hosted integration-coverage lane** plus a **fail-closed
security-contract gate**, under the maintainer-ratified posture:

- **Trigger:** `workflow_dispatch` only — no `push`, `pull_request`,
  `pull_request_target`, or `schedule`, so no untrusted-PR code ever runs on the
  self-hosted box.
- **Token:** least-privilege `contents: read`; the lane never writes.
- **Trusted-ref gated:** a Guard Trusted Ref step refuses to run except from
  `develop`, `main`, a `release/v*` branch, or a `v*` tag.
- **Advisory:** the lane is not a required merge check and gates nothing —
  self-hosted availability is not guaranteed, so it must never wedge the queue.
- **Scope:** Linux first; the Windows/LabVIEW lane is a separate, heavier
  validation.

The enforceable core is `scripts/checkIntegrationCoverageLane.js`
(`npm run integration:coverage:check`): a pure evaluator that parses the lane
workflow and fails closed on any drift from that contract (forbidden trigger,
write scope, unset permissions, non-self-hosted runner, missing trusted-ref
guard). It is unit-tested against synthetic workflow text.

Consistent with the approved posture, the six host-runner scripts **stay
coverage-excluded**; the lane exercises them for evidence rather than forcing them
through the unit-coverage risk gate, which would be dishonest for host-dependent
code.

## Consequences

- The host-runner scripts finally have a real execution lane producing coverage
  evidence, without pretending they can be unit-covered.
- The lane's security posture is itself protected by a fail-closed gate, so it
  cannot silently gain a write token, a push trigger, or lose its trusted-ref
  guard.
- The lane is advisory and dispatch-only, so it adds no merge-queue risk and no
  untrusted-code exposure on the self-hosted machine.

## Requirements recorded

VHS-SYS-REQ-013; VHS-REQ-684, VHS-REQ-685, VHS-REQ-690.
