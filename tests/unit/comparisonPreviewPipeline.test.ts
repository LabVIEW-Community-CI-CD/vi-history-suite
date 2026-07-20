import { describe, expect, it, vi } from 'vitest';

import {
  runComparisonPreviewPipeline,
  type ComparisonPreviewPipelineDeps
} from '../../src/reporting/comparisonPreviewPipeline';
import { createCycleMeter } from '../../src/reporting/runtime/cycleMeter';

function deps(overrides: Partial<ComparisonPreviewPipelineDeps> = {}): ComparisonPreviewPipelineDeps {
  return {
    renderStagedPreview: vi.fn(async () => ({ rendered: true, html: '<html></html>' })),
    runComparison: vi.fn(async () => ({ succeeded: true })),
    ...overrides
  };
}

describe('runComparisonPreviewPipeline (VHS-REQ-699.1)', () => {
  it('runs preview-left, preview-right, then comparison in a single pass', async () => {
    const order: string[] = [];
    const renderStagedPreview = vi.fn(async (side: 'left' | 'right') => {
      order.push(`preview-${side}`);
      return { rendered: true, html: `<${side}>` };
    });
    const runComparison = vi.fn(async () => {
      order.push('comparison');
      return { succeeded: true };
    });

    const result = await runComparisonPreviewPipeline(deps({ renderStagedPreview, runComparison }));

    expect(order).toEqual(['preview-left', 'preview-right', 'comparison']);
    expect(result.previewLeft.outcome).toBe('rendered');
    expect(result.previewLeft.state).toBe('PREVIEW_LEFT');
    expect(result.previewRight.outcome).toBe('rendered');
    expect(result.previewRight.state).toBe('PREVIEW_RIGHT');
    expect(result.comparison.outcome).toBe('compared');
    expect(result.comparison.state).toBe('COMPARISON');
    expect(result.finalState).toBe('COMPLETE');
  });

  it('short-circuits the comparison when the left preview fails to load (VHS-REQ-699.2)', async () => {
    const renderStagedPreview = vi.fn(async (side: 'left' | 'right') =>
      side === 'left'
        ? { rendered: false, failureReason: 'labview-preview-operation-load-failed' }
        : { rendered: true, html: '<right>' }
    );
    const runComparison = vi.fn(async () => ({ succeeded: true }));

    const result = await runComparisonPreviewPipeline(deps({ renderStagedPreview, runComparison }));

    expect(result.previewLeft.outcome).toBe('failed');
    expect(result.previewLeft.failureReason).toBe('labview-preview-operation-load-failed');
    expect(result.comparison.outcome).toBe('skipped');
    expect(result.comparison.failureReason).toBe('staged-vi-preview-validation-failed');
    expect(result.finalState).toBe('FAILED');
    expect(result.failureReason).toBe('staged-vi-preview-validation-failed');
    // The fragile comparison is never invoked when a preview validation fails.
    expect(runComparison).not.toHaveBeenCalled();
  });

  it('short-circuits the comparison when the right preview fails to load (VHS-REQ-699.2)', async () => {
    const renderStagedPreview = vi.fn(async (side: 'left' | 'right') =>
      side === 'right'
        ? { rendered: false, failureReason: 'preview-output-not-produced' }
        : { rendered: true, html: '<left>' }
    );
    const runComparison = vi.fn(async () => ({ succeeded: true }));

    const result = await runComparisonPreviewPipeline(deps({ renderStagedPreview, runComparison }));

    expect(result.previewLeft.outcome).toBe('rendered');
    expect(result.previewRight.outcome).toBe('failed');
    expect(result.comparison.outcome).toBe('skipped');
    expect(result.finalState).toBe('FAILED');
    expect(runComparison).not.toHaveBeenCalled();
  });

  it('surfaces a genuine comparison failure after both previews render (VHS-REQ-699.1)', async () => {
    const runComparison = vi.fn(async () => ({
      succeeded: false,
      failureReason: 'command-exited-nonzero'
    }));

    const result = await runComparisonPreviewPipeline(deps({ runComparison }));

    expect(result.previewLeft.outcome).toBe('rendered');
    expect(result.previewRight.outcome).toBe('rendered');
    expect(result.comparison.outcome).toBe('failed');
    expect(result.comparison.failureReason).toBe('command-exited-nonzero');
    expect(result.finalState).toBe('FAILED');
    expect(result.failureReason).toBe('command-exited-nonzero');
  });

  it('meters each iteration with the shared cycle meter, recording inter-cycle latency (VHS-REQ-699.3)', async () => {
    // Deterministic clock: each cycle spans 10ms; the gaps between them are 5ms.
    // preview-left  start 0  end 10
    // preview-right start 15 end 25   (gap 5)
    // comparison    start 30 end 40   (gap 5)
    const times = [0, 10, 15, 25, 30, 40];
    let index = 0;
    const cycleMeter = createCycleMeter(() => times[index++]);

    const result = await runComparisonPreviewPipeline(deps({ cycleMeter }));

    expect(result.previewLeft.cycle?.cycleIndex).toBe(1);
    expect(result.previewLeft.cycle?.durationMs).toBe(10);
    expect(result.previewLeft.cycle?.interCycleGapMs).toBeUndefined();

    expect(result.previewRight.cycle?.cycleIndex).toBe(2);
    expect(result.previewRight.cycle?.durationMs).toBe(10);
    expect(result.previewRight.cycle?.interCycleGapMs).toBe(5);

    expect(result.comparison.cycle?.cycleIndex).toBe(3);
    expect(result.comparison.cycle?.durationMs).toBe(10);
    expect(result.comparison.cycle?.interCycleGapMs).toBe(5);
    expect(cycleMeter.completedCycleCount).toBe(3);
  });

  it('leaves the skipped comparison iteration unmetered (VHS-REQ-699.2)', async () => {
    const cycleMeter = createCycleMeter(() => 0);
    const renderStagedPreview = vi.fn(async (side: 'left' | 'right') =>
      side === 'left' ? { rendered: false, failureReason: 'x' } : { rendered: true }
    );

    const result = await runComparisonPreviewPipeline(deps({ renderStagedPreview, cycleMeter }));

    expect(result.comparison.outcome).toBe('skipped');
    expect(result.comparison.cycle).toBeUndefined();
    // Only the two preview iterations were measured.
    expect(cycleMeter.completedCycleCount).toBe(2);
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
