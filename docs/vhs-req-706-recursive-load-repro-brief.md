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

- **Observed:** `Recursive load during LEIF load` on the GSW (Getting Started
  Window) dialog; LabVIEW CLI `CreateComparisonReport operation failed`. The
  process **exit code is 157**; the CLI also surfaces `0xFFFAA89D` (an
  illegal-arguments hex that is **misleading** — the real cause is the recursive
  load, not bad arguments). Key on the recursive-load text, not the exit code (see
  the confirmed baseline below).
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
    cold-launch section). This recursive-load class exits **157** (not `-350051`;
    an earlier report mis-attributed `-350051`), so the exit code is not the tell —
    the `Recursive load during LEIF load` + GSW text is what confirms this class.

## Confirmed on-box baseline (native LabVIEW 2026 x64, Linux host — 2026-07-27)

A real host-native comparison run captured the current signature (raw artifacts:
`failure-classification.json`, `LVStatus.txt`, `runtime-diagnostic-log.txt`,
`runtime-stderr.txt`):

- `diagnosticReason: linux-headless-recursive-load`, `failureReason:
  command-exited-nonzero`, `exitCode: 157`, `durationMs: 1583` (fails fast, at
  launch — well before any comparison content is enumerated).
- `LVStatus.txt`: `Recursive load during LEIF load`, then
  `…/LabVIEW-2026-64/resource/dialog/GSW/GSW.lvlibp/…/GSW_MainPanel.vi` is loading
  `…/GSW_MainPanel.vi/<uuid>.vi` (two distinct UUIDs).

**Decisive implication:** the recursion is **inside the shipped, packed
`GSW.lvlibp`** — `GSW_MainPanel.vi` recursively loading UUID-suffixed members of
**itself** while LabVIEW loads the Getting Started Window at headless launch. It is
therefore **fixture-independent and comparison-independent** (a packed-library
self-recursion at launch, not a fixture dependency cycle and not the comparison
content). This reorients the hypotheses below.

## Empirical result (2026-07-27) — narrowing the cause

The Linux plane ran the checklist on native **Community** LabVIEW 2026-64 (LabVIEWCLI
only, `-LabVIEWPath …/LabVIEW-2026-64/labview`). The runs bear on the hypotheses below —
they establish the render path but leave H2 and H4 open (see the conclusion):

| Run | Operation | Config | Result |
| --- | --- | --- | --- |
| A | `PrintToSingleFileHtml` (SerialPortNuggets `Verify Checksum.vi`) | no `-Headless`, no `EnableCICDFeaturesForLabVIEW` | **exit 0**, 7 PNGs, no GSW/LEIF recursion |
| C | `PrintToSingleFileHtml` (same VI) | **with `-Headless`** | **exit 0**, 7 PNGs, no GSW/LEIF recursion |
| #2480 | `PrintToSingleFileHtml` (`lv_icon.vi`) | host-native | **exit 0**, 638 PNGs |
| #2472 | **`CreateComparisonReport`** (`lv_icon.vi`) | same box / CLI / plain `labview` | **linux-headless-recursive-load** (GSW self-recursion), exit 157, ~1583 ms at launch |

**Conclusion — the render path works headless; the GSW recursion is tied to a specific
`CreateComparisonReport` launch, not to the operation universally.** A real VI renders
headlessly in every tested config (no/`-Headless`, plain `labview`, Community) via
`PrintToSingleFileHtml`, so the render path + headless launch are sound and GSW is not
loaded at generic launch. The recursion appeared on the **#2472 run only**:
`CreateComparisonReport` via **plain `labview`** (Community host-native). Crucially,
`CreateComparisonReport` is **not** uniformly broken — `runtime-validation-ledger.json`
records **green** `CreateComparisonReport` runs on `lv_icon.vi` for all four Linux
**container** tracks (in-container `labviewprofull -Headless`) and one Linux
**host-native** track (1.34.2, 2026-07-19; launch config not recorded). So the failure
is **config/launch-dependent**, correlating with the plain-`labview` host-native launch,
not with the operation as such.

