# Changelog

This changelog is the governed version-line summary for `vi-history-suite`.

Retained exact-version releases now include `v0.2.0`, `v1.0.0`, and `v1.0.1`.

## [1.0.2] - 2026-04-07

### Changed

- the public fork-owner Codespaces path now uses the governed `develop` branch
  instead of teaching `main`
- the governed `public:fixture:icon-editor` helper now defaults to upstream
  `develop`, clones full Git history instead of a shallow single-commit copy,
  repairs old shallow or wrong-branch clones automatically when they are clean,
  and stages the sample repo in a visible sibling `labview-icon-editor`
  folder so `lv_icon.vi` remains eligible for the `VI History` context menu
- the public fork-owner procedures are now rewritten for LabVIEW-first users:
  they explicitly call out the `16-core` Codespace machine, the browser build
  message, the exact open-folder path, and the manual `ni/actor-framework`
  example path without hidden `.cache` navigation
- the public Codespaces/devcontainer surface continues to avoid recommending
  `vitest.explorer`, and the fork-owner guidance now treats any browser-profile
  Vitest popup as unrelated to the VI History flow instead of implying that the
  tester must install Vitest

## [1.0.1] - 2026-04-07

### Changed

- the public fork-owner Codespaces procedures now spell out `Code` ->
  `Codespaces` -> `New with options`, the `16-core` machine selection, the
  browser build message, and the exact folder-open path for the canonical
  `lv_icon.vi` flow
- the public Codespaces/devcontainer surface no longer recommends
  `vitest.explorer`, so fork owners are not prompted to install Vitest for the
  LabVIEW review workflow

## [1.0.0] - 2026-04-07

### Added

- one public governed proof entrypoint, `runGovernedProof`, across smoke,
  report-smoke, dashboard-smoke, decision-record, and benchmark proof
  surfaces
- a Docker-only installed-extension compare contract that no longer depends on
  host-native LabVIEW runtime selection in the extension-user workflow
- documentation continuous integration with bundled-doc drift checks and
  version-matched package refresh before VSIX packaging
- deterministic host-review submission with canonical-host retention and a
  fail-closed non-OneDrive boundary
- explicit post-release sustainment rules for release cadence, benchmark
  refresh, and operator-surface upkeep

### Changed

- the repo cut the exact `v1.0.0` line because the installed extension
  contract is breaking-change material: extension compare execution depends on
  Docker, no longer exposes host-vs-Docker mode choice to extension users, and
  no longer competes with ambient host LabVIEW sessions
- the public proof contract is now canonical `LabVIEWCLI CreateComparisonReport`
  rather than multiple public proof scripts or a public engine selector

## [0.2.0] - 2026-04-03

### Added

- the first retained exact-version VSIX release for `vi-history-suite`
- governed GitLab release evidence for `v0.2.0`, including release pipeline
  `2428809456` and kept release job `13779604462`
- an exact-version install surface at `vi-history-suite-0.2.0.vsix`
