import { describe, expect, it, vi } from 'vitest';

import {
  PREVIEW_CACHE_WARM_SCHEMA,
  main,
  parseArgs,
  runViPreviewCacheWarm,
  type ResolvedPreviewWorkerRuntime,
  type RunViPreviewCacheWarmDeps
} from '../../src/cli/runViPreviewCacheWarmer';
import type { RenderViPreviewForFileResult } from '../../src/reporting/viPreview/viPreviewFileRender';

const READY: ResolvedPreviewWorkerRuntime = {
  outcome: 'ready',
  provider: 'linux-container',
  containerImage: 'nationalinstruments/labview:2026q1-linux',
  runtime: {
    provider: 'linux-container',
    containerImage: 'nationalinstruments/labview:2026q1-linux'
  } as ResolvedPreviewWorkerRuntime['runtime']
};

const IMG = '<img src="data:image/png;base64,AAAA"/>';

function baseOptions() {
  return { repositoryRoot: '/repo', cacheDirectory: '/cache' };
}

describe('parseArgs (VHS-REQ-671.6)', () => {
  it('parses worker flags and ignores an explicit --provider docker', () => {
    const parsed = parseArgs([
      '--repo-root', '/r',
      '--cache-dir', '/c',
      '--cache-max-entries', '9000',
      '--container-image', 'img:tag',
      '--labview-version', '2026',
      '--connect-timeout', '90',
      '--limit', '50',
      '--provider', 'docker',
      '--json',
      '--include-provenance',
      '--output', 'out/warm.json'
    ]);
    expect(parsed).toEqual({
      repositoryRoot: '/r',
      cacheDirectory: '/c',
      cacheMaxEntries: 9000,
      containerImage: 'img:tag',
      labviewVersion: '2026',
      connectTimeoutSeconds: 90,
      limit: 50,
      json: true,
      includeProvenance: true,
      outputPath: 'out/warm.json'
    });
  });

  it('ignores non-positive numeric flags', () => {
    const parsed = parseArgs(['--limit', '0', '--cache-max-entries', '-3']);
    expect(parsed.limit).toBeUndefined();
    expect(parsed.cacheMaxEntries).toBeUndefined();
  });

  it('parses a valid zero-based --shard index/count', () => {
    expect(parseArgs(['--shard', '0/4']).shard).toEqual({ index: 0, count: 4 });
    expect(parseArgs(['--shard', '3/4']).shard).toEqual({ index: 3, count: 4 });
  });

  it('rejects malformed or out-of-range --shard values', () => {
    // Non-matching format, index >= count, and zero count are all ignored.
    expect(parseArgs(['--shard', 'abc']).shard).toBeUndefined();
    expect(parseArgs(['--shard', '4/4']).shard).toBeUndefined();
    expect(parseArgs(['--shard', '0/0']).shard).toBeUndefined();
  });

  it('ignores a non-positive --connect-timeout', () => {
    expect(parseArgs(['--connect-timeout', '0']).connectTimeoutSeconds).toBeUndefined();
    expect(parseArgs(['--connect-timeout', 'nope']).connectTimeoutSeconds).toBeUndefined();
  });

  it('accepts and ignores a non-docker --provider without setting a field', () => {
    // The worker is docker-only: it consumes the provider value but records nothing.
    const parsed = parseArgs(['--provider', 'host', '--cache-dir', '/c']);
    expect(parsed.cacheDirectory).toBe('/c');
    expect('provider' in parsed).toBe(false);
  });

  it('collects repeatable --vi paths into viFilePaths and ignores empty values (VHS-REQ-703.6)', () => {
    const parsed = parseArgs(['--vi', 'a/One.vi', '--vi', 'b/Two.vi', '--vi', '']);
    expect(parsed.viFilePaths).toEqual(['a/One.vi', 'b/Two.vi']);
  });

  it('leaves viFilePaths undefined when no --vi is given (VHS-REQ-703.6)', () => {
    expect(parseArgs(['--cache-dir', '/c']).viFilePaths).toBeUndefined();
  });
});

