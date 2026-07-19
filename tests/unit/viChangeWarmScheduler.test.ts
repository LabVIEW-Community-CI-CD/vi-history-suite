import { describe, expect, it, vi } from 'vitest';

import {
  createViChangeWarmScheduler,
  isViChangeWarmPlanEmpty,
  resolveViChangeWarmPlan,
  warmChangedVi,
  type ViChangeWarmPlan
} from '../../src/reporting/viPreview/viChangeWarmScheduler';

/** Deterministic fake timers so the debounce is testable without real time. */
function createFakeTimers() {
  let nextId = 1;
  const handlers = new Map<number, () => void>();
  return {
    setTimeout: (handler: () => void): unknown => {
      const id = nextId++;
      handlers.set(id, handler);
      return id;
    },
    clearTimeout: (handle: unknown): void => {
      handlers.delete(handle as number);
    },
    pending: (): number => handlers.size,
    runAll: (): void => {
      const fns = [...handlers.values()];
      handlers.clear();
      for (const fn of fns) {
        fn();
      }
    }
  };
}

describe('createViChangeWarmScheduler (VHS-REQ-664.1)', () => {
  it('coalesces repeated changes for the same path into a single settled warm', () => {
    const timers = createFakeTimers();
    const settled: string[] = [];
    const scheduler = createViChangeWarmScheduler({
      debounceMs: 50,
      onSettled: (fsPath) => settled.push(fsPath),
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    });

    scheduler.note('/repo/A.vi');
    scheduler.note('/repo/A.vi');
    scheduler.note('/repo/A.vi');

    expect(timers.pending()).toBe(1);
    timers.runAll();
    expect(settled).toEqual(['/repo/A.vi']);
  });

  it('debounces distinct paths independently', () => {
    const timers = createFakeTimers();
    const settled: string[] = [];
    const scheduler = createViChangeWarmScheduler({
      debounceMs: 50,
      onSettled: (fsPath) => settled.push(fsPath),
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    });

    scheduler.note('/repo/A.vi');
    scheduler.note('/repo/B.vi');

    expect(timers.pending()).toBe(2);
    timers.runAll();
    expect([...settled].sort()).toEqual(['/repo/A.vi', '/repo/B.vi']);
  });

  it('cancels pending timers on dispose so no warm fires afterwards', () => {
    const timers = createFakeTimers();
    const settled: string[] = [];
    const scheduler = createViChangeWarmScheduler({
      debounceMs: 50,
      onSettled: (fsPath) => settled.push(fsPath),
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    });

    scheduler.note('/repo/A.vi');
    scheduler.dispose();

    expect(timers.pending()).toBe(0);
    timers.runAll();
    expect(settled).toEqual([]);
  });

  it('does not clear a timer on the first note when none is pending (VHS-REQ-664.1)', () => {
    const timers = createFakeTimers();
    const clearTimeout = vi.fn(timers.clearTimeout);
    const scheduler = createViChangeWarmScheduler({
      debounceMs: 50,
      onSettled: () => {},
      setTimeout: timers.setTimeout,
      clearTimeout
    });

    // First note for a path: nothing is pending, so the `handle !== undefined`
    // guard must skip clearTimeout. A second note for the SAME path DOES clear
    // the prior handle. This proves the guard, not just the debounce coalescing.
    scheduler.note('/repo/A.vi');
    expect(clearTimeout).not.toHaveBeenCalled();
    scheduler.note('/repo/A.vi');
    expect(clearTimeout).toHaveBeenCalledTimes(1);
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
