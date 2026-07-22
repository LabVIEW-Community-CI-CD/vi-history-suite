import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  fetchViPreviewCacheBundle,
  main,
  nodeExchangeDeps,
  parseArgs,
  publishViPreviewCacheBundle,
  type ViPreviewCacheExchangeDeps
} from '../../src/cli/runViPreviewCacheExchange';
import { exportViPreviewCacheBundle } from '../../src/cli/runViPreviewCacheBundle';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

describe('parseArgs (VHS-REQ-673.3)', () => {
  it('parses publish and fetch subcommands', () => {
    expect(parseArgs(['publish', '--bundle-dir', '/b', '--json'])).toEqual({
      command: 'publish',
      bundleDirectory: '/b',
      json: true
    });
    expect(parseArgs(['fetch', '--into', '/c', '--tag', 'preview-cache-abc'])).toEqual({
      command: 'fetch',
      targetDirectory: '/c',
      tag: 'preview-cache-abc'
    });
  });
});

/**
 * Fake exchange deps backed by the real filesystem: a "release store" directory
 * holds one subdir per tag, and the tar archive is a JSON snapshot of the bundle
 * directory so a publish->fetch round-trip faithfully preserves manifest.json +
 * the <key>.html documents for real integrity verification.
 */
function fakeExchangeDeps(releaseStore: string): ViPreviewCacheExchangeDeps {
  const join = (...s: string[]): string => path.join(...s);
  return {
    listReleases: async () => {
      let tags: string[];
      try {
        tags = await fs.readdir(releaseStore);
      } catch {
        return [];
      }
      return tags.map((tag, index) => ({
        tag,
        createdAt: `2026-07-19T00:00:${String(index).padStart(2, '0')}Z`
      }));
    },
    createRelease: async (tag, assetPaths) => {
      const dir = join(releaseStore, tag);
      await fs.mkdir(dir, { recursive: true });
      for (const asset of assetPaths) {
        await fs.copyFile(asset, join(dir, path.basename(asset)));
      }
    },
    downloadRelease: async (tag, destDir) => {
      const dir = join(releaseStore, tag);
      await fs.mkdir(destDir, { recursive: true });
      for (const name of await fs.readdir(dir)) {
        await fs.copyFile(join(dir, name), join(destDir, name));
      }
    },
    packDirectory: async (sourceDir, archivePath) => {
      const snapshot: Record<string, string> = {};
      for (const name of await fs.readdir(sourceDir)) {
        if (name.endsWith('.tar.gz')) {
          continue; // never pack the archive into itself
        }
        snapshot[name] = await fs.readFile(join(sourceDir, name), 'utf8');
      }
      await fs.writeFile(archivePath, JSON.stringify(snapshot), 'utf8');
    },
    extractArchive: async (archivePath, destDir) => {
      const snapshot = JSON.parse(await fs.readFile(archivePath, 'utf8')) as Record<string, string>;
      await fs.mkdir(destDir, { recursive: true });
      for (const [name, content] of Object.entries(snapshot)) {
        await fs.writeFile(join(destDir, name), content, 'utf8');
      }
    },
    readFile: (filePath) => fs.readFile(filePath, 'utf8'),
    ensureDirectory: async (directory) => {
      await fs.mkdir(directory, { recursive: true });
    },
    createTempDirectory: () => fs.mkdtemp(path.join(os.tmpdir(), 'vihs-exchange-test-')),
    removeDirectory: (directory) => fs.rm(directory, { recursive: true, force: true }),
    joinPath: join
  };
}

