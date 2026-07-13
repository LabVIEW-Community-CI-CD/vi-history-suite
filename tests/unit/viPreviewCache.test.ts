import { describe, expect, it, vi } from 'vitest';

import {
  computeViPreviewCacheKey,
  createFileViPreviewCache,
  type FileViPreviewCacheFsDeps
} from '../../src/reporting/viPreview/viPreviewCache';

describe('computeViPreviewCacheKey', () => {
  it('is a 64-char hex digest that is order-independent', () => {
    const a = computeViPreviewCacheKey('Foo.vi', [
      { relativePath: 'Foo.vi', sizeBytes: 10, mtimeMs: 100 },
      { relativePath: 'support/Sub.vi', sizeBytes: 20, mtimeMs: 200 }
    ]);
    const b = computeViPreviewCacheKey('Foo.vi', [
      { relativePath: 'support/Sub.vi', sizeBytes: 20, mtimeMs: 200 },
      { relativePath: 'Foo.vi', sizeBytes: 10, mtimeMs: 100 }
    ]);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(b);
  });

  it('changes when a file size or mtime changes and normalizes separators', () => {
    const base = computeViPreviewCacheKey('a/Foo.vi', [{ relativePath: 'a/Foo.vi', sizeBytes: 10, mtimeMs: 100 }]);
    expect(computeViPreviewCacheKey('a/Foo.vi', [{ relativePath: 'a/Foo.vi', sizeBytes: 11, mtimeMs: 100 }])).not.toBe(base);
    expect(computeViPreviewCacheKey('a/Foo.vi', [{ relativePath: 'a/Foo.vi', sizeBytes: 10, mtimeMs: 101 }])).not.toBe(base);
    // Backslash and forward slash hash identically (target and entries).
    expect(computeViPreviewCacheKey('a\\Foo.vi', [{ relativePath: 'a\\Foo.vi', sizeBytes: 10, mtimeMs: 100 }])).toBe(base);
  });

  it('distinguishes different target VIs that share the same staged file set (VHS-REQ-659.11, #646)', () => {
    const entries = [
      { relativePath: 'left/A.vi', sizeBytes: 10, mtimeMs: 100 },
      { relativePath: 'left/B.vi', sizeBytes: 20, mtimeMs: 200 }
    ];
    // Same staged tree, different render target -> distinct keys, so selecting a
    // second VI in one project never returns the first VI's cached document.
    expect(computeViPreviewCacheKey('left/A.vi', entries)).not.toBe(
      computeViPreviewCacheKey('left/B.vi', entries)
    );
  });
});

function makeFsDeps(overrides: Partial<FileViPreviewCacheFsDeps> = {}): FileViPreviewCacheFsDeps {
  return {
    ensureDirectory: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue([]),
    fileModifiedMs: vi.fn().mockResolvedValue(0),
    removeFile: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

const KEY = 'a'.repeat(64);

describe('createFileViPreviewCache', () => {
  it('returns undefined on a read miss and for malformed keys', async () => {
    const fsDeps = makeFsDeps();
    const cache = createFileViPreviewCache({ cacheDirectory: '/c', joinPath: (d, n) => `${d}/${n}` }, fsDeps);
    expect(await cache.get(KEY)).toBeUndefined();
    expect(await cache.get('not-a-key')).toBeUndefined();
    expect(fsDeps.readFile).toHaveBeenCalledTimes(1); // malformed key never touches the fs
  });

  it('writes under <key>.html and reads it back', async () => {
    const store = new Map<string, string>();
    const fsDeps = makeFsDeps({
      writeFile: vi.fn(async (filePath: string, data: string) => {
        store.set(filePath, data);
      }),
      readFile: vi.fn(async (filePath: string) => {
        const value = store.get(filePath);
        if (value === undefined) {
          throw new Error('ENOENT');
        }
        return value;
      })
    });
    const cache = createFileViPreviewCache({ cacheDirectory: '/c', joinPath: (d, n) => `${d}/${n}` }, fsDeps);

    await cache.set(KEY, '<HTML>doc</HTML>');
    expect(fsDeps.ensureDirectory).toHaveBeenCalledWith('/c');
    expect(store.get(`/c/${KEY}.html`)).toBe('<HTML>doc</HTML>');
    expect(await cache.get(KEY)).toBe('<HTML>doc</HTML>');
  });

  it('evicts the oldest entries beyond maxEntries on write', async () => {
    const fsDeps = makeFsDeps({
      listFiles: vi.fn().mockResolvedValue(['old.html', 'mid.html', 'new.html']),
      fileModifiedMs: vi.fn(async (filePath: string) =>
        filePath.endsWith('old.html') ? 1 : filePath.endsWith('mid.html') ? 2 : 3
      )
    });
    const cache = createFileViPreviewCache(
      { cacheDirectory: '/c', maxEntries: 2, joinPath: (d, n) => `${d}/${n}` },
      fsDeps
    );

    await cache.set(KEY, '<HTML></HTML>');
    expect(fsDeps.removeFile).toHaveBeenCalledTimes(1);
    expect(fsDeps.removeFile).toHaveBeenCalledWith('/c/old.html');
  });
});
