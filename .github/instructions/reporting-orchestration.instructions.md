---
name: Reporting Orchestration Guardrails
description: "Use when changing comparison report execution, preflight, packet, or runtime orchestration in src/reporting. Preserve staged outcomes, explicit evidence, and dependency-injected boundaries."
applyTo: "src/reporting/**/*.ts"
---

# Reporting Orchestration Guardrails

- Preserve explicit stage outcomes and user-facing evidence paths; do not collapse branches into generic errors.
- Keep preflight, execution plan, runtime execution, and packet rendering responsibilities separate.
- Maintain dependency injection boundaries for filesystem, runtime tools, and VS Code APIs to keep unit tests deterministic.
- Keep indexing diagnostics and comparison runtime diagnostics distinct in behavior and wording.
- Update related unit tests whenever orchestration branches or outcome shapes change.
- For requirement-linked behavior updates, confirm requirement references and evidence paths stay accurate.
