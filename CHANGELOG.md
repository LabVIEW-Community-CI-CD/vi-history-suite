# Changelog

This changelog is the governed version-line summary for `vi-history-suite`.

The first retained exact-version release remains `v0.2.0`. `package.json` may
advance ahead of that retained release while the repo builds the next governed
exact-version line.

## [0.3.0] - Unreleased

### Added

- one public governed proof entrypoint, `runGovernedProof`, across smoke,
  report-smoke, dashboard-smoke, decision-record, and benchmark proof
  surfaces
- first-class execution-mode governance with Windows Docker-first `auto`
  behavior when Docker Desktop is installed
- documentation continuous integration with bundled-doc drift checks and
  version-matched package refresh before VSIX packaging
- deterministic host-review submission with canonical-host retention and a
  fail-closed non-OneDrive boundary
- explicit post-release sustainment rules for release cadence, benchmark
  refresh, and operator-surface upkeep

### Changed

- the active development baseline now advances to `0.3.0` because the
  post-`v0.2.0` line introduced new product capabilities and public-contract
  tightening, not a patch-sized maintenance change
- the public proof contract is now canonical `LabVIEWCLI CreateComparisonReport`
  rather than multiple public proof scripts or a public engine selector

## [0.2.0] - 2026-04-03

### Added

- the first retained exact-version VSIX release for `vi-history-suite`
- governed GitLab release evidence for `v0.2.0`, including release pipeline
  `2428809456` and kept release job `13779604462`
- an exact-version install surface at `vi-history-suite-0.2.0.vsix`
