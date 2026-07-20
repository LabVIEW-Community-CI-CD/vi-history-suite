/**
 * VHS-REQ-699: single-pass comparison-preview pipeline (state machine).
 *
 * A comparison of two staged VI revisions is produced as a single pass over one
 * staged left/right pair, modeled as a linear state machine. The three cycle
 * states are each a single-cycle timed loop (exactly one LabVIEW invocation, no
 * retry) that pipeline together:
 *
 *   PREVIEW_LEFT   — render a VI preview of the staged LEFT VI.
 *   PREVIEW_RIGHT  — render a VI preview of the staged RIGHT VI.
 *   COMPARISON     — run CreateComparisonReport on the pair.
 *
 * The two preview cycle states double as a load-validation gate: the preview
 * operation (`PrintToSingleFileHtml`) loads a VI headless far more reliably than
 * the fragile `CreateComparisonReport` path, so a staged VI that cannot load is
 * caught as a clear per-side preview failure BEFORE the compare. The gate is
 * folded into the `PREVIEW_RIGHT` → `COMPARISON` transition (a guard, not a
 * state): when either preview cycle fails to render, the comparison cycle is
 * short-circuited (skipped) and the pass reaches the `FAILED` terminal — turning
 * a confusing compare failure into an actionable "this staged VI failed to load"
 * signal. A clean pass reaches the `COMPLETE` terminal. (`STAGING` is the
 * caller's filesystem setup and is not driven by this orchestrator.)
 *
 * Every boundary (the per-side preview renderer, the comparison runner, the
 * clock/cycle meter, and the preview cache) is injected so the orchestrator stays
 * pure and deterministically unit-testable without a LabVIEW runtime. A single
 * shared `CycleMeter` measures each cycle state so the pass records per-cycle
 * duration and inter-cycle latency (pipeline timing). The `previewCache`
 * interface is defined here for a later slice to load previews from cache; this
 * pass does not yet perform cache lookups.
 */

import { CycleMeasurement, CycleMeter, createCycleMeter } from './runtime/cycleMeter';

/**
 * Pipeline states. The pass is a linear state machine over one staged left/right
 * pair; each cycle state is a single LabVIEW invocation (single-cycle timed loop,
 * no retry). `STAGING` is filesystem setup (not a LabVIEW cycle). The validation
 * gate is folded into the `PREVIEW_RIGHT` → `COMPARISON` transition (a guard, not
 * a state): `COMPARISON` is entered only when both preview cycles loaded their
 * staged VI. Two terminals — `COMPLETE` and `FAILED` — carry the failure kind in
 * a reason field.
 *
 *   STAGING → PREVIEW_LEFT → PREVIEW_RIGHT ─[both loaded]→ COMPARISON → COMPLETE
 *      │           │              │         └─[either failed]────────────┐
 *      └─(stage fail)─────────────┴───────────────────────────────────→ FAILED
 */
export type PipelineState =
  | 'STAGING'
  | 'PREVIEW_LEFT'
  | 'PREVIEW_RIGHT'
  | 'COMPARISON'
  | 'COMPLETE'
  | 'FAILED';

/** The cycle states (one LabVIEW invocation each). */
export type PipelineCycleState = 'PREVIEW_LEFT' | 'PREVIEW_RIGHT' | 'COMPARISON';

/** The staged side a preview iteration renders. */
export type StagedSide = 'left' | 'right';


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
 * Content-addressed preview cache. Defined for a later slice that loads previews
 * from cache instead of re-rendering; this pass does not call it yet.
 */
export interface StagedPreviewCache {
  get(cacheKey: string): Promise<StagedPreviewRenderResult | undefined>;
  set(cacheKey: string, value: StagedPreviewRenderResult): Promise<void>;
}

export interface ComparisonPreviewPipelineDeps {
  /**
   * Renders a VI preview of one staged side. Single-cycle: exactly one LabVIEW
   * invocation, no retry. Injected so the pipeline is testable without LabVIEW.
   */
  renderStagedPreview: (side: StagedSide) => Promise<StagedPreviewRenderResult>;
  /**
   * Runs the CreateComparisonReport comparison for the staged pair. Single-cycle;
   * only invoked when both preview iterations rendered. Injected.
   */
  runComparison: () => Promise<ComparisonRunResult>;
  /**
   * Optional shared cycle meter measuring all three iterations (duration, index,
   * inter-cycle latency). Defaults to a per-pass meter so each result still
   * carries its own cycle duration.
   */
  cycleMeter?: CycleMeter;
  /**
   * Optional preview cache. Reserved for a later slice; not read in this pass.
   */
  previewCache?: StagedPreviewCache;
}

