# VHS-REQ-706 — Linux-headless recursive-load: failure-signature & reproduction brief

> Read-only research brief (no runtime). Scopes the [VHS-REQ-706](./requirements/srs.md)
> feasibility spike (governed by [ADR-0027](./architecture/adr/ADR-0027-ml-latent-structure-research-rails.md))
> so the native-runtime reproduction is a targeted checklist, not open-ended research.
> Runtime reproduction is owned by the maintainer/Linux plane; this brief is the map.

## The question VHS-REQ-706 exists to answer

Does the `linux-headless-recursive-load` comparison failure (first seen on the
Docker Linux container, issue #2295) come from the **Linux-headless environment**,
or is it an **intrinsic empty→rich comparison asymmetry** that would fail on any
runtime? The spike reruns the empty→rich comparison on a host-native runtime to
decide. Preview works on the same box; only comparison is blocked.

## Failure signature (what to match, and what NOT to confuse it with)

- **Observed:** `Recursive load during LEIF load` on GSW / dialog VIs; LabVIEW CLI
  `CreateComparisonReport operation failed`; surfaced as LabVIEW **Error 66** /
  exit **-350051** (also reported as `0xFFFAA89D`).
- **Detector (authoritative):** the recursive-load classifier lives in the runtime
  execution path — `src/reporting/comparisonReportRuntimeExecution.ts` (LEIF
  recursive-load detection + `GSW_MainPanel` context extraction), producing the
  `linux-headless-recursive-load` diagnostic reason. Precedence is enforced in
  `src/reporting/runtime/selectDiagnosticReason.ts` (a Linux-headless reason wins
  over generic stderr / CLI diagnostic-log reasons), and the recovery predicate is
  in `src/reporting/runtime/linuxHeadlessPredicates.ts`.
- **Do NOT confuse with two adjacent-but-distinct classes:**
  - `linux-headless-init-failed` — driven by the log text `Failed to initialize
    headless LabVIEW.` (a broken `HeadlessManager`), per [VHS-REQ-156](./requirements/srs.md).
    Different trigger text, different root cause.
  - Cold-launch connection race — `-350000` / `-350051` from the LabVIEW-CLI
    connect window (see `src/reporting/runtime/headlessLaunchScriptBuilders.ts` and
    `src/reporting/viPreview/viPreviewExecution.ts`, and TROUBLESHOOTING.md's
    cold-launch section). Note: `-350051` appears in BOTH the cold-launch family and
    this recursive-load report, so the exit code alone is not decisive — the
    `Recursive load during LEIF load` / GSW text is what confirms this class.

## What is already known (the priors that rank the hypotheses)

1. **A version/flag mismatch is a proven cause of this exact failure.**
   [ADR-0004](./architecture/adr/ADR-0004-version-aware-labview-container-execution.md):
   `-Headless` is valid only for **LabVIEW 2026 Q1+**; passing `-Headless` to a
   **2025** image "triggers a recursive GSW LEIF load failure." 2026 Q1+ must use
   `labviewprofull -Headless`; 2025 Q3 and earlier must use `labview` with
   `EnableCICDFeaturesForLabVIEW=TRUE`. CHANGELOG #565 records the historical bug:
   a 2025 image failed with recursive-load "because the run was pinned to the
   LabVIEW 2026 path and `-Headless`" — fixed by version-aware execution.
   `src/reporting/runtime/containerLaunchConstants.ts` carries the same note (plain
   `labview` failing to engage headless → recursive GSW LEIF load).
2. **Not every Linux comparison fails.** The runtime-validation ledger
   (`docs/requirements/runtime-validation-ledger.json`) records **succeeded**
   host-native and container `CreateComparisonReport` runs on `lv_icon.vi`. So the
   blocker is **not** "all Linux comparison" — it is specific to certain
   comparisons/cases (the empty→rich enumeration path, #2295) and/or a specific
   launch mechanism.
3. **The spike is about empty→rich specifically.** [ADR-0027](./architecture/adr/ADR-0027-ml-latent-structure-research-rails.md):
   "the empty→rich enumeration path trips a LabVIEW headless Error 66 recursive-load
   in the Linux container … the feasibility spike must resolve this before any
   corpus-scale claim."

## Ranked hypotheses (highest prior first) — each with confirm/refute evidence

### H1 — Launch mechanism / version-flag mismatch on the native-Linux path (HIGH prior)
The native-Linux run engages a headless mechanism that is wrong for the runtime
version (the ADR-0004 / #565 precedent), so LEIF re-enters the GSW load.
- **Confirm:** capture the EXACT LabVIEWCLI invocation of the failing native run —
  executable (`labviewprofull` vs `labview`), the `-Headless` flag, and
  `EnableCICDFeaturesForLabVIEW`. If a 2026 x64 runtime is NOT launched as
  `labviewprofull -Headless` (or a 2025 path is used with `-Headless`), that is the
  cause.
- **Refute:** the invocation is already the correct version-aware one
  (`labviewprofull -Headless` for 2026 Q1+) **and** it still trips recursive-load.
- **Why first:** it is the only hypothesis with a documented prior of causing this
  precise signature, and it is the cheapest to check (inspect the command, no rerun).

### H2 — Intrinsic empty→rich comparison asymmetry (the spike's core hypothesis)
Recursive-load is a property of the empty→rich comparison itself, independent of OS.
- **Confirm:** run the SAME empty→rich case on host-native **Windows** LabVIEW (the
  VHS-REQ-706-designed test). If Windows ALSO trips recursive-load, it is intrinsic
  to empty→rich.
- **Refute:** the identical empty→rich case PASSES on host-native Windows → the
  failure is environment-bound (Linux-headless), not intrinsic → pushes weight to
  H1/H3.

### H3 — Linux-headless environment / display artifact (GSW dialog during LEIF load)
The GSW/dialog VIs pulled in during LEIF load misbehave specifically under Linux
headless (no display), where a Windows or displayed session would not.
- **Confirm:** rerun the failing Linux case under a virtual display (`xvfb`, per
  `docs/maintainer-operations.md`). If `xvfb` (or a real display) makes it pass, the
  failure is a headless/GSW-dialog interaction.
- **Refute:** it fails identically with a display present → not a headless-display
  artifact.

### H4 — Fixture-specific GSW/dialog dependency (why lv_icon.vi passes but the icon-editor fixture fails)
The failing fixture's dependency graph contains a GSW/dialog VI (surfaced as the
`GSW_MainPanel` context) that `lv_icon.vi` does not, and that VI is what re-enters
LEIF load.
- **Confirm:** bisect — a minimal empty→rich comparison of a VI with NO GSW/dialog
  dependency passes on native Linux, while one WITH such a dependency fails. Capture
  the exact GSW/dialog VI named in the recursive-load chain (the classifier already
  extracts `GSW_MainPanel` context).
- **Refute:** a VI with no GSW/dialog dependency ALSO trips recursive-load → the
  trigger is not that dependency class.

## Scoped reproduction checklist (for the native-runtime plane)

1. **Capture the failing invocation** (H1): record the exact LabVIEWCLI executable,
   flags, env (`EnableCICDFeaturesForLabVIEW`), runtime version/bitness, and the
   `<runDir>/diagnostics/diagnostics-manifest.json` (attempt-1, and attempt-2 if a
   headless-recovery retry fires) with `failureReason` / `diagnosticReason` /
   `exitCode` / `matchedFragment`.
2. **Windows host-native rerun of the SAME empty→rich case** (H2): pass ⇒ environment-bound; fail ⇒ intrinsic.
3. **`xvfb` / displayed rerun on Linux** (H3): pass ⇒ headless-display artifact.
4. **GSW-dependency bisect** (H4): identify the specific VI in the LEIF re-entry chain.
5. Record each result as honest ledger evidence (present-but-blocked, per the
   decoupled producer pattern) so the spike's conclusion is reproducible.

## Expected decision outcomes

- H1 confirmed → fix is a version-aware launch on the native-Linux path (mirrors the
  #565 / ADR-0004 container fix); likely the fastest unblock.
- H2 confirmed (Windows also fails) → the empty→rich comparison is intrinsically
  unsupported; the spike closes with "not a Linux artifact" and the ML corpus path
  must avoid the empty→rich enumeration.
- H3/H4 confirmed → a Linux-headless GSW/dialog interaction; unblock is a
  display/headless-mechanism change scoped to the implicated VI class.
