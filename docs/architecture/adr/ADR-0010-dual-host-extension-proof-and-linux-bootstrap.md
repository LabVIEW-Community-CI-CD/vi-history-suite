# ADR-0010: Dual-Host Extension Proof And Linux Bootstrap

## Status

Accepted

## Context

`vi-history-suite` proves installed extension behavior through a real extension
host. Windows `Code.exe` is the primary user-truth surface because real
extension users install and run the product in Windows VS Code against real LabVIEW
repositories and NI tooling.

That primary proof lane is not always available for autonomous iteration:

- a live Windows VS Code instance can block the governed integration lane
- future sessions should not depend on ad hoc password entry to install Linux
  VS Code runtime libraries
- the repo now has a fast inner loop that benefits from a second explicit
  extension-host proof surface

The repo therefore needs a governed distinction between:

- Windows extension-host truth for installed-user behavior
- Linux extension-host fallback for autonomous iteration and proof continuity

## Decision

The repo will keep a dual-host extension proof design:

1. Windows extension host remains the primary product-truth lane.
2. The integration runner shall support explicit host selection through
   `VI_HISTORY_SUITE_INTEGRATION_HOST=auto|windows|linux`.
3. Linux extension-host use shall fail closed when the downloaded VS Code
   runtime lacks required shared libraries.
4. The Linux prerequisite installation path shall be a narrow governed repo
   bootstrap command:
   - `npm run public:host:bootstrap-linux`
5. Future sessions shall use the bootstrap command or the explicit
   `test:integration:linux` script instead of relying on remembered shell
   steps.

## Consequences

Positive:

- autonomous sessions can keep proving extension-host behavior even when
  Windows `Code.exe` is already in use
- Linux host failures become actionable and deterministic instead of opaque
  loader/runtime errors
- the repo gains a governed debug/proof surface instead of a chat-memory
  workaround

Tradeoffs:

- the repo now carries two extension-host proof surfaces to maintain
- Windows remains the only authoritative installed-user proof lane
- Linux bootstrap is local-machine infrastructure, not a released product
  feature

## Evidence

- `tests/integration/runTests.ts`
- `src/tooling/integrationHostRuntime.ts`
- `tests/unit/integrationHostRuntime.test.ts`
- `docs/dev-fast-loop.md`
