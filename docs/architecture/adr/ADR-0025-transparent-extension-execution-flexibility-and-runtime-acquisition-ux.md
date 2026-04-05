# ADR-0025: Transparent Extension Execution Flexibility And Runtime Acquisition UX

## Status

Accepted

## Context

The current architecture already preserves host-native and Windows-container
provider boundaries, but the user-facing operating model is still too narrow.

`ADR-0006` captured one real concern correctly: Windows 64-bit report
execution should not collide with an already-open host LabVIEW session. But
the current product and docs still leave important usability gaps:

- some users want host-only execution and do not want Docker
- some users want Docker isolation and do not want silent host fallback
- `preferBitness` does not express whether Docker is allowed, required, or
  forbidden
- already-open non-headless LabVIEW sessions, multiple installed LabVIEW
  versions, and non-default VI Server ports can contaminate host execution
- Docker acquisition is not yet governed as a visible user-facing progress
  surface

Without a stronger contract, future sessions can keep patching provider choice
without ever making the extension's execution behavior transparent to the user.

## Decision

Adopt a transparent extension execution-flexibility contract.

1. The extension execution policy shall be governed by an explicit execution
   mode with these values:
   - `auto`
   - `host-only`
   - `docker-only`
2. Execution mode shall be separate from:
   - `preferBitness`
   - explicit `labviewCliPath`, `labviewExePath`, and `lvComparePath`
   - `windowsContainerImage`
3. In `auto` mode on Windows, the extension shall:
   - use host-native execution only when the host runtime surface is compatible
     and conflict-free
   - require Docker isolation when a conflicting LabVIEW 2026 host session or
     governed VI Server collision would contaminate host execution
4. If Docker is required by the selected mode or by `auto`-mode conflict
   detection and Docker is unavailable, the extension shall fail closed with an
   actionable user-facing message that tells the user to either close the
   conflicting LabVIEW session or install/enable Docker.
5. If Docker execution is selected and the required image is not available
   locally, the extension shall acquire the platform-appropriate image through
   a visible progress surface. On Windows, this means the governed Windows
   image.
6. `host-only` shall never silently fall back to Docker.
7. `docker-only` shall never silently fall back to host-native execution.
8. Compatible host LabVIEW 2026 Q1 x86 and x64 execution remain valid under
   the future policy when the selected mode permits host-native launch and the
   governed host runtime surface is clean.
9. Runtime doctor and front-facing execution feedback shall surface:
   - selected execution mode
   - chosen provider
   - rejected-provider reasons
   - acquisition outcome
   - next action
10. `ADR-0006` is superseded as the primary extension-user execution-policy
   decision. Its narrower x64-container preference now becomes historical
   context inside this broader mode-based contract.
11. Canonical validation of the effective execution request for this future
    policy is governed separately by `ADR-0026`.

## Rationale

- Users need to understand how the extension will execute, not infer it from
  bitness or provider side effects.
- Docker should be optional when the host runtime is clean and the user wants
  host-native execution, but it should become a truthful hard requirement when
  the host runtime is already contaminated by an open session.
- Visible image-acquisition progress is part of the usability contract, not
  only an implementation detail.
- A dedicated ADR prevents the product from drifting between “prefer container”
  and “transparent execution mode” without a durable record of the difference.

## Consequences

### Positive

- host-versus-Docker behavior becomes user-legible instead of implied
- future implementation work has one bounded contract for provider selection,
  acquisition UX, and hard stops
- existing contamination concerns such as open LabVIEW sessions, multiple
  installed versions, and governed VI Server ports are tied into one coherent
  execution policy
- future sessions can improve runtime doctor and progress UX without rewriting
  the product intent

### Negative

- the architecture grows beyond a simple x64-container preference rule
- the extension will need more explicit settings and progress/reporting surfaces
- documentation upkeep expands because current behavior, queued behavior, and
  user-facing next steps must stay aligned

## Implementation Surface

- `docs/product/extension-execution-policy.md`
- `docs/product/development-queue.json`
- `docs/product/current-state.md`
- `docs/product/execution-programs/PROGRAM-0005-extension-execution-flexibility-and-runtime-acquisition-ux.md`
- `docs/product/issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md`
- `docs/product/debt-ledger.json`
- `docs/product/debt-ledger.md`
- `docs/architecture/overview.md`
- `README.md`
- `docs/requirements/srs.md`
- `docs/requirements/rtm.csv`
- `docs/testing/test-plan.md`
- `package.json`
- `src/reporting/comparisonRuntimeLocator.ts`
- `src/reporting/comparisonRuntimeDoctor.ts`
- `src/reporting/comparisonReportAction.ts`
- `src/ui/historyPanel.ts`
