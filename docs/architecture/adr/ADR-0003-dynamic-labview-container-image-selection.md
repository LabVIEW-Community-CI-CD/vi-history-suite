# ADR-0003: Dynamic LabVIEW Container Image Selection

- Status: Accepted
- Date: 2026-06-12

> Promoted into the active requirements package under issue #474:
> `VHS-SYS-REQ-019` (syrs.md) and `VHS-REQ-646`–`VHS-REQ-650` (srs.md, rtm.csv,
> id-index.csv) are the authoritative, Active requirement text; the appendix
> below is the design record.

## Context

The comparison runtime can run `CreateComparisonReport` inside a LabVIEW Docker
container for both the `windows-container` and `linux-container` providers. The
container image each provider uses is currently fixed in source as two hardcoded
constants in [comparisonRuntimeLocator.ts](../../../src/reporting/comparisonRuntimeLocator.ts):

```text
DEFAULT_WINDOWS_CONTAINER_IMAGE = 'nationalinstruments/labview:2026q1-windows'
DEFAULT_LINUX_CONTAINER_IMAGE   = 'nationalinstruments/labview:2026q1-linux'
```

A user can override these only by typing a complete image reference into the
`windowsContainerImage` / `linuxContainerImage` runtime settings, and the Docker
provider is otherwise pinned to LabVIEW 2026 — any other requested year resolves
to the blocked reason `docker-provider-labview-version-not-implemented`.

National Instruments publishes the `nationalinstruments/labview` repository on
Docker Hub with more granularity than the single pinned tag exposes. Beyond the
base quarterly release there are now cumulative **patch** images, for example:

- `nationalinstruments/labview:2026q1-windows` (base quarterly release)
- `nationalinstruments/labview:2026q1patch1-windows`
- `nationalinstruments/labview:2026q1patch2-windows`
- `nationalinstruments/labview:2026q1-linux`

None of the patch images are selectable today, even when they are already pulled
on the host. To make `2026q1patch2-windows` usable a maintainer must edit source
or hand-type the exact tag string. The same friction will recur for every future
quarter, patch, and release year (2027 and beyond): each new image requires a
code change before it can be selected. There is also no discovery — the system
neither enumerates what tags are published on the registry nor what images are
present locally, so users have no way to see which versions are available.

The host-native detection path already solved the analogous problem for locally
installed LabVIEW: [labviewInstallCatalog.ts](../../../src/tooling/labviewInstallCatalog.ts)
derives a *range* of supported install candidates from a year span and quarter
variants rather than hardcoding one install path. The container path has no
equivalent and is the remaining statically pinned runtime surface.

## Decision

Replace the hardcoded per-provider container image tag with a **derived,
selectable container image catalog**. The system will:

1. Model the NI LabVIEW image tag grammar
   (`<year>q<quarter>[patch<n>]-<windows|linux>`) as parseable, orderable data
   rather than opaque strings.
2. Discover the set of *available* image versions at runtime from two sources —
   the published Docker Hub registry tags and the images already present on the
   local Docker host — filtered to the active platform and the supported year
   floor.
3. Let the user select a version (year / quarter / patch) through a setting and
   a quick-pick, defaulting to the newest supported version when unset, and
   resolve that selection to the concrete image reference the locator consumes.
4. Drive both the Windows-container and Linux-container providers from the
   resolved selection, failing closed with a classified, actionable reason when
   an explicitly selected version is unavailable instead of silently
   substituting a different one.

The defining property is **zero-source-change extensibility**: when NI publishes
a new patch (e.g. `2026q1patch3`) or a new supported year/quarter (e.g.
`2027q1`), it becomes selectable as soon as it is published to the registry or
pulled locally — no edit to the extension and no extension update required.

This decision is recorded as the proposed system requirement
`VHS-SYS-REQ-019` (Selectable LabVIEW Container Runtime Versions) and its child
software requirements `VHS-REQ-646` through `VHS-REQ-650`, specified in the
appendix below. Following the precedent of
[ADR-0002](ADR-0002-selected-file-on-demand-vi-history-eligibility.md), the
requirement text is promoted into `syrs.md`, `srs.md`, `rtm.csv`, and
`id-index.csv` when implementation lands; this ADR is the design of record.

## Rationale

- **The hardcoded tag is the last statically pinned runtime surface.** Host
  detection already derives a supported range; the container path should be
  derived the same way so the two runtime providers stay symmetric.
