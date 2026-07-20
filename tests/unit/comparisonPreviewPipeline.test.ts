import { describe, expect, it, vi } from 'vitest';

import {
  runComparisonPreviewPipeline,
  type ComparisonPreviewPipelineDeps,
  type StagedPair
} from '../../src/reporting/comparisonPreviewPipeline';
import { createCycleMeter } from '../../src/reporting/runtime/cycleMeter';

const PAIR: StagedPair = { leftPath: '/staged/left.vi', rightPath: '/staged/right.vi' };

function deps(overrides: Partial<ComparisonPreviewPipelineDeps> = {}): ComparisonPreviewPipelineDeps {
  return {
    stageInputs: vi.fn(async () => ({ outcome: 'already-staged', staged: PAIR })),
    renderStagedPreview: vi.fn(async () => ({ rendered: true, html: '<html></html>' })),
    runComparison: vi.fn(async () => ({ succeeded: true })),
    unstageInputs: vi.fn(async () => ({ status: 'already-clean', retainedPaths: [PAIR.leftPath, PAIR.rightPath] })),
    ...overrides
  };
}

describe('runComparisonPreviewPipeline (VHS-REQ-699.1)', () => {
  it('runs staging, preview-left, preview-right, validation, comparison, then unstaging in one pass', async () => {
    const order: string[] = [];
    const stageInputs = vi.fn(async () => {
      order.push('staging');
      return { outcome: 'staged' as const, staged: PAIR };
    });
    const renderStagedPreview = vi.fn(async (side: 'left' | 'right', staged: StagedPair) => {
      order.push(`preview-${side}`);
      // Each preview receives the staged pair produced by STAGING (typed input).
      expect(staged).toEqual(PAIR);
      return { rendered: true, html: `<${side}>` };
    });
    const runComparison = vi.fn(async (staged: StagedPair) => {
      order.push('comparison');
      expect(staged).toEqual(PAIR);
      return { succeeded: true };
    });
    const unstageInputs = vi.fn(async () => {
      order.push('unstaging');
      return { status: 'removed' as const, removedPaths: [PAIR.leftPath, PAIR.rightPath] };
    });

    const result = await runComparisonPreviewPipeline(
      deps({ stageInputs, renderStagedPreview, runComparison, unstageInputs })
    );

    expect(order).toEqual(['staging', 'preview-left', 'preview-right', 'comparison', 'unstaging']);
    expect(result.staging.state).toBe('STAGING');
    expect(result.staging.outcome).toBe('staged');
    expect(result.staging.staged).toEqual(PAIR);
    expect(result.previewLeft.state).toBe('PREVIEW_LEFT');
    expect(result.previewLeft.input).toBe('left');
    expect(result.previewLeft.outcome).toBe('rendered');
    expect(result.previewRight.input).toBe('right');
    expect(result.validation.state).toBe('VALIDATION');
    expect(result.validation.outcome).toBe('admitted');
    expect(result.validation.leftOutcome).toBe('rendered');
    expect(result.validation.rightOutcome).toBe('rendered');
    expect(result.comparison.state).toBe('COMPARISON');
    expect(result.comparison.outcome).toBe('compared');
    expect(result.unstaging.state).toBe('UNSTAGING');
    expect(result.unstaging.status).toBe('removed');
    expect(result.finalState).toBe('COMPLETE');
  });

  it('treats an idempotent already-staged re-run as a valid staging outcome (VHS-REQ-699.5)', async () => {
    const result = await runComparisonPreviewPipeline(deps());
    expect(result.staging.outcome).toBe('already-staged');
    expect(result.finalState).toBe('COMPLETE');
  });

  it('rejects at VALIDATION and skips the comparison when the left preview fails (VHS-REQ-699.2)', async () => {
    const renderStagedPreview = vi.fn(async (side: 'left' | 'right') =>
      side === 'left'
        ? { rendered: false, failureReason: 'labview-preview-operation-load-failed' }
        : { rendered: true, html: '<right>' }
    );
    const runComparison = vi.fn(async () => ({ succeeded: true }));

    const result = await runComparisonPreviewPipeline(deps({ renderStagedPreview, runComparison }));

    expect(result.previewLeft.outcome).toBe('failed');
    expect(result.previewLeft.failureReason).toBe('labview-preview-operation-load-failed');
    expect(result.validation.outcome).toBe('rejected');
    expect(result.validation.rejectedSide).toBe('left');
    expect(result.comparison.outcome).toBe('skipped');
    expect(result.comparison.failureReason).toBe('staged-vi-preview-validation-failed');
    expect(result.finalState).toBe('FAILED');
    expect(result.failureReason).toBe('staged-vi-preview-validation-failed');
    // The fragile comparison is never invoked when a preview validation fails.
    expect(runComparison).not.toHaveBeenCalled();
  });

  it('rejects at VALIDATION and names the right side when the right preview fails (VHS-REQ-699.2)', async () => {
    const renderStagedPreview = vi.fn(async (side: 'left' | 'right') =>
      side === 'right'
        ? { rendered: false, failureReason: 'preview-output-not-produced' }
        : { rendered: true, html: '<left>' }
    );
    const runComparison = vi.fn(async () => ({ succeeded: true }));

    const result = await runComparisonPreviewPipeline(deps({ renderStagedPreview, runComparison }));

    expect(result.previewLeft.outcome).toBe('rendered');
    expect(result.previewRight.outcome).toBe('failed');
    expect(result.validation.outcome).toBe('rejected');
    expect(result.validation.rejectedSide).toBe('right');
    expect(result.comparison.outcome).toBe('skipped');
    expect(result.finalState).toBe('FAILED');
    expect(runComparison).not.toHaveBeenCalled();
  });

  it('fails closed at STAGING, skipping previews and the comparison (VHS-REQ-699.5)', async () => {
    const stageInputs = vi.fn(async () => ({ outcome: 'failed' as const, failureReason: 'left-staged-input-missing' }));
    const renderStagedPreview = vi.fn(async () => ({ rendered: true }));
    const runComparison = vi.fn(async () => ({ succeeded: true }));
    const unstageInputs = vi.fn(async () => ({ status: 'already-clean' as const }));

    const result = await runComparisonPreviewPipeline(
      deps({ stageInputs, renderStagedPreview, runComparison, unstageInputs })
    );

    expect(result.staging.outcome).toBe('failed');
    expect(result.staging.failureReason).toBe('left-staged-input-missing');
    expect(result.previewLeft.outcome).toBe('skipped');
    expect(result.previewRight.outcome).toBe('skipped');
    expect(result.validation.outcome).toBe('rejected');
    expect(result.comparison.outcome).toBe('skipped');
    expect(result.finalState).toBe('FAILED');
    expect(result.failureReason).toBe('left-staged-input-missing');
    expect(renderStagedPreview).not.toHaveBeenCalled();
    expect(runComparison).not.toHaveBeenCalled();
    // UNSTAGING still runs (finally-style) even when staging failed.
    expect(unstageInputs).toHaveBeenCalledTimes(1);
    expect(result.unstaging.status).toBe('already-clean');
  });

  it('surfaces a genuine comparison failure after both previews render (VHS-REQ-699.1)', async () => {
    const runComparison = vi.fn(async () => ({
      succeeded: false,
      failureReason: 'command-exited-nonzero'
    }));

    const result = await runComparisonPreviewPipeline(deps({ runComparison }));

    expect(result.validation.outcome).toBe('admitted');
    expect(result.comparison.outcome).toBe('failed');
    expect(result.comparison.failureReason).toBe('command-exited-nonzero');
    expect(result.finalState).toBe('FAILED');
    expect(result.failureReason).toBe('command-exited-nonzero');
  });

  it('always runs UNSTAGING with its diagnostic status, even on a genuine comparison failure (VHS-REQ-699.6)', async () => {
    const runComparison = vi.fn(async () => ({ succeeded: false, failureReason: 'command-exited-nonzero' }));
    const unstageInputs = vi.fn(async (context) => {
      // UNSTAGING receives how the pass ended so cleanup can be informed.
      expect(context.finalState).toBe('FAILED');
      expect(context.failureReason).toBe('command-exited-nonzero');
      expect(context.staged).toEqual(PAIR);
      return {
        status: 'partial' as const,
        removedPaths: [PAIR.leftPath],
        retainedPaths: [PAIR.rightPath],
        failureReason: 'right-retained'
      };
    });

    const result = await runComparisonPreviewPipeline(deps({ runComparison, unstageInputs }));

    expect(result.finalState).toBe('FAILED');
    expect(result.unstaging.status).toBe('partial');
    expect(result.unstaging.removedPaths).toEqual([PAIR.leftPath]);
    expect(result.unstaging.retainedPaths).toEqual([PAIR.rightPath]);
    expect(result.unstaging.failureReason).toBe('right-retained');
  });

  it('converts an UNSTAGING throw into a failed status without masking the comparison result (VHS-REQ-699.6)', async () => {
    const unstageInputs = vi.fn(async () => {
      throw new Error('cleanup boom');
    });

    const result = await runComparisonPreviewPipeline(deps({ unstageInputs }));

    // The comparison succeeded; the cleanup throw is diagnostic-only.
    expect(result.finalState).toBe('COMPLETE');
    expect(result.unstaging.status).toBe('failed');
    expect(result.unstaging.failureReason).toBe('cleanup boom');
  });

  it('quiesces the runtime once after VALIDATION admits and before COMPARISON runs (VHS-REQ-699.10)', async () => {
    const order: string[] = [];
    const renderStagedPreview = vi.fn(async (side: 'left' | 'right') => {
      order.push(`preview-${side}`);
      return { rendered: true, html: `<${side}>` };
    });
    const quiesceRuntimeBeforeComparison = vi.fn(async (staged: StagedPair) => {
      order.push('quiesce');
      expect(staged).toEqual(PAIR);
    });
    const runComparison = vi.fn(async () => {
      order.push('comparison');
      return { succeeded: true };
    });

    const result = await runComparisonPreviewPipeline(
      deps({ renderStagedPreview, quiesceRuntimeBeforeComparison, runComparison })
    );

    // Quiesce runs exactly once, strictly between the last preview and the compare.
    expect(order).toEqual(['preview-left', 'preview-right', 'quiesce', 'comparison']);
    expect(quiesceRuntimeBeforeComparison).toHaveBeenCalledTimes(1);
    expect(result.comparison.outcome).toBe('compared');
  });

  it('never quiesces the runtime when VALIDATION rejects and the comparison is skipped (VHS-REQ-699.10)', async () => {
    const renderStagedPreview = vi.fn(async (side: 'left' | 'right') =>
      side === 'left'
        ? { rendered: false, failureReason: 'labview-preview-operation-load-failed' }
        : { rendered: true, html: '<right>' }
    );
    const quiesceRuntimeBeforeComparison = vi.fn(async () => undefined);
    const runComparison = vi.fn(async () => ({ succeeded: true }));

    const result = await runComparisonPreviewPipeline(
      deps({ renderStagedPreview, quiesceRuntimeBeforeComparison, runComparison })
    );

    expect(result.comparison.outcome).toBe('skipped');
    // No compare => no quiesce; the teardown boundary is compare-scoped.
    expect(quiesceRuntimeBeforeComparison).not.toHaveBeenCalled();
    expect(runComparison).not.toHaveBeenCalled();
  });

  it('lets COMPARISON proceed when the quiesce boundary throws, never masking the compare outcome (VHS-REQ-699.10)', async () => {
    const quiesceRuntimeBeforeComparison = vi.fn(async () => {
      throw new Error('taskkill boom');
    });
    const runComparison = vi.fn(async () => ({ succeeded: true }));

    const result = await runComparisonPreviewPipeline(
      deps({ quiesceRuntimeBeforeComparison, runComparison })
    );

    // A failed teardown is swallowed; the comparison still runs and reports itself.
    expect(quiesceRuntimeBeforeComparison).toHaveBeenCalledTimes(1);
    expect(runComparison).toHaveBeenCalledTimes(1);
    expect(result.comparison.outcome).toBe('compared');
    expect(result.finalState).toBe('COMPLETE');
  });

  it('meters every executed state with the shared cycle meter, recording inter-state latency (VHS-REQ-699.3)', async () => {
    // Deterministic clock: each state spans 10ms with 5ms gaps between them.
    // staging 0-10, preview-left 15-25, preview-right 30-40, comparison 45-55, unstaging 60-70.
    const times = [0, 10, 15, 25, 30, 40, 45, 55, 60, 70];
    let index = 0;
    const cycleMeter = createCycleMeter(() => times[index++]);

    const result = await runComparisonPreviewPipeline(deps({ cycleMeter }));

    expect(result.staging.cycle?.cycleIndex).toBe(1);
    expect(result.staging.cycle?.durationMs).toBe(10);
    expect(result.staging.cycle?.interCycleGapMs).toBeUndefined();

    expect(result.previewLeft.cycle?.cycleIndex).toBe(2);
    expect(result.previewLeft.cycle?.interCycleGapMs).toBe(5);
    expect(result.previewRight.cycle?.cycleIndex).toBe(3);
    expect(result.comparison.cycle?.cycleIndex).toBe(4);
    expect(result.unstaging.cycle?.cycleIndex).toBe(5);
    expect(result.unstaging.cycle?.interCycleGapMs).toBe(5);
    expect(cycleMeter.completedCycleCount).toBe(5);
  });

  it('leaves the skipped comparison unmetered but still meters staging/previews/unstaging (VHS-REQ-699.2)', async () => {
    const cycleMeter = createCycleMeter(() => 0);
    const renderStagedPreview = vi.fn(async (side: 'left' | 'right') =>
      side === 'left' ? { rendered: false, failureReason: 'x' } : { rendered: true }
    );

    const result = await runComparisonPreviewPipeline(deps({ renderStagedPreview, cycleMeter }));

    expect(result.comparison.outcome).toBe('skipped');
    expect(result.comparison.cycle).toBeUndefined();
    // staging + preview-left + preview-right + unstaging = 4 measured states.
    expect(cycleMeter.completedCycleCount).toBe(4);
  });

  it('runs purely through injected boundaries and never reads the preview cache in this pass (VHS-REQ-699.4)', async () => {
    const previewCache = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined)
    };
    const renderStagedPreview = vi.fn(async () => ({ rendered: true, html: '<x>' }));
    const runComparison = vi.fn(async () => ({ succeeded: true }));

    const result = await runComparisonPreviewPipeline(
      deps({ renderStagedPreview, runComparison, previewCache })
    );

    // The orchestrator drives everything through injected boundaries (no LabVIEW),
    // and the StagedPreviewCache is reserved for a later slice — not read here.
    expect(result.finalState).toBe('COMPLETE');
    expect(renderStagedPreview).toHaveBeenCalledTimes(2);
    expect(runComparison).toHaveBeenCalledTimes(1);
    expect(previewCache.get).not.toHaveBeenCalled();
    expect(previewCache.set).not.toHaveBeenCalled();
  });
});
