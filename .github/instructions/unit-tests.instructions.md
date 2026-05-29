---
name: Unit Test Patterns
description: "Use when adding or updating unit tests in tests/unit. Keep tests deterministic, harness-first, and aligned to repository testing contracts."
applyTo: "tests/unit/**/*.test.ts"
---

# Unit Test Patterns

- Prefer deterministic fixtures and explicit inputs over ambient system state.
- Use the shared VS Code harness for extension-side behavior instead of ad-hoc mocks when possible.
- Keep one behavioral concern per test and use precise assertion messages for failures.
- For script behavior, test exported helpers directly with temporary fixtures before relying on shell-level execution.
- When requirement-linked behavior changes, update or add tests that preserve requirement and traceability expectations.
- Keep tests fast and isolated so they remain suitable for frequent local and CI runs.