describe('preview-cache exchange publish/fetch round-trip (VHS-REQ-673.4)', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-exchange-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function makeBundle(dirName: string, docs: Record<string, string>): Promise<string> {
    const cacheDir = path.join(root, `${dirName}-cache`);
    const bundleDir = path.join(root, `${dirName}-bundle`);
    await fs.mkdir(cacheDir, { recursive: true });
    for (const [key, html] of Object.entries(docs)) {
      await fs.writeFile(path.join(cacheDir, `${key}.html`), html);
    }
    await exportViPreviewCacheBundle({ cacheDirectory: cacheDir, bundleDirectory: bundleDir });
    return bundleDir;
  }

  it('publishes a bundle then fetches and merges it into a fresh cache', async () => {
    const store = path.join(root, 'releases');
    await fs.mkdir(store, { recursive: true });
    const deps = fakeExchangeDeps(store);
    const bundleDir = await makeBundle('one', { [KEY_A]: '<a/>', [KEY_B]: '<b/>' });

    const publish = await publishViPreviewCacheBundle(bundleDir, deps);
    expect(publish.ok).toBe(true);
    expect(publish.plan?.action).toBe('publish');

    const targetDir = path.join(root, 'target');
    const fetch = await fetchViPreviewCacheBundle(targetDir, {}, deps);
    expect(fetch).toMatchObject({ ok: true, added: 2, skippedPresent: 0, rejected: 0 });
    expect(await fs.readFile(path.join(targetDir, `${KEY_A}.html`), 'utf8')).toBe('<a/>');
    expect(await fs.readFile(path.join(targetDir, `${KEY_B}.html`), 'utf8')).toBe('<b/>');
  });

  it('is idempotent: re-publishing the same content skips the existing release', async () => {
    const store = path.join(root, 'releases2');
    await fs.mkdir(store, { recursive: true });
    const deps = fakeExchangeDeps(store);
    const bundleDir = await makeBundle('two', { [KEY_A]: '<a/>' });

    expect((await publishViPreviewCacheBundle(bundleDir, deps)).plan?.action).toBe('publish');
    expect((await publishViPreviewCacheBundle(bundleDir, deps)).plan?.action).toBe('skip-existing');
  });

  it('fails publish with bundle-not-found when the bundle directory has no manifest', async () => {
    const deps = fakeExchangeDeps(path.join(root, 'releases3'));
    const result = await publishViPreviewCacheBundle(path.join(root, 'missing'), deps);
    expect(result).toMatchObject({ ok: false, reason: 'bundle-not-found' });
  });

  it('fails fetch with no-release-found when nothing is published', async () => {
    const store = path.join(root, 'empty-store');
    await fs.mkdir(store, { recursive: true });
    const deps = fakeExchangeDeps(store);
    const result = await fetchViPreviewCacheBundle(path.join(root, 'tgt'), {}, deps);
    expect(result).toMatchObject({ ok: false, reason: 'no-release-found' });
  });
});

