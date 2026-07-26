import * as path from 'node:path';

import { planViPreviewStagingWithProjectRoot, type ViPreviewStagingEntry } from '../reporting/viPreview/viPreviewStaging';
import { toPosix } from '../support/pathStyle';

/**
 * VHS-REQ-659: materialize a VI (and its LabVIEW source dependencies) at a
 * specific Git revision into a real directory, so a historical revision can be
 * previewed through the same on-disk render path as the working file. Lists the
 * whole tree at the revision and reuses `planViPreviewStagingWithProjectRoot` to
 * select and guard the enclosing LabVIEW project (or containing-directory) tree,
 * then fetches each selected blob from Git. Git and filesystem access are
 * injected so the selection/fetch orchestration is unit-testable without a
 * repository.
 */

export interface RevisionTreeFileEntry {
  /** Path relative to the repository root, POSIX separators. */
  repoRelativePath: string;
  sizeBytes: number;
}

/**
 * Parses `git ls-tree -r -l <rev> [-- <dir>]` output into blob entries.
 * Each line is `<mode> <type> <sha> <size>\t<path>`; only blobs are kept.
 */
export function parseLsTreeOutput(stdout: string): RevisionTreeFileEntry[] {
  const entries: RevisionTreeFileEntry[] = [];
  for (const rawLine of stdout.split('\n')) {
    const tabIndex = rawLine.indexOf('\t');
    if (tabIndex < 0) {
      continue;
    }
    const meta = rawLine.slice(0, tabIndex).trim().split(/\s+/);
    // Everything after the tab is the path, verbatim. Strip only a trailing
    // carriage return (CRLF-terminated output); never the path's own leading or
    // trailing whitespace, which would fetch a different (or missing) blob.
    const repoRelativePath = rawLine.slice(tabIndex + 1).replace(/\r$/, '');
    if (meta.length < 4 || meta[1] !== 'blob' || repoRelativePath.length === 0) {
      continue;
    }
    const parsedSize = Number.parseInt(meta[3], 10);
    entries.push({
      repoRelativePath,
      sizeBytes: Number.isFinite(parsedSize) ? parsedSize : 0
    });
  }
  return entries;
}

export interface MaterializeRevisionViTreeOptions {
  revisionId: string;
  /** VI path relative to the repository root. */
  relativePath: string;
  /** Destination directory the tree is written into (the VI's dir becomes its root). */
  destinationDirectory: string;
}

export interface MaterializeRevisionViTreeDeps {
  /** Lists blob entries under `repoRelativeDirectory` (or the whole tree when empty) at the revision. */
  listTreeFiles: (revisionId: string, repoRelativeDirectory: string) => Promise<RevisionTreeFileEntry[]>;
  /** Reads a blob at the revision by repository-relative path. */
  readBlob: (revisionId: string, repoRelativePath: string) => Promise<Buffer>;
  ensureDirectory: (directory: string) => Promise<void>;
  writeFile: (filePath: string, data: Buffer) => Promise<void>;
}

export interface MaterializedRevisionVi {
  /** Absolute path of the materialized VI within the destination directory. */
  viFilePath: string;
  stagedFileCount: number;
  strategy: 'dependency-tree' | 'single-file';
  /**
   * VHS-REQ-659 large-project safeguard: present ONLY when staging fell back to
   * single-file for a SIZE reason (the revision's project tree exceeded the guard:
   * too-many-files >1000 / too-large >256MB), so the materialized tree lacks the
   * sibling dependencies and a comparison of this VI may show unresolved "?"
   * sub-VI placeholders. A consumer (the comparison report) should label the diff
   * size-degraded. Absent for a full dependency-tree materialization and for the
   * expected standalone `no-siblings` case.
   */
  stagingDegraded?: { strategy: 'single-file'; reason: 'too-many-files' | 'too-large' };
}

/**
 * A staged path is rejected only when an actual `..` path segment could escape
 * the destination directory (the final write is `path.join(dest, ...split('/'))`).
 * A bare substring check wrongly drops legitimate tracked files whose names merely
 * contain two dots (e.g. `lib/v1..2/Dep.vi` or `Foo..Bar.vi`), silently omitting
 * real dependencies from the materialized tree.
 */
function hasParentTraversalSegment(relativePath: string): boolean {
  return relativePath.split('/').some((segment) => segment === '..');
}

/**
 * Materializes the VI at `revisionId` plus its sibling LabVIEW source files into
 * `destinationDirectory`. The VI blob is required (its failure throws); sibling
 * blobs are best-effort (a missing sibling is skipped). Returns the on-disk VI
 * path plus what was staged.
 */
export async function materializeRevisionViTree(
  options: MaterializeRevisionViTreeOptions,
  deps: MaterializeRevisionViTreeDeps
): Promise<MaterializedRevisionVi> {
  const relativePathPosix = toPosix(options.relativePath).replace(/^\/+/, '');

  // List the whole tree at the revision so dependencies outside the VI's
  // directory (elsewhere in the enclosing LabVIEW project) can be staged; the
  // project-aware planner then picks and guards the actual staging root.
  let treeEntries: RevisionTreeFileEntry[] = [];
  try {
    treeEntries = await deps.listTreeFiles(options.revisionId, '');
  } catch {
    treeEntries = [];
  }

  const stagingEntries: ViPreviewStagingEntry[] = treeEntries
    .map((entry) => ({ relativePath: toPosix(entry.repoRelativePath), sizeBytes: entry.sizeBytes }))
    .filter((entry) => entry.relativePath.length > 0 && !hasParentTraversalSegment(entry.relativePath));

  const selection = planViPreviewStagingWithProjectRoot(relativePathPosix, stagingEntries);
  const stagingRoot = selection.stagingRoot;

  let stagedFileCount = 0;
  for (const relative of selection.plan.filesToStage) {
    const repoRelative = stagingRoot ? `${stagingRoot}/${relative}` : relative;
    let data: Buffer;
    try {
      data = await deps.readBlob(options.revisionId, repoRelative);
    } catch (error) {
      if (relative === selection.plan.viRelativePath) {
        throw new Error(
          `Failed to read VI ${repoRelative} at revision ${options.revisionId}: ${
            (error as Error)?.message ?? String(error)
          }`
        );
      }
      continue;
    }
    const destination = path.join(options.destinationDirectory, ...relative.split('/'));
    await deps.ensureDirectory(path.dirname(destination));
    await deps.writeFile(destination, data);
    stagedFileCount += 1;
  }

  const stagingDegraded: MaterializedRevisionVi['stagingDegraded'] =
    selection.plan.strategy === 'single-file' &&
    (selection.plan.reason === 'too-many-files' || selection.plan.reason === 'too-large')
      ? { strategy: 'single-file', reason: selection.plan.reason }
      : undefined;

  return {
    viFilePath: path.join(options.destinationDirectory, ...selection.plan.viRelativePath.split('/')),
    stagedFileCount,
    strategy: selection.plan.strategy,
    stagingDegraded
  };
}
