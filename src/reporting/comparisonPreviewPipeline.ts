/**
 * VHS-REQ-699: single-pass comparison-preview pipeline (state machine).
 *
 * When a VI changes in the VS Code Source Control view, a comparison of the two
 * revisions is produced as a single pass over one staged left/right pair, modeled
 * as a linear state machine. Each state has a typed input and a typed output so
 * the pass is fully inspectable (better diagnostics around what each state
 * received and produced):
 *
 *   STAGING        — materialize the left/right VIs into the workspace.
 *                    IDEMPOTENT: re-running with the same inputs is a no-op that
 *                    reports `already-staged` (never a double-stage error).
 *   PREVIEW_LEFT   — render a VI preview of the staged LEFT VI.
 *   PREVIEW_RIGHT  — render a VI preview of the staged RIGHT VI.
 *   VALIDATION     — admit or reject the comparison based on the two preview
 *                    load results (explicit state, not a folded guard).
 *   COMPARISON     — run CreateComparisonReport on the pair (only when admitted).
 *   UNSTAGING      — clean up the staged inputs. IDEMPOTENT and ALWAYS runs
 *                    (finally-style), carrying a diagnostic status
 *                    (`removed` / `already-clean` / `partial` / `failed`) so a
 *                    cleanup problem is surfaced without masking the pass result.
 *
 * The two preview states load each VI with the reliable `PrintToSingleFileHtml`
 * operation before the fragile `CreateComparisonReport` path, so a staged VI that
 * cannot load is caught as a clear per-side preview failure. VALIDATION turns
 * that into a first-class decision: it admits the comparison only when both
 * previews rendered, otherwise it rejects (naming the failing side) and the
 * comparison is skipped — the actionable "this staged VI failed to load" signal.
 *
 *   STAGING ─ok→ PREVIEW_LEFT → PREVIEW_RIGHT → VALIDATION ─admit→ COMPARISON ┐
 *      │                                            │                          │
 *      └─fail→ (previews skipped) ──────────────────┴─reject→ (compare skipped)│
 *                                                                              ▼
 *                             UNSTAGING (always) → COMPLETE (compared) / FAILED
 *
 * Every boundary (stage, per-side preview render, comparison run, unstage, the
 * clock/cycle meter, and the preview cache) is injected so the orchestrator stays
 * pure and deterministically unit-testable without a LabVIEW runtime or a
 * filesystem. A single shared `CycleMeter` measures each executed state so the
 * pass records per-state duration and inter-state latency (pipeline timing).
 * Injected boundaries are expected to classify their own failures into outcomes
 * rather than throw; UNSTAGING is additionally guarded so a cleanup throw can
 * never mask the comparison result. The `previewCache` interface is defined here
 * for a later slice to load previews from cache; this pass does not yet perform
 * cache lookups.
 */

import { CycleMeasurement, CycleMeter, createCycleMeter } from './runtime/cycleMeter';

/**
 * Pipeline states. The pass is a linear state machine over one staged left/right
 * pair. STAGING and UNSTAGING are idempotent filesystem states; PREVIEW_LEFT,
 * PREVIEW_RIGHT and COMPARISON are single LabVIEW invocations (single-cycle timed
 * loops, no retry); VALIDATION is a pure decision state. Two terminals —
 * `COMPLETE` and `FAILED` — carry the failure kind in a reason field.
 */
export type PipelineState =
  | 'STAGING'
  | 'PREVIEW_LEFT'
  | 'PREVIEW_RIGHT'
  | 'VALIDATION'
  | 'COMPARISON'
  | 'UNSTAGING'
  | 'COMPLETE'
  | 'FAILED';

/**
 * The six timed pipeline states (excludes the terminal `COMPLETE`/`FAILED`
 * markers) — the per-state timing/analytics model operates on these only. The
 * `satisfies` clause keeps the state list in sync with the union.
 */
export const TIMED_PIPELINE_STATES = [
  'STAGING',
  'PREVIEW_LEFT',
  'PREVIEW_RIGHT',
  'VALIDATION',
  'COMPARISON',
  'UNSTAGING'
] as const satisfies readonly Exclude<PipelineState, 'COMPLETE' | 'FAILED'>[];
export type TimedPipelineState = (typeof TIMED_PIPELINE_STATES)[number];

