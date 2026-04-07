# Changelog

This changelog is the governed version-line summary for `vi-history-suite`.

Retained exact-version releases now include `v0.2.0` and `v1.0.0`.

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

- the active development baseline now advances to `1.0.0` because the
  installed extension contract is now breaking-change material: extension
  compare execution depends on Docker, no longer exposes host-vs-Docker mode
  choice to extension users, and no longer competes with ambient host LabVIEW
  sessions
- the public proof contract is now canonical `LabVIEWCLI CreateComparisonReport`
  rather than multiple public proof scripts or a public engine selector

## [0.2.0] - 2026-04-03

### Added

- the first retained exact-version VSIX release for `vi-history-suite`
- governed GitLab release evidence for `v0.2.0`, including release pipeline
  `2428809456` and kept release job `13779604462`
- an exact-version install surface at `vi-history-suite-0.2.0.vsix`
