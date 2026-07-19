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
});