/** The LabVIEW cycle states (one external invocation each). */
export type PipelineCycleState = 'PREVIEW_LEFT' | 'PREVIEW_RIGHT' | 'COMPARISON';

/** The staged side a preview iteration renders. */
export type StagedSide = 'left' | 'right';

/** The typed output of STAGING: the on-disk staged VI pair the pass operates on. */
export interface StagedPair {
  /** Absolute path to the staged LEFT (base) VI. */
  leftPath: string;
  /** Absolute path to the staged RIGHT (selected) VI. */
  rightPath: string;
}

/**
 * Outcome of the idempotent STAGING boundary.
 * - `staged`         the pair was freshly materialized.
 * - `already-staged` the pair already existed byte-identical (idempotent re-run).
 * - `failed`         the pair could not be materialized.
 */
export interface StageInputsResult {
  outcome: 'staged' | 'already-staged' | 'failed';
  /** The staged pair (present on `staged` / `already-staged`). */
  staged?: StagedPair;
  /** Classified failure reason when `outcome` is `failed`. */
  failureReason?: string;
}

/** Outcome of a single preview render iteration. */
export interface StagedPreviewRenderResult {
  /** Whether the staged VI loaded and rendered a preview document. */
  rendered: boolean;
  /** Classified failure reason when `rendered` is false. */
  failureReason?: string;
  /** Rendered preview HTML (present on success), for caching/display. */
  html?: string;
}

/** Outcome of the comparison iteration. */
export interface ComparisonRunResult {
  /** Whether the comparison produced a usable report. */
  succeeded: boolean;
  /** Classified failure reason when `succeeded` is false. */
  failureReason?: string;
}

/**
 * Context handed to the idempotent UNSTAGING boundary so cleanup can be informed
 * by how the pass ended (for diagnostics and conditional retention).
 */
export interface UnstageContext {
  /** The staged pair, when STAGING produced one (undefined if staging failed). */
  staged?: StagedPair;
  /** The terminal the pass reached before cleanup. */
  finalState: 'COMPLETE' | 'FAILED';
  /** The pass failure reason, when `finalState` is `FAILED`. */
  failureReason?: string;
}

/**
 * Diagnostic outcome of the idempotent UNSTAGING boundary.
 * - `removed`       staged inputs were cleaned up.
 * - `already-clean` nothing to remove (idempotent re-run / caller-owned cleanup).
 * - `partial`       some inputs were removed, some retained.
 * - `failed`        cleanup could not complete.
 */
export interface UnstageInputsResult {
  status: 'removed' | 'already-clean' | 'partial' | 'failed';
  /** Paths that were removed (diagnostics). */
  removedPaths?: string[];
  /** Paths intentionally or unavoidably retained (diagnostics). */
  retainedPaths?: string[];
  /** Classified failure reason when `status` is `partial` / `failed`. */
  failureReason?: string;
}

/**
 * Content-addressed preview cache. Defined for a later slice that loads previews
 * from cache instead of re-rendering; this pass does not call it yet.
 */
export interface StagedPreviewCache {
  get(cacheKey: string): Promise<StagedPreviewRenderResult | undefined>;
  set(cacheKey: string, value: StagedPreviewRenderResult): Promise<void>;
}