describe('runViPreviewCacheWarm (VHS-REQ-671.3)', () => {
  it('warms every VI serially and records a per-entry manifest', async () => {
    const listViFiles = vi.fn(async () => ['/repo/a/Widget.vi', '/repo/b/Panel.ctl', '/repo/c/Broken.vi']);
    const renderOne = vi.fn(async (viFilePath: string): Promise<RenderViPreviewForFileResult> => {
      if (viFilePath.endsWith('Widget.vi')) {
        return { outcome: 'rendered', html: `<html>${IMG}${IMG}</html>`, cached: false, cacheKey: 'k-widget' };
      }
      if (viFilePath.endsWith('Panel.ctl')) {
        return { outcome: 'rendered', html: `<html>${IMG}</html>`, cached: true, cacheKey: 'k-panel' };
      }
      return { outcome: 'failed', failureReason: 'command-exited-nonzero', cacheKey: 'k-broken' };
    });
    const deps: RunViPreviewCacheWarmDeps = {
      listViFiles,
      resolveRuntime: async () => READY,
      renderOne,
      now: () => new Date('2026-07-18T00:00:00.000Z')
    };

    const packet = await runViPreviewCacheWarm(baseOptions(), deps);

    expect(renderOne).toHaveBeenCalledTimes(3);
    expect(packet.runtime).toEqual({
      outcome: 'ready',
      provider: 'linux-container',
      containerImage: 'nationalinstruments/labview:2026q1-linux'
    });
    expect(packet.totals).toEqual({
      total: 3,
      rendered: 1,
      cacheHit: 1,
      failed: 1,
      blocked: 0,
      bytes: Buffer.byteLength(`<html>${IMG}${IMG}</html>`, 'utf8') + Buffer.byteLength(`<html>${IMG}</html>`, 'utf8')
    });
    expect(packet.entries).toEqual([
      {
        relativePath: 'a/Widget.vi',
        key: 'k-widget',
        outcome: 'rendered',
        bytes: Buffer.byteLength(`<html>${IMG}${IMG}</html>`, 'utf8'),
        inlineImageCount: 2,
        cached: false
      },
      {
        relativePath: 'b/Panel.ctl',
        key: 'k-panel',
        outcome: 'cache-hit',
        bytes: Buffer.byteLength(`<html>${IMG}</html>`, 'utf8'),
        inlineImageCount: 1,
        cached: true
      },
      {
        relativePath: 'c/Broken.vi',
        key: 'k-broken',
        outcome: 'failed',
        bytes: 0,
        cached: false,
        failureReason: 'command-exited-nonzero'
      }
    ]);
  });

  it('warms only the explicit viFilePaths, resolved against the repo root, skipping enumeration (VHS-REQ-703.6)', async () => {
    const listViFiles = vi.fn(async () => ['/repo/should/not/enumerate.vi']);
    const rendered: string[] = [];
    const deps: RunViPreviewCacheWarmDeps = {
      listViFiles,
      resolveRuntime: async () => READY,
      renderOne: async (viFilePath: string) => {
        rendered.push(viFilePath);
        return { outcome: 'rendered', html: `<html>${IMG}</html>`, cached: false, cacheKey: 'k' };
      }
    };

    const packet = await runViPreviewCacheWarm(
      { ...baseOptions(), viFilePaths: ['changed/A.vi', 'changed/B.vi'] },
      deps
    );

    // Enumeration is skipped entirely; only the explicit VIs are rendered,
    // resolved against the repository root.
    expect(listViFiles).not.toHaveBeenCalled();
    expect(rendered).toEqual(['/repo/changed/A.vi', '/repo/changed/B.vi']);
    expect(packet.entries.map((entry) => entry.relativePath)).toEqual(['changed/A.vi', 'changed/B.vi']);
  });

  it('applies --limit to the explicit viFilePaths scope (VHS-REQ-703.6)', async () => {
    const rendered: string[] = [];
    const deps: RunViPreviewCacheWarmDeps = {
      listViFiles: async () => [],
      resolveRuntime: async () => READY,
      renderOne: async (viFilePath: string) => {
        rendered.push(viFilePath);
        return { outcome: 'rendered', html: `<html>${IMG}</html>`, cached: false, cacheKey: 'k' };
      }
    };

    await runViPreviewCacheWarm(
      { ...baseOptions(), viFilePaths: ['a.vi', 'b.vi', 'c.vi'], limit: 2 },
      deps
    );

    expect(rendered).toEqual(['/repo/a.vi', '/repo/b.vi']);
  });

  it('maps the content-addressed cache key from the render result into the manifest (VHS-REQ-671.4)', async () => {
    const deps: RunViPreviewCacheWarmDeps = {
      listViFiles: async () => ['/repo/x/One.vi'],
      resolveRuntime: async () => READY,
      renderOne: async () => ({ outcome: 'rendered', html: '<html></html>', cached: false, cacheKey: 'sha-of-one' })
    };
    const packet = await runViPreviewCacheWarm(baseOptions(), deps);
    expect(packet.entries[0].key).toBe('sha-of-one');
  });

  it('treats a fresh render that was not persisted to the cache as a failed entry (VHS-REQ-671.3)', async () => {
    const deps: RunViPreviewCacheWarmDeps = {
      listViFiles: async () => ['/repo/stored.vi', '/repo/notstored.vi'],
      resolveRuntime: async () => READY,
      renderOne: async (viFilePath: string) => {
        if (viFilePath.endsWith('notstored.vi')) {
          // Rendered fine, but the cache write failed -> no reusable entry stored.
          return { outcome: 'rendered', html: '<html></html>', cached: false, cacheKey: 'k-x', cacheStored: false };
        }
        return { outcome: 'rendered', html: '<html></html>', cached: false, cacheKey: 'k-ok', cacheStored: true };
      }
    };
    const packet = await runViPreviewCacheWarm(baseOptions(), deps);
    expect(packet.totals.rendered).toBe(1);
    expect(packet.totals.failed).toBe(1);
    const notStored = packet.entries.find((entry) => entry.relativePath === 'notstored.vi');
    expect(notStored).toMatchObject({ outcome: 'failed', failureReason: 'preview-cache-write-failed' });
  });

  it('records a render that throws as a failed entry without stopping the loop', async () => {
    const deps: RunViPreviewCacheWarmDeps = {
      listViFiles: async () => ['/repo/boom.vi', '/repo/ok.vi'],
      resolveRuntime: async () => READY,
      renderOne: async (viFilePath: string) => {
        if (viFilePath.endsWith('boom.vi')) {
          throw new Error('render exploded');
        }
        return { outcome: 'rendered', html: '<html></html>', cached: false, cacheKey: 'k-ok' };
      }
    };
    const packet = await runViPreviewCacheWarm(baseOptions(), deps);
    expect(packet.totals.failed).toBe(1);
    expect(packet.totals.rendered).toBe(1);
    expect(packet.entries[0]).toMatchObject({ relativePath: 'boom.vi', outcome: 'failed', key: null });
    expect(packet.entries[0].failureReason).toContain('render exploded');
  });

  it('includes provenance only when requested', async () => {
    const deps: RunViPreviewCacheWarmDeps = {
      listViFiles: async () => [],
      resolveRuntime: async () => READY,
      renderOne: async () => ({ outcome: 'rendered', html: '', cached: false }),
      now: () => new Date('2026-07-18T00:00:00.000Z')
    };
    const without = await runViPreviewCacheWarm(baseOptions(), deps);
    expect(without.provenance).toBeUndefined();
    const withProv = await runViPreviewCacheWarm(
      { ...baseOptions(), includeProvenance: true, argv: ['--cache-dir', '/cache'] },
      deps
    );
    expect(withProv.provenance).toMatchObject({ argv: ['--cache-dir', '/cache'] });
  });
});

