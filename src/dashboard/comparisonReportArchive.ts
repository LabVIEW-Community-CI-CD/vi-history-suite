import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { createDeterministicId } from '../support/deterministicId';
import { joinPreservingExplicitPathStyle } from '../support/pathStyle';
import { pathExistsViaFsAccess as defaultPathExists } from '../support/fsExists';
import { nowIso as defaultNow } from '../support/clock';
import {
  ComparisonReportPacketRecord
} from '../reporting/comparisonReportPacket';
import {
  ComparisonReportType,
  buildComparisonArtifactPlan
} from '../reporting/comparisonReportPlan';
import { isWorktreeRevision } from '../git/gitCli';
import {
  DEFAULT_WORKTREE_SNAPSHOT_RETENTION_LIMIT,
  WORKTREE_SNAPSHOT_INDEX_FILENAME,
  appendWorktreeSnapshotRecord,
  createEmptyWorktreeSnapshotIndex,
  parseWorktreeSnapshotIndex,
  serializeWorktreeSnapshotIndex,
  type WorktreeSnapshotRecord
} from './worktreeSnapshotIndex';

const REPORT_HISTORY_DIRECTORY = 'report-history';
const SOURCE_RECORD_FILENAME = 'source-record.json';

export interface ComparisonReportArchivePlan {
  storageRoot: string;
  repoId: string;
  fileId: string;
  pairId: string;
  reportType: ComparisonReportType;
  archiveDirectory: string;
  packetFilePath: string;
  reportFilePath: string;
  metadataFilePath: string;
  sourceRecordFilePath: string;
  runtimeStdoutFilePath: string;
  runtimeStderrFilePath: string;
  runtimeDiagnosticLogFilePath: string;
  runtimeProcessObservationFilePath: string;
  reportAssetsDirectoryName: string;
  reportAssetsDirectoryPath: string;
}

export interface ArchivedComparisonReportSourceRecord {
  archivedAt: string;
  archivePlan: ComparisonReportArchivePlan;
  packetRecord: ComparisonReportPacketRecord;
}

export interface ArchiveComparisonReportSourceDeps {
  now?: () => string;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  copyFile?: typeof fs.copyFile;
  copyDirectory?: typeof fs.cp;
  pathExists?: (targetPath: string) => Promise<boolean>;
  readFile?: typeof fs.readFile;
  removePath?: typeof fs.rm;
  /**
   * VHS-REQ-641 (Phase 3): keep-last-N limit applied to the working-tree
   * snapshot retention index (0 disables retention). Defaults to
   * `DEFAULT_WORKTREE_SNAPSHOT_RETENTION_LIMIT`.
   */
  worktreeSnapshotRetentionLimit?: number;
}

export interface ReadArchivedComparisonReportSourceRecordDeps {
  pathExists?: (targetPath: string) => Promise<boolean>;
  readFile?: typeof fs.readFile;
}

export function buildComparisonReportArchivePlan(
  record: ComparisonReportPacketRecord
): ComparisonReportArchivePlan {
  return buildComparisonReportArchivePlanFromSelection({
    storageRoot: requireNonEmpty(record.artifactPlan.allowedLocalRootPaths[0] ?? '', 'storageRoot'),
    repositoryRoot: record.artifactPlan.repoId,
    relativePath: record.artifactPlan.normalizedRelativePath,
    reportType: record.reportType,
    reportFilename: record.artifactPlan.reportFilename,
    packetFilename: record.artifactPlan.packetFilename,
    metadataFilename: path.basename(record.artifactPlan.metadataFilePath),
    runtimeStdoutFilename: path.basename(record.artifactPlan.runtimeStdoutFilePath),
    runtimeStderrFilename: path.basename(record.artifactPlan.runtimeStderrFilePath),
    runtimeDiagnosticLogFilename: path.basename(record.artifactPlan.runtimeDiagnosticLogFilePath),
    runtimeProcessObservationFilename: path.basename(record.artifactPlan.runtimeProcessObservationFilePath),
    selectedHash: record.selectedHash,
    baseHash: record.baseHash,
    repoId: record.artifactPlan.repoId,
    fileId: record.artifactPlan.fileId,
    worktreeSnapshotId: record.runtimeExecution?.worktreeSnapshotId
  });
}

