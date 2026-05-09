# ISSUE-0415: Windows Docker Desktop Launch Gate

## Goal

Turn Windows Docker Desktop Windows-container execution into a governed launch
gate for installed users, or retain a precise fail-closed blocker that a
Windows-boot Codex session can continue without rediscovery.

## Status

Open handoff issue for the `1.3.15` installed-user stable patch line.

This Ubuntu boot can exercise Docker Engine in Linux-container mode only. A
local `docker info` check reports Docker `OSType=linux`, so it is not admissible
as Windows Docker Desktop Windows-container proof.

Public issue `#65` remains the public proof-intake lane. This issue is the
authority-side implementation/handoff lane for turning that proof into a launch
gate when a Windows host is available.

## Scope

- Real Windows host or Windows boot on the maintainer machine.
- Docker Desktop installed and switched to Windows containers.
- `docker info` must report `OSType=windows`.
- Canonical command:

```powershell
vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof --runtime-timeout-ms 300000
```

## Acceptance Criteria

- Retain `docker info` evidence proving `OSType=windows`.
- Pull or prove local availability of the governed NI Windows image:
  `nationalinstruments/labview:2026q1-windows`.
- Run the canonical fixture proof command from the installed extension.
- Retain proof showing:
  - `runtimeProvider=windows-container`
  - `runtimeEngine=labview-cli`
  - `runtimeExecutionState=succeeded`
  - `generatedReportExists=true`
  - nonempty generated HTML report
- If the proof fails, retain the exact `runtimeErrorCode`, blocked reason,
  Docker image state, and whether the failure is engine, image, LabVIEWCLI, or
  report-generation related.
- Do not admit Linux Docker Engine, Docker Desktop Linux containers, WSL-only
  execution, host-provider proof, platform injection, or private VI fixtures as
  satisfying this issue.

## Implementation Direction

- Keep Windows Docker Desktop as a launch gate only if the Windows-container
  proof above succeeds repeatably.
- If proof cannot pass on the Windows host, keep `1.3.15` stable focused on
  installed users with local LabVIEW 2025+ and retain Windows Docker Desktop as
  deferred/expert validation.
- Use GitHub cloud agents for read-only review, docs audit, or implementation
  suggestions only; do not delegate credentialed release or Marketplace
  mutations.

## Continuation Prompt

Continue from branch `feature/develop-1.3.15-installed-user-ux` after the
installed-user UX patch enabled Compare for exactly two selected revisions,
collapsed secondary VI History panel details, set the Marketplace target to
`1.3.15`, and moved runtime support to LabVIEW `2025`, `2026`, and newer local
versions while rejecting LabVIEW `2024` and older for VI Comparison Report
generation. On a Windows boot, execute `ISSUE-0415` by proving Docker Desktop
Windows-container mode with `docker info` `OSType=windows`, running
`vihs validate-fixture --provider docker --labview-version 2026 --labview-bitness x64 --proof-out .\vihs-fixture-proof --runtime-timeout-ms 300000`, and retaining whether this can become a launch gate. Preserve the publication boundary unless explicitly changed: no public GitHub release publication, no Marketplace mutation, and no release branch deletion.
