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

## Empirical result (2026-07-27) — the cause, empirically resolved

The Linux plane ran the checklist on native **Community** LabVIEW 2026-64 (LabVIEWCLI
only, `-LabVIEWPath …/LabVIEW-2026-64/labview`), including the decisive controlled
host-native `CreateComparisonReport` retest at the current shipped build. The runs
**resolve** the hypotheses below: the render path is sound headless, but a fully
version-aware `-Headless` host-native compare **still** recursive-loads GSW — so
**H2 is refuted as the cure**; the Windows host-native cross-check (below) then runs the
same compare **GREEN** on both bitnesses, which **refutes H4-as-OS-independent-corruption**
and localizes 706 to the **Linux host-native** cell (see the conclusion):

| Run | Operation | Config | Result |
| --- | --- | --- | --- |
| A | `PrintToSingleFileHtml` (SerialPortNuggets `Verify Checksum.vi`) | no `-Headless`, no `EnableCICDFeaturesForLabVIEW` | **exit 0**, 7 PNGs, no GSW/LEIF recursion |
| C | `PrintToSingleFileHtml` (same VI) | **with `-Headless`** | **exit 0**, 7 PNGs, no GSW/LEIF recursion |
| #2480 | `PrintToSingleFileHtml` (`lv_icon.vi`) | host-native | **exit 0**, 638 PNGs |
| #2472 | **`CreateComparisonReport`** (`lv_icon.vi`) | same box / CLI / plain `labview` | **linux-headless-recursive-load** (GSW self-recursion), exit 157, ~1583 ms at launch |
| **Retest** | **`CreateComparisonReport`** (`lv_icon.vi`, HEAD~1→HEAD) | shipped runtime, build 1.36.1+0cc9a58, **version-aware `-Headless -LabVIEWPath …/LabVIEW-2026-64/labview -PortNumber 3363`** | **linux-headless-recursive-load** (SAME GSW self-recursion, identical uuids), exit 157, durationMs 623 |
| **Win x64** | **`CreateComparisonReport`** (`lv_icon.vi`, 5376833→fc09736) | **Windows host-native LabVIEW 2026 Q3 x64**, shipped runtime at develop HEAD | **exit 0**, `runtimeState=succeeded`, real 1,241,031-byte report, **NO GSW recursion** |
| **Win x86** | **`CreateComparisonReport`** (`lv_icon.vi`, 5376833→fc09736) | **Windows host-native LabVIEW 2026 Q3 x86**, shipped runtime at develop HEAD | **exit 0**, `runtimeState=succeeded`, identical 1,241,031-byte report, **NO GSW recursion** |

