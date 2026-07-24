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
import {
  computeViPreviewCacheKey,
  type ViPreviewCache,
  type ViPreviewCacheKeyEntry
} from './viPreviewCache';

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
  /**
   * When true, only a cache hit is served: a cache miss returns
   * `failed`/`preview-cache-miss` without staging or launching LabVIEW. Serving
   * a cached document runs no external process, so a cache-only peek is safe on
   * any runtime (including host-native, where a live render is Docker-only).
   */
  cacheOnly?: boolean;
}

export interface RenderViPreviewForFileResult {
  outcome: 'rendered' | 'blocked' | 'failed';
  /** The produced LabVIEW HTML document, present only when `rendered`. */
  html?: string;
  /** True when the document was served from the render cache. */
  cached?: boolean;
  /**
   * The content-addressed cache key used for this VI (target VI plus staged
   * file set), when it could be computed. Present for cache hits, cache-only
   * misses, and completed renders so callers can build a key->VI-path manifest
   * (VHS-REQ-671); undefined when a staged file was missing from the
   * enumeration and the render proceeded uncached.
   */
  cacheKey?: string;
  failureReason?: ViPreviewFailureReason;
  stderr?: string;
  /**
   * Whether the produced document was persisted to the cache. `true` when a
   * fresh render's `cache.set` succeeded, `false` when it was attempted and
   * failed (the render still succeeds, but no reusable cache file was stored),
   * and `undefined` when no write was attempted (no cache, or a cache hit). The
   * warm worker (VHS-REQ-671) treats a fresh render with `cacheStored === false`
   * as a failure because its job is to STORE the cache.
   */
  cacheStored?: boolean;
  /**
   * Exact-frame guard (#2363): the SHA-256 hex content signature of the target
   * VI bytes this render staged, present on a fresh live render when a file
   * hasher is available. A preview-time scan consumer passes it as the expected
   * signature so a scan that read different bytes (the VI was edited on disk
   * mid-render) is not persisted against the displayed frame. Bare hex (no
   * `sha256:` prefix); best-effort, so a hashing failure leaves it undefined.
   */
  contentSignature?: string;
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
   * Computes a SHA-256 hex digest of a file's exact bytes. Required for caching:
   * the content-addressed cache key (VHS-REQ-659 / VHS-REQ-671) folds in each
   * staged file's content digest so the key is portable across machines. When
   * omitted, rendering still works but nothing is cached (the key cannot be
   * computed).
   */
  hashFile?: (filePath: string) => Promise<string>;
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
  const cacheKey =
    deps.cache && deps.hashFile
      ? await computeStagedCacheKey(
          selection.plan.viRelativePath,
          selection.plan.filesToStage,
          stagingRootDirectory,
          deps.hashFile
        )
      : undefined;

  if (deps.cache && cacheKey) {
    const cached = await deps.cache.get(cacheKey).catch(() => undefined);
    if (cached !== undefined) {
      return { outcome: 'rendered', html: cached, cached: true, cacheKey };
    }
  }

  // Cache-only peek: serving a cached document launches no external process, so
  // it is safe on any runtime (including host-native, where a live preview
  // render is Docker-only). When requested and the cache misses, return without
  // staging or executing LabVIEW so the caller can fall back. (VHS-REQ-659.)
  if (options.cacheOnly) {
    return { outcome: 'failed', failureReason: 'preview-cache-miss', cacheKey };
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
      let cacheStored: boolean | undefined;
      if (deps.cache && cacheKey) {
        // Caching is best-effort for the render itself: a write failure must not
        // fail the render. The outcome is reported via `cacheStored` so callers
        // whose job is to persist (the warm worker) can treat a non-persisted
        // render as a failure.
        try {
          await deps.cache.set(cacheKey, html);
          cacheStored = true;
        } catch {
          cacheStored = false;
        }
      }
      // Exact-frame guard (#2363): hash the STAGED COPY of the target VI — the
      // immutable snapshot LabVIEW actually rendered — so a preview-time scan
      // consumer can confirm the scan read the same bytes. Hashing the working-
      // tree source instead would nearly always match the scan's later source
      // read even after a mid-render edit, defeating the guard. Best-effort: a
      // hashing failure must not fail the render, so it is left undefined.
      let contentSignature: string | undefined;
      if (deps.hashFile) {
        try {
          contentSignature = await deps.hashFile(
            path.join(workspaceDirectory, STAGING_SUBDIRECTORY, ...selection.plan.viRelativePath.split('/'))
          );
        } catch {
          contentSignature = undefined;
        }
      }
      return { outcome: 'rendered', html, cached: false, cacheKey, cacheStored, contentSignature };
    }

    return {
      outcome: result.outcome,
      failureReason: result.failureReason,
      stderr: result.stderr,
      cacheKey
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
 * Computes the cache key from the target VI plus each staged file's content
 * digest. Returns undefined when a staged file cannot be hashed (e.g. it is
 * missing), so the render proceeds uncached rather than keying on incomplete
 * data. The target VI path is included so VIs sharing a staged tree never
 * collide (#646); the content digests make the key portable across machines
 * (VHS-REQ-659 / VHS-REQ-671).
 */
async function computeStagedCacheKey(
  viRelativePath: string,
  filesToStage: string[],
  stagingRootDirectory: string,
  hashFile: (filePath: string) => Promise<string>
): Promise<string | undefined> {
  const keyEntries: ViPreviewCacheKeyEntry[] = [];
  for (const relativePath of filesToStage) {
    const filePath = path.join(stagingRootDirectory, ...relativePath.split('/'));
    let contentSha256: string;
    try {
      contentSha256 = await hashFile(filePath);
    } catch {
      return undefined;
    }
    keyEntries.push({ relativePath, contentSha256 });
  }
  return computeViPreviewCacheKey(viRelativePath, keyEntries);
}
