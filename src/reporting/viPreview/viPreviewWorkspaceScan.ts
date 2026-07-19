/**
 * VHS-REQ-671: headless workspace VI enumeration for the preview-cache worker.
 *
 * The extension's background cache warmer enumerates workspace VIs through
 * `vscode.workspace.findFiles`, which is unavailable to a headless worker driven
 * over `gh codespace ssh` or a CI runner. This module is the VS Code-free
 * equivalent: a deterministic, injected-filesystem recursive walk that lists the
 * LabVIEW source files a preview render targets (`.vi`/`.vit`/`.vim`/`.ctl`),
 * skipping the same build/dependency directories the warmer excludes. It is
 * pure over its injected fs boundary so it is unit-testable without a real tree.
 */

/** One directory entry surfaced by the injected filesystem. */
export interface ViPreviewWorkspaceDirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

/** Injected filesystem boundary for the workspace walk (read-only). */
export interface ViPreviewWorkspaceScanFsDeps {
  /** Lists the immediate children of `directory` (non-recursive). */
  listDirectory: (directory: string) => Promise<ViPreviewWorkspaceDirEntry[]>;
  /** Joins a directory and a child name into a path. */
  joinPath: (directory: string, name: string) => string;
}

/** Options controlling the workspace VI enumeration. */
export interface ListWorkspaceViFilesOptions {
  /**
   * Maximum number of VI files to return (after sorting). When the tree holds
   * more, the deterministic first `limit` paths are returned. Non-positive or
   * omitted means no cap. Mirrors the warmer's file-count guard.
   */
  limit?: number;
  /**
   * Directory names to skip anywhere in the walk. Defaults to the same set the
   * background warmer excludes.
   */
  excludeDirectories?: readonly string[];
  /**
   * Maximum directory depth to descend (root = depth 0). Bounds the walk so a
   * cyclic/symlinked tree can never recurse forever. Default 64.
   */
  maxDepth?: number;
}

/** LabVIEW source extensions a single-VI preview render targets. */
const VI_FILE_EXTENSIONS = ['.vi', '.vit', '.vim', '.ctl'] as const;

/** Build/dependency directories the background warmer skips. */
export const DEFAULT_WORKSPACE_SCAN_EXCLUDES: readonly string[] = [
  'node_modules',
  '.git',
  'out',
  'dist',
  '.vscode-test'
];

const DEFAULT_MAX_DEPTH = 64;

/** True when a file name has a LabVIEW preview-target extension (case-insensitive). */
export function isViPreviewTargetFile(name: string): boolean {
  const lower = name.toLowerCase();
  return VI_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Recursively enumerates preview-target VI files under `rootDirectory`, skipping
 * excluded directory names, bounded by `maxDepth`, returned as
 * deterministically sorted paths (joined from the root via the injected
 * `joinPath`). Never throws: an unreadable directory contributes nothing. When
 * `limit` is a positive number, at most that many paths are returned.
 */
export async function listWorkspaceViFiles(
  rootDirectory: string,
  deps: ViPreviewWorkspaceScanFsDeps,
  options: ListWorkspaceViFilesOptions = {}
): Promise<string[]> {
  const excludes = new Set(
    (options.excludeDirectories ?? DEFAULT_WORKSPACE_SCAN_EXCLUDES).map((name) => name)
  );
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const found: string[] = [];

  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > maxDepth) {
      return;
    }
    let entries: ViPreviewWorkspaceDirEntry[];
    try {
      entries = await deps.listDirectory(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory) {
        if (excludes.has(entry.name)) {
          continue;
        }
        await walk(deps.joinPath(directory, entry.name), depth + 1);
      } else if (entry.isFile && isViPreviewTargetFile(entry.name)) {
        found.push(deps.joinPath(directory, entry.name));
      }
    }
  };

  await walk(rootDirectory, 0);
  // Deterministic code-point sort (not locale-aware `localeCompare`, which can
  // reorder by ICU locale and diverge between hosts/CI).
  found.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  if (typeof options.limit === 'number' && options.limit > 0 && found.length > options.limit) {
    return found.slice(0, options.limit);
  }
  return found;
}

/** A shard assignment: render the `index`-th slice of `count` total shards. */
export interface ViPreviewWorkspaceShard {
  /** Zero-based shard index (0 <= index < count). */
  index: number;
  /** Total number of shards (>= 1). */
  count: number;
}

/**
 * Selects the subset of `paths` belonging to a shard, for the cache-generation
 * fleet (VHS-REQ-674): the workspace VI set is split across a runner matrix so
 * each shard renders a disjoint slice, and the union of all shards is exactly
 * the input (no VI rendered twice, none skipped). Assignment is round-robin by
 * position (`i % count === index`), which balances evenly for any ordering.
 * An out-of-range or non-positive shard returns [] (index) or the whole list
 * (count <= 1), never throwing.
 */
export function selectWorkspaceViShard(
  paths: readonly string[],
  shard: ViPreviewWorkspaceShard
): string[] {
  const count = Math.floor(shard.count);
  const index = Math.floor(shard.index);
  if (!Number.isFinite(count) || count <= 1) {
    return index === 0 || !Number.isFinite(index) ? paths.slice() : [];
  }
  if (!Number.isFinite(index) || index < 0 || index >= count) {
    return [];
  }
  return paths.filter((_, position) => position % count === index);
}
