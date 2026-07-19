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