**Conclusion — the render path works headless; a version-aware `-Headless` host-native
`CreateComparisonReport` STILL recursive-loads GSW, so the launch mechanism is not the
cure; the Windows host-native cross-check (below) then compares GREEN, refuting packed-lib
corruption and localizing the failure to the Linux host-native cell.** A real VI renders headlessly in every tested config
(no/`-Headless`, plain `labview`, Community) via `PrintToSingleFileHtml`, so the render
path + headless launch are sound and GSW is not loaded at generic launch. The **decisive
retest** ran the *shipped* host-native comparison runtime (build 1.36.1+0cc9a58, core
byte-identical to develop HEAD) on `lv_icon.vi` with a **fully version-aware**
`-Headless -LabVIEWPath …/LabVIEW-2026-64/labview -PortNumber 3363` invocation — and it
reproduced the **same** GSW self-recursion (exit 157, `linux-headless-recursive-load`,
identical `GSW_MainPanel.vi` uuids). LabVIEW connected (port 3363) then failed at LEIF
load. So the recursion is **not** cured by a version-aware launch. `CreateComparisonReport`
is still not *uniformly* broken — `runtime-validation-ledger.json` records **green**
compares for all four Linux **container** tracks (in-container `labviewprofull -Headless`)
and one Linux **host-native** track (1.34.2, 2026-07-19); with the version-aware
host-native retest now RED, that 07-19 green is a **different host/edition/environment**
(#2486 candidate a), not a since-fixed launch.

What the evidence **establishes** (after the retest):
- **H1 (suppress GSW at generic launch) is not the lever** — the render at the same
  launch never loads GSW; the `-Headless` flag does not break *rendering*.
- **H2 (version-aware `-Headless` host-native launch as the CURE) is REFUTED** — the
  retest issued a fully version-aware `-Headless -LabVIEWPath -PortNumber` compare and it
  still recursive-loaded GSW, so the launch mechanism was not the trigger and a
  version-aware launch does not fix it (contrast the container #565/ADR-0004 case, where
  the wrong-version `-Headless` *was* the cause).
- **H4 (packed `GSW.lvlibp` integrity), refined by the Windows cross-check** — the packed
  library is **not corrupt**: the same `CreateComparisonReport` on `lv_icon.vi` runs GREEN
  on Windows host-native LabVIEW 2026 Q3, **both x86 and x64** (real 1.24 MB reports, no GSW
  recursion), so a corrupt/version-mismatched packed lib would have to fail there too and does
  not. H4-as-OS-independent-corruption is therefore **refuted**. What remains is a
  **Linux-host-native-specific packed-library LOAD** behavior — only `CreateComparisonReport`
  pulls GSW (`PrintToSingleFileHtml` renders the same VI with 638 imgs and NO GSW load), a
  version-aware launch does not avoid it, and it recurses **only** in the Linux host-native cell.
- **Edition** is not the discriminator for the compare op: both the #2472 and the retest
  compares were Community 2026, and the 07-19 host-native green's edition/host is unrecorded
  (#2486 candidate a).

**Decisive test — DONE, RED.** The controlled host-native `CreateComparisonReport` retest
on `lv_icon.vi` at the current shipped build (a version-aware `-Headless` launch postdating
#2472) **reproduced** the recursion (exit 157). So the disposition is the **Red ⇒
host/edition/packed-lib specific** branch: H2 (launch mechanism) is refuted as the cure, and
H4-as-OS-independent-corruption is refuted by the Windows-green cross-check below. The SRS environment-vs-intrinsic question resolves as:
**container path green (`labviewprofull -Headless`); host-native compare on this box RED
regardless of a version-aware launch** — an install/packed-lib-scoped GSW-load failure, not
a blanket Linux-environment failure and not an empty→rich asymmetry. **The Windows host-native
2026 cross-check is now DONE and GREEN** — the same `CreateComparisonReport` on `lv_icon.vi`
(5376833→fc09736) succeeds on Windows host-native LabVIEW 2026 Q3, **both x86 and x64** (real
1.24 MB reports, no GSW recursion). So the packed `GSW.lvlibp` loads and compares cleanly off
Linux: **H4-as-OS-independent-corruption is refuted** and 706 is confirmed
**Linux-host-native-specific** — the single broken cell is (platform=Linux AND
provider=host-native), while Windows host-native (either bitness) and the Linux container
(`labviewprofull -Headless`) are all green.

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

> These were the pre-reproduction rankings. The **Empirical result** section above has
> since RESOLVED the cause via the decisive host-native compare retest plus the Windows
> host-native cross-check: the render path is
> sound (H1's suppress-GSW-at-launch is not the lever), **H2 (launch mechanism / version-flag)
> is REFUTED as the cure** (a version-aware `-Headless` host-native compare still recurses),
> and **H4-as-OS-independent-corruption is REFUTED** (the same compare runs GREEN on Windows
> host-native, both bitnesses) — the residual cause is a Linux-host-native-specific packed-lib
> load. Retained as the record of how the reproduction was scoped.

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
  recurses. **CONFIRMED REFUTED (2026-07-27 retest):** the shipped runtime issued
  `labview … -Headless -LabVIEWPath …/LabVIEW-2026-64/labview -PortNumber 3363` and it
  STILL recursive-loaded GSW — so a version-aware launch is not the cure; weight moves to H4.
- **Cheapest:** the baseline already captured the invocation; this is an inspection.

### H3 — Linux-headless / no-display artifact
GSW is a GUI dialog; with no display it may recurse where a real/virtual display lets
it load once.
- **Confirm:** rerun under `xvfb` / a display (per `docs/maintainer-operations.md`);
  it proceeds.
- **Refute:** it recurses identically with a display present.

### H4 — Packed `GSW.lvlibp` integrity / build mismatch (refined: NOT corruption)
The packed-lib self-recursion was hypothesized to be a corrupt or version-mismatched
`GSW.lvlibp`. The **Windows host-native cross-check refutes corruption**: the same packed
lib loads and compares cleanly on Windows LabVIEW 2026 Q3 (both bitnesses), so the artifact
is sound. What remains is a **Linux-host-native packed-library LOAD** behavior specific to
the Linux host-native cell.
- **Confirm:** the GSW load path differs between Linux host-native and the Linux container
  (which is green); replicate the container's edition/launch on Linux host-native, or route
  Linux comparisons through the container provider, and the recursion disappears.
- **Refute:** an identical container-edition launch on Linux host-native still recurses.

### Refuted by the on-box baseline (do NOT spend cycles here)
- **Fixture-specific GSW dependency** — the recursion is inside the shipped
  `GSW.lvlibp`, not the fixture graph, so it reproduces with ANY comparison
  (`lv_icon.vi` passing on the **container** tracks reflects the different
  environment/build there, not a fixture lacking a GSW dependency; the version-aware
  host-native retest on `lv_icon.vi` still recurses).
- **Intrinsic empty→rich asymmetry as the proximate cause** — the failure is at
  launch (`durationMs 623`–`1583`), before comparison content is enumerated, so empty→rich
  content is not the trigger. (The SRS environment-vs-intrinsic question resolves to a
  **Linux-host-native-specific** GSW-load failure — the Windows host-native cross-check
  ran the same compare GREEN on both bitnesses, so it is not OS-independent.)

## Scoped reproduction checklist (for the native-runtime plane)

1. **Confirm the invocation** (H2): from the captured baseline, record the exact
   LabVIEWCLI executable / `-Headless` flag / `EnableCICDFeaturesForLabVIEW` /
   version / bitness. Cheapest signal first.
2. **GSW-suppression attempt** (H1): locate + set a GSW/Getting-Started skip
   (`.ini` token / launch arg / env), rerun; proceeding ⇒ the fix.
3. **`xvfb` / displayed rerun** (H3): proceeding ⇒ headless-no-display artifact.
4. **Windows host-native headless cross-check** — **DONE, GREEN (both bitnesses).**
   `CreateComparisonReport` on `lv_icon.vi` (5376833→fc09736) succeeded on Windows
   host-native LabVIEW 2026 Q3 x64 and x86 (real 1.24 MB reports, no GSW recursion) ⇒
   the failure is **Linux-host-native-specific**, not an OS-independent packed-lib issue.
5. **`GSW.lvlibp` integrity** (H4): compare/repair the packed lib if H1–H3 do not
   resolve it.
6. Record each result as honest ledger evidence (present-but-blocked, per the
   decoupled producer pattern) so the spike's conclusion is reproducible.

## Outcome (empirically resolved 2026-07-27)

See **Empirical result** above. Net: the render path is sound headless; the decisive
host-native `CreateComparisonReport` retest at the current shipped build — with a **fully
version-aware** `-Headless -LabVIEWPath …/LabVIEW-2026-64/labview -PortNumber 3363`
invocation — **reproduced** the GSW self-recursion (exit 157, `linux-headless-recursive-load`),
and the **Windows host-native 2026 Q3 cross-check then ran the same compare GREEN on both
bitnesses**. So **H2 (launch mechanism / version-flag) is REFUTED as the cure**, and
**H4-as-OS-independent-corruption is REFUTED** by the Windows-green result — the packed
`GSW.lvlibp` is not corrupt. The authoritative verdict is that 706 is
**Linux-host-native-specific**: the single broken cell is (platform=Linux AND
provider=host-native). The #2486 split is confirmed — Linux container compares
(`labviewprofull -Headless`) are green, Windows host-native (either bitness) is green,
and only Linux host-native Community is red regardless of the launch, so the 07-19
ledger-green host-native was a different host/edition/environment (candidate a). Forward paths:
- **Unblock #2315 now** — build the decoupled Linux diff from per-revision
  `PrintToSingleFileHtml` renders + a structural diff (rendered-output surrogate; ships a
  present-and-capable per-actor diff signal without the blocker). [Done: #2490.] This mirrors
  NI's **blessed render-then-diff mechanism** — `PrintToSingleFileHtml` + `vidiff`
  (`resources/labview-cli-operations/vidiff/`, vendored byte-for-byte via #2488 from
  `ni/labview-for-containers`) — which renders each VI then diffs the outputs, side-stepping
  `CreateComparisonReport` (and GSW) entirely.
- **Root-cause thread (true comparison parity)** — the Windows host-native 2026 Q3 cross-check
  (x86 + x64) is **DONE and GREEN**, so the failure is **Linux-host-native-specific**, not an
  OS-independent packed-lib / compare-op-intrinsic defect. The cure is therefore **not**
  repacking `GSW.lvlibp` (it is not corrupt) and **not** a launch-flag change (the
  version-aware launch is proven not to help). Since the Linux **container** path is already
  green, the practical Linux fix is to route GSW-bearing Linux comparisons through the
  container provider, or to replicate the container's edition/launch on Linux host-native;
  the remaining root-cause work is isolating why the Linux host-native GSW LOAD path recurses
  where the container's does not.
