---
name: Script Contract Guardrails
description: "Use when editing scripts in scripts/*.js. Preserve testable module boundaries, gate-order constants, and cross-platform path safety."
applyTo: "scripts/**/*.js"
---

# Script Contract Guardrails

- Keep script logic testable through exported helpers and a thin CLI entrypoint.
- Preserve centralized constants for required CI and gate ordering when those contracts are enforced.
- Keep path handling cross-platform and avoid assumptions tied to a single OS shell.
- When script contracts change, update corresponding unit tests in the same change.
- Keep diagnostics actionable and explicit for maintainers and CI triage.
- Avoid introducing behavior that bypasses repository governance checks.
