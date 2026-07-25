// Shared cache-key validator (supporting VHS-REQ-610 dashboard aggregate
// review). Three cache modules (single-VI preview render cache, semantic
// narrative cache, comparison model cache) each defined the byte-identical
// `isValidKey` guard that a key is a 64-character lowercase hex string (a
// SHA-256 hex digest). This centralizes that guard so cache-key validation
// stays consistent.
//
// It also centralizes the vihs cache DIRECTORY convention: all vihs caches are
// repo-relative under `<repositoryRoot>/.vihs/cache/<subsystem>`, mirroring
// lvkit's `<repo>/.lvkit/cache` layout so the analysis caches live alongside the
// repo they describe (and travel/clear with it).

import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';

// True when `key` is a 64-character lowercase hex string (a SHA-256 hex digest),
// the shape used for content-addressed cache keys.
export function isSha256HexKey(key: string): boolean {
  return /^[a-f0-9]{64}$/.test(key);
}

/** The repo-relative cache root directory name (sibling of lvkit's `.lvkit`). */
export const VIHS_CACHE_ROOT_DIRNAME = '.vihs';

/**
 * Resolve the vihs cache ROOT, following lvkit's `<repo>/.lvkit/cache` layout
 * with a `.vihs/cache` sibling. Precedence:
 *   1. `VIHS_CACHE_DIR` env override (an explicit absolute cache root), else
 *   2. repo-relative `<repositoryRoot>/.vihs/cache` when a repository root is
 *      known (the normal path), else
 *   3. `<os.tmpdir()>/.vihs/cache` as a last resort when no repo is available.
 */
export function resolveVihsCacheRoot(
  repositoryRoot: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = env.VIHS_CACHE_DIR?.trim();
  if (configured) {
    return configured;
  }
  const repo = repositoryRoot?.trim();
  return path.join(repo && repo.length > 0 ? repo : os.tmpdir(), VIHS_CACHE_ROOT_DIRNAME, 'cache');
}

/**
 * Resolve a named subsystem cache directory under the repo-relative vihs cache
 * root, e.g. `resolveVihsCacheDir(repo, 'vi-comparison')` ->
 * `<repo>/.vihs/cache/vi-comparison`.
 */
export function resolveVihsCacheDir(
  repositoryRoot: string | undefined,
  subsystem: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return path.join(resolveVihsCacheRoot(repositoryRoot, env), subsystem);
}

/**
 * Best-effort mkdir for a vihs cache directory that ALSO keeps the cache out of
 * the analyzed repo's git status: when the directory is repo-relative
 * (`<repo>/.vihs/cache/...`), a `.gitignore` containing `*` is dropped at the
 * `.vihs` root so cache files never surface as untracked (mirroring how lvkit's
 * `.lvkit/` stays out of the tree). The self-ignore is best-effort and never
 * throws; the mkdir failure (if any) propagates so a caller's own try/catch can
 * decide, matching the caches' fail-closed write behavior.
 */
export async function ensureVihsCacheDir(directory: string): Promise<void> {
  await fsp.mkdir(directory, { recursive: true });
  const marker = `${path.sep}${VIHS_CACHE_ROOT_DIRNAME}${path.sep}`;
  const idx = directory.indexOf(marker);
  if (idx < 0) {
    return; // an explicit VIHS_CACHE_DIR override without a `.vihs` root: leave it alone
  }
  const vihsRoot = directory.slice(0, idx + marker.length - 1);
  try {
    await fsp.writeFile(path.join(vihsRoot, '.gitignore'), '*\n');
  } catch {
    // Best-effort self-ignore; a failure must never fail the cache operation.
  }
}
