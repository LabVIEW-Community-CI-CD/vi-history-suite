# ADR-0028: Governed Authority-To-Public Source Promotion System

## Status

Accepted

## Context

As of `2026-04-06`, `vi-history-suite` now has four distinct outward-facing
surfaces:

- the private GitLab source repo as engineering authority
- the internal GitLab wiki as the maintainer-facing derived reader surface
- the public GitHub source repo as the extension-user source/product surface
- the public GitHub wiki as the extension-user reader surface

ADR-0027 established the public-versus-internal audience split, but the source
side remained weaker than the wiki side:

- the public GitHub source repo still carried a stale release-kit story
- public source publication still depended on manual editing inside the public
  clone
- there was no dedicated authority map or publication ledger for the public
  source repo
- there was no deterministic promotion mechanism that could fail closed on
  stale release-kit drift or internal-surface leakage
- there was no governed rule for binding the intended local public checkout or
  rejecting a dirty target repo before comparison/write acted on the wrong
  worktree

That is too weak for a long-lived public product surface.

## Decision

Adopt a deterministic one-way promotion system for the public GitHub source
repo.

1. GitLab remains the sole authority repo.
2. The public GitHub source repo is a curated product surface, not a mirror of
   the GitLab authority repo.
3. Public source publication shall be governed by:
   - a public source authority map
   - a public source publication ledger
   - a deterministic promotion script
   - regression tests that fail closed when the curated surface drifts
   - explicit target-root binding through `--target-root` or
     `VIHS_PUBLIC_GITHUB_SOURCE_REPO_ROOT`, with fail-closed rejection when the
     bound public checkout is dirty
4. The public source repo shall be shaped around the public product contract:
   - Docker-only installed compare execution
   - x64-only container surfaces
   - repo-agnostic two-commit checkbox-selected compare flow
   - devcontainer/Codespaces-capable development path
   - no internal control-plane, benchmark-governance, or maintainer-review
     publication
5. Public GitHub source publication shall be recorded separately from:
   - internal GitLab wiki publication
   - public GitHub wiki publication
6. Gate D shall ultimately be exercised against the public product surface,
   not the authority repo alone.

## Rationale

- A public product repo needs a stable published boundary, not ad hoc manual
  repo edits.
- A curated public source surface is smaller and clearer than a blind source
  mirror.
- Deterministic promotion makes it possible to audit what was actually
  published and to rerun the same publication later.
- Public-source promotion is not deterministic if the tool silently points at
  the wrong local checkout or writes over a dirty repo.
- Separate ledgers are required because publishing the public source repo and
  publishing the public wiki are different acts.

## Consequences

### Positive

- future sessions can publish the public source repo without rediscovering the
  file boundary
- future sessions can bind the intended local public checkout explicitly and
  fail closed before acting on a dirty side worktree
- the public GitHub source repo can evolve into a real product repo instead of
  a legacy release kit
- the authority repo can prove what was published publicly and when

### Negative

- the authority repo now has one more derived publication surface to govern
- public source publication requires explicit tooling and regression coverage
- public source, public wiki, and internal wiki publication must stay aligned
  without being conflated

## Implementation Surface

- `scripts/promotePublicGithubSource.js`
- `public-github-source/`
- `docs/product/public-github-source-authority-map.md`
- `docs/product/public-github-source-publication-ledger.md`
- `docs/product/public-github-source-publication-ledger.json`
- `docs/product/program-repo-jump.md`
- `docs/product/program-repo-jump-map.json`
- `docs/documentation-workbench.md`
- `docs/release-procedure.md`
- `tests/unit/publicGithubSourcePromotion.test.ts`
- `tests/unit/publicSurfaceBoundaryDocs.test.ts`
