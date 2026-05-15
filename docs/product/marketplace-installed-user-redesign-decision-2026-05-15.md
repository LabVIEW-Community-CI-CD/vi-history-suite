# Marketplace Installed-User Redesign Decision

Date: 2026-05-15

## Context

The Marketplace/README Details page had drifted into a mixed audience surface.
First-time installed users encountered maintainer release-control material,
relative links that are fragile outside the repository renderer, and setup
wording that implied `vihs` might exist before the explicit prepare command.

Reported issues:

- `You have not yet finished authorizing this extension to use GitHub. Would you like to try a different way?` appeared when selecting the installed extension.
- Selecting the extension could open LabVIEW 32-bit through an unintended early path.
- FAQ and Command Reference routes were linked from Marketplace through
  relative paths.
- `docs/information-item-map.md` and
  `docs/product/public-release-candidate.md` were exposed from README as
  installed-user Details routes even though they are maintainer/control-plane
  material.
- Information-for-users docs were linked relatively from the Marketplace
  README.
- Bundled installed docs linked to missing root `FIRST-RUN.md` and
  `TROUBLESHOOTING.md` paths.
- The README `Authority And Release Control` and `Authority release facts`
  sections were too verbose for users looking to install and run the extension.

Repo findings:

- `package.json` activated the extension on `onStartupFinished` and declared
  `vscode.git` as an extension dependency.
- `src/extension.ts` resolved the built-in Git API, constructed the VI
  eligibility indexer, started indexing, and materialized the local runtime CLI
  during extension activation.
- `README.md` contained both installed-user onboarding and maintainer
  release-control routes.
- `resources/bundled-docs/pages/install-and-release.html` and
  `scripts/syncBundledDocs.js` linked to missing root first-run and
  troubleshooting guides.

## Decisions

- Scope this change across documentation and activation behavior, because the
  first-time user failure mode was both a content problem and a startup side
  effect problem.
- Keep the README and Marketplace Details installed-user first.
- Remove authority/release-control material from README Details and retain it
  in `docs/product/maintainer-control-plane-index.md`.
- Add quiet future-video anchors in the Overview without fake thumbnails or
  placeholder video links.
- Remove startup activation.
- Resolve the built-in Git API lazily only when `VI History` or an explicit API
  refresh path needs repository facts.
- Do not start VI eligibility indexing from docs, prepare CLI, or general
  extension selection.
- Do not allow LabVIEW or `LabVIEWCLI` to start except from explicit Compare,
  `vihs --validate`, fixture validation, or explicit runtime probe commands.
- Use already-live public/wiki links where possible. Keep branch-local
  information-for-users and maintainer-control-plane links relative until the
  target files are live on public GitHub; the full `lychee` docs gate fails
  correctly on future public URLs that return 404 before publication.
- Make first-time onboarding prepare-CLI-first: run
  `VI History: Prepare Local Runtime Settings CLI`, run `vihs`, choose
  provider/year/bitness, run `vihs --validate`, then open `VI History`.
- Keep Git indexing command-only and Compare-path-only.
- Add a maintainer control-plane route for release/publication truth.

## Consequences

- Selecting the extension or opening installed documentation should stay quiet:
  no GitHub auth prompt, no repository indexing, and no LabVIEW process.
- `vihs` is prepared by explicit user action instead of being promised by
  startup activation.
- The Marketplace README becomes a user flow backed by deeper details, while
  governance facts remain retained for maintainers.
