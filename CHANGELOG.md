# Changelog

This changelog records user-facing release history for `vi-history-suite`.

Retained exact-version releases now include `v0.2.0`, `v1.0.0`, `v1.0.1`,
`v1.0.2`, `v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.0.6`, `v1.1.0`, `v1.2.0`,
`v1.2.1`, `v1.2.2`, `v1.3.0`, `v1.3.1`, `v1.3.2`, `v1.3.3`, `v1.3.4`,
`v1.3.5`, `v1.3.6`, `v1.3.7`, `v1.3.8`, `v1.3.9`, `v1.3.14`,
`v1.3.15`, `v1.3.16`, `v1.4.0`, `v1.4.1`, and `v1.4.2`.

Burned exact-version releases now include `v1.0.2`.

## [Unreleased]

### Changed

- A comparison blocked because a different LabVIEW bitness or version is already
  running now shows a concise, actionable notification — it names the running
  vs. selected LabVIEW and steers to a single path: close the running LabVIEW,
  then click **Retry Compare**. The verbose provider/rejected-provider text is
  gone, no setting-switch instruction is shown, and the blocked-evidence report
  no longer opens automatically (the packet is still saved and can be exported).
  The host-native rejection rationale now states the bitness/version conflict
  instead of an incorrect "LabVIEWCLI was not located" message. The mid-run
  reclassified bitness-conflict failure keeps its existing **Pick Runtime
  Provider** notification (VHS-REQ-621/653, #530).

## [1.27.2] - 2026-06-14

### Changed

- The Windows runtime-matrix `port-A` scenario now derives its expected VI
  Server port from the selected install's own `LabVIEW.ini` instead of a
  hardcoded `3380` or an operator-supplied `host_tcp_port` / `--host-tcp-port`
  value, and additionally asserts the validation proof's `hostLabviewIniPath`
  matches the selected install. This removes a false-pass path (passing the
  `3363` default), self-configures to whatever port the operator sets, and
  proves the product read the selected install rather than the latest-used one.
  The `host_tcp_port` workflow input and `--host-tcp-port` driver flag are
  removed (VHS-REQ-623, #525).

## [1.27.1] - 2026-06-13

### Fixed

- The self-hosted maintainer validation workflows now reliably produce their
  evidence bundles. The `runner-evidence/` summary directory is recreated after
  checkout in the Windows and Linux LabVIEW maintainer workflows (it was wiped
  by `actions/checkout`), the Windows runtime-conflict matrix re-records its
  trusted-ref guard summary after checkout instead of silently dropping it, and
  the Windows maintainer workflow's VSIX-evidence step no longer hard-fails on
  an invalid `Tee-Object` parameter combination.

### Changed

- The `vihs --validate` runtime-validation proof now records the observed
  host VI Server TCP port (`runtime.hostLabviewTcpPort`) and the `LabVIEW.ini`
  it was read from (`runtime.hostLabviewIniPath`), so maintainer validation
  evidence can prove a non-default VI Server port was admitted without a false
  conflict block. A new dispatch-only Windows runtime-matrix `port-A` scenario
  exercises this on real hardware (VHS-REQ-623).

## [1.27.0] - 2026-06-13

### Changed

- The Marketplace listing now documents the extension **Requirements** (VS Code
  1.90+, a trusted Git repository with at least two retained revisions, and
  host-native LabVIEW 2025+ with the LabVIEW CLI or a validated Docker image)
  and a **Runtime providers and safety checks** section covering the compare
  preflight plus the proactive runtime-conflict diagnostics (bitness, version,
  container-image-platform, and VI Server TCP), so the safety guardrails are
  clear before install.

## [1.26.0] - 2026-06-13

### Fixed

- On a Windows host with multiple LabVIEW installs of the **same bitness but
  different years** (for example LabVIEW 2025 and 2026, each x64 with its own VI
  Server TCP port), a host-native compare no longer silently attaches to an
  already-running wrong-year LabVIEW. The compare-time runtime locator now blocks
  with an actionable `windows-host-version-conflict` reason when a running
  same-bitness LabVIEW has a known year that differs from the selected
  `viHistorySuite.labviewVersion`, and the warning toast offers a `Pick Runtime
  Provider` action. Year inference is best-effort, so a matching-year or
  unknown-year session is still admitted. (VHS-REQ-653)

## [1.25.0] - 2026-06-13

### Added

- The `VI History` compare preflight now offers a **Pick Image Version**
  call-to-action button when the runtime is blocked because the selected
  `viHistorySuite.container.imageVersion` targets a platform the active Docker
  mode cannot launch (`container-image-platform-mismatch`). Clicking it opens the
  image-version picker, so the mismatch can be fixed from the panel before
  selecting revisions and running Compare. After the picker completes, the panel
  re-resolves the preflight and re-renders in place, so a corrected selection
  clears the block (and its call-to-action) without reopening the panel. The
  button appears only for that classified block reason. (VHS-REQ-650)

## [1.24.0] - 2026-06-13

### Added

- The `VI History runtime` status bar now warns proactively when the selected
  `viHistorySuite.container.imageVersion` targets a platform the active Docker
  daemon cannot launch (for example a `-windows` image while Docker runs Linux
  containers): the label switches to a warning state (`$(warning) VI History
  runtime: Docker @ <tag>`) with a tooltip naming the conflict and the fix, so
  the mismatch is visible before a comparison is attempted. The warning fires
  only against a confirmed Docker daemon mode — when Docker is stopped or the
  mode cannot be determined, no warning is shown. (VHS-REQ-620, VHS-REQ-650)

### Changed

- When a comparison is blocked because the selected
  `viHistorySuite.container.imageVersion` targets a different platform than the
  active Docker container mode (`container-image-platform-mismatch`), the warning
  now offers a **Pick Image Version** button that opens the image-version picker,
  and the picker surfaces a stale cross-platform selection as a leading warning
  **Clear** row that names the stale tag and the active Docker platform — so the
  mismatch is recoverable in one click instead of requiring a manual settings
  edit. (VHS-REQ-650)

## [1.23.0] - 2026-06-13

### Changed

- The **Pick LabVIEW Container Image Version** command now probes the active
  Docker daemon container mode (`docker info`) when it opens and lists the image
  versions for that platform, so a Windows host running Docker in Linux-container
  mode is offered Linux images up front instead of Windows-only tags. If Docker
  is unavailable or the mode cannot be determined, it falls back to the host OS
  default as before. (VHS-REQ-649)
- The `VI History runtime` status bar label now names the active LabVIEW
  container image for the docker provider (for example
  `VI History runtime: Docker @ 2026q1patch1-windows`), mirroring the host label
  that already shows version and bitness. It reflects the
  `viHistorySuite.container.imageVersion` selection live and falls back to a
  default tag when nothing is selected. (VHS-REQ-620)

### Fixed

- A selected `viHistorySuite.container.imageVersion` whose platform conflicts
  with the active Docker container mode (for example a `-linux` image while
  Docker is running Windows containers) now fails closed at compare time with a
  classified `container-image-platform-mismatch` reason that names the active
  mode and the fix, instead of silently falling back to the default image. A
  full per-platform image override still governs and suppresses the check.
  (VHS-REQ-650)

## [1.22.0] - 2026-06-13

### Added

- Comparison report flags are now configurable through native VS Code settings
  under `viHistorySuite.report.*` (user- and workspace-scoped, shown in the
  Settings editor). A `report.format` setting chooses the report output format
  (single-file HTML default, or multi-file HTML), and five toggles map to the
  LabVIEWCLI `CreateComparisonReport` difference-suppression filters:
  `ignoreViAttributes` (`-noattr`), `ignoreFrontPanel` (`-nofp`),
  `ignoreFrontPanelObjectPosition` (`-nofppos`), `ignoreBlockDiagram` (`-nobd`),
  and `ignoreBlockDiagramCosmetic` (`-nobdcosm`). With nothing configured, report
  generation is unchanged. (VHS-REQ-645)
- LabVIEW Docker container image versions are now selectable instead of pinned to
  a single hardcoded tag. The new `viHistorySuite.container.imageVersion` setting
  and the **Pick LabVIEW Container Image Version** command
  (`labviewViHistory.pickContainerImageVersion`) list the versions discovered
  from the published Docker Hub `nationalinstruments/labview` tags and from images
  already pulled locally — newest first, annotated as pulled-locally or
  available-to-pull. The comparison runtime drives both the Windows-container and
  Linux-container providers from the selection, so new National Instruments
  patch releases (for example `2026q1patch1`, `2026q1patch2`) and future release
  years become selectable without updating the extension. With nothing selected,
  the prior default image is used unchanged. (VHS-SYS-REQ-019, VHS-REQ-646,
  VHS-REQ-647, VHS-REQ-648, VHS-REQ-649, VHS-REQ-650)
- Selecting the **docker** runtime provider through **Pick Runtime Provider** now
  chains directly into the container image version picker as a follow-on step, so
  the matching image version is offered at the moment it is relevant. Host
  selections are unchanged. (VHS-REQ-651)

## [1.21.1] - 2026-06-12

### Changed

- The multi-report comparison dashboard now reports an **Overview images
  materialized** metric (and a `materializedOverviewImageCount` field in the
  dashboard record) alongside the parsed overview-image count. Single-file
  reports (the default since v1.21.0) embed difference images as data URIs with
  no sibling `<report>_files` directory; surfacing the materialized count makes
  any overview image that could not be decoded or located observable instead of
  being silently dropped. (VHS-REQ-640)

## [1.21.0] - 2026-06-12

### Added

- The **Export comparison report** title-bar action now embeds the same revision
  context shown in the in-panel comparison view — the selected and base revision
  hash, date, author, subject, and full commit body — at the top of the exported
  LabVIEW-generated graphics report. Previously the exported graphics report
  carried no revision context. The context is added to the exported copy only;
  the retained report on disk is unchanged, and the report's images still
  resolve when the exported HTML is opened in an external browser. (VHS-REQ-626)

## [1.20.0] - 2026-06-12

### Added

- When a VI comparison is started with the Docker runtime selected but the
  Docker daemon is not running (Docker is installed yet Docker Desktop or the
  daemon has not been started), VI History now shows a concise notification
  instead of opening the full diagnostics report: it names the platform's Docker
  surface (Docker Desktop on Windows, the Docker daemon on other hosts) and
  offers **Retry** and **Show diagnostics**. Start Docker and choose **Retry**
  to run the comparison again; the full diagnostics packet is still retained and
  is reachable from **Show diagnostics**. (VHS-REQ-642)
- When a VI comparison is started with the Docker runtime selected but Docker is
  not installed at all, VI History now shows a concise notification with an
  **Install Docker** action (opening the Docker download page) and a **Show
  diagnostics** action, instead of the full diagnostics report. (VHS-REQ-643)

## [1.19.0] - 2026-06-11

### Added

- The VI History panel now detects uncommitted working-tree changes to the
  selected VI and pins a selectable **Working Tree (uncommitted)** row at the top
  of the history table. Check the working-tree row plus any committed revision
  and choose **Compare** to review on-disk changes before they are committed
  against any prior commit. A VI with a single commit plus uncommitted changes
  becomes reviewable. The working-tree side reads the on-disk file (it is never
  written to) and resolves its in-repo dependencies against the committed tree.
  Working-tree comparisons are not retained as reproducible dashboard evidence.
  (VHS-REQ-641)

## [1.18.0] - 2026-06-11

### Changed

- LabVIEW comparison reports are now generated as a self-contained single-file
  HTML document (`-ReportType htmlsinglefile`) with every difference image
  embedded as a data URI, instead of a multi-file report plus a sibling
  `<report>_files` image directory. This removes the per-image webview
  sub-requests that could exhaust the resource loader on large reports, so the
  comparison-report panel reliably renders every image. Exporting a single-file
  report now writes just the one self-contained HTML file (no sibling assets
  folder); previously retained multi-file reports continue to render and export
  with their assets. (VHS-REQ-640, VHS-REQ-610, VHS-REQ-626)

### Fixed

- Generated LabVIEW comparison reports now render every difference image in the
  report webview. Large reports reference hundreds of per-object difference
  images, and the webview previously requested them all at once when the report
  opened. That exhausted the webview resource loader (Chromium
  `net::ERR_INSUFFICIENT_RESOURCES`), so images past the limit failed to load and
  showed their file-path `alt` text (for example
  `diff-report-KeyDown.vi_files/380_0_1.png`) instead of the picture. Report
  images now load lazily as they scroll into view, keeping concurrent requests
  low so all images load. The fix applies to both the comparison report panel
  and the VI Review Dashboard's inline report view.

## [1.17.0] - 2026-06-11

### Changed

- The `VI History` panel now shows each retained revision's full Git commit
  message body in a dedicated `Commit body` column, replacing the former
  `Adjacent pair` column. The adjacent-pair text only repeated hash pairings
  already visible elsewhere in the table, while the commit body carries the
  human rationale that is otherwise hard to recover from binary VI revisions.
  Commit bodies render with their original line breaks and show a factual
  fallback when a revision has no body. The copied review packet now lists
  per-revision commit subject and body facts in place of the previous
  compare-pair summary. (VHS-REQ-639)

## [1.16.0] - 2026-06-11

### Added

- The comparison report now has a `VI History` button in its title bar that
  re-opens the history panel for the file the report compares, and the report
  now opens beside the history panel instead of replacing it. Together these
  resolve the friction where, after running a comparison, returning to a VI's
  history required reselecting the file because the report had taken over the
  editor. (VHS-REQ-638)

## [1.15.0] - 2026-06-11

### Added

- On Windows, opening `VI History` now detects when a LabVIEW session is already
  running at a different *bitness* than the one VI History is configured to use
  (`viHistorySuite.labviewBitness`) and stops with a single plain-language prompt
  before the comparison panel opens, instead of surfacing a verbose runtime
  report only after you select revisions and start a compare. The message names
  the running and selected LabVIEW (year and 32-/64-bit), asks you to save and
  close the running session — or change the configured bitness to match it — and
  offers a `Pick Runtime Provider` shortcut. (VHS-REQ-636)
- On Windows, opening `VI History` now also detects when a LabVIEW session is
  already running at a different *version (year)* than the configured
  `viHistorySuite.labviewVersion` while the bitness matches, and stops with the
  same kind of plain-language prompt — explaining that VI History would otherwise
  connect to the wrong already-running LabVIEW — with options to save and close
  it, change the configured version to match, or use a Docker-backed compare. A
  LabVIEW session whose version and bitness both match your selection continues
  to open normally. (VHS-REQ-637)

## [1.14.6] - 2026-06-10

### Fixed

- On Windows, opening `VI History` now resolves LabVIEW installed at a
  non-default location when the registry records the installation *directory*
  (for example `C:\Program Files\National Instruments\LabVIEW 2025\`) rather
  than the executable path. Registry-derived LabVIEW candidates are also
  validated on disk before the comparison runtime locator selects them, so a
  stale registry entry can never point the locator at a missing `LabVIEW.exe`.

## [1.14.5] - 2026-06-10

### Fixed

- The extension's exported `isEligible()` API no longer returns a stale result
  after the selected file's eligibility changes. The selected-file eligibility
  hint is now cleared on `viHistorySuite` configuration changes, workspace
  folder changes, and workspace-trust grants, and reports ineligible in
  untrusted workspaces, so a cached answer can never outlive the conditions
  under which it was computed. The `VI History` open command was already
  authoritative per invocation and is unchanged.

## [1.14.4] - 2026-06-09

### Fixed

- On Windows, opening `VI History` is no longer falsely blocked when LabVIEW is
  installed at a non-default location recorded only in the registry. Before
  blocking, the LabVIEW CLI open gate now consults a bounded, on-demand registry
  probe (reusing the comparison runtime's existing registry lookup) and allows
  the panel when a registry-resolved LabVIEW and the shared LabVIEW CLI are both
  present. Activation-time detection stays filesystem-only, and the probe runs
  only when the gate would otherwise block.

## [1.14.3] - 2026-06-09

### Added

- New `viHistorySuite.labviewCliPath` and `viHistorySuite.labviewExePath`
  settings let you point VI History at a LabVIEWCLI or LabVIEW executable that
  auto-detection does not cover. A configured `labviewCliPath` also lets
  `Open VI History` proceed past the LabVIEW CLI prerequisite gate; the
  comparison runtime validates the path and reports a precise missing-path
  error if it is wrong. Both settings are restricted in untrusted workspaces
  because they name executables the comparison launches. This makes the runtime
  doctor's existing "set `viHistorySuite.labviewCliPath`" guidance work end to
  end.

## [1.14.2] - 2026-06-09

### Fixed

- Host LabVIEW runtime detection and the comparison runtime locator now share a
  single install-location catalog, so the activation-time LabVIEW CLI gate
  recognizes every documented filesystem install the compare engine can use.
  This closes a class of false "install LabVIEW / the LabVIEW CLI" blocks: Linux
  hosts whose LabVIEW lives in a quarterly install directory
  (`LabVIEW-<year>Q1-64` / `Q3`) are now detected, and Windows installs are
  recognized across the full supported year range rather than a hardcoded folder
  list. The Windows registry scan remains a locator-only superset for installs
  placed outside the default Program Files locations.

## [1.14.1] - 2026-06-09

### Fixed

- Linux host-native users are no longer falsely blocked from opening a
  comparison when the LabVIEW CLI is installed. Runtime auto-detection now
  recognizes the shared, version-independent LabVIEW CLI launcher
  (`/usr/local/bin/LabVIEWCLI` and the underlying
  `/usr/local/natinst/share/nilvcli/LabVIEWCLI`) instead of probing only a
  per-version `labviewcli` sibling that does not exist on real NI Linux
  installs. A per-version sibling is still honored as a fallback. This aligns
  activation-time detection with the execution locator, so the LabVIEW CLI
  open-gate allows the panel to open when the CLI is present.

## [1.14.0] - 2026-06-09

### Added

- Opening `VI History` is now blocked before the panel loads when the selected
  LabVIEW does not explicitly enable VI Server (TCP/IP). The notification names
  VI Server and the enable path (Tools → Options → VI Server,
  `server.tcp.enabled=True`, restart LabVIEW). The check reads the selected
  LabVIEW's `LabVIEW.ini` (Windows) or `labview.conf` (Linux) and requires an
  explicit `server.tcp.enabled=True`; an absent key, an explicit `False`, or an
  unreadable config all block, so a disabled VI Server is caught before a
  comparison attempt fails with `-350000`. The command still opens when VI
  Server is explicitly enabled, when Docker is the active provider, when no host
  LabVIEW is resolved, or while runtime detection has not completed.

## [1.13.3] - 2026-06-09

### Changed

- When a VI comparison fails because LabVIEWCLI launched LabVIEW but could not
  connect over VI Server (error `-350000`), the failure notification now names
  VI Server (TCP/IP) being disabled for the selected LabVIEW as the most common
  cause and gives the enable path (LabVIEW Tools → Options → VI Server, or
  `server.tcp.enabled=True` and the configured port), restart LabVIEW, then
  rerun. Previously this failure showed generic runtime guidance that did not
  mention VI Server. This complements the pre-attempt VI Server guidance added
  in 1.13.1.

## [1.13.2] - 2026-06-09

### Changed

- When opening `VI History` is blocked because the LabVIEW CLI is missing and
  LabVIEW ≥2025 is already installed, the notification now says LabVIEW is
  installed but the LabVIEW CLI is not, and offers an `Install LabVIEW CLI`
  action that opens NI's dedicated LabVIEW Command-Line Interface download page.
  Previously this case pointed at the full LabVIEW installer, which was
  confusing when LabVIEW was already present. When no LabVIEW is installed, the
  notification still offers `Install LabVIEW`.

## [1.13.1] - 2026-06-08

### Changed

- When a comparison is blocked because LabVIEW VI Server (TCP/IP) is disabled,
  the blocked-compare notification and history panel now give specific,
  actionable guidance that names VI Server as the unmet prerequisite and how to
  enable it (LabVIEW Tools → Options → VI Server, or `server.tcp.enabled=True`
  in `LabVIEW.ini` on Windows / `labview.conf` on Linux), restart LabVIEW, then
  rerun. Previously these blocks fell back to generic host-runtime guidance.

## [1.13.0] - 2026-06-08

### Added

- Opening `VI History` now stops before the panel loads when the LabVIEW CLI
  (`LabVIEWCLI`) is not installed, showing a warning notification that names the
  missing prerequisite and offers an `Install LabVIEW` action that opens the NI
  download page. This replaces discovering the missing runtime only after
  selecting two revisions and choosing `Compare`. Detection reuses the existing
  cached runtime probe, so the check adds no startup cost. The command still
  opens when the LabVIEW CLI is present, when a Docker comparison runtime is the
  active provider (container compare does not need a host LabVIEW CLI), or while
  runtime detection has not yet completed.

## [1.12.2] - 2026-06-08

### Changed

- Linux host-native comparison reports now disclose that LabVIEW stays running
  after the comparison so later comparisons can reuse the warm session, and
  `TROUBLESHOOTING.md` explains how to close the resident LabVIEW (it runs under
  the `labview` name). No runtime behavior change.
- The Linux-validation gap filer (`scripts/fileLinuxValidationGap.js`) now frames
  a clean-run `--note` record as a "Linux validation observation" (labelled
  `copilot-target` only) instead of a "Linux validation gap" labelled `bug`, so
  PASS evidence is no longer misreported as a defect. Hard gaps are unchanged.
- The validation gap filer now derives the platform word in composed issue titles
  and summaries from the run's `runtimeSelection.platform`, so a Windows
  validation run is titled "Windows validation …" instead of "Linux validation …".
  Linux runs are unchanged.

### Fixed

- Comparison report generation no longer fails to stage a VI's tracked tree when
  the report storage root is deep enough to exceed the Windows `MAX_PATH` (260)
  limit. Staging now enables Git `core.longpaths`, and a deep-path failure that is
  still recognized surfaces an actionable long-path diagnostic (shorten the report
  storage root, or enable Windows long paths) instead of an opaque staging error.

## [1.12.1] - 2026-06-07

### Fixed

- Comparison reports now reproduce the selected revision's tracked files
  faithfully when staging a VI for comparison, so in-repo dependencies that Git
  excludes from archives via `.gitattributes export-ignore` are present beside
  the VI at load time. Previously these files were dropped, which could make
  LabVIEW render dependent controls as whiteboxes in the generated comparison.
- Comparison staging now also materializes the contents of Git submodules
  recorded at the selected revision (including nested submodules) beside the
  staged VI, so dependencies tracked through a submodule resolve at load time
  instead of rendering as whiteboxes. Submodule materialization is best-effort:
  an unavailable submodule is skipped without failing the comparison.
- The comparison report now states that only files tracked in the repository are
  staged, so dependencies outside the repository (for example LabVIEW-installed
  paths such as `vi.lib`, `instr.lib`, `user.lib`, or the `resource` directory)
  are not staged and may appear as placeholder (white) items. This clarifies
  that such whiteboxes are a staging limitation rather than a change in the VI.

## [1.12.0] - 2026-06-07

### Added

- An **Export Comparison Report (HTML)** action in the comparison-report panel
  title bar saves the report to an accessible folder so you can open it outside
  VS Code in Edge or Chrome and zoom into the graphics. The export writes a
  self-contained, timestamped bundle that copies the LabVIEW-generated report
  together with its graphics dependency folder so block-diagram and front-panel
  images keep resolving in a browser, then offers to open the exported file in
  your default browser or reveal it in the OS file manager. When no
  LabVIEW-generated graphics report is available, it explains the exact reason
  and offers the diagnostic evidence packet instead.

## [1.11.1] - 2026-06-07

### Fixed

- Opting into Linux host-native headless comparisons with
  `LV_RTE_LINUX_HEADLESS=1` no longer hangs indefinitely on LabVIEW builds whose
  `HeadlessManager` is broken (for example LabVIEW Community 2026 `26.1.1f1`,
  which logs `Failed to initialize headless LabVIEW.` every 10 seconds and never
  binds a session). The production comparison path wired no command timeout, so
  the opt-in `-Headless` CLI could stall during VI load and the post-process
  headless classifier never ran. The host-native headless opt-in is now bounded
  by a default timeout, converting the stall into a deterministic
  `command-timed-out` failure that still surfaces the
  `linux-headless-init-failed` diagnostic and its remediation guidance (set
  `LV_RTE_LINUX_HEADLESS=0` to opt out, or use the Linux container provider). The
  safe non-headless default and the working Linux container provider remain
  unbounded and unchanged.
- A successful Linux **container** comparison run on a Linux host is no longer
  contaminated by a stale host-native headless log. The headless diagnostic
  scanner read host `/tmp` whenever the host platform was Linux, so a prior
  host-native run's leftover `lvrt_*_headless_*_cur.txt` (with
  `Failed to initialize headless LabVIEW.`) could bleed into a passing container
  run and surface a misleading failure note. The linux-container provider now
  reads only its mapped container-temp directory (matching the windows-container
  provider), and headless bring-up notes are gated on run success so they can
  never appear on a successful run.

## [1.11.0] - 2026-06-06

### Fixed

- Comparison reports no longer show a false "no difference" (or load a VI with
  missing dependencies) when an in-repo dependency changed between the two
  compared commits. Staging previously wrote only the two selected VI blobs into
  a flat directory, so subVIs, `.ctl` typedefs, and `.lvlib`/`.lvclass` members
  resolved against the working tree or collapsed to a single copy. Comparison now
  materializes the selected (newest) revision's surrounding tree once and places
  both staged VIs at the VI's repository-relative path, so LabVIEW resolves
  in-repo dependencies at load time. This applies to the host-native, Windows
  container, and Linux container comparison providers.

### Changed

- The comparison report packet now discloses a dependency caveat when a
  selected-revision tree was materialized: both revisions are evaluated against
  the selected revision's dependencies, so dependency-only changes may not appear
  and loading the older revision against newer dependencies may recompile it and
  distort the rendered diff.
- The comparison report packet now discloses when the compared VI is itself a
  member of a LabVIEW library (`.lvlib`) or class (`.lvclass`) at the selected
  revision, noting that the VI is staged outside its owning library for
  side-by-side comparison so library-context resolution may differ from the
  in-project VI.

## [1.10.2] - 2026-06-03

### Fixed

- The Linux **container** comparison provider can now generate reports on the
  official `nationalinstruments/labview:<release>-linux` images. The container
  invocation targeted the plain `labview` binary, which does not fully engage
  headless mode (LabVIEW tried to bring up the Getting Started Window), so
  `CreateComparisonReport` never bound the supplied VI paths and the run failed
  with `-350000`. The provider now invokes the bundled LabVIEW Professional
  executable (`labviewprofull`) with `-Headless`, matching NI's own canonical
  container compare script, which lets the session connect and produce a report.
- A successful headless Linux comparison no longer reports a misleading
  `diagnosticReason = linux-headless-recursive-load`. LabVIEW logs a benign
  "Recursive load during LEIF load!" line while initializing the Getting
  Started Window and then recovers; the diagnostic reason is now suppressed
  when the run succeeds, mirroring how `failureReason` is already cleared.
- Linux host-native comparisons no longer fail when a report is regenerated
  over a prior run's output. LabVIEW emits the `<report>_files/support`
  asset directory read-only, so copying a freshly generated report back over
  the stale destination raised `EACCES: permission denied, unlink ...` and was
  misreported as `command-spawn-failed` even though `CreateComparisonReport`
  had succeeded. The copy-back now clears the destination by normalizing
  permissions (`chmod`) and retrying on `EACCES`/`EPERM`, and normalizes the
  freshly copied tree to owner-writable so subsequent runs can replace it.
  When the report command succeeds but copy-back still fails, the runtime now
  surfaces the distinct `report-finalize-failed` reason with a diagnostic note
  naming the copy failure, instead of the misleading `command-spawn-failed`.
  When the destination still cannot be cleared after the permission reset
  (an `EPERM`/`EACCES` that usually means a prior containerized run left
  root-owned files in the retained report directory), the diagnostic note now
  explains the cross-ownership cause and includes the exact `rm -rf` (prefix
  with `sudo`) remediation for the stale report and `_files` outputs.
  (VHS-REQ-156)

### Changed

- Linux containerized comparisons now write their root-owned output into an
  isolated `container-out/` subdirectory of the report directory instead of the
  shared retained report path. LabVIEW runs as root inside the container, so its
  generated report, `_files`, and `container-temp` artifacts were previously
  left root-owned directly in the host-native report path, where a later
  host-native run could not overwrite or clean them. The host now copies the
  finished report from `container-out/` back into the canonical report path as
  the invoking user, keeping the retained host-native path user-owned and
  immune to cross-ownership collisions from prior container runs. (VHS-REQ-156)

## [1.10.0] - 2026-06-03

### Added

- Windows host-native comparisons now run a VI Server TCP preflight that mirrors
  the Linux gate. When `LabVIEW.ini` explicitly sets `server.tcp.enabled=False`
  (quoted or unquoted), the runtime fails fast with the classified
  `windows-vi-server-tcp-disabled` blocked reason and an actionable diagnostic
  note instead of stalling on the opaque `-350000` / `labview-cli-connection-failed`
  cold-launch firewall failure. Absent keys preserve the Windows default-on
  behavior, and `server.tcp.port` is honored (quoted or unquoted, default 3363).
  (VHS-REQ-623, relates to #225)

### Fixed

- `buildLinuxHostNativeShortPathLayout` now uses `path.posix.join` so the staged
  short-path layout is computed deterministically as POSIX paths regardless of
  the host running the comparison. (VHS-REQ-156)

## [1.9.2] - 2026-06-02

### Fixed

- Marketplace release workflow: `Publish To Marketplace` is now idempotent on
  rerun. A new `Marketplace Pre-Publish Check` step inspects the live
  Marketplace listing for the target version and skips publish when the
  version is already published, so a rerun of a previously failed
  `Verify Marketplace Listing` step never re-attempts publish and never
  aborts on `Version already exists`. The verifier budget grew from 6×30s
  (3 min) to 20×30s (10 min) to cover observed Marketplace propagation lag.
  `Upload Release Evidence` now runs with `if: always()` so propagation
  timeouts no longer erase the release-evidence artifact. (VHS-REQ-609,
  fixes #199, #190)
- Linux host-native comparisons surface clearer evidence when LabVIEW's
  cold-launch path or VI Server configuration breaks `CreateComparisonReport`.
  Stderr classification now recognizes the LabVIEW error 8 (`File permission
  error.` / `CreateComparisonReport operation failed.`) signature as
  `labview-cli-create-report-permission-error`, and the headless-log scanner
  emits `linux-headless-init-failed` when LabVIEW logs `Failed to initialize
  headless LabVIEW.` so operators on broken headless builds (e.g. LabVIEW
  2026 `26.1.1f1`) get an actionable classified failure instead of an
  unbounded stall. The headless-session-reset retry only fires for
  `linux-headless-recursive-load` so init-failed runs do not waste a second
  attempt. (VHS-REQ-156)

### Changed

- Linux host-native LabVIEWCLI invocations stay non-headless by default. The
  Linux container provider continues to invoke `-Headless` because its
  bundled LabVIEW image initializes headless mode correctly. Operators on
  LabVIEW builds where host-native headless mode works can opt in by setting
  `LV_RTE_LINUX_HEADLESS=1` in the VS Code extension host environment.
  (VHS-REQ-156)
- Linux host-native `labview-cli` invocations now read `labview.conf` (under
  `~/natinst/.config/LabVIEW-<version>/`,
  `~/.config/natinst/LabVIEW-<version>/`, and
  `/etc/natinst/LabVIEW-<version>/`) before launching LabVIEWCLI. Runs are
  blocked with `linux-vi-server-tcp-disabled` when `server.tcp.enabled` is
  `False`, the key is missing from a readable config, or no candidate
  `labview.conf` is readable at all (NI Linux defaults VI Server TCP off,
  so the surface cannot be confirmed enabled). When the runtime selection
  does not carry an explicit `requestedLabviewVersion`, the year is inferred
  from the resolved `labviewExe` directory (e.g. `LabVIEW-2026-64`) so the
  preflight does not fail open. The `lvcompare` engine is exempt because it
  does not connect to LabVIEW VI Server. When TCP is enabled, the configured
  `server.tcp.port` (default `3363`) is passed to LabVIEWCLI as
  `-PortNumber`. (VHS-REQ-156)
- Linux host-native runs now mirror staged VI inputs and the report output
  under a short tmpdir (default `${os.tmpdir()}/vi-history-suite-runtime`,
  overridable via `LVIE_LINUX_RUNTIME_TMPDIR`, opt-out via
  `LVIE_LINUX_DISABLE_RUNTIME_TMPDIR=1`) and copy the produced report back
  to the canonical workspaceStorage path. The tmp directory is cleaned up
  on every run. This works around a LabVIEW 2026 (`26.1.1f1`) Linux
  path-table corruption that surfaces as
  `Possible path leak, unable to purge elements of base #0` followed by
  `CreateComparisonReport operation failed.` when staged inputs live under
  deep, dot-prefixed paths such as
  `~/.config/Code/User/workspaceStorage/...`. (VHS-REQ-156)

## [1.9.1] - 2026-06-02

### Fixed

- Cold-launch comparisons against LabVIEW no longer fail with
  `labview-cli-connection-failed` (`-350000`) on hosts where LabVIEW takes
  longer than NI's 60 s default to bind its VI Server listener. The
  extension now hardens NI's connect-window keys
  (`OpenAppReferenceTimeoutInSecond` and
  `AfterLaunchOpenAppReferenceTimeoutInSecond`) in `LabVIEWCLI.ini` before
  each Windows host-native LabVIEW CLI compare and applies the same
  timeout to the Windows-container compare path. (VHS-REQ-148)

### Added

- Setting `viHistorySuite.runtime.cliConnectTimeoutSeconds` (integer,
  default 180, range 30–600) drives the LabVIEW CLI connect-window
  timeout for both Windows host-native and Windows-container compare
  paths. (VHS-REQ-148)
- The diagnostics bundle records a `cliConnectTimeoutHardening`
  fingerprint (requested value, ini path, before/after key snapshot) for
  each retained Windows host-native run; failed-run doctor summaries
  surface a compact `cli connect window: applied=<bool>
  requestedValue=<int>[ reason=<reason>]` line on
  `labview-cli-connection-failed` failures so operators can confirm the
  fix from the comparison report packet without opening the manifest.
  (VHS-REQ-148)
- TROUBLESHOOTING.md gains a `Cold-launch comparison failures` section
  covering symptoms, the new setting, how to confirm the fix from the
  diagnostics bundle, and how to restore NI defaults. (VHS-REQ-148)

## [1.9.0] - 2026-05-31

### Added

- Automated end-to-end Windows runtime conflict verification harness
  (VHS-REQ-622). A new manually-dispatched `Windows Runtime Conflict Matrix`
  workflow drives `vihs --validate` against a real running LabVIEW 2026 in
  both steady-state bitness directions (x64 host with x86 selected, and x86
  host with x64 selected), asserts the proof JSON reports the
  `windows-host-bitness-conflict` blocked reason, and uploads the matrix
  evidence plus per-scenario proofs as a 90-day retention artifact. The Node
  driver (`scripts/runWindowsRuntimeMatrix.js`) and PowerShell scenario
  helpers run on the self-hosted `vihs-windows-labview-maintainer` runner;
  race-condition coverage is delegated to the existing comparison-runtime
  unit-test contract and recorded in the evidence schema.

### Changed

- Narrowed hosted CI branch governance to gitflow-only families. Pull
  requests to `develop` are now admitted from `feature/*`, `release/vX.Y.Z`,
  `hotfix/vX.Y.Z`, or `main` back-sync branches; the `copilot/**` push
  trigger and the `copilot/*` and `dependabot/*` pull-request allowances were
  removed.

## [1.8.0] - 2026-05-31

### Added

- Concurrent LabVIEW bitness conflict diagnostic for the Windows
  comparison-report runtime (VHS-REQ-621). When a LabVIEW session is
  already running at a different bitness than the selected runtime,
  preflight now short-circuits with the new
  `windows-host-bitness-conflict` blocked reason and the post-failure
  classifier rewrites a generic `command-exited-nonzero` to
  `labview-host-bitness-conflict`. The retained doctor summary names both
  the observed running bitness and the currently selected bitness, the
  process-observation packet retains `labviewProcessBitness` and
  `labviewProcessExecutablePath`, and the comparison-report warning toast
  exposes a `Pick Runtime Provider` action button that invokes
  `labviewViHistory.pickRuntimeProvider` (reusing the VHS-REQ-620
  quick-pick) so users can align `viHistorySuite.labviewBitness` with the
  running LabVIEW session without hunting for the setting.

## [1.7.0] - 2026-05-31

### Added

- CLI-driven runtime provider flip with reactive status bar (VHS-REQ-620).
  Editing `viHistorySuite.runtimeProvider`, `viHistorySuite.labviewVersion`,
  or `viHistorySuite.labviewBitness` — whether by hand, by the bundled
  `vihs --provider … --year … --bitness …` CLI, or by the new quick-pick —
  immediately re-renders the `VI History runtime` status bar without waiting
  for the focus-event throttle and without re-running filesystem detection.
  The label now sources from the persisted selection when all three keys
  are populated and the combination is satisfiable on this host, and
  silently falls back to the auto-detection recommendation otherwise.
- New `Pick Runtime Provider` command (id `labviewViHistory.pickRuntimeProvider`).
  The status-bar item now targets this command, so a click opens a
  quick-pick built from the cached detection: one entry per detected
  LabVIEW host installation, one entry for Docker when the CLI is
  available, plus a `Clear` option that removes the three persisted keys
  and returns to auto-detection. Selections are written to
  `ConfigurationTarget.Global` (VHS-REQ-620).
- `Show Runtime Summary` now appends a `Drift:` line: `none` when the
  persisted selection matches the recommendation or nothing is persisted,
  `selection differs from recommendation: persisted=…, recommendation=…`
  when persisted is satisfiable but diverges, and
  `selection unsatisfiable on this host; falling back to recommendation`
  when the persisted combination cannot be served on this host
  (VHS-REQ-620).

## [1.6.0] - 2026-05-31

### Added

- Git prerequisite detection on activation: a single `git --version` probe
  is cached for the session and surfaces a `Git not detected` status bar
  warning plus a one-time first-run information notice with an `Install
  Git` action that opens [https://git-scm.com/downloads](https://git-scm.com/downloads)
  when Git is not on PATH (VHS-REQ-619).
- `labviewViHistory.open` is gated by the cached Git detection. When Git is
  missing the command refuses with a warning toast linking to the install
  page instead of starting the comparison flow and failing later inside the
  Git CLI wrapper (VHS-REQ-619).

## [1.5.0] - 2026-05-31

### Added

- Auto-materialized the local `vihs` runtime-settings launcher on every
  extension activation so fresh installs and upgrades no longer require
  running `labviewViHistory.prepareLocalRuntimeSettingsCli` before invoking
  bare `vihs` from the integrated terminal (VHS-REQ-612).
- Self-healing `vihs` launcher: when the stamped extension build folder is
  missing after an upgrade, the launcher scans the per-user VS Code extension
  roots for `svelderrainruiz.vi-history-suite-*` and rebinds to the newest
  installed build instead of failing with `MODULE_NOT_FOUND`.
- Filesystem-only runtime auto-detection on activation that scans for
  installed LabVIEW host years (≥2025) and a Docker CLI, then seeds
  `viHistorySuite.runtimeProvider`, `viHistorySuite.labviewVersion`, and
  `viHistorySuite.labviewBitness` on first install and repairs them when the
  persisted combination is no longer satisfiable, so users do not have to
  configure the comparison runtime by hand (VHS-REQ-616).
- Missing-runtime user experience: a `VI History runtime` status bar item
  reflects detection outcome with a provider-specific label (e.g.,
  `VI History runtime: LabVIEW 2026 x64`, `VI History runtime: Docker`,
  or `VI History runtime: missing`), a one-time first-run information
  notice surfaces install guidance for LabVIEW ≥2025 or Docker Desktop, and
  a focus-event re-detect (throttled to 5 seconds) picks up runtime installs
  performed after VS Code launched (VHS-REQ-617).
- Three trust-gated VS Code commands under category `VI History` to make the
  detection surface controllable from the palette: `Detect Runtime Now`
  bypasses the focus-event throttle and refreshes the status bar; `Reset
  First-Run Runtime Notice` clears the `vihs.firstRunNoRuntimeNoticeShown`
  globalState flag after explicit modal confirmation; `Show Runtime Summary`
  writes a structured report (platform, host installations, docker
  availability, recommendation, persisted settings) to a `VI History:
  Runtime` output channel with a clipboard `Copy` action (VHS-REQ-617).

### Known Limitations

- macOS host LabVIEW detection is not yet implemented. On `darwin`,
  auto-detection returns no host installations and falls through to the
  Docker CLI check; Marketplace-published builds for macOS still require
  Docker Desktop until ≥2025 macOS builds of LabVIEW ship and the
  `/Applications` scan is added (tracked as VHS-REQ-618).

### Changed

- Opened the next patch release-candidate line around the GitHub-first
  Definition-of-Done contract, keeping issue quality, PR evidence, hosted CI,
  local validation, traceability drift prevention, standards provenance, and
  closeout readiness visible before release promotion.
- Added a fail-closed customization governance audit, workspace skills,
  prompts, file instructions, workflow-governor agent guidance, and retained CI
  audit evidence so agent customization changes are reviewable and repeatable.
- Expanded release-readiness validation with a documentation link gate,
  coverage-to-traceability risk mapping, higher evidence-backed coverage
  floors, and broader focused unit coverage across command, comparison,
  dashboard, runtime-settings, closeout, and Marketplace workflow surfaces.
- Hardened closeout evidence with standards toolchain provenance, published
  standards workbench fallback handling, bounded remote retries, trusted-root
  execution, explicit release references, and machine-readable closeout
  summaries.
- Strengthened diagnostic VSIX and Marketplace release evidence so diagnostic
  packages stay distinct from Marketplace publication and exact-tag release
  evidence names the required validation and live-listing surfaces.

## [1.4.2] - 2026-05-28

### Fixed

- Added indexing cache diagnostics for large-repository field evidence so
  maintainers can distinguish restored cache entries, persistence failures,
  cache hits, misses, proof rejection, and dirty or otherwise uncacheable files.
- Fixed restored persisted VI eligibility cache state after a VS Code restart
  so unchanged tracked VIs report as a warm restart with cache reuse instead of
  being classified as a cold scan.

## [1.4.1] - 2026-05-26

### Changed

- Reintroduced a governed `develop` integration branch model with
  `release/vX.Y.Z` and `hotfix/vX.Y.Z` promotion paths to `main`.
- Added CI branch-governance checks so `main` remains the Marketplace release
  baseline while `develop` carries integration work.
- Added a protected, tag-only Marketplace release workflow that publishes from
  exact `vX.Y.Z` tags after version, ancestry, test, package, and live listing
  verification.
- Updated maintainer operations, architecture, test-plan, and requirements
  traceability for the governed release model.

## [1.4.0] - 2026-05-24

### Changed

- Moved the active public source home to
  `github.com/LabVIEW-Community-CI-CD/vi-history-suite` while preserving the
  Marketplace extension ID `svelderrainruiz.vi-history-suite`.
- Relicensed the active repository to BSD0 / `0BSD` and updated package
  metadata to point Marketplace users at the GitHub organization repository.
- Simplified source evaluation around the devcontainer/Codespaces path,
  lightweight GitHub CI, and the core package checks.
- Added GitHub issue templates plus support and security reporting docs,
  including private vulnerability reporting through GitHub.
- Retained Vagrant only as an optional local helper for humans; this release
  does not claim fresh Vagrant validation.
- Removed active GitLab authority, private-release, governed proof, and public
  source-promotion machinery from the simplified source tree while retaining
  historical release context in tags and this changelog.

## [1.3.16] - 2026-05-11

### Changed

- Opened the next patch candidate line after exact `v1.3.15` closed across
  GitLab authority, public GitHub, and VS Code Marketplace.
- Installed-user Windows host compare now admits the selected already-open
  LabVIEW session when the user targets a local host runtime, so Compare can
  attach to the running LabVIEW 2025+ session instead of blocking as a
  contaminated host surface.
- Canonical clean-host proof and benchmark lanes still fail closed on ambient
  LabVIEW contamination unless they explicitly opt in to installed-user host
  session admission.
- Closed the exact `v1.3.16` authority/publication line across GitLab
  authority, public GitHub source/tag/release, Windows exact-VSIX install
  proof, and VS Code Marketplace publication.

## [1.3.15] - 2026-05-09

### Changed

- Started the installed-user stable patch line for Marketplace readiness after
  the `1.3.14` authority handoff.
- Reduced the VI History panel's default explanatory clutter by keeping
  secondary runtime, repository, capability, guidance, and confidence details
  behind disclosure rows.
- Compare now remains available after exactly two retained revisions are
  selected, even when local runtime preflight is not ready, so runtime failures
  are exposed through the comparison-report path instead of hidden by a disabled
  button.
- Installed runtime selection now centers LabVIEW `2025`, `2026`, and newer
  local versions; LabVIEW `2024` and older are rejected as unsupported for VI
  Comparison Report generation because LabVIEW `2025` and newer can open older
  VIs without migrating them.
- Closed the exact `v1.3.15` authority/publication line across GitLab
  authority, public GitHub source/tag/release, Windows exact-VSIX install
  proof, and VS Code Marketplace publication.

## [1.3.14] - 2026-05-08

### Changed

- Opened the next `develop` patch candidate line for release-readiness
  consolidation after the `1.3.13` public-validation pre-release.
- Vagrant Windows VSIX acceptance is now governed by a repo-owned evidence
  assertion surface that retains reusable CI receipts without expanding the
  Windows Docker Desktop proof claim.
- Exact-release readiness now has a current `2026-05-08` assessment for the
  `1.3.14` `develop` line, making release-branch opening admissible as a
  separate governed action while exact tag, public GitHub release, Marketplace
  mutation, and `main` promotion remain gated and not performed.
- Opened `release/1.3.14` as the governed release-candidate branch and
  retained the branch-opening boundary without creating an exact tag,
  publishing GitHub/Marketplace assets, admitting Windows Docker Desktop
  proof, or promoting `main`.
- Reassessed `release/1.3.14` branch readiness after the branch pipeline and
  protected `develop` retention pipeline both passed, making protected `main`
  promotion admissible only as a separate governed action while exact tag,
  public GitHub release, Marketplace mutation, Windows Docker Desktop proof,
  and `main` promotion remain unperformed in this slice.
- Added a protected `release/1.3.14` to `main` promotion preflight that records
  clean branch ancestry, MR `!196`, protected `develop` pipeline `2511333533`,
  and source-branch-retention requirements before opening a release-to-main
  merge request; no exact tag, public release, Marketplace mutation, Windows
  Docker Desktop proof admission, `main` merge, or release branch deletion was
  performed.

## [1.3.13] - 2026-04-27

### Changed

- Public validation pre-release refresh carries the admitted Windows host
  LabVIEW 2026 x64 proof wording into the public facade and Marketplace
  package line.
- Successful LabVIEWCLI `CreateComparisonReport` diagnostics no longer retain
  a stale success-before-failure note when the operation succeeded.

## [1.3.12] - 2026-04-26

### Added

- `vihs validate-fixture` for running the canonical public
  `ni/labview-icon-editor` / `resource/plugins/lv_icon.vi` compare battery
  from the installed CLI and retaining public proof packets.
- Public proof-status matrix that distinguishes admitted Linux/Docker,
  admitted Linux host LabVIEW, community/deferred Windows host LabVIEW, and
  community/deferred Windows Docker Desktop Windows-container evidence.

### Changed

- Public validation docs now treat the canonical fixture as an executable
  validation recipe, not only retained issue evidence.
- Linux host comparison execution now returns cleanly after `LabVIEWCLI` exits
  even when headless LabVIEW keeps inherited stdio handles open long enough to
  outlive the CLI process.

## [1.3.11] - 2026-04-26

### Added

- Public validation pre-release lane for publishing `1.3.11` to public GitHub
  and VS Code Marketplace so users can report validation success, validation
  failure, bug, and feature-not-implemented results.
- `vihs --validate --proof-out <dir>` proof packets with stable `VIHS_E_*`
  runtime codes, GitHub-ready issue body output, and diagnostic path/env
  evidence with secret-looking environment variables redacted.

### Changed

- Runtime provider selection now keeps all provider/year/bitness variants
  selectable for public validation reporting, including paths that currently
  return not-yet-implemented or blocked runtime codes.

## [1.3.10] - 2026-04-25

### Added

- Marketplace community-validation preview package line for publishing a VS
  Code Marketplace pre-release while Windows installed-user proof remains
  explicitly deferred.
- Proof-status disclosure for selectable Windows/LabVIEW provider, year, and
  bitness settings through `vihs --validate` and the requirements traceability
  matrix.

## [1.3.9] - 2026-04-23

### Changed

- exact authority `v1.3.8` is retained as blocked historical incident
  evidence after public GitHub release `312768592` published immutable with
  zero assets
- `release/1.3.9` opens from the retained `v1.3.8` authority line through the
  asset-first GitHub publication path so the installed `vihs` Windows launcher
  fix can close across GitLab, public GitHub, and VS Code Marketplace

## [1.3.8] - 2026-04-23

### Fixed

- `release/1.3.8` opened from the closed `v1.3.7` public GitHub and VS Code
  Marketplace baseline to promote the installed `vihs` Windows launcher fix
  for users who do not have global `node` on `PATH`
- generated Windows launchers now prefer `VI_HISTORY_SUITE_NODE_EXE`, then
  standard VS Code `Code.exe` with `ELECTRON_RUN_AS_NODE=1`, before falling
  back to ambient `node.exe`

## [1.3.7] - 2026-04-22

### Changed

- exact authority `v1.3.6` on `main` remains immutable while public GitHub
  `main` plus tag already publish `v1.3.6`, but the repo-owned in-place
  GitHub release publish attempt against draft `312363117` now proves an
  external immutable-release boundary (`422 tag_name was used by an immutable
  release`), so `release/1.3.7` opens from merged-green `develop` as the next
  governed exact line
- the repo-owned exact-release publish/verify controller remains retained on
  `develop` so the next exact line can close through one governed GitHub
  release act instead of another draft-only partial transaction

## [1.3.6] - 2026-04-22

### Changed

- exact authority `v1.3.5` on `main` remains immutable while the separate
  public GitHub exact release still serves `v1.3.1` and VS Code Marketplace
  still serves `1.3.0`, so `release/1.3.6` now opens from merged-green
  `develop` for the next governed public-exact retry
- the fail-closed public exact pre-tag proof remains retained directly on
  `develop` while `release/1.3.6` carries the next exact-retry line

## [1.3.5] - 2026-04-21

### Changed

- exact authority `v1.3.4` on `main` remains immutable while the public GitHub
  exact release still serves `v1.3.1` and VS Code Marketplace still serves
  `1.3.0`, so `v1.3.5` reopens the exact line narrowly from `main`
- the authority-side public-source validation surfaces now relax the remaining
  stale public facade changelog expectation before the next public GitHub exact-release retry

## [1.3.4] - 2026-04-21

### Changed

- exact authority `v1.3.3` on `main` remains immutable while the public GitHub
  exact release still serves `v1.3.1` and VS Code Marketplace still serves
  `1.3.0`, so `v1.3.4` reopens the exact line narrowly from `main`
- the authority-side public-source validation surfaces now fix the last stale
  public facade changelog expectation before the next public GitHub exact-release retry

## [1.3.3] - 2026-04-21

### Changed

- exact authority `v1.3.2` on `main` remains immutable while the public GitHub
  exact release still serves `v1.3.1` and VS Code Marketplace still serves
  `1.3.0`, so `v1.3.3` reopens the exact line narrowly from `main`
- the authority-side public-source validation surfaces now align with the
  promoted public facade by expecting the current README source-evaluation
  headings and the reopened `1.3.3` package/changelog line before the next
  public GitHub exact-release retry

## [1.3.2] - 2026-04-21

### Changed

- exact public GitHub `v1.3.1` remains immutable while VS Code Marketplace
  still serves `1.3.0`, so `v1.3.2` opens as a governed hotfix line from
  exact `main` instead of mutating the already-published `v1.3.1` GitHub
  asset
- the packaged extension surface now carries the first governed Marketplace
  icon path at `resources/marketplace/vi-history-suite-icon.png` through the
  extension manifest instead of relying on listing-only operator memory

## [1.3.1] - 2026-04-20

### Changed

- `v1.3.0` remains the exact public release line on `main`, while `develop`
  now carries `1.3.1` as the next exact candidate line
- the `1.3.1` opening decision is now governed as a `patch` line because the
  remaining active work hardens the published host-default Windows local
  `LabVIEWCLI` workflow and retained live-session proof/control surfaces
  without adding a new public workflow or breaking the exact `v1.3.0`
  contract
- the first `ISSUE-0414` implementation slice now aligns the installed
  settings CLI, compare-preflight, and runtime-doctor guidance to the retained
  conditional stale-result rule: review Compare or runtime validation again
  after CLI updates and reload or restart only if the current session still
  shows stale provider or runtime facts
- the retained `ISSUE-0414` proof bundle now also carries and enforces
  bidirectional provider-selection coverage plus explicit
  alignment/baseline-switch receipts on latest-packet, policy-boundary, and
  proof-receipt surfaces, and a fresh governed Windows proof receipt dated
  `2026-04-21T06:48:16.064Z` satisfies that strengthened boundary on the
  admitted host
- exact `v1.3.0` closeout remains retained complete on authority, while
  `v1.3.1` remains a pre-release candidate line that still requires current
  public-candidate review plus later exact-release publication gates

## [1.3.0] - 2026-04-14

### Changed

- `v1.2.2` remains the exact public release line on `main`, while `develop`
  now carries `1.3.0` as the next exact candidate line
- the `1.3.0` opening decision is now governed as a `minor` line because the
  active branch adds a new installed-user capability and supported workflow:
  host-default Windows local `LabVIEWCLI` with bounded expert Docker instead
  of only hardening the released Docker-only path
- the public candidate package now distinguishes the published exact `v1.2.2`
  baseline from the unreleased `v1.3.0` candidate line, keeping the next
  public/wiki publication and expert-agent review gates explicit instead of
  continuing to treat exact `1.2.2` publication closeout as the active
  candidate state

## [1.2.2] - 2026-04-07

### Changed

- `v1.2.1` remains the exact public release line on `main`, while `develop`
  now carries `1.2.2` as the next exact candidate line
- exact release closeout now remains incomplete until the exact released
  `main` line has been back-merged into `develop` through the protected path
  and the resulting `develop` pipeline is green, so future sessions do not
  wait for Sergio to elicit that follow-through explicitly
- the sustainment control plane now treats missing or not-yet-running Docker
  as an expected first-run installed-user boundary instead of assuming image
  acquisition is always the first runtime step on a fresh machine
- installed-user entry docs and runtime-doctor next actions now tell first-use
  users to install or start Docker, confirm `docker info` works, and then
  retry the checkbox-selected compare flow without implying host-LabVIEW
  fallback

## [1.2.1] - 2026-04-07

### Changed

- `v1.2.1` is now the exact public release line on `main`, while `develop`
  remains aligned to `1.2.1` until the next exact release candidate opens
- exact release closeout is now governed through a retained VS Code
  Marketplace publication surface for `svelderrainruiz.vi-history-suite`
  instead of relying on operator memory after the GitHub release and GitLab
  tag are already green
- the release control plane now records the governed publisher id, Marketplace
  item id, publication URL, publication mode, and exact published version in a
  dedicated Marketplace publication ledger
- exact SemVer closeout now remains incomplete until the matching VSIX version
  is verified on the VS Code Marketplace, and the release procedure now
  records both the pinned `vsce` path and the manual portal-upload fallback
- the packaged extension homepage now points Marketplace users to the
  maintained public wiki home surface instead of the repo root, so the next
  exact release does not route installed users into branch-specific source
  guidance first
- the root README, public source README, public install page, and public wiki
  home/install pages now lead with the installed-extension local workflow and
  keep repo/fork/Codespaces evaluation as an explicit secondary lane
- the exact public GitHub release `v1.2.1` now publishes merged public `main`
  commit `2547344`, and the VS Code Marketplace item
  `svelderrainruiz.vi-history-suite` now verifies `1.2.1` through the
  official gallery extension query after pinned `vsce` publication

## [1.2.0] - 2026-04-07

### Changed

- `v1.2.0` is now the exact public release line on `main`, while `develop`
  remains the public evaluation branch and still carries `1.2.0` until the
  next exact release candidate opens
- the `release/1.2.0` promotion lane is now closed, and no newer exact public
  release candidate is active yet
- the `1.2.0` line opens one governed public Codespaces/bootstrap capability
  for public `github.com` and `gitlab.com` HTTPS repos, with explicit branch
  honor, remote default-branch resolution when the branch is omitted, and a
  visible repo-sibling clone target instead of a hidden cache path
- `npm run design:gate` now begins with a governed branch-baseline assertion so
  future candidate work fails closed when `develop` has not yet been realigned
  to the exact released `main` line
- Sergio's brand-new-fork and brand-new-Codespace acceptance rerun has now
  passed on `Examples/Logging with Helper-VIs.vi`, and moved-VI compare pairs
  now resolve the historical repo-relative path per revision instead of
  failing closed with `left-blob-read-failed`
- bundled compare-flow docs now retire stale `Diff prev` and retained-pair
  wording in favor of the checkbox-selected pair review path

## [1.1.0] - 2026-04-07

### Changed

- `v1.1.0` is now the exact public release line on `main`, while `develop`
  remains the public evaluation branch and still carries `1.1.0` until the
  next exact release candidate opens
- the `release/1.1.0` promotion lane is now closed, and no newer exact public
  release candidate is active yet
- the control plane now retains one explicit hosted branch-protection and CI
  governance matrix across authority GitLab, the public GitHub facade, and the
  GitHub experiment workflows instead of leaving those boundaries scattered
  across YAML and branch-protection settings
- the authority GitLab package-preview lane is now admitted on `develop`,
  `main`, `release/*`, `hotfix/*`, and exact tags, while feature work relies
  on merge-request admission instead of a generic branch-push preview lane
- the configuration-management and release-control docs now fail closed on the
  real branch model: `develop` is the integration branch, `main` is the exact
  release branch, and GitHub's default branch stays `main` while `develop`
  carries the next candidate

## [1.0.6] - 2026-04-07

### Changed

- `v1.0.6` is now the exact public release line on `main`, while `develop`
  remains the public evaluation branch and still carries `1.0.6` until the
  next exact release candidate opens
- the public branch model now explicitly keeps GitHub's default branch on
  `main` for exact released truth while first-time Codespaces and devcontainer
  evaluation continue to use `develop`
- the public workflow pair now has an explicit responsibility matrix in which
  `Public Facade Package Preview` owns compile, design-contract, and preview
  packaging while `Public Facade Linux Smoke` owns Docker Linux proof, with
  bounded `develop`/`main`/`release/*`/`hotfix/*` triggers and per-ref
  concurrency to reduce CI churn
- the `VI History` panel now fails closed when an in-flight progress or result
  update races a disposed webview instead of surfacing a disposed-webview
  exception through the public review flow

## [1.0.5] - 2026-04-07

### Changed

- the public release line is now exact `v1.0.5` on `main`, and `develop`
  remains aligned to `1.0.5` until the next exact release candidate is opened
- the public fork-owner first-use Codespaces procedure is now tighter for a
  LabVIEW-first reader: it keeps the `develop` fork requirement, the
  `Codespaces` `...` -> `New with options` path, the `16-core` machine
  selection, the browser build message, the top-left three-line menu, the port
  `6010` forwarding dialog, and the exact `VI History` panel wording, while
  removing stale Vitest-popup guidance from the first-use flow
- the first-use quickstart and refresh workflow are now governed by a public
  docs CI test that reads the published public wiki checkout directly, so the
  fork-owner procedure can no longer drift silently from the authority/public
  source contract

## [1.0.4] - 2026-04-07

### Changed

- the public fork-owner Codespaces pages are now rewritten as atomic
  first-time-only procedures for LabVIEW users: they explicitly call out the
  fork dialog `Copy the main branch only` checkbox, the Codespaces `...` ->
  `New with options` path, the `16-core` machine choice, the browser build
  message, the top-left VS Code menu button, the expected port `6010`
  forwarding dialog, and the `VI History` panel wording
- public refresh steps are now split into a separate
  `Refresh-Codespace-Repositories` page instead of being embedded into the
  first-time procedures
- the public release line is now exact `v1.0.4` on `main`, and `develop`
  remains aligned to `1.0.4` until the next published change advances it again
- the authority/public wiki-root contract is now split between
  `VIHS_INTERNAL_WIKI_REPO_ROOT` and
  `VIHS_PUBLIC_GITHUB_WIKI_REPO_ROOT`, so public wiki overrides can no longer
  poison internal-authority docs tests or packaging lanes

## [1.0.3] - 2026-04-07

### Changed

- `v1.0.2` is now retained as a burned release because immutable main/tag
  pipelines failed after publication on stale authority-side package-manifest
  expectations, so `v1.0.3` is the next exact green line
- the authority release contract now treats `develop` as the integration branch
  and `main` as the release branch, instead of relying on direct-to-main
  operator memory
- the authority/public control plane now records the public-product branch
  model, the burned `v1.0.2` line, and the requirement to use CI required
  checks before protected-branch promotion
- the stale authority package-manifest contract now admits the governed
  `tests/unit/preparePublicTestFixtureScript.test.ts` design-contract test so
  docs CI no longer burns a tagged release on an outdated script inventory
- the public `VI History` explorer/title action now surfaces immediately for
  `.vi`, `.ctl`, and `.vit` files instead of waiting for background eligibility
  indexing to finish, while the runtime eligibility check still fails closed
- the public `Public Facade Package Preview` workflow now creates its
  `artifacts/` directory before packaging so the required-check upload step
  cannot fail after a successful VSIX build

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