describe('runViPreviewCacheWarm blocked runtime (VHS-REQ-671.2)', () => {
  it('returns a blocked packet with an empty manifest and zero totals', async () => {
    const renderOne = vi.fn();
    const listViFiles = vi.fn();
    const packet = await runViPreviewCacheWarm(baseOptions(), {
      resolveRuntime: async () => ({ outcome: 'blocked', provider: 'unknown', reason: 'container-image-unavailable' }),
      renderOne,
      listViFiles
    });
    expect(packet.runtime).toEqual({ outcome: 'blocked', provider: 'unknown', reason: 'container-image-unavailable' });
    expect(packet.entries).toEqual([]);
    expect(packet.totals).toEqual({ total: 0, rendered: 0, cacheHit: 0, failed: 0, blocked: 0, bytes: 0 });
    expect(renderOne).not.toHaveBeenCalled();
    expect(listViFiles).not.toHaveBeenCalled();
  });
});

describe('preview-cache-warm packet shape (VHS-REQ-671.5)', () => {
  it('is self-describing with schema envelope and cache/runtime metadata', async () => {
    const packet = await runViPreviewCacheWarm(baseOptions(), {
      listViFiles: async () => [],
      resolveRuntime: async () => READY,
      renderOne: async () => ({ outcome: 'rendered', html: '', cached: false })
    });
    expect(packet.$schema).toBe(PREVIEW_CACHE_WARM_SCHEMA);
    expect(packet.schemaVersion).toBe(1);
    expect(packet.repositoryRoot).toBe('/repo');
    expect(packet.cacheDirectory).toBe('/cache');
  });
});

