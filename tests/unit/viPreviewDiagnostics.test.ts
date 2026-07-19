import { describe, expect, it } from 'vitest';

import type {
  ComparisonRuntimeSelection,
  locateComparisonRuntime
} from '../../src/reporting/comparisonRuntimeLocator';
import {
  collectViPreviewDiagnostics,
  PREVIEW_DIAGNOSTICS_SCHEMA
} from '../../src/tooling/viPreviewDiagnostics';

function fakeLocate(selection: Partial<ComparisonRuntimeSelection>): typeof locateComparisonRuntime {
  return (async () => selection as ComparisonRuntimeSelection) as typeof locateComparisonRuntime;
}

const FIXED_NOW = () => Date.parse('2026-07-19T06:00:00.000Z');

describe('collectViPreviewDiagnostics (VHS-REQ-659)', () => {
  it('reports a ready docker runtime, cache stats, and labview images', async () => {
    const snapshot = await collectViPreviewDiagnostics(
      { cacheDirectory: '/cache', processPlatform: 'linux' },
      {
        now: FIXED_NOW,
        locateRuntime: fakeLocate({
          provider: 'linux-container',
          linuxContainerImage: 'nationalinstruments/labview:2026q1patch2-linux'
        }),
        readCacheEntries: async () => [
          { name: 'a.html', sizeBytes: 100, mtimeMs: 1000 },
          { name: 'b.html', sizeBytes: 250, mtimeMs: 5000 }
        ],
        runDocker: async (args) => {
          if (args[0] === 'info') return 'linux\n';
          return 'nationalinstruments/labview:2026q1patch2-linux\nubuntu:24.04\n';
        }
      }
    );

    expect(snapshot.schema).toBe(PREVIEW_DIAGNOSTICS_SCHEMA);
    expect(snapshot.generatedAt).toBe('2026-07-19T06:00:00.000Z');
    expect(snapshot.runtime.outcome).toBe('ready');
    expect(snapshot.runtime.provider).toBe('linux-container');
    expect(snapshot.cache).toMatchObject({
      directory: '/cache',
      present: true,
      entryCount: 2,
      totalBytes: 350,
      newestModifiedAt: new Date(5000).toISOString()
    });
    expect(snapshot.docker.available).toBe(true);
    expect(snapshot.docker.osType).toBe('linux');
    expect(snapshot.docker.labviewImages).toEqual([
      'nationalinstruments/labview:2026q1patch2-linux'
    ]);
  });

  it('reports a blocked runtime and empty cache without throwing', async () => {
    const snapshot = await collectViPreviewDiagnostics(
      { cacheDirectory: '/missing', processPlatform: 'linux' },
      {
        now: FIXED_NOW,
        locateRuntime: fakeLocate({ blockedReason: 'runtime-unavailable' }),
        readCacheEntries: async () => [],
        runDocker: async () => {
          throw new Error('docker: command not found');
        }
      }
    );

    expect(snapshot.runtime.outcome).toBe('blocked');
    expect(snapshot.cache.present).toBe(false);
    expect(snapshot.cache.entryCount).toBe(0);
    expect(snapshot.cache.newestModifiedAt).toBeNull();
    expect(snapshot.docker.available).toBe(false);
    expect(snapshot.docker.labviewImages).toEqual([]);
  });

  it('reports a null cache directory when none is supplied', async () => {
    const snapshot = await collectViPreviewDiagnostics(
      { processPlatform: 'linux' },
      {
        now: FIXED_NOW,
        locateRuntime: fakeLocate({ provider: 'linux-container' }),
        runDocker: async (args) => (args[0] === 'info' ? 'linux' : '')
      }
    );
    expect(snapshot.cache.directory).toBeNull();
    expect(snapshot.cache.present).toBe(false);
  });

  it('never throws when runtime resolution itself fails', async () => {
    const snapshot = await collectViPreviewDiagnostics(
      { processPlatform: 'linux' },
      {
        now: FIXED_NOW,
        locateRuntime: (async () => {
          throw new Error('locator exploded');
        }) as typeof locateComparisonRuntime,
        readCacheEntries: async () => [],
        runDocker: async () => 'linux'
      }
    );
    expect(snapshot.runtime.outcome).toBe('blocked');
    expect(snapshot.runtime.reason).toContain('locator exploded');
  });
});
