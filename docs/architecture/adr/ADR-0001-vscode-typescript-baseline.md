# ADR-0001: TypeScript-First VS Code Desktop Baseline

- Status: accepted
- Date: 2026-04-02
- Deciders: sole author

## Context

- The product target is a VS Code extension running in the Node extension host.
- The initial value comes from content detection, Git-backed eligibility, and a
  local review panel.
- The new repo should be self-contained and should not depend on existing
  comparevi repos.

## Decision

- Build the first baseline as a TypeScript-first VS Code desktop extension.
- Use the built-in Git extension for repository discovery and Git CLI for
  bounded file-history operations.
- Keep NI report generation out of the first implementation slice.

## Rationale

- TypeScript is the natural language for VS Code extension development.
- The built-in Git extension reduces repository-discovery guesswork.
- Git CLI preserves direct control over `ls-files` and `log --follow`
  semantics.
- Deferring NI report generation keeps the first baseline focused and locally
  testable.

## Alternatives Considered

- Python orchestration outside VS Code
- depending on other comparevi repos
- solving NI compare-report generation immediately

## Consequences

- Positive:
  - product direction is visible in code from day one
  - local developer loop stays small
  - governance docs align with the actual runtime
- Negative:
  - more Git command parsing must be implemented locally
  - integration testing inside VS Code remains future work in this baseline