What the renders **do** and **do NOT** establish:
- **Establish:** the `-Headless` flag does not break *rendering*; H1's "suppress GSW at
  generic launch" is not the lever (the render at the same launch never loads GSW).
- **Do NOT refute H2 (launch mechanism / version-flag)** — now the *leading* hypothesis:
  the green compares use `labviewprofull -Headless` (container) while the red used plain
  `labview`; the renders never exercised `CreateComparisonReport` under a version-aware
  launch, so the mechanism is untested *for the compare op*.
- **Do NOT refute H4 (packed `GSW.lvlibp` integrity)** — `PrintToSingleFileHtml` never
  loads GSW, so it cannot exercise GSW-load integrity; H4 stays open.
- **Edition** is not cleanly refuted for the compare op: the red compare was *also*
  Community, and the 07-19 host-native green's edition/launch is unrecorded.

**Decisive next test (Linux plane):** a controlled host-native `CreateComparisonReport`
retest on `lv_icon.vi` at the current comparison-runtime build (which may carry a
version-aware `-Headless` launch postdating #2472). **Green ⇒ H2** (the plain-`labview`
launch was the trigger; a version-aware launch fixes it). **Red ⇒ host/edition/packed-lib
specific** (H4, or a host-specific 07-19 green). Until then the SRS environment-vs-intrinsic
question resolves as: **container path green (`labviewprofull -Headless`); host-native
compare config/host-dependent** — not a blanket Linux-environment failure and not an
empty→rich asymmetry.

### #2315 unblock (does not require resolving the root cause)
Because a real VI renders headlessly on the decoupled Linux actor
(`PrintToSingleFileHtml`, proven), a Linux decoupled **diff** can be built by
rendering each revision via `PrintToSingleFileHtml` and structurally diffing the
outputs — side-stepping `CreateComparisonReport` and the GSW blocker entirely. This
is a rendered-output surrogate (not the semantic `CreateComparisonReport` parity),
but it makes the decoupled Linux actor a present-and-capable per-actor **diff**
signal now; true comparison parity stays gated on the narrowed root-cause thread.
Evidence: the Linux-plane run artifacts (`EMPIRICAL-PrintToSingleFileHtml.md`,
`spn-A.log`, `spn-C.log`, and the #2472 baseline `failure-classification.json` /
`LVStatus.txt`) are named in the tracking issue #2485 and the collab record; they live
on the Linux run host and are not committed.

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

## Ranked hypotheses (as of the baseline — now largely resolved by the Empirical result above)

> These were the pre-reproduction rankings. The **Empirical result** section above
> has since NARROWED the cause: the render path is sound (H1's suppress-GSW-at-launch
> is not the lever), **H2 (launch mechanism / version-flag) is now the leading open
> hypothesis** pending a controlled compare retest, and **H4 (packed-lib) stays open**
> (the renders never load GSW). Retained as the record of how the reproduction was scoped.

### H1 — Suppress the GSW (Getting Started Window) load at headless launch (TOP, highest-leverage)
The recursion is GSW loading itself; if headless launch can start LabVIEW **without**
loading `GSW_MainPanel`, the recursion never happens.
- **Confirm:** find a GSW-suppression control — a LabVIEW `.ini` token (e.g. a
  `showWelcomeOnLaunch=False` / "skip Getting Started" style key), a launch arg, or
  an env — set it for the headless launch, rerun; comparison proceeds.
- **Refute:** GSW load cannot be suppressed, or suppressing it still trips the
  recursion.
- **Why top:** it targets the proven proximate cause (GSW self-load) and is the most
  likely durable fix.

### H2 — Launch mechanism / version-flag mismatch (HIGH, cheapest check)
ADR-0004 + CHANGELOG #565 show the exact "recursive GSW LEIF load" is what a
wrong-version `-Headless` produces; the native run may be engaging the GSW load path
the wrong way.
- **Confirm:** from the captured invocation, verify the run uses `labviewprofull
  -Headless` for 2026 x64 (not plain `labview`, not a 2025 path with `-Headless`).
  A mismatch that engages the interactive GSW path is the cause.
