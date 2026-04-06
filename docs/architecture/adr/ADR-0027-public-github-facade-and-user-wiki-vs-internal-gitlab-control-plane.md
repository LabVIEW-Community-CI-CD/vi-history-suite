# ADR-0027: Public GitHub Facade And User Wiki Vs Internal GitLab Control Plane

## Status

Accepted

## Context

`vi-history-suite` now has multiple outward-facing repository and reader
surfaces that serve different audiences:

- the private GitLab source repo and its maintainer-facing control plane
- the public GitHub facade repo for extension users
- the internal GitLab wiki repo derived from the private control plane
- the new public GitHub wiki repo created for extension-user-facing pages

Those surfaces should not be treated as one blended documentation system.

The public extension-user audience should not be exposed to:

- Sergio's canonical host setup details
- benchmark-control material
- private requirements, RTM, or design-gate chronology
- maintainer-only acceptance and review instructions

At the same time, the private GitLab control plane still needs a derived wiki
surface for maintainer/operator navigation that can include those concerns.

As of `2026-04-06`, the public GitHub facade repo exists at
`https://github.com/svelderrainruiz/vi-history-suite`, and the public GitHub
wiki repo now exists at
`https://github.com/svelderrainruiz/vi-history-suite.wiki.git`.

## Decision

Keep a deliberate audience split.

1. The private GitLab source repo remains the engineering authority and
   release-control surface.
2. The internal GitLab wiki remains the maintainer-facing derived reader
   surface for that private control plane.
3. The public GitHub facade repo is the extension-user front face for:
   - release assets
   - setup guidance
   - support guidance
   - public issues
   - public extension-user documentation
4. The public GitHub wiki is an extension-user reader surface only. It shall
   contain curated public user guidance and shall not mirror the internal
   control plane.
5. The packaged VSIX metadata shall point extension users to the public GitHub
   facade, not to the internal GitLab authority repo.
6. Bundled installed-user documentation inside the VSIX remains a public
   extension-user reader surface and shall stay aligned with the public GitHub
   user guidance.
7. Publication accounting for the internal GitLab wiki and the public GitHub
   wiki shall remain explicit and separate. One ledger shall not silently
   imply both publication surfaces.
8. The private GitHub experiment mirror remains benchmark-only and is not part
   of the public extension-user documentation surface.
9. Public release, smoke, and documentation publication shall follow explicit
   one-way publication rules: internal GitLab authority is normalized first,
   then published outward to the public GitHub facade, bundled docs, and
   public GitHub user wiki.

## Rationale

- Extension users need a clean public front face.
- The maintainer still needs a richer internal control plane and maintainer
  wiki without leaking that material publicly.
- Public and internal wiki publication need separate evidence trails so future
  sessions can tell which audience actually received which documentation.
- Explicit one-way publication rules keep internal corrections from being
  mistaken for already-published public user guidance.
- Package metadata should match the user-facing support surface rather than the
  private engineering authority.

## Consequences

### Positive

- package metadata, public setup guidance, and public wiki direction all align
  to one public front face
- internal benchmark, acceptance, and standards/control-plane material can stay
  on GitLab without contaminating extension-user docs
- future sessions can publish user docs without weakening maintainer/operator
  control surfaces

### Negative

- the repo now needs to maintain two separate derived wiki audiences
- publication ledgers and docs CI must distinguish bundled docs, internal wiki,
  and public wiki surfaces explicitly
- future public wiki automation cannot assume the internal GitLab wiki is the
  direct publication source

## Implementation Surface

- `package.json`
- `README.md`
- `docs/product/current-state.md`
- `docs/product/extension-execution-policy.md`
- `docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md`
- `docs/product/issues/ISSUE-0407-public-facade-installer-and-windows-acceptance.md`
- `docs/product/wiki-authority-map.md`
- `docs/product/wiki-publication-ledger.md`
- `docs/product/wiki-publication-ledger.json`
- `docs/release-procedure.md`
- `docs/information-item-map.md`
- `resources/bundled-docs/manifest.json`
- `tests/unit/packageManifest.test.ts`
- `tests/unit/executionPolicyDocs.test.ts`
- `tests/unit/shipControlDocs.test.ts`
