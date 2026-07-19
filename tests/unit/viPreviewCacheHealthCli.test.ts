import { describe, expect, it, vi } from 'vitest';

import {
  main,
  parseArgs,
  runViPreviewCacheHealth,
  type RunViPreviewCacheHealthDeps
} from '../../src/cli/runViPreviewCacheHealth';
import {
  PREVIEW_CACHE_HEALTH_SCHEMA,
  type ViPreviewCacheHealthReport
} from '../../src/reporting/viPreview/viPreviewCacheHealth';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

describe('parseArgs (VHS-REQ-675.3)', () => {
  it('parses the health CLI flags', () => {
    const parsed = parseArgs([
      '--repo-root', '/r',
      '--cache-dir', '/c',
      '--manifest', 'warm.json',
      '--limit', '10',
      '--json',
      '--strict',
      '--output', 'out/health.json'
    ]);
    expect(parsed).toEqual({
      repositoryRoot: '/r',
      cacheDirectory: '/c',
      manifestPath: 'warm.json',
      limit: 10,
      json: true,
      strict: true,
      outputPath: 'out/health.json'
    });
  });
});

describe('runViPreviewCacheHealth (VHS-REQ-675.3)', () => {
  it('gathers workspace VIs, cache keys, and the manifest and builds the report', async () => {
    const deps: RunViPreviewCacheHealthDeps = {
      listViFiles: vi.fn(async () => ['/repo/a/One.vi', '/repo/b/Two.vi']),
      listCacheKeys: vi.fn(async () => [KEY_A]),
      readManifest: vi.fn(async () => ({
        entries: [
          { relativePath: 'a/One.vi', key: KEY_A, outcome: 'rendered' as const },
          { relativePath: 'b/Two.vi', key: KEY_B, outcome: 'rendered' as const }
        ]
      })),
      now: () => new Date('2026-07-19T00:00:00.000Z')
    };
    const report = await runViPreviewCacheHealth(
      { repositoryRoot: '/repo', cacheDirectory: '/cache', manifestPath: 'warm.json' },
      deps
    );
    expect(deps.readManifest).toHaveBeenCalledWith('warm.json');
    expect(report.totals).toMatchObject({ workspaceVis: 2, cached: 1, stale: 1, coveragePercent: 50 });
    // Paths were made repo-relative for the read-model.
    expect(report.entries.map((e) => e.relativePath).sort()).toEqual(['a/One.vi', 'b/Two.vi']);
  });

  it('does not read a manifest when none was requested', async () => {
    const readManifest = vi.fn();
    const report = await runViPreviewCacheHealth(
      { repositoryRoot: '/repo', cacheDirectory: '/cache' },
      {
        listViFiles: async () => ['/repo/a/One.vi'],
        listCacheKeys: async () => [],
        readManifest,
        now: () => new Date('2026-07-19T00:00:00.000Z')
      }
    );
    expect(readManifest).not.toHaveBeenCalled();
    expect(report.manifestPresent).toBe(false);
  });
});

function readyReport(overrides: Partial<ViPreviewCacheHealthReport> = {}): ViPreviewCacheHealthReport {
  return {
    $schema: PREVIEW_CACHE_HEALTH_SCHEMA,
    schemaVersion: 1,
    generatedAt: '2026-07-19T00:00:00.000Z',
    cacheDirectory: '/cache',
    manifestPresent: true,
    totals: {
      workspaceVis: 2,
      cached: 2,
      stale: 0,
      missing: 0,
      failed: 0,
      orphanedCacheFiles: 0,
      removedVis: 0,
      coveragePercent: 100
    },
    entries: [],
    orphanedCacheKeys: [],
    removedViPaths: [],
    healthy: true,
    ...overrides
  };
}

describe('preview-cache-health CLI main (VHS-REQ-675.3)', () => {
  it('fails closed with a remedy when --cache-dir is absent', async () => {
    const run = vi.fn();
    expect(await main(['--repo-root', '/repo'], { run })).toBe(2);
    expect(run).not.toHaveBeenCalled();
  });

  it('exits 0 by default even when coverage is incomplete', async () => {
    const run = vi.fn(async () => readyReport({ healthy: false, totals: { ...readyReport().totals, cached: 1, missing: 1, coveragePercent: 50 } }));
    expect(await main(['--cache-dir', '/cache'], { run })).toBe(0);
  });

  it('exits 1 under --strict when the cache is not fully healthy', async () => {
    const run = vi.fn(async () => readyReport({ healthy: false }));
    expect(await main(['--cache-dir', '/cache', '--strict'], { run })).toBe(1);
  });

  it('exits 0 under --strict when the cache is fully healthy', async () => {
    const run = vi.fn(async () => readyReport({ healthy: true }));
    expect(await main(['--cache-dir', '/cache', '--strict'], { run })).toBe(0);
  });

  it('retains the report through a path-safe --output', async () => {
    const run = vi.fn(async () => readyReport());
    const writeOutput = vi.fn(async () => undefined);
    await main(['--cache-dir', '/cache', '--output', 'evidence/health.json'], { run, writeOutput });
    expect(writeOutput).toHaveBeenCalledWith(
      'evidence/health.json',
      expect.stringContaining(PREVIEW_CACHE_HEALTH_SCHEMA)
    );
  });
});