export interface ComparisonPreviewPipelineDeps {
  /**
   * Materializes the left/right staged pair. Idempotent: a repeated call with the
   * same inputs reports `already-staged` instead of failing. Injected so the
   * pipeline is testable without a filesystem.
   */
  stageInputs: () => Promise<StageInputsResult>;
  /**
   * Renders a VI preview of one staged side, given the staged pair STAGING
   * produced. Single-cycle: exactly one LabVIEW invocation, no retry. Injected.
   */
  renderStagedPreview: (side: StagedSide, staged: StagedPair) => Promise<StagedPreviewRenderResult>;
  /**
   * Runs the CreateComparisonReport comparison for the staged pair. Single-cycle;
   * only invoked when VALIDATION admitted the comparison. Injected.
   */
  runComparison: (staged: StagedPair) => Promise<ComparisonRunResult>;
  /**
   * Optional runtime-quiesce boundary invoked once, after VALIDATION admits and
   * before COMPARISON runs. It exists because the two preview renders can leave a
   * runtime instance alive that the COMPARISON cold-launch then contends with
   * (host-native LabVIEW is single-instance per bitness, so a surviving preview
   * instance blocks the compare from owning VI Server port 3363 -> -350000).
   * Injected and OPTIONAL: container runtimes are process-isolated per invocation
   * and inject nothing (no-op); only the host-native runtime injects a real
   * teardown. Never invoked when the comparison is skipped.
   */
  quiesceRuntimeBeforeComparison?: (staged: StagedPair) => Promise<void>;
  /**
   * Cleans up the staged inputs. Idempotent and ALWAYS invoked (finally-style),
   * carrying a diagnostic status. Injected.
   */
  unstageInputs: (context: UnstageContext) => Promise<UnstageInputsResult>;
  /**
   * Optional shared cycle meter measuring every executed state (duration, index,
   * inter-cycle latency). Defaults to a per-pass meter so each result still
   * carries its own duration.
   */
  cycleMeter?: CycleMeter;
  /**
   * Optional preview cache. Reserved for a later slice; not read in this pass.
   */
  previewCache?: StagedPreviewCache;
}

/** Result of the idempotent STAGING state. */
export interface StagingStateResult {
  state: 'STAGING';
  outcome: 'staged' | 'already-staged' | 'failed';
  /** The staged pair this state produced (present unless `failed`). */
  staged?: StagedPair;
  failureReason?: string;
  /** Timing of the staging state. */
  cycle?: CycleMeasurement;
}

/** Per-side preview / comparison outcome shared by the three cycle states. */
export type PipelineCycleOutcome = 'rendered' | 'compared' | 'failed' | 'skipped';

/** Result of one LabVIEW cycle state (PREVIEW_LEFT / PREVIEW_RIGHT / COMPARISON). */
export interface PipelineCycleResult {
  /** The cycle state this result belongs to. */
  state: PipelineCycleState;
  /** The staged side a preview cycle rendered (its input); absent for COMPARISON. */
  input?: StagedSide;
  /**
   * `rendered` / `compared` on success, `failed` on a genuine failure, `skipped`
   * when an earlier state (staging failure or a validation rejection) meant this
   * cycle never ran.
   */
  outcome: PipelineCycleOutcome;
  /** Classified failure reason when the cycle failed or was skipped. */
  failureReason?: string;
  /** Timing of this cycle (absent for a skipped cycle). */
  cycle?: CycleMeasurement;
}

/** Result of the explicit VALIDATION state. */
export interface ValidationStateResult {
  state: 'VALIDATION';
  /** `admitted` when both previews rendered; `rejected` otherwise. */
  outcome: 'admitted' | 'rejected';
  /** The LEFT preview outcome this decision consumed (its input). */
  leftOutcome: 'rendered' | 'failed' | 'skipped';
  /** The RIGHT preview outcome this decision consumed (its input). */
  rightOutcome: 'rendered' | 'failed' | 'skipped';
  /** The side whose preview load failed, when a preview caused the rejection. */
  rejectedSide?: StagedSide;
  /** Classified rejection reason when `outcome` is `rejected`. */
  failureReason?: string;
}

/** Result of the idempotent, always-run UNSTAGING state. */
export interface UnstagingStateResult {
  state: 'UNSTAGING';
  status: 'removed' | 'already-clean' | 'partial' | 'failed';
  removedPaths?: string[];
  retainedPaths?: string[];
  failureReason?: string;
  /** Timing of the unstaging state. */
  cycle?: CycleMeasurement;
}

export interface ComparisonPreviewPipelineResult {
  staging: StagingStateResult;
  previewLeft: PipelineCycleResult;
  previewRight: PipelineCycleResult;
  validation: ValidationStateResult;
  comparison: PipelineCycleResult;
  /** Always present: UNSTAGING runs finally-style on every path. */
  unstaging: UnstagingStateResult;
  /**
   * The terminal state reached: `COMPLETE` when staging succeeded, both previews
   * rendered, VALIDATION admitted, and the comparison compared; `FAILED`
   * otherwise. UNSTAGING status does NOT change the terminal (cleanup is
   * diagnostic-only).
   */
  finalState: 'COMPLETE' | 'FAILED';
  /** Failure kind when `finalState` is `FAILED` (first failing state's reason). */
  failureReason?: string;
}

