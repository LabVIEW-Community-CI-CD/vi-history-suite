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

**Decisive implication (refined by the 2026-07-27 root-cause experiment):** the GSW
recursive LEIF load is the **surface** of a failed VI dependency load, not an intrinsic
`GSW.lvlibp` defect. `CreateComparisonReport` spawns a headless LabVIEW that **loads** each
staged revision; when the shipped staging drops a revision's dependencies from their
commit-correct paths, the load fails and Linux host-native LabVIEW surfaces it as the GSW
self-recursion. It reproduces with **any** staged compare (both `lv_icon.vi` and the
SerialPortNuggets golden fixture) and **greens** when each revision's dependencies are
present at their commit-correct paths — so the trigger is **staging dependency-fidelity**,
not the fixture graph and not the packed library. This reorients the hypotheses below.

## Empirical result (2026-07-27) — root cause proven

The Linux plane ran the checklist on native **Community** LabVIEW 2026-64, the WIN plane
cross-checked on Windows host-native LabVIEW 2026 Q3 (both bitnesses), and a decisive
**single-variable staging experiment** isolated the root cause. The runs **resolve** 706:
the render path is sound headless; a fully version-aware `-Headless` host-native compare
**still** recursive-loads GSW (the launch mechanism is not the cure, **H2 refuted**); the
same compare runs **GREEN** on Windows host-native both bitnesses (the packed lib is not
corrupt, **H4 refuted**); and the single-variable experiment proves the trigger is the
**shipped staging dropping each revision's dependencies from their commit-correct paths** —
a **staging dependency-fidelity bug** (fixable, with a proven green), not an OS/cell-intrinsic
limitation (see the conclusion):

| Run | Operation | Config | Result |
| --- | --- | --- | --- |
| A | `PrintToSingleFileHtml` (SerialPortNuggets `Verify Checksum.vi`) | no `-Headless`, no `EnableCICDFeaturesForLabVIEW` | **exit 0**, 7 PNGs, no GSW/LEIF recursion |
| C | `PrintToSingleFileHtml` (same VI) | **with `-Headless`** | **exit 0**, 7 PNGs, no GSW/LEIF recursion |
| #2480 | `PrintToSingleFileHtml` (`lv_icon.vi`) | host-native | **exit 0**, 638 PNGs |
| #2472 | **`CreateComparisonReport`** (`lv_icon.vi`) | same box / CLI / plain `labview` | **linux-headless-recursive-load** (GSW self-recursion), exit 157, ~1583 ms at launch |
| **Retest** | **`CreateComparisonReport`** (`lv_icon.vi`, HEAD~1→HEAD) | shipped runtime, build 1.36.1+0cc9a58, **version-aware `-Headless -LabVIEWPath …/LabVIEW-2026-64/labview -PortNumber 3363`** | **linux-headless-recursive-load** (SAME GSW self-recursion, identical uuids), exit 157, durationMs 623 |
| **Win x64** | **`CreateComparisonReport`** (`lv_icon.vi`, 5376833→fc09736) | **Windows host-native LabVIEW 2026 Q3 x64**, shipped runtime at develop HEAD | **exit 0**, `runtimeState=succeeded`, real 1,241,031-byte report, **NO GSW recursion** |
| **Win x86** | **`CreateComparisonReport`** (`lv_icon.vi`, 5376833→fc09736) | **Windows host-native LabVIEW 2026 Q3 x86**, shipped runtime at develop HEAD | **exit 0**, `runtimeState=succeeded`, identical 1,241,031-byte report, **NO GSW recursion** |
| **Root-cause RED** | **`CreateComparisonReport`** (SerialPortNuggets `ASCII Intermittent.vi`, HEAD~1→HEAD) | **Linux host-native** Community `labview -Headless`, **shipped single-tree staging** (deps NOT at commit-correct paths) | **exit 157**, GSW recursive LEIF load — reproduced |
| **Root-cause GREEN** | **`CreateComparisonReport`** (same VI, same revisions) | **Linux host-native** Community `labview -Headless`, **each revision in its own full git worktree** (deps AT commit-correct paths), target VI renamed `left-*`/`right-*` | **exit 0**, real 740 KB report, **94 diff blocks**, **NO GSW** |

