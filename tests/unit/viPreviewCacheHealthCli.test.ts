import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

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

// Exercises the default (uninjected) node-fs adapters + main output against a
// real temp directory so the node builder factories and the path-safe writer
// are covered rather than always replaced by injected deps.
describe('preview-cache-health default node deps over a real filesystem (VHS-REQ-675.3)', () => {
  const KEY = 'a'.repeat(64);
  let root: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-health-fs-'));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('enumerates workspace VIs, lists cache keys, and parses the manifest from disk', async () => {
    const repoRoot = path.join(root, 'repo');
    const cacheDir = path.join(root, 'cache');
    await fs.mkdir(path.join(repoRoot, 'sub'), { recursive: true });
    await fs.mkdir(path.join(repoRoot, 'node_modules'), { recursive: true });
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(repoRoot, 'sub', 'One.vi'), 'vi');
    await fs.writeFile(path.join(repoRoot, 'Two.ctl'), 'ctl');
    await fs.writeFile(path.join(repoRoot, 'node_modules', 'Dep.vi'), 'ignored');
    await fs.writeFile(path.join(cacheDir, `${KEY}.html`), '<html></html>');
    await fs.writeFile(path.join(cacheDir, 'not-a-cache.txt'), 'skip');
    const manifestPath = path.join(root, 'warm.json');
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        entries: [
          { relativePath: 'sub/One.vi', key: KEY, outcome: 'rendered' },
          { relativePath: 'Two.ctl', key: 'b'.repeat(64), outcome: 'rendered' }
        ]
      })
    );

    const report = await runViPreviewCacheHealth({
      repositoryRoot: repoRoot,
      cacheDirectory: cacheDir,
      manifestPath
    });

    // node_modules excluded; both source VIs enumerated repo-relative.
    expect(report.totals.workspaceVis).toBe(2);
    const byPath = Object.fromEntries(report.entries.map((e) => [e.relativePath, e.status]));
    expect(byPath['sub/One.vi']).toBe('cached'); // KEY present on disk
    expect(byPath['Two.ctl']).toBe('stale'); // manifest key absent on disk
    expect(report.manifestPresent).toBe(true);
  });

  it('treats a missing or unparseable manifest as no manifest', async () => {
    const cacheDir = path.join(root, 'cache2');
    await fs.mkdir(cacheDir, { recursive: true });
    const missing = await runViPreviewCacheHealth({
      repositoryRoot: root,
      cacheDirectory: cacheDir,
      manifestPath: path.join(root, 'nope.json')
    });
    expect(missing.manifestPresent).toBe(false);

    const bad = path.join(root, 'bad.json');
    await fs.writeFile(bad, 'not json at all');
    const report = await runViPreviewCacheHealth({
      repositoryRoot: root,
      cacheDirectory: cacheDir,
      manifestPath: bad
    });
    expect(report.manifestPresent).toBe(false);
  });

  it('returns empty cache keys when the cache directory is unreadable', async () => {
    const report = await runViPreviewCacheHealth({
      repositoryRoot: root,
      cacheDirectory: path.join(root, 'does-not-exist')
    });
    expect(report.totals.orphanedCacheFiles).toBe(0);
  });

  it('main writes the report to disk via the default path-safe writer and prints a summary', async () => {
    const cacheDir = path.join(root, 'cache3');
    await fs.mkdir(cacheDir, { recursive: true });
    process.chdir(root);
    const code = await main(['--repo-root', root, '--cache-dir', cacheDir, '--output', 'out/health.json']);
    expect(code).toBe(0);
    const written = await fs.readFile(path.join(root, 'out', 'health.json'), 'utf8');
    expect(written).toContain(PREVIEW_CACHE_HEALTH_SCHEMA);
  });

  it('main default writer rejects an absolute --output path', async () => {
    const cacheDir = path.join(root, 'cache4');
    await fs.mkdir(cacheDir, { recursive: true });
    process.chdir(root);
    await expect(main(['--cache-dir', cacheDir, '--output', '/etc/evil.json'])).rejects.toThrow(
      /relative path/
    );
  });

  it('main default writer rejects a parent-escaping --output path', async () => {
    const cacheDir = path.join(root, 'cache5');
    await fs.mkdir(cacheDir, { recursive: true });
    process.chdir(root);
    await expect(main(['--cache-dir', cacheDir, '--output', '../escape.json'])).rejects.toThrow(
      /within the working directory/
    );
  });

  it('main prints JSON on stdout under --json with the default runner', async () => {
    const cacheDir = path.join(root, 'cache6');
    await fs.mkdir(cacheDir, { recursive: true });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const code = await main(['--repo-root', root, '--cache-dir', cacheDir, '--json']);
      expect(code).toBe(0);
      const printed = log.mock.calls.map((call) => String(call[0])).join('\n');
      expect(printed).toContain(PREVIEW_CACHE_HEALTH_SCHEMA);
    } finally {
      log.mockRestore();
    }
  });
});