export function buildComparisonReportArchivePlanFromSelection(options: {
  storageRoot: string;
  repositoryRoot: string;
  relativePath: string;
  reportType: ComparisonReportType;
  selectedHash: string;
  baseHash: string;
  reportFilename?: string;
  packetFilename?: string;
  metadataFilename?: string;
  runtimeStdoutFilename?: string;
  runtimeStderrFilename?: string;
  runtimeDiagnosticLogFilename?: string;
  runtimeProcessObservationFilename?: string;
  repoId?: string;
  fileId?: string;
  /**
   * VHS-REQ-641 (Phase 3, issue #1366): content-addressed identity of the
   * staged working-tree bytes for a side that is the `WORKTREE` sentinel. When
   * provided, the sentinel is replaced by `WORKTREE:<id>` in the deterministic
   * pair-ID so repeated comparisons of unchanged uncommitted content resolve to
   * the same retained pair (idempotent) while changed content yields a distinct
   * pair — instead of every working-tree compare colliding on the bare
   * `WORKTREE` token. Ignored for a side that is a committed hash.
   */
  worktreeSnapshotId?: string;
}): ComparisonReportArchivePlan {
  const artifactPlan = buildComparisonArtifactPlan({
    storageRoot: options.storageRoot,
    repositoryRoot: options.repositoryRoot,
    relativePath: options.relativePath,
    reportType: options.reportType
  });
  const reportFilename = options.reportFilename ?? artifactPlan.reportFilename;
  const pairId = createDeterministicId(
    `${options.reportType}\n${contentAddressRevisionForPairId(
      options.baseHash,
      options.worktreeSnapshotId
    )}\n${contentAddressRevisionForPairId(options.selectedHash, options.worktreeSnapshotId)}`
  );
  const archiveDirectory = joinPreservingExplicitPathStyle(
    options.storageRoot,
    REPORT_HISTORY_DIRECTORY,
    options.repoId ?? artifactPlan.repoId,
    options.fileId ?? artifactPlan.fileId,
    'pairs',
    pairId
  );
  const reportAssetsDirectoryName = buildReportAssetsDirectoryName(reportFilename);

  return {
    storageRoot: options.storageRoot,
    repoId: options.repoId ?? artifactPlan.repoId,
    fileId: options.fileId ?? artifactPlan.fileId,
    pairId,
    reportType: options.reportType,
    archiveDirectory,
    packetFilePath: joinPreservingExplicitPathStyle(
      archiveDirectory,
      options.packetFilename ?? artifactPlan.packetFilename
    ),
    reportFilePath: joinPreservingExplicitPathStyle(archiveDirectory, reportFilename),
    metadataFilePath: joinPreservingExplicitPathStyle(
      archiveDirectory,
      options.metadataFilename ?? path.basename(artifactPlan.metadataFilePath)
    ),
    sourceRecordFilePath: joinPreservingExplicitPathStyle(
      archiveDirectory,
      SOURCE_RECORD_FILENAME
    ),
    runtimeStdoutFilePath: joinPreservingExplicitPathStyle(
      archiveDirectory,
      options.runtimeStdoutFilename ?? path.basename(artifactPlan.runtimeStdoutFilePath)
    ),
    runtimeStderrFilePath: joinPreservingExplicitPathStyle(
      archiveDirectory,
      options.runtimeStderrFilename ?? path.basename(artifactPlan.runtimeStderrFilePath)
    ),
    runtimeDiagnosticLogFilePath: joinPreservingExplicitPathStyle(
      archiveDirectory,
      options.runtimeDiagnosticLogFilename ??
        path.basename(artifactPlan.runtimeDiagnosticLogFilePath)
    ),
    runtimeProcessObservationFilePath: joinPreservingExplicitPathStyle(
      archiveDirectory,
      options.runtimeProcessObservationFilename ??
        path.basename(artifactPlan.runtimeProcessObservationFilePath)
    ),
    reportAssetsDirectoryName,
    reportAssetsDirectoryPath: joinPreservingExplicitPathStyle(
      archiveDirectory,
      reportAssetsDirectoryName
    )
  };
}