describe('nodeExchangeDeps default adapter (VHS-REQ-673.4)', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-exchange-node-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('round-trips a directory through real tar pack/extract and the fs helpers', async () => {
    const deps = nodeExchangeDeps();
    const src = deps.joinPath(root, 'src');
    await deps.ensureDirectory(src);
    await fs.writeFile(deps.joinPath(src, 'manifest.json'), '{"entries":[]}');
    await fs.writeFile(deps.joinPath(src, 'x.html'), '<x/>');

    const archive = deps.joinPath(root, 'bundle.tar.gz');
    await deps.packDirectory(src, archive);

    const out = deps.joinPath(root, 'out');
    await deps.ensureDirectory(out);
    await deps.extractArchive(archive, out);
    expect(await deps.readFile(deps.joinPath(out, 'manifest.json'))).toBe('{"entries":[]}');
    expect(await deps.readFile(deps.joinPath(out, 'x.html'))).toBe('<x/>');
  });

  it('creates and removes a temp directory', async () => {
    const deps = nodeExchangeDeps();
    const tmp = await deps.createTempDirectory();
    await fs.writeFile(deps.joinPath(tmp, 'f'), 'x');
    await deps.removeDirectory(tmp);
    await expect(fs.readdir(tmp)).rejects.toThrow();
  });

  it('listReleases returns an array even when gh cannot resolve a repo context', async () => {
    // Run gh from a bare temp dir with no repo context; the adapter swallows the
    // failure and returns an empty list rather than throwing.
    const originalCwd = process.cwd();
    process.chdir(root);
    try {
      const deps = nodeExchangeDeps();
      expect(Array.isArray(await deps.listReleases())).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe('preview-cache-exchange CLI main (VHS-REQ-673.3)', () => {
  it('requires --bundle-dir for publish', async () => {
    const publish = vi.fn();
    expect(await main(['publish'], { publish })).toBe(2);
    expect(publish).not.toHaveBeenCalled();
  });

  it('requires --into for fetch', async () => {
    const fetch = vi.fn();
    expect(await main(['fetch'], { fetch })).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 2 with usage for an unknown command', async () => {
    expect(await main([])).toBe(2);
  });

  it('exits 0 on a successful publish and 1 on failure', async () => {
    expect(
      await main(['publish', '--bundle-dir', '/b'], {
        publish: vi.fn(async () => ({ ok: true, plan: { action: 'publish' as const, tag: 't', contentDigest: 'd', entryCount: 1 } }))
      })
    ).toBe(0);
    expect(
      await main(['publish', '--bundle-dir', '/b'], {
        publish: vi.fn(async () => ({ ok: false, reason: 'bundle-not-found' as const }))
      })
    ).toBe(1);
  });

  it('exits 0 on a successful fetch and 1 on failure', async () => {
    expect(
      await main(['fetch', '--into', '/c'], {
        fetch: vi.fn(async () => ({ ok: true, tag: 't', added: 1, skippedPresent: 0, rejected: 0 }))
      })
    ).toBe(0);
    expect(
      await main(['fetch', '--into', '/c'], {
        fetch: vi.fn(async () => ({ ok: false, reason: 'no-release-found' as const }))
      })
    ).toBe(1);
  });
});

describe('preview-cache-exchange edge branches (VHS-REQ-673.4)', () => {
  const tempDirs: string[] = [];
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  // Minimal exchange deps backed by real temp-dir fs; individual members are
  // overridden per test to force one fetch/publish edge branch each. No `gh`,
  // `tar`, or network is touched.
  function edgeDeps(overrides: Partial<ViPreviewCacheExchangeDeps> = {}): ViPreviewCacheExchangeDeps {
    const join = (...segments: string[]): string => path.join(...segments);
    return {
      listReleases: async () => [{ tag: 'preview-cache-edge', createdAt: '2026-07-19T00:00:00Z' }],
      createRelease: async () => undefined,
      downloadRelease: async () => undefined,
      packDirectory: async () => undefined,
      extractArchive: async () => undefined,
      readFile: (filePath) => fs.readFile(filePath, 'utf8'),
      ensureDirectory: async (directory) => {
        await fs.mkdir(directory, { recursive: true });
      },
      createTempDirectory: async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-exchange-edge-'));
        tempDirs.push(dir);
        return dir;
      },
      removeDirectory: (directory) => fs.rm(directory, { recursive: true, force: true }),
      joinPath: join,
      ...overrides
    };
  }

  it('publish returns bundle-not-found when the manifest entries are not an array', async () => {
    // readBundleManifest parses valid JSON but rejects a non-array `entries`.
    const result = await publishViPreviewCacheBundle(
      '/bundle',
      edgeDeps({ readFile: async () => '{"entries":"not-an-array"}' })
    );
    expect(result).toMatchObject({ ok: false, reason: 'bundle-not-found' });
  });

  it('fetch returns archive-missing when the archive cannot be extracted', async () => {
    const result = await fetchViPreviewCacheBundle(
      path.join(os.tmpdir(), 'vihs-exchange-target-missing'),
      {},
      edgeDeps({
        extractArchive: async () => {
          throw new Error('no archive to extract');
        }
      })
    );
    expect(result).toMatchObject({ ok: false, reason: 'archive-missing', tag: 'preview-cache-edge' });
  });

  it('fetch surfaces the bundle import failure reason for an invalid extracted bundle', async () => {
    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-exchange-target-'));
    tempDirs.push(target);
    // extractArchive is a no-op, so the extract directory stays empty and the
    // real bundle import fails, surfacing its reason rather than throwing.
    const result = await fetchViPreviewCacheBundle(target, {}, edgeDeps());
    expect(result.ok).toBe(false);
    expect(result.tag).toBe('preview-cache-edge');
    expect(result.reason).toBeDefined();
  });

  it('fetch swallows a workspace cleanup failure in the finally block', async () => {
    const result = await fetchViPreviewCacheBundle(
      path.join(os.tmpdir(), 'vihs-exchange-target-cleanup'),
      {},
      edgeDeps({
        extractArchive: async () => {
          throw new Error('no archive to extract');
        },
        removeDirectory: async () => {
          throw new Error('cleanup failed');
        }
      })
    );
    // The rejected removeDirectory is swallowed by `.catch(() => undefined)`, so
    // the archive-missing result still resolves without an unhandled rejection.
    expect(result).toMatchObject({ ok: false, reason: 'archive-missing' });
  });

  it('main publish --json prints the serialized publish result', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const code = await main(['publish', '--bundle-dir', '/b', '--json'], {
        publish: vi.fn(async () => ({
          ok: true,
          plan: { action: 'publish' as const, tag: 't', contentDigest: 'd', entryCount: 2 }
        }))
      });
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"ok":true'));
    } finally {
      logSpy.mockRestore();
    }
  });

  it('main fetch --json prints the serialized fetch result', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const code = await main(['fetch', '--into', '/c', '--json'], {
        fetch: vi.fn(async () => ({ ok: true, tag: 't', added: 3, skippedPresent: 1, rejected: 0 }))
      });
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"added":3'));
    } finally {
      logSpy.mockRestore();
    }
  });

  it('main publish non-json success tolerates a result with no plan (defensive optional chain)', async () => {
    // publishViPreviewCacheBundle always returns a plan on success, but the
    // non-json render defends with `result.plan?.<field> ?? 0`. Feeding an
    // ok:true result WITHOUT a plan exercises the undefined side of every
    // optional chain plus the `?? 0` fallback in one pass.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const code = await main(['publish', '--bundle-dir', '/b'], {
        publish: vi.fn(async () => ({ ok: true }))
      });
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('undefined undefined (0 entries)'));
    } finally {
      logSpy.mockRestore();
    }
  });
});

