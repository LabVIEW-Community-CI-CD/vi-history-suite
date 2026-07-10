import * as path from 'node:path';

import {
  executeViPreview,
  type ViPreviewExecutionDeps,
  type ViPreviewExecutionResult,
  type ViPreviewFailureReason,
  type ViPreviewRuntimeSelection
} from './viPreviewExecution';
import {
  planViPreviewStagingWithProjectRoot,
  type ViPreviewStagingEntry
} from './viPreviewStaging';
import { computeViPreviewCacheKey, type ViPreviewCache } from './viPreviewCache';

/**
 * VHS-REQ-659: render an on-disk LabVIEW VI to preview HTML.
 *
 * Stages the selected VI plus its LabVIEW source dependencies — preferring the
 * enclosing LabVIEW project tree so dependencies in sibling directories resolve,
 * and falling back to the containing-directory tree — into a fresh workspace
 * directory (bind-mounted at the container workspace root for the Linux-
 * container provider), runs the preview executor, reads the produced document,
 * and cleans up. A size/count guard steps the staging root down (project ->
 * containing directory -> single file) for implausibly large trees. When a
 * cache is supplied, an unchanged VI (same staged file set by size/mtime) is
 * served from cache without staging or running LabVIEW. Filesystem and process
 * boundaries are injected so the orchestration is unit-testable without a
 * LabVIEW runtime, Docker, or a real temp directory.
 */

export interface RenderViPreviewForFileOptions {
  runtime: ViPreviewRuntimeSelection;
  /** Absolute path to the on-disk VI file to preview. */
  viFilePath: string;
  /** Host directory that contains the `PrintToSingleFileHtml/` operation folder. */
  operationDirectory: string;
}

export interface RenderViPreviewForFileResult {
  outcome: 'rendered' | 'blocked' | 'failed';
  /** The produced LabVIEW HTML document, present only when `rendered`. */
  html?: string;
  /** True when the document was served from the render cache. */
  cached?: boolean;
  failureReason?: ViPreviewFailureReason;
  stderr?: string;
}

export interface RenderViPreviewForFileDeps {
  /** Creates and returns a fresh workspace directory (e.g. via `fs.mkdtemp`). */
  createWorkspaceDirectory: () => Promise<string>;
  /**
   * Lists LabVIEW source files under `directory` (recursively) as paths relative
   * to it, with sizes, for dependency staging. May return an empty array when
   * the directory cannot be read; the render then falls back to single-file
   * staging of the VI alone.
   */
  listSourceFiles: (directory: string) => Promise<ViPreviewStagingEntry[]>;
  /**
   * Optionally resolves the directory to stage from (normally the enclosing
   * LabVIEW project root) so dependencies outside the VI's containing directory
   * resolve. When omitted or resolving to undefined, the VI's containing
   * directory is used, preserving the containing-directory-tree behavior.
   */
  resolveStagingBaseDirectory?: (viFilePath: string) => Promise<string | undefined>;
  ensureDirectory: (directory: string) => Promise<void>;
  copyFile: (source: string, destination: string) => Promise<void>;
  readFile: (filePath: string) => Promise<string>;
  removeDirectory: (directory: string) => Promise<void>;
  /**
   * Execution dependencies for the default executor. Required unless `execute`
   * is provided (the warm-container session supplies its own `execute`).
   */
  execution?: ViPreviewExecutionDeps;
  /**
   * Optional execution override. The default runs the host or `docker run` plan
   * via `executeViPreview`; the warm-container session injects a `docker exec`
   * executor so renders reuse a resident LabVIEW.
   */
  execute?: (
    workspaceDirectory: string,
    viFilename: string,
    outputFilename: string
  ) => Promise<ViPreviewExecutionResult>;
  /** Optional render cache; when supplied, unchanged VIs are served without rendering. */
  cache?: ViPreviewCache;
}

const OUTPUT_FILENAME = 'preview.html';
const STAGING_SUBDIRECTORY = 'vi';

/**
 * Renders `viFilePath` to a self-contained HTML preview and returns the HTML.
 * The workspace directory is always removed, even on failure.
 */