/** Result of one pipeline cycle state. */
export interface PipelineCycleResult {
  /** The cycle state this result belongs to. */
  state: PipelineCycleState;
  /**
   * `rendered` / `compared` on success, `failed` on a genuine failure, `skipped`
   * when the folded validation gate short-circuited the comparison.
   */
  outcome: 'rendered' | 'compared' | 'failed' | 'skipped';
  /** Classified failure reason when the cycle failed. */
  failureReason?: string;
  /** Timing of this cycle (absent for a skipped cycle). */
  cycle?: CycleMeasurement;
}

export interface ComparisonPreviewPipelineResult {
  previewLeft: PipelineCycleResult;
  previewRight: PipelineCycleResult;
  comparison: PipelineCycleResult;
  /**
   * The terminal state reached: `COMPLETE` when both previews rendered and the
   * comparison cycle ran; `FAILED` when a preview failed to load (validation gate
   * short-circuited the comparison) or the comparison cycle failed.
   */
  finalState: 'COMPLETE' | 'FAILED';
  /** Failure kind when `finalState` is `FAILED`. */
  failureReason?: string;
}

async function measureCycle<T>(
  meter: CycleMeter,
  state: PipelineCycleState,
  run: () => Promise<T>,
  classify: (value: T) => { outcome: 'rendered' | 'compared' | 'failed'; failureReason?: string }
): Promise<PipelineCycleResult> {
  const handle = meter.startCycle();
  const value = await run();
  const { outcome, failureReason } = classify(value);
  const cycle = handle.complete(outcome === 'failed' ? (failureReason ?? 'failed') : outcome);
  return { state, outcome, failureReason, cycle };
}

/**
 * Runs the single-pass comparison-preview pipeline as a linear state machine:
 * PREVIEW_LEFT → PREVIEW_RIGHT ─[both loaded]→ COMPARISON → COMPLETE, folding the
 * validation gate into the PREVIEW_RIGHT → COMPARISON transition so a staged VI
 * that fails its preview load short-circuits (skips) the fragile
 * CreateComparisonReport cycle and the pass ends in FAILED. Each cycle state is a
 * single-cycle timed loop measured by the shared cycle meter. (STAGING is the
 * caller's filesystem setup and is not driven here.)
 */
export async function runComparisonPreviewPipeline(
  deps: ComparisonPreviewPipelineDeps
): Promise<ComparisonPreviewPipelineResult> {
  const meter = deps.cycleMeter ?? createCycleMeter();

  const previewLeft = await measureCycle(
    meter,
    'PREVIEW_LEFT',
    () => deps.renderStagedPreview('left'),
    (result) =>
      result.rendered
        ? { outcome: 'rendered' }
        : { outcome: 'failed', failureReason: result.failureReason ?? 'preview-render-failed' }
  );

  const previewRight = await measureCycle(
    meter,
    'PREVIEW_RIGHT',
    () => deps.renderStagedPreview('right'),
    (result) =>
      result.rendered
        ? { outcome: 'rendered' }
        : { outcome: 'failed', failureReason: result.failureReason ?? 'preview-render-failed' }
  );

  // Validation gate (folded into the PREVIEW_RIGHT → COMPARISON transition): a
  // staged VI that could not render a preview will not compare either, so skip
  // the fragile CreateComparisonReport cycle and end in FAILED with the load
  // failure as the actionable signal.
  if (previewLeft.outcome === 'failed' || previewRight.outcome === 'failed') {
    return {
      previewLeft,
      previewRight,
      comparison: {
        state: 'COMPARISON',
        outcome: 'skipped',
        failureReason: 'staged-vi-preview-validation-failed'
      },
      finalState: 'FAILED',
      failureReason: 'staged-vi-preview-validation-failed'
    };
  }

  const comparison = await measureCycle(
    meter,
    'COMPARISON',
    () => deps.runComparison(),
    (result) =>
      result.succeeded
        ? { outcome: 'compared' }
        : { outcome: 'failed', failureReason: result.failureReason ?? 'comparison-failed' }
  );

  return {
    previewLeft,
    previewRight,
    comparison,
    finalState: comparison.outcome === 'compared' ? 'COMPLETE' : 'FAILED',
    failureReason: comparison.outcome === 'compared' ? undefined : comparison.failureReason
  };
}