**Conclusion — 706 is a shipped-staging dependency-fidelity bug (fixable, with a proven
green), not an OS/cell-intrinsic limitation.** A single-variable experiment holding
everything constant except dependency placement proves the trigger: same VI (SerialPortNuggets
`ASCII Intermittent.vi`), same cross-revision HEAD~1→HEAD, same Community `labview` binary,
same `-Headless`, Linux host-native both runs. **RED** — the shipped single-tree staging
(`materializeSelectedRevisionTreeWithGit`: one tree at the selected rev + both renamed
left/right VIs, deps NOT at commit-correct paths) recursive-loads GSW (exit 157). **GREEN** —
each revision checked out in its OWN full git worktree (deps AT their commit-correct paths),
target VI copied to `left-*`/`right-*`, exits 0 with a real 740 KB report, 94 diff blocks, and
NO GSW. The ONLY variable between RED and GREEN is whether each revision's VI has its
dependencies at the paths they were at that commit. `CreateComparisonReport` spawns a headless
LabVIEW that **loads** each staged VI; with deps missing from their commit-correct paths the
load fails and surfaces as the GSW recursive LEIF load. **Linux host-native LabVIEW is uniquely
intolerant** of that broken load, while **Windows host-native (both bitnesses)** and the
**Linux container** tolerate it — which reconciles the whole matrix. The render path is
independently sound (a real VI renders headlessly in every tested config via
`PrintToSingleFileHtml`, no GSW), so rendering is not implicated.

This resolves the SRS environment-vs-intrinsic question: 706 is **neither** a blanket
Linux-environment failure **nor** an intrinsic empty→rich asymmetry — it is a
**staging-fidelity** defect introduced by the shipped comparison staging, exposed by the
Linux host-native loader's low tolerance for the resulting broken load.

What the evidence **establishes**:
- **H1 (suppress GSW at generic launch) is not the lever** — the render at the same launch
  never loads GSW; GSW is pulled by the *failing dependency load*, not by generic launch.
