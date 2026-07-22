import { describe, expect, it } from 'vitest';

import {
  PREVIEW_CACHE_HEALTH_SCHEMA,
  buildViPreviewCacheHealth,
  type ViPreviewCacheHealthManifest
} from '../../src/reporting/viPreview/viPreviewCacheHealth';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const KEY_C = 'c'.repeat(64);
const KEY_ORPHAN = 'd'.repeat(64);

function manifest(entries: ViPreviewCacheHealthManifest['entries']): ViPreviewCacheHealthManifest {
  return { entries };
}

describe('buildViPreviewCacheHealth (VHS-REQ-675)', () => {
  it('classifies cached, stale, missing, and failed VIs against the manifest and cache dir (VHS-REQ-675.1)', () => {
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      workspaceViPaths: ['a/Cached.vi', 'b/Stale.vi', 'c/Never.vi', 'd/Failed.vi'],
      manifest: manifest([
        { relativePath: 'a/Cached.vi', key: KEY_A, outcome: 'rendered' },
        { relativePath: 'b/Stale.vi', key: KEY_B, outcome: 'cache-hit' },
        { relativePath: 'd/Failed.vi', key: null, outcome: 'failed' }
      ]),
      // KEY_B is absent -> Stale.vi is stale; c/Never.vi is not in the manifest -> missing.
      presentCacheKeys: [KEY_A],
      generatedAt: '2026-07-19T00:00:00.000Z'
    });

    const byPath = Object.fromEntries(report.entries.map((entry) => [entry.relativePath, entry]));
    expect(byPath['a/Cached.vi']).toMatchObject({ status: 'cached', key: KEY_A, cacheFilePresent: true });
    expect(byPath['b/Stale.vi']).toMatchObject({ status: 'stale', key: KEY_B, cacheFilePresent: false });
    expect(byPath['c/Never.vi']).toMatchObject({ status: 'missing', key: null });
    expect(byPath['d/Failed.vi']).toMatchObject({ status: 'failed' });

    expect(report.totals).toMatchObject({
      workspaceVis: 4,
      cached: 1,
      stale: 1,
      missing: 1,
      failed: 1,
      coveragePercent: 25
    });
    expect(report.$schema).toBe(PREVIEW_CACHE_HEALTH_SCHEMA);
    expect(report.schemaVersion).toBe(1);
    expect(report.healthy).toBe(false);
  });

  it('reports orphaned cache keys not referenced by the manifest (VHS-REQ-675.2)', () => {
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      workspaceViPaths: ['a/One.vi'],
      manifest: manifest([{ relativePath: 'a/One.vi', key: KEY_A, outcome: 'rendered' }]),
      presentCacheKeys: [KEY_A, KEY_ORPHAN],
      generatedAt: '2026-07-19T00:00:00.000Z'
    });
    expect(report.orphanedCacheKeys).toEqual([KEY_ORPHAN]);
    expect(report.totals.orphanedCacheFiles).toBe(1);
  });

  it('reports manifest VIs no longer present in the workspace as removed (VHS-REQ-675.2)', () => {
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      workspaceViPaths: ['a/Kept.vi'],
      manifest: manifest([
        { relativePath: 'a/Kept.vi', key: KEY_A, outcome: 'rendered' },
        { relativePath: 'z/Gone.vi', key: KEY_C, outcome: 'rendered' }
      ]),
      presentCacheKeys: [KEY_A, KEY_C],
      generatedAt: '2026-07-19T00:00:00.000Z'
    });
    expect(report.removedViPaths).toEqual(['z/Gone.vi']);
    expect(report.totals.removedVis).toBe(1);
    // z/Gone.vi's key is referenced by the manifest, so it is NOT orphaned.
    expect(report.orphanedCacheKeys).toEqual([]);
  });

  it('is healthy only when every workspace VI is cached and none failed (VHS-REQ-675.1)', () => {
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      workspaceViPaths: ['a/One.vi', 'b/Two.vi'],
      manifest: manifest([
        { relativePath: 'a/One.vi', key: KEY_A, outcome: 'rendered' },
        { relativePath: 'b/Two.vi', key: KEY_B, outcome: 'cache-hit' }
      ]),
      presentCacheKeys: [KEY_A, KEY_B],
      generatedAt: '2026-07-19T00:00:00.000Z'
    });
    expect(report.healthy).toBe(true);
    expect(report.totals.coveragePercent).toBe(100);
  });

  it('treats every workspace VI as missing when no manifest is supplied (VHS-REQ-675.1)', () => {
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      workspaceViPaths: ['a/One.vi'],
      presentCacheKeys: [KEY_A],
      generatedAt: '2026-07-19T00:00:00.000Z'
    });
    expect(report.manifestPresent).toBe(false);
    expect(report.entries[0]).toMatchObject({ status: 'missing' });
    // Every present key is orphaned when there is no manifest to reference it.
    expect(report.orphanedCacheKeys).toEqual([KEY_A]);
  });

  it('normalizes separators, de-duplicates, and sorts workspace paths', () => {
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      workspaceViPaths: ['b\\Two.vi', 'a/One.vi', 'a/One.vi'],
      manifest: manifest([{ relativePath: 'b/Two.vi', key: KEY_B, outcome: 'rendered' }]),
      presentCacheKeys: [KEY_B],
      generatedAt: '2026-07-19T00:00:00.000Z'
    });
    expect(report.entries.map((entry) => entry.relativePath)).toEqual(['a/One.vi', 'b/Two.vi']);
    expect(report.totals.workspaceVis).toBe(2);
  });

  it('reports 100% coverage for an empty workspace but is not healthy', () => {
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      workspaceViPaths: [],
      presentCacheKeys: [],
      generatedAt: '2026-07-19T00:00:00.000Z'
    });
    expect(report.totals.coveragePercent).toBe(100);
    expect(report.healthy).toBe(false);
  });

  it('classifies a blocked manifest outcome as failed (VHS-REQ-675.1)', () => {
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      workspaceViPaths: ['a/Blocked.vi'],
      presentCacheKeys: [],
      generatedAt: '2026-07-19T00:00:00.000Z',
      manifest: manifest([{ relativePath: 'a/Blocked.vi', key: KEY_A, outcome: 'blocked' }])
    });
    const entry = report.entries.find((e) => e.relativePath === 'a/Blocked.vi');
    expect(entry).toMatchObject({ status: 'failed', key: KEY_A });
    expect(report.totals.failed).toBe(1);
  });

  it('reports a failed entry whose cache key is still present as cacheFilePresent (VHS-REQ-675.1)', () => {
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      workspaceViPaths: ['a/Failed.vi'],
      presentCacheKeys: [KEY_A],
      generatedAt: '2026-07-19T00:00:00.000Z',
      manifest: manifest([{ relativePath: 'a/Failed.vi', key: KEY_A, outcome: 'failed' }])
    });
    const entry = report.entries.find((e) => e.relativePath === 'a/Failed.vi');
    // The recorded key is still present on disk even though the outcome failed;
    // the key IS referenced by the manifest, so it must not be reported orphaned.
    expect(entry).toMatchObject({ status: 'failed', key: KEY_A, cacheFilePresent: true });
    expect(report.orphanedCacheKeys).toEqual([]);
  });

  it('deduplicates and sorts duplicate workspace VI paths (VHS-REQ-675.1)', () => {
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      workspaceViPaths: ['b/Two.vi', 'a/One.vi', 'b/Two.vi'],
      presentCacheKeys: [],
      generatedAt: '2026-07-19T00:00:00.000Z'
    });
    expect(report.entries.map((e) => e.relativePath)).toEqual(['a/One.vi', 'b/Two.vi']);
    expect(report.totals.workspaceVis).toBe(2);
  });

  it('treats a rendered manifest entry with no key as an uncovered stale entry (VHS-REQ-675.1)', () => {
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      workspaceViPaths: ['a/NoKey.vi'],
      presentCacheKeys: [],
      generatedAt: '2026-07-19T00:00:00.000Z',
      manifest: manifest([{ relativePath: 'a/NoKey.vi', key: null, outcome: 'rendered' }])
    });
    const entry = report.entries.find((e) => e.relativePath === 'a/NoKey.vi');
    expect(entry).toMatchObject({ status: 'stale', key: null, cacheFilePresent: false });
    expect(report.totals.stale).toBe(1);
  });

  it('sorts multiple orphaned cache keys and removed VI paths deterministically (VHS-REQ-675.2)', () => {
    // Three reverse-ordered elements exercise both the < and > sides of each sort comparator.
    const ORPHAN_F = 'f'.repeat(64);
    const ORPHAN_G = 'g'.repeat(64);
    const ORPHAN_H = 'h'.repeat(64);
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      // Manifest references three VIs no longer in the workspace, listed out of order.
      workspaceViPaths: [],
      manifest: manifest([
        { relativePath: 'z/Removed.vi', key: KEY_A, outcome: 'rendered' },
        { relativePath: 'm/Removed.vi', key: KEY_B, outcome: 'rendered' },
        { relativePath: 'a/Removed.vi', key: KEY_C, outcome: 'rendered' }
      ]),
      // Present keys not referenced by the manifest, provided in reverse order.
      presentCacheKeys: [ORPHAN_H, ORPHAN_G, ORPHAN_F],
      generatedAt: '2026-07-19T00:00:00.000Z'
    });

    expect(report.orphanedCacheKeys).toEqual([ORPHAN_F, ORPHAN_G, ORPHAN_H]);
    expect(report.removedViPaths).toEqual(['a/Removed.vi', 'm/Removed.vi', 'z/Removed.vi']);
    expect(report.totals.orphanedCacheFiles).toBe(3);
    expect(report.totals.removedVis).toBe(3);
  });

  it('sorts reverse-ordered workspace paths into ascending order (VHS-REQ-675.1)', () => {
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      workspaceViPaths: ['z/Last.vi', 'a/First.vi', 'm/Mid.vi'],
      presentCacheKeys: [],
      generatedAt: '2026-07-19T00:00:00.000Z'
    });
    expect(report.entries.map((e) => e.relativePath)).toEqual([
      'a/First.vi',
      'm/Mid.vi',
      'z/Last.vi'
    ]);
  });

  it('sorts shuffled orphaned cache keys and removed VI paths ascending (VHS-REQ-675.2)', () => {
    // Five shuffled distinct values drive the orphan/removed sort comparators
    // through both their < and > sides (their equal side is unreachable after the
    // Set-based de-duplication upstream).
    const key = (c: string) => c.repeat(64);
    const report = buildViPreviewCacheHealth({
      cacheDirectory: '/cache',
      // Empty workspace: every manifest path is "removed", every present key orphaned.
      workspaceViPaths: [],
      manifest: manifest([
        { relativePath: 'c/R.vi', key: key('1'), outcome: 'rendered' },
        { relativePath: 'e/R.vi', key: key('2'), outcome: 'rendered' },
        { relativePath: 'a/R.vi', key: key('3'), outcome: 'rendered' },
        { relativePath: 'd/R.vi', key: key('4'), outcome: 'rendered' },
        { relativePath: 'b/R.vi', key: key('5'), outcome: 'rendered' }
      ]),
      presentCacheKeys: [key('e'), key('c'), key('a'), key('d'), key('b')],
      generatedAt: '2026-07-19T00:00:00.000Z'
    });
    expect(report.orphanedCacheKeys).toEqual([
      key('a'),
      key('b'),
      key('c'),
      key('d'),
      key('e')
    ]);
    expect(report.removedViPaths).toEqual([
      'a/R.vi',
      'b/R.vi',
      'c/R.vi',
      'd/R.vi',
      'e/R.vi'
    ]);
  });
});
