import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  ComparisonReportPacketRecord
} from '../reporting/comparisonReportPacket';
import {
  ComparisonReportType,
  buildComparisonArtifactPlan
} from '../reporting/comparisonReportPlan';

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
    fileId: record.artifactPlan.fileId
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
}): ComparisonReportArchivePlan {
  const artifactPlan = buildComparisonArtifactPlan({
    storageRoot: options.storageRoot,
    repositoryRoot: options.repositoryRoot,
    relativePath: options.relativePath,
    reportType: options.reportType
  });
  const reportFilename = options.reportFilename ?? artifactPlan.reportFilename;
  const pairId = createDeterministicId(
    `${options.reportType}\n${options.baseHash}\n${options.selectedHash}`
  );
  const archiveDirectory = path.join(
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
    packetFilePath: path.join(archiveDirectory, options.packetFilename ?? artifactPlan.packetFilename),
    reportFilePath: path.join(archiveDirectory, reportFilename),
    metadataFilePath: path.join(
      archiveDirectory,
      options.metadataFilename ?? path.basename(artifactPlan.metadataFilePath)
    ),
    sourceRecordFilePath: path.join(archiveDirectory, SOURCE_RECORD_FILENAME),
    runtimeStdoutFilePath: path.join(
      archiveDirectory,
      options.runtimeStdoutFilename ?? path.basename(artifactPlan.runtimeStdoutFilePath)
    ),
    runtimeStderrFilePath: path.join(
      archiveDirectory,
      options.runtimeStderrFilename ?? path.basename(artifactPlan.runtimeStderrFilePath)
    ),
    runtimeDiagnosticLogFilePath: path.join(
      archiveDirectory,
      options.runtimeDiagnosticLogFilename ??
        path.basename(artifactPlan.runtimeDiagnosticLogFilePath)
    ),
    runtimeProcessObservationFilePath: path.join(
      archiveDirectory,
      options.runtimeProcessObservationFilename ??
        path.basename(artifactPlan.runtimeProcessObservationFilePath)
    ),
    reportAssetsDirectoryName,
    reportAssetsDirectoryPath: path.join(archiveDirectory, reportAssetsDirectoryName)
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
  return archivedRecord;
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

function buildReportAssetsDirectoryName(reportFilename: string): string {
  return reportFilename.replace(/\.html$/i, '') + '_files';
}

function createDeterministicId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
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

async function defaultPathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function defaultNow(): string {
  return new Date().toISOString();
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} must be non-empty`);
  }

  return trimmed;
}
