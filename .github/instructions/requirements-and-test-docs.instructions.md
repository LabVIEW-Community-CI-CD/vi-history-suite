---
name: Requirements And Test Docs Guardrails
description: "Use when editing requirements docs or test-plan contracts. Keep SRS, RTM, traceability inventory, and gate expectations aligned."
applyTo:
  - "docs/requirements/**/*.md"
  - "docs/requirements/**/*.csv"
  - "docs/testing/**/*.md"
---

# Requirements And Test Docs Guardrails

- If requirement-linked behavior changed, update requirement artifacts together where applicable: SRS, RTM, ID index, and traceability inventory.
- Keep RTM implementation and verification references repo-relative, resolvable, and appropriately tagged for manual or external references.
- Keep PR evidence and gate-order expectations aligned with repository DoD checks and workflow contracts.
- Use focused edits: change only the requirement and evidence surfaces affected by the task.
- Run traceability and docs validation commands after these edits.
- Preserve historical ID intent; do not silently remove retired or superseded identifiers.
