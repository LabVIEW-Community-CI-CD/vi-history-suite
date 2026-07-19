/**
 * VHS-REQ-675: preview-cache health / coverage read-model.
 *
 * Given the current workspace VI set, a prior warm manifest
 * (`vi-history-suite/preview-cache-warm@v1`, produced by the headless worker,
 * VHS-REQ-671), and the cache directory's present `<key>.html` files, this
 * module reports which VIs are cached, stale, or missing, plus orphaned cache
 * files and an overall coverage percentage. It observes the fabric so an agent
 * or CI can drive incremental warms and prune superseded entries.
 *
 * It is a pure read-model over its inputs (no filesystem, no rendering): the CLI
 * supplies the workspace enumeration, parses the manifest, and lists the cache
 * directory. It never launches LabVIEW and never mutates the cache.
 */

export const PREVIEW_CACHE_HEALTH_SCHEMA = 'vi-history-suite/preview-cache-health@v1';

/** Per-VI coverage classification. */
export type ViPreviewCacheHealthStatus =
  /** The manifest maps this VI to a cache key whose file is present. */
  | 'cached'
  /** The VI was warmed to a key, but that key's cache file is now absent. */
  | 'stale'
  /** The VI is in the workspace but not covered by the manifest at all. */
  | 'missing'
  /** The manifest recorded this VI as failed/blocked at warm time. */
  | 'failed';

/** One VI's coverage record. */
export interface ViPreviewCacheHealthEntry {
  relativePath: string;
  status: ViPreviewCacheHealthStatus;
  /** The content-addressed key the manifest recorded for this VI, if any. */
  key: string | null;
  /** Whether that key's `<key>.html` file is present in the cache directory. */
  cacheFilePresent: boolean;
}

/** Aggregate coverage totals. */
export interface ViPreviewCacheHealthTotals {
  workspaceVis: number;
  cached: number;
  stale: number;
  missing: number;
  failed: number;
  /** Cache files present but not referenced by any manifest entry. */
  orphanedCacheFiles: number;
  /** Manifest entries whose VI is no longer in the workspace. */
  removedVis: number;
  /** Percentage of workspace VIs currently cached (0..100, integer). */
  coveragePercent: number;
}

/** The self-describing health report packet. */
export interface ViPreviewCacheHealthReport {
  $schema: typeof PREVIEW_CACHE_HEALTH_SCHEMA;
  schemaVersion: 1;
  generatedAt: string;
  cacheDirectory: string;
  /** True when a warm manifest was supplied; without it, per-VI mapping is unavailable. */
  manifestPresent: boolean;
  totals: ViPreviewCacheHealthTotals;
  entries: ViPreviewCacheHealthEntry[];
  /** Cache-key files present in the directory but not referenced by the manifest. */
  orphanedCacheKeys: string[];
  /** Manifest VI paths no longer present in the workspace enumeration. */
  removedViPaths: string[];
  /** Whether the cache is fully healthy: every workspace VI cached, no failures. */
  healthy: boolean;
}

/** The subset of a warm manifest entry the health model needs. */
export interface ViPreviewCacheHealthManifestEntry {
  relativePath: string;
  key: string | null;
  outcome: 'rendered' | 'cache-hit' | 'failed' | 'blocked';
}

/** The subset of a warm manifest the health model needs. */
export interface ViPreviewCacheHealthManifest {
  entries: readonly ViPreviewCacheHealthManifestEntry[];
}

export interface BuildViPreviewCacheHealthInput {
  cacheDirectory: string;
  /** Current workspace VI paths, repository-relative and separator-normalized. */
  workspaceViPaths: readonly string[];
  /** Prior warm manifest, or undefined when none was supplied. */
  manifest?: ViPreviewCacheHealthManifest;
  /** Content-addressed keys physically present in the cache directory. */
  presentCacheKeys: readonly string[];
  generatedAt: string;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function computeCoveragePercent(cached: number, workspaceVis: number): number {
  if (workspaceVis <= 0) {
    return 100;
  }
  return Math.max(0, Math.min(100, Math.floor((cached / workspaceVis) * 100)));
}

/**
 * Builds the preview-cache health report from the current workspace VIs, a prior
 * warm manifest, and the set of cache keys present on disk. Pure and total:
 * unknown/duplicate inputs are handled deterministically and it never throws.
 */
export function buildViPreviewCacheHealth(
  input: BuildViPreviewCacheHealthInput
): ViPreviewCacheHealthReport {
  const presentKeys = new Set(input.presentCacheKeys);
  const workspacePaths = Array.from(new Set(input.workspaceViPaths.map(normalizePath))).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  const manifestIndex = new Map<string, ViPreviewCacheHealthManifestEntry>();
  const manifestKeys = new Set<string>();
  if (input.manifest) {
    for (const entry of input.manifest.entries) {
      const relativePath = normalizePath(entry.relativePath);
      manifestIndex.set(relativePath, { ...entry, relativePath });
      if (entry.key) {
        manifestKeys.add(entry.key);
      }
    }
  }

  const entries: ViPreviewCacheHealthEntry[] = [];
  let cached = 0;
  let stale = 0;
  let missing = 0;
  let failed = 0;

  for (const relativePath of workspacePaths) {
    const manifestEntry = manifestIndex.get(relativePath);
    if (!manifestEntry) {
      entries.push({ relativePath, status: 'missing', key: null, cacheFilePresent: false });
      missing += 1;
      continue;
    }
    if (manifestEntry.outcome === 'failed' || manifestEntry.outcome === 'blocked') {
      entries.push({
        relativePath,
        status: 'failed',
        key: manifestEntry.key,
        cacheFilePresent: manifestEntry.key ? presentKeys.has(manifestEntry.key) : false
      });
      failed += 1;
      continue;
    }
    // Rendered / cache-hit: covered only when the recorded key's file is present.
    const present = manifestEntry.key ? presentKeys.has(manifestEntry.key) : false;
    if (present) {
      entries.push({ relativePath, status: 'cached', key: manifestEntry.key, cacheFilePresent: true });
      cached += 1;
    } else {
      // Warmed to a key, but the cache file is gone (evicted/removed) -> stale.
      entries.push({ relativePath, status: 'stale', key: manifestEntry.key, cacheFilePresent: false });
      stale += 1;
    }
  }

  // Orphaned cache files: present keys not referenced by any manifest entry.
  const orphanedCacheKeys = Array.from(presentKeys)
    .filter((key) => !manifestKeys.has(key))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  // Removed VIs: manifest paths no longer in the workspace.
  const workspaceSet = new Set(workspacePaths);
  const removedViPaths = Array.from(manifestIndex.keys())
    .filter((relativePath) => !workspaceSet.has(relativePath))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const totals: ViPreviewCacheHealthTotals = {
    workspaceVis: workspacePaths.length,
    cached,
    stale,
    missing,
    failed,
    orphanedCacheFiles: orphanedCacheKeys.length,
    removedVis: removedViPaths.length,
    coveragePercent: computeCoveragePercent(cached, workspacePaths.length)
  };

  return {
    $schema: PREVIEW_CACHE_HEALTH_SCHEMA,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    cacheDirectory: input.cacheDirectory,
    manifestPresent: Boolean(input.manifest),
    totals,
    entries,
    orphanedCacheKeys,
    removedViPaths,
    healthy: workspacePaths.length > 0 && cached === workspacePaths.length && failed === 0
  };
}
