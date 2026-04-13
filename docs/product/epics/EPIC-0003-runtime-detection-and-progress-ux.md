# EPIC-0003: Runtime Detection And Progress UX

## Outcome

Deliver a governed runtime/tool-discovery and progress experience aligned to the
authoritative research:

- exact released Docker-only bundled/user runtime truth
- active branch provider request, version, and bitness truth
- Windows registry and install-root discovery
- macOS/Linux documented-root discovery and constraint retention
- notification, status-bar, and webview progress surfaces

## Scope

- exact released bundled/user baseline:
  - Docker-only compare execution
  - current Docker engine selection of governed Windows or Linux image family
  - visible image acquisition and blocked-provider guidance
- active branch authority/internal direction:
  - generated settings CLI with provider, LabVIEW version, and bitness
  - host-default Windows local `LabVIEWCLI`
  - bounded expert Docker provider selection
  - explicit compare preflight before execution
- bounded internal/runtime-proof compatibility inputs:
  - `executionMode`
  - `labviewCliPath`
  - `labviewExePath`
  - internal image overrides
- Windows discovery heuristics and retained detection facts
- macOS/Linux discovery heuristics and platform constraint facts
- notification progress with percent, processed/total, and ETA
- discreet status-bar progress item
- webview progress surface for long-running report generation

## Excluded From This Epic

- arbitrary non-NI compare tooling
- VS Code for Web support
- opaque timeout-based runtime control

## Exit Criteria

- explicit settings override auto-discovery deterministically
- runtime detection retains classified results instead of silent fallback
- indexing progress includes percent, processed/total, and ETA
- report generation progress is visible in the webview
- desktop/remote-host boundary is documented and testable

## Initial Child Slices

1. explicit settings and detection model
2. Windows discovery
3. macOS/Linux discovery and constraints
4. progress-surface uplift
