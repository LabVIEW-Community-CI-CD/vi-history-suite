import { describe, expect, it, vi } from 'vitest';

import {
  createViChangeWarmScheduler,
  isViChangeWarmPlanEmpty,
  resolveViChangeWarmPlan,
  warmChangedVi,
  type ViChangeWarmPlan
} from '../../src/reporting/viPreview/viChangeWarmScheduler';

describe('createViChangeWarmScheduler (VHS-REQ-664.1)', () => {
  it('dispatches each noted change immediately (no debounce)', () => {
    const settled: string[] = [];
    const scheduler = createViChangeWarmScheduler({
      onSettled: (fsPath) => settled.push(fsPath)
    });

    scheduler.note('/repo/A.vi');
    scheduler.note('/repo/A.vi');
    scheduler.note('/repo/A.vi');

    // Immediate dispatch: every note fires onSettled synchronously.
    expect(settled).toEqual(['/repo/A.vi', '/repo/A.vi', '/repo/A.vi']);
  });

  it('dispatches distinct paths independently', () => {
    const settled: string[] = [];
    const scheduler = createViChangeWarmScheduler({
      onSettled: (fsPath) => settled.push(fsPath)
    });

    scheduler.note('/repo/A.vi');
    scheduler.note('/repo/B.vi');

    expect([...settled].sort()).toEqual(['/repo/A.vi', '/repo/B.vi']);
  });

  it('dispose is a no-op that leaves prior dispatches intact', () => {
    const settled: string[] = [];
    const scheduler = createViChangeWarmScheduler({
      onSettled: (fsPath) => settled.push(fsPath)
    });

    scheduler.note('/repo/A.vi');
    scheduler.dispose();

    // The change already dispatched; dispose has no pending timers to cancel.
    expect(settled).toEqual(['/repo/A.vi']);
  });
});

describe('resolveViChangeWarmPlan (VHS-REQ-664.2)', () => {
  const baseInput = {
    warmOnChangeEnabled: true,
    isDocker: true,
    previewEnabled: true,
    isTrusted: true
  };

  it('warms both preview and comparison under Docker with all gates open', () => {
    expect(resolveViChangeWarmPlan(baseInput)).toEqual({ warmPreview: true, warmComparison: true });
  });

  it('warms nothing when the warmOnChange setting is off', () => {
    const plan = resolveViChangeWarmPlan({ ...baseInput, warmOnChangeEnabled: false });
    expect(plan).toEqual({ warmPreview: false, warmComparison: false });
    expect(isViChangeWarmPlanEmpty(plan)).toBe(true);
  });

  it('warms nothing when the runtime is not Docker', () => {
    expect(resolveViChangeWarmPlan({ ...baseInput, isDocker: false })).toEqual({
      warmPreview: false,
      warmComparison: false
    });
  });

  it('skips the preview warm when the preview feature is disabled', () => {
    expect(resolveViChangeWarmPlan({ ...baseInput, previewEnabled: false })).toEqual({
      warmPreview: false,
      warmComparison: true
    });
  });

  it('skips the comparison warm in an untrusted workspace', () => {
    expect(resolveViChangeWarmPlan({ ...baseInput, isTrusted: false })).toEqual({
      warmPreview: true,
      warmComparison: false
    });
  });
});

describe('warmChangedVi (VHS-REQ-664.3)', () => {
  const bothPlan: ViChangeWarmPlan = { warmPreview: true, warmComparison: true };

  it('warms both caches when the plan asks for both', async () => {
    const warmPreview = vi.fn(async () => {});
    const warmComparison = vi.fn(async () => {});

    const result = await warmChangedVi('/repo/A.vi', bothPlan, { warmPreview, warmComparison });

    expect(warmPreview).toHaveBeenCalledWith('/repo/A.vi');
    expect(warmComparison).toHaveBeenCalledWith('/repo/A.vi');
    expect(result).toEqual({ previewWarmed: true, comparisonWarmed: true });
  });

  it('still warms the comparison when the preview warm fails, and never throws', async () => {
    const warmPreview = vi.fn(async () => {
      throw new Error('preview render failed');
    });
    const warmComparison = vi.fn(async () => {});

    const result = await warmChangedVi('/repo/A.vi', bothPlan, { warmPreview, warmComparison });

    expect(warmComparison).toHaveBeenCalledWith('/repo/A.vi');
    expect(result).toEqual({ previewWarmed: false, comparisonWarmed: true });
  });

  it('swallows a comparison warm failure best-effort', async () => {
    const warmPreview = vi.fn(async () => {});
    const warmComparison = vi.fn(async () => {
      throw new Error('comparison failed');
    });

    const result = await warmChangedVi('/repo/A.vi', bothPlan, { warmPreview, warmComparison });

    expect(result).toEqual({ previewWarmed: true, comparisonWarmed: false });
  });

  it('only invokes the warms the plan permits', async () => {
    const warmPreview = vi.fn(async () => {});
    const warmComparison = vi.fn(async () => {});

    await warmChangedVi('/repo/A.vi', { warmPreview: true, warmComparison: false }, {
      warmPreview,
      warmComparison
    });

    expect(warmPreview).toHaveBeenCalledTimes(1);
    expect(warmComparison).not.toHaveBeenCalled();
  });

  it('warms only the comparison when the plan asks for comparison but not preview', async () => {
    const warmPreview = vi.fn(async () => {});
    const warmComparison = vi.fn(async () => {});

    // Mirror of the preview-only case: proves the `if (plan.warmPreview)` guard
    // actually gates the preview warm (not merely that both run under bothPlan).
    const result = await warmChangedVi('/repo/A.vi', { warmPreview: false, warmComparison: true }, {
      warmPreview,
      warmComparison
    });

    expect(warmPreview).not.toHaveBeenCalled();
    expect(warmComparison).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ previewWarmed: false, comparisonWarmed: true });
  });
});

describe('isViChangeWarmPlanEmpty (VHS-REQ-664.2)', () => {
  it('is empty only when neither warm is requested', () => {
    expect(isViChangeWarmPlanEmpty({ warmPreview: false, warmComparison: false })).toBe(true);
    // Mixed plans are NOT empty — proves the predicate uses AND of the negations,
    // not OR (an OR would wrongly report a preview-only plan as empty).
    expect(isViChangeWarmPlanEmpty({ warmPreview: true, warmComparison: false })).toBe(false);
    expect(isViChangeWarmPlanEmpty({ warmPreview: false, warmComparison: true })).toBe(false);
    expect(isViChangeWarmPlanEmpty({ warmPreview: true, warmComparison: true })).toBe(false);
  });
});
