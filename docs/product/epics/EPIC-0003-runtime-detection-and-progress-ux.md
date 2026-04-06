# EPIC-0003: Runtime Detection And Progress UX

## Outcome

Deliver a governed runtime/tool-discovery and progress experience aligned to the
authoritative research:

- explicit user tool-path overrides
- Windows registry and install-root discovery
- macOS/Linux documented-root discovery and constraint retention
- notification, status-bar, and webview progress surfaces

## Scope

- `labviewCliPath`, `lvComparePath`, `labviewExePath`, `bitness`
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
