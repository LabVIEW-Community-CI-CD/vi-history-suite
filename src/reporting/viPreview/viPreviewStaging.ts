/**
 * VHS-REQ-659: dependency-aware staging plan for single-VI preview.
 *
 * A LabVIEW VI usually depends on subVIs, type definitions, and libraries that
 * live beside it. Staging only the opened VI leaves those links unresolved, so
 * the VI loads broken and the preview is empty. This planner selects the
 * LabVIEW source files to stage alongside the VI: it prefers the enclosing
 * LabVIEW project (`.lvproj`) tree so dependencies in sibling directories
 * resolve (`planViPreviewStagingWithProjectRoot` / `selectViPreviewStagingRoot`),
 * falling back to the VI's containing directory tree and then to single-file
 * staging when a tree is implausibly large (avoiding copying a huge or
 * unrelated directory).
 *
 * Pure so the selection and guard logic stay unit-testable without a
 * filesystem.
 */

import { toPosix } from '../../support/pathStyle';

/** LabVIEW source/library file extensions worth staging for dependency resolution. */
export const LABVIEW_SOURCE_EXTENSIONS = [
  '.vi',
  '.vit',
  '.vim',
  '.ctl',
  '.lvlib',
  '.lvclass',
  '.lvproj',
  '.llb'
] as const;

export interface ViPreviewStagingEntry {
  /** Path relative to the VI's containing directory, using any separator. */
  relativePath: string;
  sizeBytes: number;
  /** Last-modified time (epoch ms), used for preview render cache invalidation. */
  mtimeMs?: number;
}

export interface ViPreviewStagingLimits {
  maxFiles: number;
  maxTotalBytes: number;
}

export const DEFAULT_VI_PREVIEW_STAGING_LIMITS: ViPreviewStagingLimits = {
  maxFiles: 1000,
  maxTotalBytes: 256 * 1024 * 1024
};

export interface ViPreviewStagingPlan {
  strategy: 'dependency-tree' | 'single-file';
  /** POSIX-normalized relative paths to copy into the staging root (always includes the VI). */
  filesToStage: string[];
  /** POSIX-normalized relative path of the VI within the staging root. */
  viRelativePath: string;
  /** Why single-file staging was chosen, when it was. */
  reason?: 'too-many-files' | 'too-large' | 'no-siblings';
}