- **H2 (version-aware `-Headless` host-native launch as the CURE) is REFUTED** — the retest
  issued a fully version-aware `-Headless -LabVIEWPath -PortNumber` compare and it still
  recursive-loaded GSW, so the launch mechanism is not the trigger (contrast the container
  #565/ADR-0004 case, where a wrong-version `-Headless` *was* the cause).
- **H4 (packed `GSW.lvlibp` integrity) is REFUTED** — the same compare runs GREEN on Windows
  host-native LabVIEW 2026 Q3 (both x86 and x64, real 1.24 MB reports) **and** greens on Linux
  host-native itself when deps are commit-correct, so the packed library is sound; the GSW
  recursion is a load-failure surface, not corruption.
- **Edition is not the discriminator** — per the maintainer, `labviewprofull` ==
  `labviewcommunity` in capabilities; the same golden VI reds staged and greens deps-correct
  on the same Community binary.
- **Fixture is not the discriminator** — the RED/GREEN flip reproduces on the SerialPortNuggets
  golden fixture and the signature also appears on `lv_icon.vi`; the variable is staging, not
  the fixture graph.
- **Linux host-native is not incapable** — `CreateComparisonReport` GREENS on a real
  cross-revision diff on Linux host-native when deps are commit-correct.

**Root fix (runtime owner).** The comparison staging must materialize **each revision's full
dependency closure at its commit-correct paths** (a git worktree per side, renaming only the
target VI) instead of one tree at the selected rev + both renamed VIs. This is exactly what the
render-diff producer (#2490) already does per revision — and why render-diff works host-native
on Linux. Routing Linux comparisons through the container provider remains a valid
**workaround**, but the staging fix makes Linux host-native itself green.

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
> since PROVEN the root cause via a single-variable staging experiment (plus the host-native
> retest and the Windows both-bitness cross-check): the render path is sound (H1's
> suppress-GSW-at-launch is not the lever), **H2 (launch mechanism / version-flag) is REFUTED
> as the cure** (a version-aware `-Headless` host-native compare still recurses), and **H4
> (packed-lib integrity) is REFUTED** (the same compare greens on Windows host-native both
> bitnesses AND on Linux host-native when deps are commit-correct). The actual root cause is a
> **shipped-staging dependency-fidelity bug** — the single-tree staging drops each revision's
> deps from their commit-correct paths, and Linux host-native LabVIEW is uniquely intolerant of
> the resulting broken load. Retained as the record of how the reproduction was scoped.

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

### H4 — Packed `GSW.lvlibp` integrity / build mismatch — REFUTED
The packed-lib self-recursion was hypothesized to be a corrupt or version-mismatched
`GSW.lvlibp`. **Refuted:** the same packed lib loads and compares cleanly on Windows
host-native LabVIEW 2026 Q3 (both bitnesses) **and** on Linux host-native itself when each
revision's dependencies are at their commit-correct paths (the single-variable GREEN). The
GSW recursion is the **surface of a failed dependency load**, not corruption — see the proven
root cause (staging dependency-fidelity) in the conclusion.

### Refuted by the on-box baseline (do NOT spend cycles here)
- **Fixture-specific GSW dependency** — the recursion is a dependency-load failure surfaced
  as GSW, not a fixture-graph cycle: the RED/GREEN flip reproduces on the SerialPortNuggets
  golden fixture (and the signature also appears on `lv_icon.vi`), with staging fidelity the
  only variable.
- **Intrinsic empty→rich asymmetry as the proximate cause** — the failure is at launch
  (`durationMs 623`–`1583`), before comparison content is enumerated, so empty→rich content
  is not the trigger. (The SRS environment-vs-intrinsic question resolves to a **staging
  dependency-fidelity** bug — neither an environment-intrinsic nor a content-intrinsic
  failure.)

## Scoped reproduction checklist (for the native-runtime plane)

> Historical scoping record — the root cause is now **proven** (staging dependency-fidelity;
> see the Outcome). Items retained for provenance; H1/H3/H4 steps are moot now that the
> single-variable experiment isolated the cause.

1. **Confirm the invocation** (H2): from the captured baseline, record the exact
   LabVIEWCLI executable / `-Headless` flag / `EnableCICDFeaturesForLabVIEW` /
   version / bitness. Cheapest signal first.
2. **GSW-suppression attempt** (H1): locate + set a GSW/Getting-Started skip
   (`.ini` token / launch arg / env), rerun; proceeding ⇒ the fix.
3. **`xvfb` / displayed rerun** (H3): proceeding ⇒ headless-no-display artifact.
4. **Windows host-native headless cross-check** — **DONE, GREEN (both bitnesses).**
   `CreateComparisonReport` on `lv_icon.vi` (5376833→fc09736) succeeded on Windows
   host-native LabVIEW 2026 Q3 x64 and x86 (real 1.24 MB reports, no GSW recursion) ⇒ the
   packed lib is sound and the failure is not OS-independent; combined with the Linux
   deps-correct GREEN, the cause is **staging dependency-fidelity**, not a packed-lib issue.
5. **`GSW.lvlibp` integrity** (H4): compare/repair the packed lib if H1–H3 do not
   resolve it.
6. Record each result as honest ledger evidence (present-but-blocked, per the
   decoupled producer pattern) so the spike's conclusion is reproducible.

## Outcome (root cause proven 2026-07-27)

See **Empirical result** above. Net: 706 is a **shipped-staging dependency-fidelity bug**. A
single-variable experiment (same VI, same cross-revision, same Community `labview`, same
`-Headless`, Linux host-native) flipped RED→GREEN on the one variable of whether each
revision's dependencies sit at their commit-correct paths: the shipped single-tree staging
(deps displaced) recursive-loads GSW (exit 157); each revision in its own full git worktree
(deps commit-correct) exits 0 with a real 740 KB / 94-diff report and no GSW. The host-native
retest reproduced the recursion with a fully version-aware `-Headless` launch (**H2 refuted as
the cure**), and the Windows host-native 2026 Q3 cross-check ran the same compare GREEN on both
bitnesses while Linux host-native also greens deps-correct (**H4 refuted** — the packed
`GSW.lvlibp` is sound). Edition is not the cause (`labviewprofull` == `labviewcommunity`), nor
the fixture, nor is Linux host-native intrinsically incapable. `CreateComparisonReport` spawns
a headless LabVIEW that loads each staged VI; when deps are displaced the load fails and Linux
host-native LabVIEW is uniquely intolerant of it (surfacing GSW recursion), while Windows
host-native and the Linux container tolerate the same broken load. Forward paths:
- **Unblock #2315 now** — build the decoupled Linux diff from per-revision
  `PrintToSingleFileHtml` renders + a structural diff (rendered-output surrogate; ships a
  present-and-capable per-actor diff signal without the blocker). [Done: #2490.] This mirrors
  NI's **blessed render-then-diff mechanism** — `PrintToSingleFileHtml` + `vidiff`
  (`resources/labview-cli-operations/vidiff/`, vendored byte-for-byte via #2488 from
  `ni/labview-for-containers`) — which renders each VI then diffs the outputs, side-stepping
  `CreateComparisonReport` (and GSW) entirely.
- **Root fix (runtime owner)** — the comparison staging (`materializeSelectedRevisionTreeWithGit`
  → one tree at the selected rev + both renamed VIs) must instead materialize **each revision's
  full dependency closure at its commit-correct paths** (a git worktree per side, renaming only
  the target VI) — exactly what render-diff (#2490) already does per revision, and why it works
  host-native on Linux. Routing GSW-bearing Linux comparisons through the container provider
  remains a valid **workaround**, but the staging fix makes Linux host-native itself green.