/** Stable reason surfaced when a staged VI fails its preview-load validation. */
const STAGED_VI_PREVIEW_VALIDATION_FAILED = 'staged-vi-preview-validation-failed';
/** Stable reason surfaced when STAGING did not produce a usable pair. */
const STAGING_FAILED = 'staging-failed';

/** Measures a boundary call, tagging the meter cycle with a caller-chosen label. */
async function measureState<T>(
  meter: CycleMeter,
  run: () => Promise<T>,
  tagOf: (value: T) => string
): Promise<{ value: T; cycle: CycleMeasurement }> {
  const handle = meter.startCycle();
  const value = await run();
  const cycle = handle.complete(tagOf(value));
  return { value, cycle };
}

/** Measures one LabVIEW cycle state and classifies its outcome. */
async function measureCycle<T>(
  meter: CycleMeter,
  state: PipelineCycleState,
  input: StagedSide | undefined,
  run: () => Promise<T>,
  classify: (value: T) => { outcome: 'rendered' | 'compared' | 'failed'; failureReason?: string }
): Promise<PipelineCycleResult> {
  const handle = meter.startCycle();
  const value = await run();
  const { outcome, failureReason } = classify(value);
  const cycle = handle.complete(outcome === 'failed' ? (failureReason ?? 'failed') : outcome);
  return { state, input, outcome, failureReason, cycle };
}

/**
 * Runs the single-pass comparison-preview pipeline as a linear state machine
 * over one staged left/right pair:
 *
 *   STAGING → PREVIEW_LEFT → PREVIEW_RIGHT → VALIDATION → COMPARISON → UNSTAGING
 *
 * STAGING and UNSTAGING are idempotent; UNSTAGING always runs (finally-style) and
 * carries a diagnostic status. VALIDATION is an explicit state that admits the
 * comparison only when both previews rendered, otherwise rejects it (naming the
 * failing side) and the COMPARISON cycle is skipped. Each executed state is timed
 * by the shared cycle meter so inputs and outputs of every state are inspectable.
 */
