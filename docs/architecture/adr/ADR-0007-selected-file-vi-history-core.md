# ADR-0007: Selected-File VI History Core

- Status: Accepted
- Date: 2026-07-19

> This ADR records the retained design for the core VI History capability under
> system requirement VHS-SYS-REQ-001 (VS Code LabVIEW VI History System). The
> authoritative requirement text lives in the requirements package; this is the
> design record.

## Context

The product's foundational capability is reviewing the Git history of a single
LabVIEW VI a user selects in their workspace, inside VS Code, without disturbing
their normal source-control workflow. This requires detecting that a file is a
VI, resolving its Git repository and tracked history safely and cheaply, and
presenting factual history in a webview — all with lean activation that does not
scan the repository or start heavy work on load.

## Decision

Keep VI History a **selected-file, read-only, factual** capability:

- Identify VIs by content signature (not just extension) and gate the
  Explorer/editor menu entries and the open command on that plus Git tracking.
- Resolve the most-specific Git repository for the selected file and read
  history with NUL-safe path parsing and bounded commit queries, doing only
  minimal local probe reads (with a non-file URI fallback).
- Present history and the copyable review packet as factual, non-editorial text
  in a webview panel, including the commit body.
- Keep activation lean: a stable primary command identifier and no
  indexing/side effects on activation; bundled documentation ships in-product.

## Consequences

- Open cost is scoped to the selected file, and activation stays cheap.
- History and review output remain factual and safe to show in review contexts.
- Repository-wide behavior is never a prerequisite for opening one file (see
  ADR-0002 for the on-demand eligibility decision that reinforces this).

## Requirements recorded

VHS-SYS-REQ-001; VHS-REQ-001, VHS-REQ-003, VHS-REQ-004, VHS-REQ-006,
VHS-REQ-007, VHS-REQ-008, VHS-REQ-010, VHS-REQ-011, VHS-REQ-013, VHS-REQ-016,
VHS-REQ-017, VHS-REQ-039, VHS-REQ-040, VHS-REQ-061, VHS-REQ-082, VHS-REQ-083,
VHS-REQ-611, VHS-REQ-639.