export async function archiveComparisonReportSource(
  record: ComparisonReportPacketRecord,
  deps: ArchiveComparisonReportSourceDeps = {}
): Promise<ArchivedComparisonReportSourceRecord> {
  const archivePlan = buildComparisonReportArchivePlan(record);
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const copyFile = deps.copyFile ?? fs.copyFile;
  const copyDirectory = deps.copyDirectory ?? fs.cp;
  const pathExists = deps.pathExists ?? defaultPathExists;

  await mkdir(archivePlan.archiveDirectory, { recursive: true });
  await copyIfExists(record.artifactPlan.packetFilePath, archivePlan.packetFilePath, {
    copyFile,
    mkdir,
    pathExists
  });
  await copyIfExists(record.artifactPlan.metadataFilePath, archivePlan.metadataFilePath, {
    copyFile,
    mkdir,
    pathExists
  });
  await copyIfExists(record.artifactPlan.reportFilePath, archivePlan.reportFilePath, {
    copyFile,
    mkdir,
    pathExists
  });
  await copyIfExists(record.artifactPlan.runtimeStdoutFilePath, archivePlan.runtimeStdoutFilePath, {
    copyFile,
    mkdir,
    pathExists
  });
  await copyIfExists(record.artifactPlan.runtimeStderrFilePath, archivePlan.runtimeStderrFilePath, {
    copyFile,
    mkdir,
    pathExists
  });
  await copyIfExists(
    record.artifactPlan.runtimeDiagnosticLogFilePath,
    archivePlan.runtimeDiagnosticLogFilePath,
    {
      copyFile,
      mkdir,
      pathExists
    }
  );
  await copyIfExists(
    record.artifactPlan.runtimeProcessObservationFilePath,
    archivePlan.runtimeProcessObservationFilePath,
    {
      copyFile,
      mkdir,
      pathExists
    }
  );

  const sourceAssetsDirectory = path.join(
    path.dirname(record.artifactPlan.reportFilePath),
    archivePlan.reportAssetsDirectoryName
  );
  if (await pathExists(sourceAssetsDirectory)) {
    await mkdir(path.dirname(archivePlan.reportAssetsDirectoryPath), { recursive: true });
    await copyDirectory(sourceAssetsDirectory, archivePlan.reportAssetsDirectoryPath, {
      recursive: true,
      force: true
    });
  }

  const archivedRecord: ArchivedComparisonReportSourceRecord = {
    archivedAt: (deps.now ?? defaultNow)(),
    archivePlan,
    packetRecord: record
  };
  await writeFile(
    archivePlan.sourceRecordFilePath,
    JSON.stringify(archivedRecord, null, 2),
    'utf8'
  );

  // VHS-REQ-641 (Phase 3, issue #1366): when this is a working-tree comparison,
  // append it to the per-VI retention index so the dashboard can rediscover the
  // retained snapshot (its pair-ID is content-addressed, not derivable from the
  // commit list), and garbage-collect evicted snapshots' archive directories.
  const worktreeSnapshotId = record.runtimeExecution?.worktreeSnapshotId;
  if (worktreeSnapshotId) {
    await updateWorktreeSnapshotIndexForArchive(
      { archivePlan, worktreeSnapshotId, record, archivedAt: archivedRecord.archivedAt },
      { mkdir, writeFile, pathExists, readFile: deps.readFile ?? fs.readFile, removePath: deps.removePath ?? fs.rm },
      deps.worktreeSnapshotRetentionLimit ?? DEFAULT_WORKTREE_SNAPSHOT_RETENTION_LIMIT
    );
  }
  return archivedRecord;
}

/** Absolute path of a VI's working-tree snapshot retention index file. */
export function buildWorktreeSnapshotIndexFilePath(archivePlan: ComparisonReportArchivePlan): string {
  return joinPreservingExplicitPathStyle(
    archivePlan.storageRoot,
    REPORT_HISTORY_DIRECTORY,
    archivePlan.repoId,
    archivePlan.fileId,
    WORKTREE_SNAPSHOT_INDEX_FILENAME
  );
}

function buildRetainedPairDirectory(
  archivePlan: ComparisonReportArchivePlan,
  pairId: string
): string {
  return joinPreservingExplicitPathStyle(
    archivePlan.storageRoot,
    REPORT_HISTORY_DIRECTORY,
    archivePlan.repoId,
    archivePlan.fileId,
    'pairs',
    pairId
  );
}