export async function runComparisonPreviewPipeline(
  deps: ComparisonPreviewPipelineDeps
): Promise<ComparisonPreviewPipelineResult> {
  const meter = deps.cycleMeter ?? createCycleMeter();
  let staged: StagedPair | undefined;

  try {
    // STAGING (idempotent): materialize the pair the whole pass operates on.
    const stagingMeasured = await measureState(
      meter,
      () => deps.stageInputs(),
      (result) => (result.outcome === 'failed' ? (result.failureReason ?? STAGING_FAILED) : result.outcome)
    );
    const stageResult = stagingMeasured.value;
    staged = stageResult.staged;
    const stagingOk = stageResult.outcome !== 'failed' && staged !== undefined;
    const staging: StagingStateResult = {
      state: 'STAGING',
      outcome: stageResult.outcome,
      staged,
      failureReason: stagingOk ? undefined : (stageResult.failureReason ?? STAGING_FAILED),
      cycle: stagingMeasured.cycle
    };

    // PREVIEW_LEFT / PREVIEW_RIGHT: load-validate each staged VI (skipped when
    // staging did not produce a pair).
    let previewLeft: PipelineCycleResult;
    let previewRight: PipelineCycleResult;
    if (stagingOk && staged) {
      const pair = staged;
      previewLeft = await measureCycle(
        meter,
        'PREVIEW_LEFT',
        'left',
        () => deps.renderStagedPreview('left', pair),
        (result) =>
          result.rendered
            ? { outcome: 'rendered' }
            : { outcome: 'failed', failureReason: result.failureReason ?? 'preview-render-failed' }
      );
      previewRight = await measureCycle(
        meter,
        'PREVIEW_RIGHT',
        'right',
        () => deps.renderStagedPreview('right', pair),
        (result) =>
          result.rendered
            ? { outcome: 'rendered' }
            : { outcome: 'failed', failureReason: result.failureReason ?? 'preview-render-failed' }
      );
    } else {
      previewLeft = { state: 'PREVIEW_LEFT', input: 'left', outcome: 'skipped', failureReason: STAGING_FAILED };
      previewRight = { state: 'PREVIEW_RIGHT', input: 'right', outcome: 'skipped', failureReason: STAGING_FAILED };
    }

    // VALIDATION (explicit state): admit the comparison only when both previews
    // rendered; otherwise reject, naming the failing side.
    const leftOutcome = previewLeft.outcome as 'rendered' | 'failed' | 'skipped';
    const rightOutcome = previewRight.outcome as 'rendered' | 'failed' | 'skipped';
    let validation: ValidationStateResult;
    if (!stagingOk) {
      validation = {
        state: 'VALIDATION',
        outcome: 'rejected',
        leftOutcome,
        rightOutcome,
        failureReason: staging.failureReason ?? STAGING_FAILED
      };
    } else if (leftOutcome === 'rendered' && rightOutcome === 'rendered') {
      validation = { state: 'VALIDATION', outcome: 'admitted', leftOutcome, rightOutcome };
    } else {
      const rejectedSide: StagedSide = leftOutcome === 'failed' ? 'left' : 'right';
      validation = {
        state: 'VALIDATION',
        outcome: 'rejected',
        leftOutcome,
        rightOutcome,
        rejectedSide,
        failureReason: STAGED_VI_PREVIEW_VALIDATION_FAILED
      };
    }

    // COMPARISON: only when VALIDATION admitted; otherwise skipped with the
    // rejection reason as the actionable signal.
    let comparison: PipelineCycleResult;
    if (validation.outcome === 'admitted' && staged) {
      const pair = staged;
      // Quiesce the runtime before the compare cold-launches (host-native only;
      // container runtimes inject nothing). Guarded so a teardown throw never
      // masks or aborts the comparison — a failed quiesce simply lets COMPARISON
      // proceed and surface its own genuine outcome.
      if (deps.quiesceRuntimeBeforeComparison) {
        await deps.quiesceRuntimeBeforeComparison(pair).catch(() => undefined);
      }
      comparison = await measureCycle(
        meter,
        'COMPARISON',
        undefined,
        () => deps.runComparison(pair),
        (result) =>
          result.succeeded
            ? { outcome: 'compared' }
            : { outcome: 'failed', failureReason: result.failureReason ?? 'comparison-failed' }
      );
    } else {
      comparison = { state: 'COMPARISON', outcome: 'skipped', failureReason: validation.failureReason };
    }

    const finalState: 'COMPLETE' | 'FAILED' = comparison.outcome === 'compared' ? 'COMPLETE' : 'FAILED';
    const failureReason =
      finalState === 'COMPLETE'
        ? undefined
        : !stagingOk
          ? staging.failureReason
          : validation.outcome === 'rejected'
            ? validation.failureReason
            : comparison.failureReason;

    // UNSTAGING (finally-style, idempotent): always runs; guarded so a cleanup
    // throw becomes a `failed` status rather than masking the comparison result.
    const unstaging = await runUnstaging(meter, deps, { staged, finalState, failureReason });

    return { staging, previewLeft, previewRight, validation, comparison, unstaging, finalState, failureReason };
  } catch (error) {
    // Safety net: a boundary threw instead of returning an outcome. Still attempt
    // idempotent cleanup (its result is discarded) before rethrowing so staged
    // inputs are not leaked.
    await deps
      .unstageInputs({ staged, finalState: 'FAILED', failureReason: 'pipeline-error' })
      .catch(() => undefined);
    throw error;
  }
}

/** Runs the idempotent UNSTAGING state, converting a cleanup throw to `failed`. */
async function runUnstaging(
  meter: CycleMeter,
  deps: ComparisonPreviewPipelineDeps,
  context: UnstageContext
): Promise<UnstagingStateResult> {
  const handle = meter.startCycle();
  try {
    const result = await deps.unstageInputs(context);
    const cycle = handle.complete(result.status);
    return {
      state: 'UNSTAGING',
      status: result.status,
      removedPaths: result.removedPaths,
      retainedPaths: result.retainedPaths,
      failureReason: result.failureReason,
      cycle
    };
  } catch (error) {
    const cycle = handle.complete('failed');
    return {
      state: 'UNSTAGING',
      status: 'failed',
      failureReason: error instanceof Error ? error.message : String(error),
      cycle
    };
  }
}
