# Requirement Target Scaffold

Use this scaffold when creating requirement-scoped agent work items or prompts.

Target VHS-REQ-###.
Linked issue: Refs #<issue-number>.

Read first:
- docs/requirements/srs.md
- docs/requirements/rtm.csv
- docs/requirements/README.md

Work contract:
- Implement only accepted scope for the target requirement.
- Update code, tests, and requirement artifacts together when behavior or evidence paths change.
- Keep out-of-scope boundaries explicit.

Required output:
- PR evidence block with linked issue, target requirement, validation commands, traceability/RTM impact, out-of-scope, closeout readiness.

Validation commands:
- npm run traceability:audit
- npm run check
- npm test
- npm run docs:links
- bash .github/skills/testing-automation/scripts/run-pr-gates.sh --skip-install
