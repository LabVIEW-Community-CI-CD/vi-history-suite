# Portfolio Operating Cycle 2 - 2026-05-17

Recorded: `2026-05-17T13:04:45Z`

GitLab work item:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/31`

Parent control plane:
`https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/11`

## Purpose

This packet records the second governed alignment cycle after the MIT
runtime-contract closeout and Marketplace-disabled decision. It turns the stale
Windows installed-user release-claim work into a current branch from `develop`,
records the three-authority operating model, and keeps future MIT work blocked
until a new bridge-admitted Implementation Admission Unit exists.

## Authority State

| Authority | Current Role | Cycle 2 State |
| --- | --- | --- |
| GitLab `vi-history-suite` | governed requirements, evidence, release, and bridge-admission authority | owns work item `#31`, standing lanes `#11` through `#16`, the refreshed Windows installed-user release-claim ledger, and all retained private evidence boundaries |
| GitHub `vi-history-suite` | public Marketplace-continuity authority | keeps open proof/readiness issues `#65`, `#82`, and `#98`; no new source promotion or Marketplace mutation is admitted by this cycle |
| GitHub MIT `vi-history` | clean-room Spec Kit implementation authority | remains idle at promoted baseline `bba32566c5909ef89ddf8ee2fac0422b9db45d49` with no open issues or pull requests; future implementation requires a new bridge-admitted IAU |

## MR !220 Triage

MR `!220` was not merged as-is because its branch diverged from current
`develop` and its pipeline failed. The release-claim ledger itself was still
valid because current `develop` did not contain the Windows installed-user
release-claim ledger, assertion script, host-only gate, or guard tests.

Cycle 2 therefore supersedes `!220` with a fresh branch from current
`develop`: `codex/portfolio-operating-cycle-2`.

The port preserves the useful claim boundary:

- native Windows LabVIEW 2026 x64 host proof is admitted as host-only
  installed-user evidence;
- exact VSIX installed-user proof is admitted for the retained line;
- Windows Docker Desktop Windows-container proof remains blocked and not
  admitted;
- host proof is not a substitute for Windows Docker Desktop proof;
- no tag, release, public GitHub, Marketplace, release-branch deletion,
  protected-branch mutation, or retained-evidence deletion is admitted.

Cycle 2 did not re-run the Windows claim assertion as proof on this Linux
worktree. `npm run proof:windows-installed-user-claim:assert` failed closed
because the retained Windows host and Windows Docker blocker proof roots were
not present locally. That failure preserves the boundary: this branch carries
the ledger and assertion logic, but it does not create a new Windows proof
claim.

## Operating Loop

1. Govern requirements, evidence, release truth, and assurance in GitLab.
2. Admit public implementation only through sanitized bridge packets and named
   IAUs.
3. Implement in MIT only after the IAU preflight passes.
4. Compare independent behavior across GitLab/Suite and MIT as the bug oracle.
5. Release only when evidence, docs, user-facing claims, and publication
   ledgers agree.

## Next-Admissible Work

There is no active MIT implementation IAU after this cycle. The next
implementation candidate must start as a governed GitLab finding, pass
`spec-kit-authority-bridge` redaction and artifact checks, and record an
explicit IAU preflight with status `pass`.

The next non-implementation work is governance:

- retire or close stale MR `!220` once this refreshed branch is accepted;
- keep `#65` blocked on real Windows Docker Desktop Windows-container proof;
- keep `#98` as installed-user observation intake;
- keep `#82` as Marketplace/readiness roadmap only.

## Proving Commands

Required before merge:

- `npm run check`
- `npm test`
- `npm run docs:gate:core`
- `npm run docs:ci:core`
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:release-gate -- --evidence-dir /tmp/vihs-assurance-release-cycle-2`
- `VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514-cycle-2`
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/requirements_quality_check.py . --json`
- `python3 /home/sergio/repos/gl/repo-standards-review/scripts/external_user_information_check.py . --json`
- `git diff --check`

Informational fail-closed check:

- `npm run proof:windows-installed-user-claim:assert` fails on this Linux
  worktree until the retained Windows host proof, Windows Docker blocker proof,
  and canonical fixture proof roots are restored locally.

## Mutation Boundary

This cycle authorizes governance, docs, tests, assertion tooling, and CI proof
surface alignment only. It does not authorize MIT implementation, source
promotion, release publication, Marketplace publication, protected branch
mutation, or Windows Docker Desktop proof claims.