- **Patches are cumulative fixes**, so within a `year`+`quarter` a higher patch
  number is the newer, preferred image. Modeling the tag lets the system order
  `base < patch1 < patch2 < …` and pick a deterministic newest default, while
  still letting an operator pin an exact version for reproducible evidence.
- **Two discovery sources cover both the online and air-gapped cases.** Registry
  discovery future-proofs new releases; local discovery guarantees that
  already-pulled images (the user's `patch1`/`patch2`) are offered even with no
  network and are never needlessly re-pulled.
- **Linux has the same multiplicity as Windows**, so the model, discovery, and
  selection are provider-agnostic and solve both platforms with one mechanism.
- **Fail-closed on an explicit unavailable selection** preserves the project's
  established runtime contract: a requested-but-missing runtime produces a
  classified, actionable block, never a silent downgrade that would make report
  evidence ambiguous about which LabVIEW produced it.

## Security Considerations

- **Untrusted registry input.** Tag strings returned by the registry are
  untrusted. They MUST be validated against the strict tag grammar and the image
  namespace MUST be pinned to the official `nationalinstruments/labview`
  repository. Any tag that does not parse, or any image reference outside the
  pinned namespace, is ignored. This prevents a spoofed or compromised registry
  response from injecting an arbitrary image reference that `docker pull` /
  `docker run` would then execute (a supply-chain / argument-injection vector).
- **No raw shell interpolation.** Resolved image references are passed to Docker
  as discrete process arguments — never concatenated into a shell command —
  consistent with the existing container invocation path.
- **Anonymous, read-only, bounded network access.** Registry discovery uses an
  anonymous read-only HTTPS query with a bounded timeout and is lazy (performed
  when the user opens the picker or runs a Docker compare, not on activation). A
  slow or hostile registry must never hang the extension; any failure falls back
  to local discovery plus the pinned default.
- **Workspace trust.** A selected image names an executable surface the compare
  launches, so the resolved selection is treated as a trust-restricted input,
  consistent with `labviewExePath` / `labviewCliPath`.

## Consequences

- The container provider gains parity with host detection: available versions
  are derived data, and new NI images are usable without a source change.
- Two new discovery surfaces (registry + local) and one new selection surface
  (setting + quick-pick) are added; each is independently testable and degrades
  gracefully (offline → local + default; no Docker → unchanged host behavior).
- Default behavior is preserved for users who never open the picker: the
  resolved newest-supported default reproduces today's pinned tag for the
  current release, so this is additive, not a breaking change.
- The `docker-provider-labview-version-not-implemented` hard year pin is
  replaced, for discovered tags, by availability-driven resolution; an explicit
  unavailable selection still fails closed with actionable guidance.
- This is a documentation/architecture record; it introduces no behavior change
  on its own. Implementation is governed by the child requirements below and
  follows the standard `feature/<issue#>-*` branch flow.

## Out Of Scope / Non-Goals

- Building or publishing LabVIEW images (those are produced by NI).
- Authenticated/private registries or registries other than the configured
  default Docker Hub namespace.
- Changing the host-native LabVIEW version selection, which already derives a
  supported range.
- Auto-pulling images without user intent beyond the existing acquire-before-
  launch behavior.

## Appendix: Proposed Requirement Hierarchy

The following requirement text is drop-in ready for promotion into the active
requirements package. On promotion, each block's `Status` becomes `Active`, the
RTM rows are added with the references below (new files created during
implementation), and `id-index.csv` rows are added. Until then this appendix is
the authoritative draft and the live requirements package is unchanged.

#### VHS-SYS-REQ-019: Selectable LabVIEW Container Runtime Versions (System)

- Status: Proposed
- Area: Runtime
- Statement: The system shall let users select among the LabVIEW container image
  versions that are actually available — across release year, quarter, and patch
  revision, for both the Windows-container and Linux-container providers — and
  shall derive the selectable set from published registry tags and locally
  present images, so that newly published images (including future release years
  and new patch revisions) become selectable without modifying extension source.
- Acceptance Criteria:
  - Selectable container versions are derived at runtime from discovered image
    tags, not from a hardcoded single tag per platform.
  - A newly published LabVIEW image (a new patch within a supported
    year/quarter, or a new supported year/quarter) becomes selectable with no
    source-code change and no extension update, once it is present on the
    configured registry namespace or pulled locally.
  - Selection is available for both the Windows-container and Linux-container
    providers.
  - When no explicit selection is made, the system resolves a deterministic
    newest-supported default that preserves the prior pinned behavior for the
    current release.
  - An explicitly selected version that is not available fails closed with a
    classified, actionable reason rather than silently substituting a different
    version.
- Children: VHS-REQ-646, VHS-REQ-647, VHS-REQ-648, VHS-REQ-649, VHS-REQ-650.

#### VHS-REQ-646: LabVIEW Container Image Tag Model

- Status: Proposed
- Parent: VHS-SYS-REQ-019
- Area: Runtime Discovery
- Statement: The extension shall provide a pure model that parses, formats, and
  orders `nationalinstruments/labview` image tags of the form
  `<year>q<quarter>[patch<n>]-<windows|linux>` into structured
  `{ year, quarter, patch, platform }` data.
- Acceptance Criteria:
  - A strict parser accepts `2026q1-windows`, `2026q1patch2-windows`, and
    `2026q1-linux` and decomposes each into year (4-digit), quarter (1–4),
    optional patch (>=1), and platform (`windows` | `linux`).
  - Any string that does not match the grammar, or whose repository is not the
    official `nationalinstruments/labview` namespace, is rejected (returns no
    parsed value) and never produces an image reference.
  - Ordering is deterministic newest-first by year, then quarter, then patch,
    where a higher patch is newer and the base (no-patch) release is the oldest
    within its year/quarter group.
  - A formatter reconstructs the canonical full image reference from structured
    data; round-tripping parse→format is identity for every valid tag.
  - The model is platform-pure (no I/O, no Docker, no network) and unit-tested.
- Agent Work Scope:
  - Add a `containerImageCatalog` model module exposing the parser, formatter,
    and comparator. No locator or settings wiring in this requirement.
- Implementation References:
  - `src/tooling/containerImageCatalog.ts` (new)
- Verification References:
  - `tests/unit/containerImageCatalog.test.ts` (new)
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the grammar and namespace pin strict; widening either is a security
    decision (see ADR-0003 Security Considerations), not a cosmetic change.

#### VHS-REQ-647: Published Container Image Tag Discovery

- Status: Proposed
- Parent: VHS-SYS-REQ-019
- Area: Runtime Discovery
- Statement: The extension shall discover available LabVIEW container versions by
  querying the configured Docker Hub `nationalinstruments/labview` tag list with
  an anonymous, read-only, bounded request, filtering the result to the active
  platform and the supported year floor through the VHS-REQ-646 model.
- Acceptance Criteria:
  - Discovery issues an anonymous read-only HTTPS request with a bounded timeout
    and is performed lazily (on picker open or Docker compare), never on
    activation.
  - Returned tags are parsed and namespace-pinned through VHS-REQ-646; tags that
    do not parse, target the wrong platform, or fall below the supported year
    floor are excluded.
  - Network failure, timeout, or a non-success response degrades gracefully:
    discovery returns no registry results and surfaces a non-fatal note rather
    than throwing, so selection falls back to local images and the default.
  - The discovery boundary is injected (dependency) so it is unit-tested without
    real network access.
- Agent Work Scope:
  - Add a registry tag-discovery function behind an injected fetch boundary;
    return parsed, ordered, platform-filtered versions plus a fail-soft note.
- Implementation References:
  - `src/tooling/containerImageCatalog.ts` (new)
  - `src/reporting/comparisonRuntimeLocator.ts`
- Verification References:
  - `tests/unit/containerImageCatalog.test.ts` (new)
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the request anonymous, read-only, and bounded; never add credentials or
    unbounded retries. Registry unavailability must remain non-fatal.

#### VHS-REQ-648: Local Container Image Tag Discovery

- Status: Proposed
- Parent: VHS-SYS-REQ-019
- Area: Runtime Discovery
- Statement: The extension shall discover available LabVIEW container versions
  from images already present on the local Docker host, so already-pulled images
  are selectable offline and are not needlessly re-pulled.
- Acceptance Criteria:
  - Local discovery enumerates `nationalinstruments/labview` images on the host
    (e.g. via `docker images`) and parses each tag through VHS-REQ-646.
  - Each discovered version is marked as locally present so selection surfaces
    can distinguish "already pulled" from "available to pull".
  - Local discovery requires no network and succeeds in an air-gapped
    environment; absence of the Docker CLI yields an empty result, not an error.
  - The Docker enumeration boundary is injected and unit-tested without invoking
    real Docker.
- Agent Work Scope:
  - Add a local image enumeration function behind an injected command boundary;
    merge its results with registry results, de-duplicated by canonical tag.
- Implementation References:
  - `src/tooling/containerImageCatalog.ts` (new)
  - `src/reporting/comparisonRuntimeLocator.ts`
- Verification References:
  - `tests/unit/containerImageCatalog.test.ts` (new)
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Treat the local list as authoritative for the offline/already-pulled case;
    merging with registry results must not drop a locally present version.

#### VHS-REQ-649: Container Image Version Selection Setting And Quick-Pick

- Status: Proposed
- Parent: VHS-SYS-REQ-019
- Area: Menu Gating
- Statement: The extension shall expose a container image version setting and a
  quick-pick command that lists discovered versions newest-first, marks
  locally-present versions, and resolves the user's choice (or the
  newest-supported default when unset) to the concrete image reference consumed
  by the comparison runtime.