/**
 * Drives the DEFAULT `nodeExchangeDeps()` GitHub adapter arrows
 * (`listReleases` / `createRelease` / `downloadRelease`) with a canned process
 * runner, so their bodies (which normally shell out to the `gh` CLI) run
 * deterministically and never spawn a real subprocess. The default runner
 * argument is behavior-preserving: production callers pass none and get the
 * real `execFileAsync`; here we pass a fake that returns canned `gh` output.
 */
describe('nodeExchangeDeps GitHub adapter with a canned process runner (VHS-REQ-673.4)', () => {
  type RunnerCall = { file: string; args: readonly string[] };

  function cannedRunner(
    handler: (file: string, args: readonly string[]) => Promise<{ stdout: string }> | { stdout: string }
  ): { run: (file: string, args: readonly string[]) => Promise<{ stdout: string }>; calls: RunnerCall[] } {
    const calls: RunnerCall[] = [];
    const run = async (file: string, args: readonly string[]): Promise<{ stdout: string }> => {
      calls.push({ file, args });
      return handler(file, args);
    };
    return { run, calls };
  }

  it('listReleases parses gh JSON, keeps tagged entries and drops untagged ones', async () => {
    const { run, calls } = cannedRunner(() => ({
      stdout: JSON.stringify([
        { tagName: 'preview-cache-1111', createdAt: '2026-01-01T00:00:00Z' },
        { createdAt: '2026-01-02T00:00:00Z' }
      ])
    }));
    const deps = nodeExchangeDeps(run);
    const releases = await deps.listReleases();
    expect(releases).toEqual([{ tag: 'preview-cache-1111', createdAt: '2026-01-01T00:00:00Z' }]);
    expect(calls[0]).toEqual({
      file: 'gh',
      args: ['release', 'list', '--limit', '200', '--json', 'tagName,createdAt']
    });
  });

  it('listReleases returns [] when gh exits non-zero', async () => {
    const { run } = cannedRunner(() => {
      throw new Error('gh: not authenticated');
    });
    const deps = nodeExchangeDeps(run);
    await expect(deps.listReleases()).resolves.toEqual([]);
  });

  it('listReleases returns [] when gh emits non-JSON output', async () => {
    const { run } = cannedRunner(() => ({ stdout: 'not-json-at-all' }));
    const deps = nodeExchangeDeps(run);
    await expect(deps.listReleases()).resolves.toEqual([]);
  });

  it('createRelease shells gh release create with assets, title, notes and prerelease', async () => {
    const { run, calls } = cannedRunner(() => ({ stdout: '' }));
    const deps = nodeExchangeDeps(run);
    await deps.createRelease(
      'preview-cache-2222',
      ['/tmp/preview-cache-bundle.tar.gz', '/tmp/manifest.json'],
      'Preview cache bundle preview-cache-2222 (3 entries)'
    );
    expect(calls[0]).toEqual({
      file: 'gh',
      args: [
        'release',
        'create',
        'preview-cache-2222',
        '/tmp/preview-cache-bundle.tar.gz',
        '/tmp/manifest.json',
        '--title',
        'Preview cache bundle preview-cache-2222 (3 entries)',
        '--notes',
        'Preview cache bundle preview-cache-2222 (3 entries)',
        '--prerelease'
      ]
    });
  });

  it('downloadRelease shells gh release download into the destination directory', async () => {
    const { run, calls } = cannedRunner(() => ({ stdout: '' }));
    const deps = nodeExchangeDeps(run);
    await deps.downloadRelease('preview-cache-3333', '/tmp/dest');
    expect(calls[0]).toEqual({
      file: 'gh',
      args: ['release', 'download', 'preview-cache-3333', '--dir', '/tmp/dest', '--clobber']
    });
  });
});
