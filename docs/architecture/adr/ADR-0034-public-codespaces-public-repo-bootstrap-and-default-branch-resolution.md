# ADR-0034: Public Codespaces Public-Repo Bootstrap And Default-Branch Resolution

## Status

Accepted

## Context

The published public Codespaces/devcontainer story already has one canonical
helper-backed proof path through `ni/labview-icon-editor`, but that path is too
narrow to cover a fork owner who wants to review another public LabVIEW repo in
Codespaces.

The next public capability needed one command that:

- accepts a public GitHub or public GitLab repo without forcing the user to
  choose a provider flag
- clones into a visible workspace path instead of a hidden cache folder
- honors an explicit branch exactly when provided
- resolves the remote default branch when the branch is omitted
- keeps the canonical icon-editor helper path as the easiest first-time proof
  instead of replacing it with a more generic but less guided flow

The user story is explicitly public-only. Private repo authentication, SSH
transport, and arbitrary Git hosts would add a different risk and UX surface
than this line intends to govern.

## Decision

Adopt this `1.2.0` public bootstrap contract:

- add one generic command:
  - `npm run public:repo:clone -- --repo-url <https-url>`
- support only public HTTPS repos on:
  - `github.com`
  - `gitlab.com`
- require no provider selector; infer the provider from the repo host
- honor `--branch` exactly when the user supplies it
- resolve the remote default branch from remote HEAD when the user omits
  `--branch`
- derive a visible repo-sibling target root from the repo name
- fail closed when the existing target path:
  - is not a Git clone
  - points at a different origin repo
  - is dirty
- keep `npm run public:fixture:icon-editor` as the canonical easiest first-time
  proof for `ni/labview-icon-editor`
- keep the generic public bootstrap procedure separate from the canonical
  helper-backed procedure
- block the exact `v1.2.0` tag until the maintained public wiki procedures are
  dry-run reviewed and accepted from a brand new fork and a brand new Codespace

## Consequences

Positive:

- fork owners gain one governed public bootstrap command that works for public
  GitHub and GitLab repos
- the branch-selection contract becomes stronger than a brittle `main` versus
  `master` heuristic because it resolves the actual remote default branch
- the novice-friendly icon-editor quickstart remains intact

Costs:

- the public docs package now has to maintain two distinct Codespaces
  procedures on purpose
- the bootstrap command must stay strict about supported hosts and clone-state
  hygiene instead of silently trying best-effort fallbacks

## Follow-On

- retain this contract in the SRS, RTM, test plan, README, current-state, and
  public release-candidate package
- prove the command through unit tests and public-source promotion checks
- stop for Sergio wiki-procedure review from a brand new fork and a brand new
  Codespace before exact `v1.2.0` tagging
