import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type {
  ComparisonRuntimeSelection,
  locateComparisonRuntime
} from '../../src/reporting/comparisonRuntimeLocator';
import { runExecFileText } from '../../src/tooling/execFileText';
import {
  collectViPreviewDiagnostics,
  PREVIEW_DIAGNOSTICS_SCHEMA
} from '../../src/tooling/viPreviewDiagnostics';

// Mock only the exec boundary so the DEFAULT `runDocker` dependency
// (`defaultRunDocker`, which wraps `runExecFileText`) can be exercised without
// spawning a real `docker` process. Every existing test injects its own
// `runDocker`, so this mock is inert for them.
vi.mock('../../src/tooling/execFileText', () => ({
  runExecFileText: vi.fn()
}));

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

  it('reports docker available with no images when the images probe fails', async () => {
    const snapshot = await collectViPreviewDiagnostics(
      { processPlatform: 'linux' },
      {
        now: FIXED_NOW,
        locateRuntime: fakeLocate({ provider: 'linux-container' }),
        runDocker: async (args) => {
          if (args[0] === 'info') {
            return 'linux';
          }
          throw new Error('docker images failed');
        }
      }
    );
    // The daemon answered `info`, so it is available even though `images` failed.
    expect(snapshot.docker.available).toBe(true);
    expect(snapshot.docker.osType).toBe('linux');
    expect(snapshot.docker.labviewImages).toEqual([]);
  });

  it('treats an unreadable cache directory as absent (readCacheEntries rejects)', async () => {
    const snapshot = await collectViPreviewDiagnostics(
      { cacheDirectory: '/unreadable', processPlatform: 'linux' },
      {
        now: FIXED_NOW,
        locateRuntime: fakeLocate({ provider: 'linux-container' }),
        readCacheEntries: async () => {
          throw new Error('EACCES');
        },
        runDocker: async () => 'linux'
      }
    );
    expect(snapshot.cache.present).toBe(false);
    expect(snapshot.cache.entryCount).toBe(0);
    expect(snapshot.cache.directory).toBe('/unreadable');
  });

  it('treats a docker info that returns only whitespace as an undefined osType', async () => {
    const snapshot = await collectViPreviewDiagnostics(
      { processPlatform: 'linux' },
      {
        now: FIXED_NOW,
        locateRuntime: fakeLocate({ provider: 'linux-container' }),
        runDocker: async (args) => (args[0] === 'info' ? '   ' : 'nationalinstruments/labview:2026q1-linux')
      }
    );
    expect(snapshot.docker.available).toBe(true);
    expect(snapshot.docker.osType).toBeUndefined();
  });

  it('falls back to the real clock when no now dependency is injected', async () => {
    const before = Date.now();
    const snapshot = await collectViPreviewDiagnostics(
      { processPlatform: 'linux' },
      {
        locateRuntime: fakeLocate({ provider: 'linux-container' }),
        readCacheEntries: async () => [],
        runDocker: async () => {
          throw new Error('no docker');
        }
      }
    );
    const generated = Date.parse(snapshot.generatedAt);
    expect(Number.isNaN(generated)).toBe(false);
    // Tolerant window: only assert the timestamp is recent, never a tight bound.
    expect(Math.abs(generated - before)).toBeLessThanOrEqual(60_000);
  });

  it('marks a present cache with a null newest timestamp when every entry has a zero mtime', async () => {
    // entryCount > 0 marks the cache present, but a max mtime of 0 keeps
    // newestModifiedAt null (the false arm of `newestMs > 0 ? ... : null`).
    const snapshot = await collectViPreviewDiagnostics(
      { cacheDirectory: '/cache', processPlatform: 'linux' },
      {
        now: FIXED_NOW,
        locateRuntime: fakeLocate({ provider: 'linux-container' }),
        readCacheEntries: async () => [{ name: 'a.html', sizeBytes: 10, mtimeMs: 0 }],
        runDocker: async () => {
          throw new Error('no docker');
        }
      }
    );
    expect(snapshot.cache.present).toBe(true);
    expect(snapshot.cache.entryCount).toBe(1);
    expect(snapshot.cache.newestModifiedAt).toBeNull();
  });

  it('resolves the win32 runtime platform when the process platform is win32', async () => {
    let requestedPlatform: 'win32' | 'linux' | undefined;
    await collectViPreviewDiagnostics(
      { processPlatform: 'win32' },
      {
        now: FIXED_NOW,
        locateRuntime: (async (platform: 'win32' | 'linux') => {
          requestedPlatform = platform;
          return { provider: 'host-native' } as ComparisonRuntimeSelection;
        }) as typeof locateComparisonRuntime,
        readCacheEntries: async () => [],
        runDocker: async () => {
          throw new Error('no docker');
        }
      }
    );
    // processPlatform win32 -> runtimePlatform win32 (the true arm of the ternary).
    expect(requestedPlatform).toBe('win32');
  });

  it('stringifies a non-Error thrown by the runtime locator', async () => {
    const snapshot = await collectViPreviewDiagnostics(
      { processPlatform: 'linux' },
      {
        now: FIXED_NOW,
        locateRuntime: (async () => {
          // Throw a non-Error to exercise the String(error) arm of the catch.
          throw 'locator string failure';
        }) as typeof locateComparisonRuntime,
        readCacheEntries: async () => [],
        runDocker: async () => 'linux'
      }
    );
    expect(snapshot.runtime.outcome).toBe('blocked');
    expect(snapshot.runtime.reason).toBe('locator string failure');
  });
});