async function updateWorktreeSnapshotIndexForArchive(
  context: {
    archivePlan: ComparisonReportArchivePlan;
    worktreeSnapshotId: string;
    record: ComparisonReportPacketRecord;
    archivedAt: string;
  },
  deps: {
    mkdir: typeof fs.mkdir;
    writeFile: typeof fs.writeFile;
    pathExists: (targetPath: string) => Promise<boolean>;
    readFile: typeof fs.readFile;
    removePath: typeof fs.rm;
  },
  retentionLimit: number
): Promise<void> {
  const indexFilePath = buildWorktreeSnapshotIndexFilePath(context.archivePlan);
  let index = createEmptyWorktreeSnapshotIndex();
  if (await deps.pathExists(indexFilePath)) {
    const parsed = parseWorktreeSnapshotIndex(await deps.readFile(indexFilePath, 'utf8'));
    if (parsed) {
      index = parsed;
    }
  }

  const newRecord: WorktreeSnapshotRecord = {
    snapshotId: context.worktreeSnapshotId,
    pairId: context.archivePlan.pairId,
    baseHash: context.record.baseHash,
    reportType: context.archivePlan.reportType,
    retainedAt: context.archivedAt,
    relativePath: context.record.artifactPlan.normalizedRelativePath
  };
  const { index: nextIndex, evicted } = appendWorktreeSnapshotRecord(index, newRecord, retentionLimit);

  await deps.mkdir(path.dirname(indexFilePath), { recursive: true });
  await deps.writeFile(indexFilePath, serializeWorktreeSnapshotIndex(nextIndex), 'utf8');

  // Delete the archive directory of each evicted snapshot (keep-last-N GC). The
  // just-written record is never evicted unless the limit is 0, in which case
  // its own archive is removed too — matching the "0 disables retention" contract.
  for (const removed of evicted) {
    const pairDirectory = buildRetainedPairDirectory(context.archivePlan, removed.pairId);
    if (await deps.pathExists(pairDirectory)) {
      await deps.removePath(pairDirectory, { recursive: true, force: true });
    }
  }
}

export async function readArchivedComparisonReportSourceRecordFromSelection(
  options: {
    storageRoot: string;
    repositoryRoot: string;
    relativePath: string;
    reportType: ComparisonReportType;
    selectedHash: string;
    baseHash: string;
  },
  deps: ReadArchivedComparisonReportSourceRecordDeps = {}
): Promise<ArchivedComparisonReportSourceRecord | undefined> {
  const archivePlan = buildComparisonReportArchivePlanFromSelection(options);
  const pathExists = deps.pathExists ?? defaultPathExists;
  if (!(await pathExists(archivePlan.sourceRecordFilePath))) {
    return undefined;
  }

  const readFile = deps.readFile ?? fs.readFile;
  return JSON.parse(
    await readFile(archivePlan.sourceRecordFilePath, 'utf8')
  ) as ArchivedComparisonReportSourceRecord;
}

export function buildReportAssetsDirectoryName(reportFilename: string): string {
  return reportFilename.replace(/\.html$/i, '') + '_files';
}

/**
 * VHS-REQ-641 (Phase 3): maps a revision id to the token used in the
 * deterministic pair-ID. A committed hash is used verbatim. The `WORKTREE`
 * sentinel is content-addressed as `WORKTREE:<snapshotId>` when a snapshot id
 * is available so distinct uncommitted snapshots produce distinct retained
 * pairs; without a snapshot id it falls back to the bare sentinel (preserving
 * the pre-Phase-3 pair-ID for any legacy caller).
 */
function contentAddressRevisionForPairId(
  revisionId: string,
  worktreeSnapshotId: string | undefined
): string {
  if (isWorktreeRevision(revisionId) && worktreeSnapshotId && worktreeSnapshotId.length > 0) {
    return `${revisionId}:${worktreeSnapshotId}`;
  }
  return revisionId;
}

async function copyIfExists(
  sourcePath: string,
  destinationPath: string,
  deps: {
    copyFile: typeof fs.copyFile;
    mkdir: typeof fs.mkdir;
    pathExists: (targetPath: string) => Promise<boolean>;
  }
): Promise<void> {
  if (!(await deps.pathExists(sourcePath))) {
    return;
  }

  await deps.mkdir(path.dirname(destinationPath), { recursive: true });
  await deps.copyFile(sourcePath, destinationPath);
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} must be non-empty`);
  }

  return trimmed;
}