describe('preview-cache-warm CLI main (VHS-REQ-671.6)', () => {
  it('fails closed with a remedy when --cache-dir is absent', async () => {
    const run = vi.fn();
    const code = await main(['--repo-root', '/repo'], { run });
    expect(code).toBe(2);
    expect(run).not.toHaveBeenCalled();
  });

  it('exits 0 when the runtime is ready and nothing failed', async () => {
    const run = vi.fn(async () => ({
      $schema: PREVIEW_CACHE_WARM_SCHEMA,
      schemaVersion: 1 as const,
      generatedAt: '2026-07-18T00:00:00.000Z',
      repositoryRoot: '/repo',
      cacheDirectory: '/cache',
      runtime: { outcome: 'ready' as const, provider: 'linux-container' },
      totals: { total: 1, rendered: 1, cacheHit: 0, failed: 0, blocked: 0, bytes: 10 },
      entries: []
    }));
    const code = await main(['--cache-dir', '/cache', '--json'], { run });
    expect(code).toBe(0);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ cacheDirectory: '/cache', requestedProvider: 'docker' }));
  });

  it('exits 1 when the runtime is blocked', async () => {
    const run = vi.fn(async () => ({
      $schema: PREVIEW_CACHE_WARM_SCHEMA,
      schemaVersion: 1 as const,
      generatedAt: '2026-07-18T00:00:00.000Z',
      repositoryRoot: '/repo',
      cacheDirectory: '/cache',
      runtime: { outcome: 'blocked' as const, provider: 'unknown', reason: 'docker-daemon-unreachable' },
      totals: { total: 0, rendered: 0, cacheHit: 0, failed: 0, blocked: 0, bytes: 0 },
      entries: []
    }));
    expect(await main(['--cache-dir', '/cache'], { run })).toBe(1);
  });

  it('exits 1 when a VI failed to render', async () => {
    const run = vi.fn(async () => ({
      $schema: PREVIEW_CACHE_WARM_SCHEMA,
      schemaVersion: 1 as const,
      generatedAt: '2026-07-18T00:00:00.000Z',
      repositoryRoot: '/repo',
      cacheDirectory: '/cache',
      runtime: { outcome: 'ready' as const, provider: 'linux-container' },
      totals: { total: 2, rendered: 1, cacheHit: 0, failed: 1, blocked: 0, bytes: 5 },
      entries: []
    }));
    expect(await main(['--cache-dir', '/cache'], { run })).toBe(1);
  });

  it('retains the packet through a path-safe --output', async () => {
    const run = vi.fn(async () => ({
      $schema: PREVIEW_CACHE_WARM_SCHEMA,
      schemaVersion: 1 as const,
      generatedAt: '2026-07-18T00:00:00.000Z',
      repositoryRoot: '/repo',
      cacheDirectory: '/cache',
      runtime: { outcome: 'ready' as const, provider: 'linux-container' },
      totals: { total: 0, rendered: 0, cacheHit: 0, failed: 0, blocked: 0, bytes: 0 },
      entries: []
    }));
    const writeOutput = vi.fn(async () => undefined);
    await main(['--cache-dir', '/cache', '--output', 'evidence/warm.json'], { run, writeOutput });
    expect(writeOutput).toHaveBeenCalledWith('evidence/warm.json', expect.stringContaining(PREVIEW_CACHE_WARM_SCHEMA));
  });

  it('rejects an absolute --output path through the default path-safe writer', async () => {
    const run = vi.fn(async () => ({
      $schema: PREVIEW_CACHE_WARM_SCHEMA,
      schemaVersion: 1 as const,
      generatedAt: '2026-07-18T00:00:00.000Z',
      repositoryRoot: '/repo',
      cacheDirectory: '/cache',
      runtime: { outcome: 'ready' as const, provider: 'linux-container' },
      totals: { total: 0, rendered: 0, cacheHit: 0, failed: 0, blocked: 0, bytes: 0 },
      entries: []
    }));
    // No writeOutput dep -> exercises defaultWriteOutput, which rejects absolute paths.
    await expect(main(['--cache-dir', '/cache', '--output', '/etc/evil.json'], { run })).rejects.toThrow(
      /--output must be a relative path/
    );
  });

  it('rejects a parent-escaping --output path through the default path-safe writer', async () => {
    const run = vi.fn(async () => ({
      $schema: PREVIEW_CACHE_WARM_SCHEMA,
      schemaVersion: 1 as const,
      generatedAt: '2026-07-18T00:00:00.000Z',
      repositoryRoot: '/repo',
      cacheDirectory: '/cache',
      runtime: { outcome: 'ready' as const, provider: 'linux-container' },
      totals: { total: 0, rendered: 0, cacheHit: 0, failed: 0, blocked: 0, bytes: 0 },
      entries: []
    }));
    await expect(
      main(['--cache-dir', '/cache', '--output', '../escape.json'], { run })
    ).rejects.toThrow(/--output must stay within the working directory/);
  });
});