describe('defaultPreviewCacheDirectoryHint', () => {
  it('points at the remote globalStorage path', async () => {
    const { defaultPreviewCacheDirectoryHint } = await import(
      '../../src/tooling/viPreviewDiagnostics'
    );
    const hint = defaultPreviewCacheDirectoryHint();
    expect(hint).toContain('globalStorage');
    expect(hint).toContain('.vscode-remote');
  });
});

describe('collectViPreviewDiagnostics default dependency boundaries (VHS-REQ-659)', () => {
  const mockedRunExecFileText = vi.mocked(runExecFileText);

  it('reads a real cache directory through the default readCacheEntries dependency', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vihs-preview-diag-'));
    try {
      await writeFile(join(dir, 'a.html'), 'x'.repeat(100));
      await writeFile(join(dir, 'b.html'), 'y'.repeat(250));
      // A non-.html entry must be skipped by the suffix guard (`continue`).
      await writeFile(join(dir, 'notes.txt'), 'ignore me');

      const snapshot = await collectViPreviewDiagnostics(
        { cacheDirectory: dir, processPlatform: 'linux' },
        {
          now: FIXED_NOW,
          locateRuntime: fakeLocate({ provider: 'linux-container' }),
          // Docker stays injected so this case isolates the real-fs cache read.
          runDocker: async () => {
            throw new Error('no docker');
          }
        }
      );

      expect(snapshot.cache.directory).toBe(dir);
      expect(snapshot.cache.present).toBe(true);
      expect(snapshot.cache.entryCount).toBe(2);
      expect(snapshot.cache.totalBytes).toBe(350);
      expect(snapshot.cache.newestModifiedAt).not.toBeNull();
      expect(typeof snapshot.cache.newestModifiedAt).toBe('string');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('treats a non-existent cache directory as absent via the default reader (readdir rejects)', async () => {
    const missing = join(tmpdir(), `vihs-preview-diag-missing-${Date.now()}-${Math.random()}`);
    const snapshot = await collectViPreviewDiagnostics(
      { cacheDirectory: missing, processPlatform: 'linux' },
      {
        now: FIXED_NOW,
        locateRuntime: fakeLocate({ provider: 'linux-container' }),
        runDocker: async () => {
          throw new Error('no docker');
        }
      }
    );
    expect(snapshot.cache.present).toBe(false);
    expect(snapshot.cache.entryCount).toBe(0);
    expect(snapshot.cache.newestModifiedAt).toBeNull();
  });

  it('probes docker through the default runDocker dependency (info + images succeed)', async () => {
    mockedRunExecFileText.mockReset();
    mockedRunExecFileText
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'linux\n', stderr: '' })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'nationalinstruments/labview:2026q1-linux\nubuntu:24.04\n',
        stderr: ''
      });

    const snapshot = await collectViPreviewDiagnostics(
      { processPlatform: 'linux' },
      {
        now: FIXED_NOW,
        locateRuntime: fakeLocate({ provider: 'linux-container' })
      }
    );

    expect(snapshot.docker.available).toBe(true);
    expect(snapshot.docker.osType).toBe('linux');
    expect(snapshot.docker.labviewImages).toEqual(['nationalinstruments/labview:2026q1-linux']);
    expect(mockedRunExecFileText).toHaveBeenCalledWith(
      'docker',
      ['info', '--format', '{{.OSType}}'],
      expect.anything()
    );
  });

  it('reports docker unavailable when the default runDocker info probe exits nonzero', async () => {
    mockedRunExecFileText.mockReset();
    mockedRunExecFileText.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'cannot connect' });

    const snapshot = await collectViPreviewDiagnostics(
      { processPlatform: 'linux' },
      {
        now: FIXED_NOW,
        locateRuntime: fakeLocate({ provider: 'linux-container' })
      }
    );

    expect(snapshot.docker.available).toBe(false);
    expect(snapshot.docker.labviewImages).toEqual([]);
  });
});
