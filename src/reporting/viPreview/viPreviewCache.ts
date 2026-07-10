import { createHash } from 'node:crypto';

/**
 * VHS-REQ-659: render cache for single-VI previews.
 *
 * The preview custom editor renders on every open, and each render is an
 * expensive LabVIEW invocation (a cold container launch can take a minute).
 * Caching the produced document keyed by the staged file set (path + size +
 * mtime of the VI and its staged dependencies) makes reopening an unchanged VI
 * instant and re-renders only when a staged file changes. The key is pure; the
 * store is behind an injected filesystem boundary so both are unit-testable.
 */

export interface ViPreviewCacheKeyEntry {
  relativePath: string;
  sizeBytes: number;
  mtimeMs?: number;
}

/**
 * Deterministic SHA-256 key over the render TARGET VI plus the staged file set.
 * The target VI's staging-relative path is folded in first so two VIs that share
 * the same staged dependency tree (e.g. two VIs in one project) get DISTINCT
 * keys — otherwise the second VI would incorrectly hit the first VI's cached
 * document (#646). The file-set portion is order-independent (entries are
 * sorted) and a change to any staged file's size or mtime yields a different
 * key, so the cache never returns a stale render for edited inputs.
 */
export function computeViPreviewCacheKey(
  targetViRelativePath: string,
  entries: ViPreviewCacheKeyEntry[]
): string {
  const normalized = entries
    .map((entry) => `${entry.relativePath.replace(/\\/g, '/')}|${entry.sizeBytes}|${entry.mtimeMs ?? 0}`)
    .sort();
  const target = targetViRelativePath.replace(/\\/g, '/');
  return createHash('sha256')
    .update(`target:${target}\n${normalized.join('\n')}`)
    .digest('hex');
}

export interface ViPreviewCache {
  get(key: string): Promise<string | undefined>;
  set(key: string, html: string): Promise<void>;
}

export interface FileViPreviewCacheFsDeps {
  ensureDirectory: (directory: string) => Promise<void>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, data: string) => Promise<void>;
  listFiles: (directory: string) => Promise<string[]>;
  fileModifiedMs: (filePath: string) => Promise<number>;
  removeFile: (filePath: string) => Promise<void>;
}

export interface FileViPreviewCacheOptions {
  cacheDirectory: string;
  /** Maximum cached documents retained; oldest are evicted first. Default 200. */
  maxEntries?: number;
  joinPath: (directory: string, name: string) => string;
}

const CACHE_FILE_SUFFIX = '.html';
const DEFAULT_MAX_ENTRIES = 200;

function isValidKey(key: string): boolean {
  return /^[a-f0-9]{64}$/.test(key);
}

/**
 * File-backed preview cache. Reads/writes `<key>.html` under the cache
 * directory. `get` treats any read failure as a miss; `set` writes the document
 * and best-effort-evicts the oldest entries beyond `maxEntries`.
 */
export function createFileViPreviewCache(
  options: FileViPreviewCacheOptions,
  fsDeps: FileViPreviewCacheFsDeps
): ViPreviewCache {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;

  function cacheFilePath(key: string): string {
    return options.joinPath(options.cacheDirectory, `${key}${CACHE_FILE_SUFFIX}`);
  }

  async function evictExcess(): Promise<void> {
    let names: string[];
    try {
      names = await fsDeps.listFiles(options.cacheDirectory);
    } catch {
      return;
    }
    const cacheFiles = names.filter((name) => name.endsWith(CACHE_FILE_SUFFIX));
    if (cacheFiles.length <= maxEntries) {
      return;
    }
    const withTimes = await Promise.all(
      cacheFiles.map(async (name) => {
        const filePath = options.joinPath(options.cacheDirectory, name);
        try {
          return { filePath, mtimeMs: await fsDeps.fileModifiedMs(filePath) };
        } catch {
          return { filePath, mtimeMs: 0 };
        }
      })
    );
    withTimes.sort((left, right) => left.mtimeMs - right.mtimeMs);
    const evictCount = withTimes.length - maxEntries;
    await Promise.all(
      withTimes.slice(0, evictCount).map((entry) => fsDeps.removeFile(entry.filePath).catch(() => undefined))
    );
  }

  return {
    async get(key: string): Promise<string | undefined> {
      if (!isValidKey(key)) {
        return undefined;
      }
      try {
        return await fsDeps.readFile(cacheFilePath(key));
      } catch {
        return undefined;
      }
    },
    async set(key: string, html: string): Promise<void> {
      if (!isValidKey(key)) {
        return;
      }
      await fsDeps.ensureDirectory(options.cacheDirectory);
      await fsDeps.writeFile(cacheFilePath(key), html);
      await evictExcess();
    }
  };
}