- Acceptance Criteria:
  - A `viHistorySuite.container.imageVersion` setting (string) accepts a canonical
    tag or version token; unset resolves to the deterministic newest-supported
    default for the active platform.
  - A quick-pick command lists discovered versions ordered newest-first, labels
    each with year/quarter/patch, and annotates whether each is locally present
    or available to pull.
  - The chosen version resolves to the full image reference for the active
    provider platform (Windows or Linux) and persists to the setting.
  - When discovery yields nothing (offline and nothing pulled), the picker still
    offers the default and explains how to pull it; selection never crashes.
  - The setting is documented in `package.json` and treated as a
    trust-restricted, executable-naming input.
- Agent Work Scope:
  - Add the contributed setting and a `labviewViHistory.pickContainerImageVersion`
    command; reuse the existing runtime quick-pick patterns. Resolution logic is
    window-free and unit-tested; the command surface is thin.
- Implementation References:
  - `package.json`
  - `src/commands` (new container-image quick-pick command)
  - `src/reporting/comparisonRuntimeLocator.ts`
- Verification References:
  - `tests/unit/packageManifest.test.ts`
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Keep the default resolution backward-compatible: an unset setting must
    reproduce today's pinned tag for the current release.

#### VHS-REQ-650: Selected Container Version Drives Both Providers With Fail-Closed Acquisition