export async function renderViPreviewForFile(
  options: RenderViPreviewForFileOptions,
  deps: RenderViPreviewForFileDeps
): Promise<RenderViPreviewForFileResult> {
  const containingDirectory = path.dirname(options.viFilePath);
  // Prefer the enclosing LabVIEW project directory as the staging base so
  // dependencies in sibling directories resolve; fall back to the VI's own
  // directory (the containing-directory-tree behavior).
  const stagingBaseDirectory =
    (await deps.resolveStagingBaseDirectory?.(options.viFilePath).catch(() => undefined)) ??
    containingDirectory;
  // VI path relative to the staging base (its basename when the base is the
  // containing directory), POSIX-normalized for the staging math.
  const viRelativeToBase = path
    .relative(stagingBaseDirectory, options.viFilePath)
    .split(path.sep)
    .join('/');

  let entries: ViPreviewStagingEntry[];
  try {
    entries = await deps.listSourceFiles(stagingBaseDirectory);
  } catch {
    entries = [];
  }

  const selection = planViPreviewStagingWithProjectRoot(viRelativeToBase, entries);
  // Absolute directory that the selection's relative paths are anchored at.
  const stagingRootDirectory = selection.stagingRoot
    ? path.join(stagingBaseDirectory, ...selection.stagingRoot.split('/'))
    : stagingBaseDirectory;
  const cacheKey = deps.cache
    ? computeStagedCacheKey(selection.plan.filesToStage, selection.stagedEntries)
    : undefined;

  if (deps.cache && cacheKey) {
    const cached = await deps.cache.get(cacheKey).catch(() => undefined);
    if (cached !== undefined) {
      return { outcome: 'rendered', html: cached, cached: true };
    }
  }

  const workspaceDirectory = await deps.createWorkspaceDirectory();
  try {
    for (const relativePath of selection.plan.filesToStage) {
      const segments = relativePath.split('/');
      const source = path.join(stagingRootDirectory, ...segments);
      const destination = path.join(workspaceDirectory, STAGING_SUBDIRECTORY, ...segments);
      await deps.ensureDirectory(path.dirname(destination));
      await deps.copyFile(source, destination);
    }

    // POSIX-joined so the container `-VI` path is well-formed on every host.
    const viFilename = `${STAGING_SUBDIRECTORY}/${selection.plan.viRelativePath}`;

    const execute =
      deps.execute ??
      ((executeWorkspace: string, executeViFilename: string, executeOutputFilename: string) => {
        if (!deps.execution) {
          throw new Error(
            'renderViPreviewForFile requires execution deps when no execute override is provided'
          );
        }
        return executeViPreview(
          {
            runtime: options.runtime,
            workspaceDirectory: executeWorkspace,
            viFilename: executeViFilename,
            outputFilename: executeOutputFilename,
            operationDirectory: options.operationDirectory
          },
          deps.execution
        );
      });
    const result = await execute(workspaceDirectory, viFilename, OUTPUT_FILENAME);

    if (result.outcome === 'rendered' && result.reportFilePath) {
      const html = await deps.readFile(result.reportFilePath);
      if (deps.cache && cacheKey) {
        // Caching is best-effort: a write failure must not fail the render.
        try {
          await deps.cache.set(cacheKey, html);
        } catch {
          /* ignore cache write failure */
        }
      }
      return { outcome: 'rendered', html, cached: false };
    }

    return {
      outcome: result.outcome,
      failureReason: result.failureReason,
      stderr: result.stderr
    };
  } finally {
    // Best-effort cleanup: a completed render must not fail because the throwaway
    // workspace could not be fully removed (e.g. a root-owned file left by the
    // container). Leftover temp directories are reclaimed by the OS.
    try {
      await deps.removeDirectory(workspaceDirectory);
    } catch {
      /* cleanup failure is non-fatal */
    }
  }
}

/**
 * Computes the cache key from the staged files' size/mtime. Returns undefined
 * when a staged file is missing from the enumeration, so the render proceeds
 * uncached rather than keying on incomplete data.
 */
function computeStagedCacheKey(
  filesToStage: string[],
  entries: ViPreviewStagingEntry[]
): string | undefined {
  const index = new Map(entries.map((entry) => [entry.relativePath.replace(/\\/g, '/'), entry]));
  const keyEntries: ViPreviewStagingEntry[] = [];
  for (const relativePath of filesToStage) {
    const entry = index.get(relativePath);
    if (!entry) {
      return undefined;
    }
    keyEntries.push(entry);
  }
  return computeViPreviewCacheKey(keyEntries);
}
