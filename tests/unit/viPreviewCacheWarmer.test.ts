import { describe, expect, it, vi } from 'vitest';

import {
  computeWarmPercent,
  formatWarmStatusLabel,
  warmViPreviewCache,
  type ViPreviewWarmProgress
} from '../../src/reporting/viPreview/viPreviewCacheWarmer';

describe('computeWarmPercent', () => {
  it('floors the ratio and clamps to 0..100', () => {
    expect(computeWarmPercent(0, 0)).toBe(100);
    expect(computeWarmPercent(0, 4)).toBe(0);
    expect(computeWarmPercent(1, 4)).toBe(25);
    expect(computeWarmPercent(1, 3)).toBe(33);
    expect(computeWarmPercent(3, 3)).toBe(100);
    expect(computeWarmPercent(5, 3)).toBe(100);
  });
});

describe('formatWarmStatusLabel', () => {
  it('shows a spinning percentage while warming and a check when done', () => {
    expect(
      formatWarmStatusLabel({ total: 4, completed: 1, succeeded: 1, failed: 0, percent: 25, done: false })
    ).toBe('$(sync~spin) Caching VI previews 25%');
    expect(
      formatWarmStatusLabel({ total: 4, completed: 4, succeeded: 4, failed: 0, percent: 100, done: true })
    ).toBe('$(check) VI previews cached');
  });
});

describe('warmViPreviewCache', () => {
  it('renders serially and reports monotonic progress ending at 100% done', async () => {
    const order: string[] = [];
    const progress: ViPreviewWarmProgress[] = [];
    const result = await warmViPreviewCache(['a.vi', 'b.vi', 'c.vi', 'd.vi'], {
      renderOne: async (viFilePath) => {
        order.push(viFilePath);
        return 'succeeded';
      },
      onProgress: (snapshot) => progress.push({ ...snapshot })
    });

    expect(order).toEqual(['a.vi', 'b.vi', 'c.vi', 'd.vi']);
    expect(result.done).toBe(true);
    expect(result.percent).toBe(100);
    expect(result.succeeded).toBe(4);
    // Monotonic non-decreasing percentage.
    const percents = progress.map((p) => p.percent);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(percents.at(-1)).toBe(100);
  });

  it('reports done immediately for an empty set', async () => {
    const onProgress = vi.fn();
    const result = await warmViPreviewCache([], { renderOne: vi.fn(), onProgress });
    expect(result).toMatchObject({ total: 0, completed: 0, percent: 100, done: true });
    expect(onProgress).toHaveBeenCalled();
  });

  it('counts a failing (or throwing) render and continues', async () => {
    const result = await warmViPreviewCache(['ok.vi', 'boom.vi', 'ok2.vi'], {
      renderOne: async (viFilePath) => {
        if (viFilePath === 'boom.vi') {
          throw new Error('render failed');
        }
        return 'succeeded';
      },
      onProgress: () => undefined
    });
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.completed).toBe(3);
    expect(result.done).toBe(true);
  });

  it('stops early when cancelled', async () => {
    const rendered: string[] = [];
    let calls = 0;
    const result = await warmViPreviewCache(['a.vi', 'b.vi', 'c.vi'], {
      renderOne: async (viFilePath) => {
        rendered.push(viFilePath);
        return 'succeeded';
      },
      onProgress: () => undefined,
      isCancelled: () => {
        calls += 1;
        return calls > 1; // allow the first render, cancel before the second
      }
    });
    expect(rendered).toEqual(['a.vi']);
    expect(result.done).toBe(true);
  });
});