- **Refute:** the invocation is already correct version-aware **and** it still
  recurses (the baseline suggests this is plausible — pushing weight to H1/H3/H4).
- **Cheapest:** the baseline already captured the invocation; this is an inspection.

### H3 — Linux-headless / no-display artifact
GSW is a GUI dialog; with no display it may recurse where a real/virtual display lets
it load once.
- **Confirm:** rerun under `xvfb` / a display (per `docs/maintainer-operations.md`);
  it proceeds.
- **Refute:** it recurses identically with a display present.

### H4 — Packed `GSW.lvlibp` integrity / build mismatch
The packed-lib self-recursion may be a corrupt or version-mismatched `GSW.lvlibp` in
this LabVIEW-2026-64 install.
- **Confirm:** compare the `GSW.lvlibp` build against the LabVIEW 2026-64 install; a
  repair/reinstall or a clean 2026 build stops the recursion.
- **Refute:** a known-good `GSW.lvlibp` still recurses headless.

### Refuted by the on-box baseline (do NOT spend cycles here)
- **Fixture-specific GSW dependency** — the recursion is inside the shipped
  `GSW.lvlibp`, not the fixture graph, so it reproduces with ANY comparison
  (`lv_icon.vi` passing per the ledger is because those runs did not hit this launch
  path, not because the fixture lacked a GSW dependency).
- **Intrinsic empty→rich asymmetry as the proximate cause** — the failure is at
  launch (`durationMs 1583`), before comparison content is enumerated, so empty→rich
  content is not the trigger. (The SRS environment-vs-intrinsic question is now
  effectively answered "Linux-headless launch environment", pending the Windows
  cross-check in the checklist.)

## Scoped reproduction checklist (for the native-runtime plane)

1. **Confirm the invocation** (H2): from the captured baseline, record the exact
   LabVIEWCLI executable / `-Headless` flag / `EnableCICDFeaturesForLabVIEW` /
   version / bitness. Cheapest signal first.
2. **GSW-suppression attempt** (H1): locate + set a GSW/Getting-Started skip
   (`.ini` token / launch arg / env), rerun; proceeding ⇒ the fix.
3. **`xvfb` / displayed rerun** (H3): proceeding ⇒ headless-no-display artifact.
4. **Windows host-native headless cross-check**: does host-native Windows 2026
   headless ALSO load GSW and recurse? Windows fine ⇒ Linux-specific (H1/H3/H4);
   Windows also recurses ⇒ a version/packed-lib issue independent of OS.
5. **`GSW.lvlibp` integrity** (H4): compare/repair the packed lib if H1–H3 do not
   resolve it.
6. Record each result as honest ledger evidence (present-but-blocked, per the
   decoupled producer pattern) so the spike's conclusion is reproducible.

## Outcome (empirically resolved 2026-07-27)

See **Empirical result** above. Net: the render path is sound headless; the GSW
recursion is **config/launch-dependent** (the #2472 plain-`labview` Community
host-native `CreateComparisonReport`), **not** operation-universal — container
compares (`labviewprofull -Headless`) and a 07-19 host-native compare are green.
**H2 (launch mechanism / version-flag) is the leading open hypothesis** and **H4
(packed-lib) stays open**; a controlled host-native compare retest is the decisive
test. Forward paths:
- **Unblock #2315 now** — build the decoupled Linux diff from per-revision
  `PrintToSingleFileHtml` renders + a structural diff (rendered-output surrogate;
  ships a present-and-capable per-actor diff signal without the blocker). [Done: #2490.]
- **Root-cause thread (true comparison parity)** — run the controlled host-native
  compare retest under a version-aware `-Headless` launch (green ⇒ H2 launch
  mechanism; red ⇒ host/edition/packed-lib specific), then, if H2, apply the
  version-aware launch fix host-native (mirrors the container #565/ADR-0004 fix).