export function isLabviewSourceFile(relativePath: string): boolean {
  const lower = toPosix(relativePath).toLowerCase();
  return LABVIEW_SOURCE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Builds a staging plan for `viRelativePath` (the VI's path relative to its
 * containing directory, normally its basename) given the LabVIEW source
 * `entries` discovered under that directory. Applies the size/count guard and
 * always includes the VI itself.
 */
export function planViPreviewStaging(
  viRelativePath: string,
  entries: ViPreviewStagingEntry[],
  limits: ViPreviewStagingLimits = DEFAULT_VI_PREVIEW_STAGING_LIMITS
): ViPreviewStagingPlan {
  const viPath = toPosix(viRelativePath);
  const singleFile = (reason: ViPreviewStagingPlan['reason']): ViPreviewStagingPlan => ({
    strategy: 'single-file',
    filesToStage: [viPath],
    viRelativePath: viPath,
    reason
  });

  const sources = entries
    .map((entry) => ({ relativePath: toPosix(entry.relativePath), sizeBytes: entry.sizeBytes }))
    .filter((entry) => isLabviewSourceFile(entry.relativePath));

  // Guarantee the VI is present even if the enumeration omitted it.
  const includesVi = sources.some((entry) => entry.relativePath === viPath);
  const staged = includesVi ? sources : [{ relativePath: viPath, sizeBytes: 0 }, ...sources];

  if (staged.length <= 1) {
    return singleFile('no-siblings');
  }
  if (staged.length > limits.maxFiles) {
    return singleFile('too-many-files');
  }
  if (staged.reduce((total, entry) => total + entry.sizeBytes, 0) > limits.maxTotalBytes) {
    return singleFile('too-large');
  }

  // De-duplicate while preserving order (the VI first for readability).
  const seen = new Set<string>();
  const filesToStage: string[] = [];
  for (const entry of [{ relativePath: viPath, sizeBytes: 0 }, ...staged]) {
    if (!seen.has(entry.relativePath)) {
      seen.add(entry.relativePath);
      filesToStage.push(entry.relativePath);
    }
  }

  return { strategy: 'dependency-tree', filesToStage, viRelativePath: viPath };
}

/** POSIX directory of a relative path; '' for a top-level (base) path. */
function posixDirname(relativePath: string): string {
  const index = relativePath.lastIndexOf('/');
  return index < 0 ? '' : relativePath.slice(0, index);
}

/**
 * Ancestor directories of `directory`, deepest first, always ending with the
 * empty string (the shared base). For `a/b/c` -> `['a/b/c', 'a/b', 'a', '']`.
 */
function ancestorsDeepestFirst(directory: string): string[] {
  const result: string[] = [];
  let current = directory;
  while (current.length > 0) {
    result.push(current);
    current = posixDirname(current);
  }
  result.push('');
  return result;
}

/**
 * Chooses the dependency staging root for the VI: the nearest ancestor
 * directory (including the VI's own directory) that directly contains a LabVIEW
 * project file (`*.lvproj`). Staging the whole project tree preserves the
 * relative layout so subVI/type-definition references in sibling directories
 * resolve at load time. Falls back to the VI's containing directory when no
 * enclosing project is present. All paths are POSIX and relative to a shared
 * base; `''` denotes the base itself.
 */
export function selectViPreviewStagingRoot(
  viRelativePath: string,
  sourceRelativePaths: string[]
): string {
  const viDirectory = posixDirname(toPosix(viRelativePath));
  const projectDirectories = new Set<string>();
  for (const raw of sourceRelativePaths) {
    const candidate = toPosix(raw);
    if (candidate.toLowerCase().endsWith('.lvproj')) {
      projectDirectories.add(posixDirname(candidate));
    }
  }
  if (projectDirectories.size === 0) {
    return viDirectory;
  }
  for (const ancestor of ancestorsDeepestFirst(viDirectory)) {
    if (projectDirectories.has(ancestor)) {
      return ancestor;
    }
  }
  return viDirectory;
}

/**
 * VHS-REQ-659 large-project safeguard: a preview whose staging could not cover
 * the VI's full dependency set, so its block diagram may carry unresolved "?"
 * sub-VI placeholders. Two shapes:
 *  - `single-file` + `too-many-files`/`too-large`: the enclosing project (and its
 *    containing directory) exceeded the staging guard, so only the lone VI staged.
 *  - `dependency-tree`/`single-file` + `project-scope-reduced`: the enclosing
 *    project tripped the guard so staging STEPPED DOWN to the VI's containing
 *    directory; cross-directory dependencies outside that directory were skipped.
 */
export interface ViPreviewStagingDegraded {
  strategy: 'single-file' | 'dependency-tree';
  reason: 'too-many-files' | 'too-large' | 'project-scope-reduced';
}

export interface ViPreviewStagingSelection {
  /** Staging root as a POSIX path relative to the scan base (`''` = the base). */
  stagingRoot: string;
  /** `'project'` when an enclosing `.lvproj` widened the root past the VI directory. */
  rootKind: 'project' | 'directory';
  /** Staging plan whose `filesToStage`/`viRelativePath` are relative to `stagingRoot`. */
  plan: ViPreviewStagingPlan;
  /** Source entries under `stagingRoot`, rebased to it, for render-cache keying. */
  stagedEntries: ViPreviewStagingEntry[];
  /**
   * `true` when the enclosing project tripped the size/count guard so staging
   * stepped DOWN to the VI's containing directory (partial scope) rather than
   * staging the whole project. Cross-directory dependencies were not staged.
   */
  stepDownFromProject: boolean;
}

/** Rebases `entries` (relative to the base) to `root`, keeping only those under it. */
function rebaseEntriesUnderRoot(
  root: string,
  entries: ViPreviewStagingEntry[]
): ViPreviewStagingEntry[] {
  if (root === '') {
    return entries.map((entry) => ({ ...entry, relativePath: toPosix(entry.relativePath) }));
  }
  const prefix = `${root}/`;
  const rebased: ViPreviewStagingEntry[] = [];
  for (const entry of entries) {
    const candidate = toPosix(entry.relativePath);
    if (candidate.startsWith(prefix)) {
      rebased.push({ ...entry, relativePath: candidate.slice(prefix.length) });
    }
  }
  return rebased;
}

/** Rebases the VI path (relative to the base) to `root`. */
function rebaseViPathUnderRoot(root: string, viRelativePath: string): string {
  const viPath = toPosix(viRelativePath);
  if (root === '') {
    return viPath;
  }
  const prefix = `${root}/`;
  return viPath.startsWith(prefix) ? viPath.slice(prefix.length) : viPath.slice(viPath.lastIndexOf('/') + 1);
}

/**
 * Builds a project-aware staging selection: widens the staging root to the
 * enclosing LabVIEW project (so cross-directory dependencies resolve), then
 * falls back to the VI's containing directory tree if the project tree trips
 * the size/count guard (rather than collapsing straight to single-file), and
 * to single-file only when even the containing directory is too large or has no
 * siblings. `entries` and `viRelativePath` are relative to a shared scan base
 * (the project root for the on-disk render, or the repository root for a
 * revision); the returned plan is relative to `stagingRoot`.
 */
export function planViPreviewStagingWithProjectRoot(
  viRelativePath: string,
  entries: ViPreviewStagingEntry[],
  limits: ViPreviewStagingLimits = DEFAULT_VI_PREVIEW_STAGING_LIMITS
): ViPreviewStagingSelection {
  const viPath = toPosix(viRelativePath);
  const viDirectory = posixDirname(viPath);
  const projectRoot = selectViPreviewStagingRoot(
    viPath,
    entries.map((entry) => entry.relativePath)
  );

  const buildSelection = (
    root: string,
    stepDownFromProject = false
  ): ViPreviewStagingSelection => {
    const stagedEntries = rebaseEntriesUnderRoot(root, entries);
    const plan = planViPreviewStaging(rebaseViPathUnderRoot(root, viPath), stagedEntries, limits);
    return {
      stagingRoot: root,
      rootKind: root !== viDirectory ? 'project' : 'directory',
      plan,
      stagedEntries,
      stepDownFromProject
    };
  };

  const widened = buildSelection(projectRoot);
  const trippedGuard =
    widened.plan.strategy === 'single-file' &&
    (widened.plan.reason === 'too-many-files' || widened.plan.reason === 'too-large');
  if (trippedGuard && projectRoot !== viDirectory) {
    // The enclosing project tripped the size/count guard, so STEP DOWN to the
    // VI's containing directory (partial scope). Flag it so a consumer can label
    // the preview scope-reduced: cross-directory dependencies outside this
    // directory were not staged and may render as "?" placeholders.
    return buildSelection(viDirectory, true);
  }
  return widened;
}