- Status: Proposed
- Parent: VHS-SYS-REQ-019
- Area: Runtime Discovery
- Statement: The comparison runtime locator shall consume the resolved container
  image version for both the Windows-container and Linux-container providers, and
  shall fail closed with a classified, actionable reason when an explicitly
  selected version is unavailable, rather than silently substituting a different
  version.
- Acceptance Criteria:
  - The resolved image reference replaces the hardcoded per-provider default in
    the locator for both `windows-container` and `linux-container`.
  - An explicitly selected version that is neither locally present nor
    acquirable produces a classified blocked reason with actionable guidance
    (which version was requested and how to pull it); no silent downgrade
    occurs.
  - The existing acquire-before-launch behavior is preserved for a selected
    version that is available on the registry but not yet pulled.
  - A discovered, supported version no longer resolves to
    `docker-provider-labview-version-not-implemented` when it is explicitly
    selected; the legacy host-LabVIEW-year pin is bypassed by the selection and
    the chosen image fails closed through container-image acquisition if it
    cannot be launched.
  - Default (unset) resolution preserves current behavior and existing locator
    tests continue to pass.
- Agent Work Scope:
  - Wire the resolved version into `locateComparisonRuntime` image resolution for
    both providers; add the fail-closed unavailable-selection blocked reason and
    its doctor guidance. Keep resolution injected and unit-tested.
- Implementation References:
  - `src/reporting/comparisonRuntimeLocator.ts`
  - `src/reporting/comparisonRuntimeDoctor.ts`
- Verification References:
  - `tests/unit/comparisonRuntimeLocator.test.ts`
  - `tests/unit/comparisonRuntimeDoctor.test.ts`
  - `tests/unit/requirementsDocs.test.ts`
- Change Guidance:
  - Preserve the fail-closed runtime contract (VHS-SYS-REQ-007): a
    requested-but-missing runtime is always a classified block, never a silent
    substitution that would make report evidence ambiguous.
