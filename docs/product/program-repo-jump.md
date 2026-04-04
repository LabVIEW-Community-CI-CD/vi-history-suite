# Program Repo Jump

## Purpose

Retain one governed cross-repo navigation surface for the local CompareVI
program constellation on this machine:

- `vi-history-suite`
- `vi-history-suite-source-experiments`
- `vi-history-suite.wiki`
- `repo-standards-review`

This surface exists so future sessions can move between product truth,
published-reader truth, and standards-assurance truth without depending on chat
memory or ad hoc shell history.

## Authority Roles

- `vi-history-suite`: product authority and ship-control repo
- `vi-history-suite-source-experiments`: private GitHub experiment mirror for
  non-authoritative Linux benchmark iteration
- `vi-history-suite.wiki`: derived reader surface
- `repo-standards-review`: companion assurance skill and docs-package audit
  surface

If those repos disagree, the main repo documentation package in
`vi-history-suite` remains the authority of record until the other repo is
aligned.

`vi-history-suite-source-experiments` is a governed private mirror with an
actual remote and local sibling path on this machine. It remains benchmark
evidence only and does not replace GitLab authority.

## Governed Map

The machine-readable source of truth is:

- `docs/product/program-repo-jump-map.json`

That map names:

- the governed repo ids
- their authority roles
- expected remotes
- local path-resolution strategy
- primary repo entrypoints

## Local CLI

Use the local CLI from `vi-history-suite` when you need a deterministic local
path summary:

```bash
npm run program:repos
```

Filter to one repo when needed:

```bash
npm run program:repos -- --repo repo-standards-review
```

Emit JSON for tooling or future automation:

```bash
npm run program:repos -- --format json
```

## Companion Skill Entry

From `repo-standards-review`, use the reciprocal resolver against this repo:

```bash
python3 scripts/repo_jump.py /home/sveld/code/standards/vi-history-suite --format text
```

That script reads this repo's governed map instead of hardcoding a second
constellation definition.

## Update Rule

When the CompareVI repo constellation changes, update these together:

- `docs/product/program-repo-jump-map.json`
- `docs/product/program-repo-jump.md`
- `docs/product/current-state.md`
- `README.md`
- `docs/information-item-map.md`
- `docs/documentation-workbench.md`
- `docs/architecture/overview.md`
- companion `repo-standards-review` jump tooling

## Boundary

This surface is for local navigation and documentation-package orientation. It
is not a runtime-proof lane and it does not replace release or benchmark
authority.

The governed boundary is:

- GitLab `vi-history-suite`: authority
- private GitHub `vi-history-suite-source-experiments`: experiment mirror only
- public GitHub facade: public release/setup/support only
