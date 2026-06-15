# ADR-0004: Version-Aware LabVIEW Container Execution

- Status: Accepted
- Date: 2026-06-15

> Promoted into the active requirements package under issue #565:
> `VHS-REQ-657` (srs.md, rtm.csv, id-index.csv) is the authoritative, Active
> requirement text, and `VHS-REQ-620` is amended for the LabVIEW-agnostic Docker
> settings/label behavior. The text below is the design record. This ADR
> supersedes the LabVIEW-2026-pin aspect of [ADR-0003](./ADR-0003-dynamic-labview-container-image-selection.md);
> ADR-0003 remains Accepted as the image-selection design of record.

## Context

The comparison runtime can run `CreateComparisonReport` inside a LabVIEW Docker
container. [ADR-0003](./ADR-0003-dynamic-labview-container-image-selection.md)
made the *image tag* selectable (`viHistorySuite.container.imageVersion`), but
the *execution* of that image stayed pinned to LabVIEW 2026 in three ways:

- The Linux-container invocation hardcoded
  `-LabVIEWPath /usr/local/natinst/LabVIEW-2026-64/labviewprofull` and the
  LVCompare `-lvpath /usr/local/natinst/LabVIEW-2026-64/labview`, regardless of
  the selected image. A 2025 Q3 image ships LabVIEW under `LabVIEW-2025-64`, so
  the path does not exist there.
- The invocation always appended LabVIEWCLI `-Headless`. Per NI's
  `ni/labview-for-containers` guidance (`docs/headless-labview.md`,
  `docs/linux-prebuilt.md`), `-Headless` is valid only for **LabVIEW 2026 Q1 and
  later**; **2025 Q3 and earlier** engage CI/CD headless behavior through the
  environment variable `EnableCICDFeaturesForLabVIEW=TRUE` instead. Passing
  `-Headless` to a 2025 image triggers a recursive GSW LEIF load failure
  (observed as `command-exited-nonzero` / `linux-headless-recursive-load`), and
  the follow-up `CloseLabVIEW` reset — itself issued with the 2026 path and
  `-Headless` — also fails.
- The runtime-provider quick-pick hardcoded the label
  `Docker — LabVIEW 2026 x64` and persisted `labviewVersion=2026` /
  `labviewBitness=x64`, so the runtime doctor reported `LabVIEW=2026` even when a
  2025 image was selected. The user already chooses the LabVIEW version through
  the image, so the Docker provider's own version/bitness are redundant and
  misleading.

A real run against `resource/plugins/lv_icon.vi` with
`nationalinstruments/labview:2025q3-linux` failed for exactly these reasons.

## Decision

Derive the Linux-container LabVIEW invocation from the selected image, and make
the Docker provider LabVIEW-agnostic in settings and labels.

1. Add a pure resolver `resolveLinuxContainerLabviewProfile(imageReference)` to
   `containerImageCatalog.ts` that maps the parsed image year to an invocation
   profile: install directory `/usr/local/natinst/LabVIEW-<year>-64`; executable
   `labviewprofull` for 2026 Q1+ and `labview` for 2025 Q3 and earlier; and
   headless mechanism `cli-headless` (the `-Headless` flag) for 2026 Q1+ versus
   `enable-cicd-env` (`export EnableCICDFeaturesForLabVIEW=TRUE`) for earlier
   images. An unparseable reference falls back to the LabVIEW 2026 profile so the
   prior behavior is preserved for unrecognized overrides.
2. Thread the profile through `buildLinuxContainerCommandPlan` into the
   LabVIEWCLI argument rewrite (image-derived `-LabVIEWPath`, conditional
   `-Headless`), the container bash script (`export EnableCICDFeaturesForLabVIEW`
   only for the env mechanism), and the LVCompare `-lvpath` rewrite.
3. Run the Linux headless recursive-load recovery only for the `cli-headless`
   mechanism; an `enable-cicd-env` image never issued `-Headless`, so a
   `-Headless` `CloseLabVIEW` reset would be invalid.
4. Remove the legacy `docker-provider-labview-version-not-implemented` year pin.
   The resolved image governs the version; the existing supported-floor check
   (`labview-version-unsupported-for-comparison-report`) still rejects versions
   below the minimum for every provider.
5. Report the image-derived LabVIEW year on the runtime doctor's
   `Requested runtime` line for container providers.
6. Make the Docker runtime-provider option LabVIEW-agnostic: label `Docker`,
   persist `runtimeProvider=docker` and clear `labviewVersion`/`labviewBitness`,
   and treat a Docker selection as complete and satisfiable with the provider key
   alone across `isPersistedSelectionSatisfiable`, the activation seed/repair,
   `selectActiveRuntime`, and the runtime panel selection. The status-bar label
   stays image-based (`Docker @ <tag>`).

Windows-container execution remains LabVIEW 2026 pinned; widening it is deferred
to a future requirement because NI does not document an equivalent 2025 Q3
Windows-container headless variant in this repository.

## Rationale

- NI's own container guidance ties the headless mechanism and the canonical
  compare binary to the release year, so deriving them from the selected image is
  the faithful contract rather than a workaround.
- The catalog already parses the image tag into structured year data
  (ADR-0003), so the resolver reuses a verified, namespace-pinned parser with no
  new I/O and stays unit-testable on Linux without Docker.
- Clearing the Docker provider's version/bitness removes a redundant, misleading
  input now that the image is the single source of the LabVIEW version, matching
  the user's mental model ("pick the image, not a second version").
- Failing closed on the supported-year floor (kept) while removing the 2026 pin
  (removed) preserves safety without blocking valid older images.

## Consequences

- A 2025 Q3 Linux image now completes a comparison report; the recursive-load
  failure mode for that image is eliminated at the source.
- The Docker provider label and persisted settings no longer name a LabVIEW
  version; existing persisted Docker selections that still carry `2026`/`x64`
  remain satisfiable and are cosmetically harmless (the label is image-based and
  the execution path derives the version from the image).
- The `vihs` terminal CLI's Docker prompt still writes `labviewVersion`/
  `labviewBitness`; this is intentionally out of scope and is now cosmetic only.
- The `docker-provider-labview-version-not-implemented` blocked reason is no
  longer produced; its doctor guidance handler is retained but unreachable in
  production.
