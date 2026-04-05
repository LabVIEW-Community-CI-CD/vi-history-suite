# PROGRAM-0005: Extension Execution Flexibility And Runtime Acquisition UX

## Status

Queued follow-on post-release program.

Activation is intentionally deferred until:

- `PROGRAM-0003` closes the benchmark-proof packet under `TRANCHE-011`
- the queue promotes `TRANCHE-013` from `queued` to `active`

## Purpose

Implement a transparent user-facing execution contract for the installed
extension so runtime behavior is explicit, configurable, and contamination-safe
instead of being inferred from bitness preferences or ambient Docker state.

## North Star

An extension user can choose one governed execution mode for report generation:

- `auto`
- `host-only`
- `docker-only`

and the extension will:

- allow compatible host LabVIEW 2026 Q1 x86 or x64 execution when the selected
  mode permits host-native launch and the host runtime surface is clean
- explain which provider it selected
- fail closed when the selected mode cannot run truthfully
- surface Docker acquisition progress when image pull is required
- never silently substitute host-native and Docker behavior

## Workstreams

1. execution-mode setting and manifest/trust-boundary contract
2. canonical effective execution-request validation across settings, selected
   host-runtime facts, and Docker capability facts before provider work starts
3. conflict-aware provider selection for host sessions, multiple versions, and
   governed VI Server ports, including already-open LabVIEW 2026 sessions that
   require Docker isolation in `auto`
4. Docker acquisition progress, Windows container-capability checks, and
   platform-specific image selection
5. runtime-doctor, history-panel, and progress-surface transparency
6. documentation and bundled-user-doc normalization of the execution policy

## Queue Mapping

- `TRANCHE-013`
  - `ISSUE-0410`

## Exit Gates

### Gate A: Execution Mode Contract

- a first-class execution-mode setting exists
- `auto`, `host-only`, and `docker-only` are explicit product truths
- compatible host LabVIEW 2026 Q1 x86 and x64 execution remain available when
  the selected mode allows host-native launch and the governed host surface is
  conflict-free
- provider selection validates one canonical effective execution request before
  any host launch or Docker acquisition begins

### Gate B: Conflict Truth

- host-runtime contamination rules are explicit and enforced
- conflicting host LabVIEW sessions and governed VI Server collisions fail
  closed instead of contaminating later evidence
- the selected host-runtime surface derives the governed `LabVIEW.ini` path and
  TCP port explicitly instead of assuming one default port

### Gate C: Acquisition UX

- Docker-required execution surfaces visible pull/acquisition progress
- Windows hosts pull the governed Windows image when Docker execution is
  selected there
- Windows Docker-required execution also fails closed when Docker is installed
  but not capable of Windows-container execution

### Gate D: Transparent Feedback

- runtime doctor and front-facing action/progress surfaces expose execution
  mode, selected provider, rejected providers, acquisition outcome, and next
  action

### Gate E: Control-Plane Normalization

- README, current-state, requirements, RTM, test plan, wiki, and bundled docs
  describe the same execution policy without contradiction

## Delivery Rules

This program exists to remove ambiguity, not to add silent fallback behavior.

Every slice shall preserve:

- no silent provider substitution
- no provider launch or Docker pull from a non-canonical effective request
- no contaminated host-runtime launches treated as product truth
- explicit user-facing next-step guidance
- platform-appropriate acquisition behavior

## First Implementation Slice

Start with [ISSUE-0410 Extension Execution Flexibility And Runtime Acquisition UX](../issues/ISSUE-0410-extension-execution-flexibility-and-runtime-acquisition-ux.md).

That slice should:

- land the execution-policy control plane
- retire the current ambiguity around whether Docker is optional, required, or
  forbidden for a given user workflow
- make canonical execution-request validation explicit before implementation
- make Windows container-capability truth explicit before image acquisition
- stop short of claiming full implementation until the installed extension
  actually exposes the execution mode and acquisition UX

## Success Condition

This program is complete when the installed extension can execute comparison
work through a transparent `auto` / `host-only` / `docker-only` contract with
truthful hard stops, visible acquisition progress, and user-facing runtime
diagnosis that does not rely on shell archaeology.
