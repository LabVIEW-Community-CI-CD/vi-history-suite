# ADR-0006: Independent Dev-Tools Versioning And Runtime Pinning

- Status: Accepted
- Date: 2026-07-19

> Promoted into the active requirements package: VHS-REQ-676 (independent SemVer
> dev-tools version line), VHS-REQ-677 (runtime dev-tools version pinning for the
> MCP server), VHS-REQ-678 (Marketplace pre-release channel), VHS-REQ-679
> (runtime dev-tools install lifecycle), and VHS-REQ-680 (dev-tools status
> command and consumer documentation) are the authoritative, Active requirement
> text. The text below is the design record. The governing system requirements
> are VHS-SYS-REQ-013 (Optional Human Validation Surfaces, for the dev-tools
> versioning/pinning/status surfaces) and VHS-SYS-REQ-016 (Governed Release
> Branch Promotion, for the Marketplace pre-release channel).

## Context

The extension ships a "dev-tools" build — the compiled MCP server and companion
tooling — inside its Marketplace VSIX, so the only way to deliver a new dev-tools
build was to publish a new extension version to the Marketplace. That coupled
the toolset's cadence to the extension's release cadence and made it impossible
to try a newer toolset, or reproduce a specific one, without a Marketplace
republish. We also lacked a way to ship pre-release builds for real-world
testing through the normal install channel.

## Decision

Give the dev-tools an **independent version line** and let the extension pin and
consume it at runtime, without a Marketplace republish:

- **Independent SemVer line (VHS-REQ-676).** The dev-tools release channel
  carries its own SemVer 2.0 version (`devtools-vX.Y.Z`), sourced from a
  committed manifest field and echoed into the provenance packet, decoupled from
  the extension's Marketplace version.
- **Runtime pinning (VHS-REQ-677).** The `viHistorySuite.devTools.version`
  setting selects `bundled` (default, no network) or a pinned `devtools-vX.Y.Z`
  release. The MCP server launches the pinned build only when it is installed and
  integrity-verified in a trusted workspace; otherwise it fails closed to the
  bundled build.
- **Install lifecycle (VHS-REQ-679).** A dependency-free, official-source-only,
  HTTPS install boundary downloads and integrity-verifies a pinned release into
  global storage, with commands to install, uninstall, and (VHS-REQ-680) show
  status; an opt-in check surfaces newer stable versions.
- **Marketplace pre-release channel (VHS-REQ-678).** The release workflow
  selects the stable or pre-release Marketplace channel from the release tag's
  minor-version parity (odd = pre-release, even = stable), preserving every
  existing release guard for both channels.

## Consequences

- The dev-tools toolset is versioned and released on its own cadence; a user can
  run a specific dev-tools build without waiting for a Marketplace update.
- The runtime posture is fail-closed and security-gated: pinned builds are
  fetched only from the official repository over HTTPS, integrity-verified before
  use, and gated on workspace trust; an unverified or untrusted pin uses the
  bundled build.
- Version comparison reuses one dependency-free SemVer 2.0 utility across the
  extension and the release scripts; no semver npm dependency is added.
- Pre-release builds can be shipped for real-world testing through the same
  single, gated release lever, keeping dev-tools versioning independent of the
  extension version.
