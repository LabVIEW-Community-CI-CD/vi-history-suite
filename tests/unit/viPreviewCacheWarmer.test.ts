import { describe, expect, it, vi } from 'vitest';

import {
  computeWarmPercent,
  formatWarmStatusLabel,
  formatWarmStatusTooltip,
  shouldWarmViPreviewProvider,
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

describe('shouldWarmViPreviewProvider (VHS-REQ-659.12)', () => {
  it('docker-only warms the container providers but not host-native', () => {
    expect(shouldWarmViPreviewProvider('linux-container', 'docker-only')).toBe(true);
    expect(shouldWarmViPreviewProvider('windows-container', 'docker-only')).toBe(true);
    expect(shouldWarmViPreviewProvider('host-native', 'docker-only')).toBe(false);
  });

  it('always warms every provider including host-native', () => {
    expect(shouldWarmViPreviewProvider('host-native', 'always')).toBe(true);
    expect(shouldWarmViPreviewProvider('linux-container', 'always')).toBe(true);
    expect(shouldWarmViPreviewProvider('windows-container', 'always')).toBe(true);
  });

  it('off disables warming for every provider', () => {
    expect(shouldWarmViPreviewProvider('host-native', 'off')).toBe(false);
    expect(shouldWarmViPreviewProvider('linux-container', 'off')).toBe(false);
    expect(shouldWarmViPreviewProvider('windows-container', 'off')).toBe(false);
  });
});

describe('formatWarmStatusLabel (VHS-REQ-659.12)', () => {
  it('shows a spinning percentage with the running count while warming', () => {
    expect(
      formatWarmStatusLabel({ total: 200, completed: 85, succeeded: 85, failed: 0, percent: 42, done: false })
    ).toBe('$(sync~spin) Caching VI previews 42% (85/200)');
  });

  it('shows a check with the succeeded count when done', () => {
    expect(
      formatWarmStatusLabel({ total: 4, completed: 4, succeeded: 4, failed: 0, percent: 100, done: true })
    ).toBe('$(check) VI previews cached (4)');
  });

  it('shows succeeded/total when done with partial failures (never overstates cached)', () => {
    expect(
      formatWarmStatusLabel({ total: 200, completed: 200, succeeded: 198, failed: 2, percent: 100, done: true })
    ).toBe('$(check) VI previews cached (198/200)');
  });

  it('omits the count when done with no VIs', () => {
    expect(
      formatWarmStatusLabel({ total: 0, completed: 0, succeeded: 0, failed: 0, percent: 100, done: true })
    ).toBe('$(check) VI previews cached');
  });

  it('warns when done and nothing could be cached (all renders failed)', () => {
    expect(
      formatWarmStatusLabel({ total: 200, completed: 200, succeeded: 0, failed: 200, percent: 100, done: true })
    ).toBe('$(warning) VI previews could not be cached (0/200)');
  });
});

describe('formatWarmStatusTooltip', () => {
  it('reports the running count while warming', () => {
    expect(
      formatWarmStatusTooltip({ total: 200, completed: 85, succeeded: 85, failed: 0, percent: 42, done: false })
    ).toBe(
      'VI History Suite: caching VI previews in the background so they open instantly \u2014 85 of 200 done.'
    );
  });

  it('notes failures and the final count when done', () => {
    expect(
      formatWarmStatusTooltip({ total: 200, completed: 200, succeeded: 198, failed: 2, percent: 100, done: true })
    ).toBe(
      'VI History Suite: cached 198 of 200 VI previews so they open instantly (2 could not be rendered).'
    );
  });

  it('reports that nothing could be cached when all renders fail', () => {
    expect(
      formatWarmStatusTooltip({ total: 200, completed: 200, succeeded: 0, failed: 200, percent: 100, done: true })
    ).toBe(
      'VI History Suite: could not cache any of the 200 VI previews — the background renders failed, so opens will render on demand.'
    );
  });
});

describe('warmViPreviewCache (VHS-REQ-659.12)', () => {
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
