import { createHash } from 'node:crypto';
import * as path from 'node:path';

import { normalizeRelativeGitPath } from '../git/gitCli';

export type ComparisonReportType = 'diff' | 'print';
export type ComparisonReportFormat = 'HTMLSingleFile' | 'HTML' | 'XML' | 'PlainText' | 'MicrosoftWord';

export interface ComparisonArtifactPlanOptions {
  storageRoot: string;
  repositoryRoot: string;
  relativePath: string;
  reportType: ComparisonReportType;
}

export interface ComparisonArtifactPlan {
  repoId: string;
  fileId: string;
  reportType: ComparisonReportType;
  fullFilename: string;
  normalizedRelativePath: string;
  reportDirectory: string;
  stagingDirectory: string;
  reportFilename: string;
  reportFilePath: string;
  packetFilename: string;
  packetFilePath: string;
  metadataFilePath: string;
  runtimeStdoutFilePath: string;
  runtimeStderrFilePath: string;
  allowedLocalRootPaths: string[];
}

export interface StagedRevisionPlanOptions {
  stagingDirectory: string;
  fullFilename: string;
  leftRevisionId?: string;
  rightRevisionId?: string;
}

export interface StagedRevisionPlan {
  leftFilename: string;
  leftFilePath: string;
  rightFilename: string;
  rightFilePath: string;
}

export interface LabviewCliComparisonReportPlanOptions {
  leftViPath: string;
  rightViPath: string;
  reportFilePath: string;
  reportFormat?: ComparisonReportFormat;
  labviewPath?: string;
  overwrite?: boolean;
  createOutputDirectory?: boolean;
  headless?: boolean;
  includeDiagnostics?: boolean;
}

export interface ComparisonCommandPlan {
  executable: string;
  args: string[];
}

export interface LvComparePlanOptions {
  leftViPath: string;
  rightViPath: string;
  labviewPath?: string;
}

const REPORTS_DIRECTORY = 'reports';
const METADATA_FILENAME = 'report-metadata.json';
const PACKET_FILENAME = 'report-packet.html';
const RUNTIME_STDOUT_FILENAME = 'runtime-stdout.txt';
const RUNTIME_STDERR_FILENAME = 'runtime-stderr.txt';

export function buildComparisonArtifactPlan(
  options: ComparisonArtifactPlanOptions
): ComparisonArtifactPlan {
  const storageRoot = requireNonEmpty(options.storageRoot, 'storageRoot');
  const repositoryRoot = requireNonEmpty(options.repositoryRoot, 'repositoryRoot');
  const normalizedRelativePath = requireNonEmpty(
    normalizeRelativeGitPath(options.relativePath),
    'relativePath'
  );
  const fullFilename = path.basename(normalizedRelativePath);
  const repoId = createDeterministicId(repositoryRoot);
  const fileId = createDeterministicId(`${repositoryRoot}\n${normalizedRelativePath}`);
  const reportDirectory = path.join(storageRoot, REPORTS_DIRECTORY, repoId, fileId);
  const stagingDirectory = path.join(reportDirectory, 'staging');
  const reportFilename = buildComparisonReportFilename(options.reportType, fullFilename);

  return {
    repoId,
    fileId,
    reportType: options.reportType,
    fullFilename,
    normalizedRelativePath,
    reportDirectory,
    stagingDirectory,
    reportFilename,
    reportFilePath: path.join(reportDirectory, reportFilename),
    packetFilename: PACKET_FILENAME,
    packetFilePath: path.join(reportDirectory, PACKET_FILENAME),
    metadataFilePath: path.join(reportDirectory, METADATA_FILENAME),
    runtimeStdoutFilePath: path.join(reportDirectory, RUNTIME_STDOUT_FILENAME),
    runtimeStderrFilePath: path.join(reportDirectory, RUNTIME_STDERR_FILENAME),
    allowedLocalRootPaths: [storageRoot, path.join(storageRoot, REPORTS_DIRECTORY, repoId)]
  };
}

export function buildComparisonReportFilename(
  reportType: ComparisonReportType,
  fullFilename: string
): string {
  return `${requireNonEmpty(reportType, 'reportType')}-report-${requireNonEmpty(fullFilename, 'fullFilename')}.html`;
}

export function buildStagedRevisionPlan(options: StagedRevisionPlanOptions): StagedRevisionPlan {
  const stagingDirectory = requireNonEmpty(options.stagingDirectory, 'stagingDirectory');
  const fullFilename = requireNonEmpty(options.fullFilename, 'fullFilename');
  const leftLabel = buildStageLabel('left', options.leftRevisionId);
  const rightLabel = buildStageLabel('right', options.rightRevisionId);
  const leftFilename = `${leftLabel}-${fullFilename}`;
  const rightFilename = `${rightLabel}-${fullFilename}`;

  return {
    leftFilename,
    leftFilePath: path.join(stagingDirectory, leftFilename),
    rightFilename,
    rightFilePath: path.join(stagingDirectory, rightFilename)
  };
}

export function buildLabviewCliCreateComparisonReportPlan(
  options: LabviewCliComparisonReportPlanOptions
): ComparisonCommandPlan {
  const args = [
    '-OperationName',
    'CreateComparisonReport',
    '-vi1',
    requireNonEmpty(options.leftViPath, 'leftViPath'),
    '-vi2',
    requireNonEmpty(options.rightViPath, 'rightViPath'),
    '-reportType',
    options.reportFormat ?? 'HTMLSingleFile',
    '-reportPath',
    requireNonEmpty(options.reportFilePath, 'reportFilePath')
  ];

  if (options.createOutputDirectory ?? true) {
    args.push('-c');
  }

  if (options.overwrite ?? true) {
    args.push('-o');
  }

  if (options.includeDiagnostics ?? true) {
    args.push('-d');
  }

  if (options.headless ?? true) {
    args.push('-Headless');
  }

  if (options.labviewPath?.trim()) {
    args.push('-LabVIEWPath', options.labviewPath.trim());
  }

  return {
    executable: 'LabVIEWCLI',
    args
  };
}

export function buildLvComparePlan(options: LvComparePlanOptions): ComparisonCommandPlan {
  const args = [
    requireNonEmpty(options.leftViPath, 'leftViPath'),
    requireNonEmpty(options.rightViPath, 'rightViPath')
  ];

  if (options.labviewPath?.trim()) {
    args.push('-lvpath', options.labviewPath.trim());
  }

  return {
    executable: 'LVCompare',
    args
  };
}

function createDeterministicId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function buildStageLabel(side: 'left' | 'right', revisionId?: string): string {
  const trimmed = revisionId?.trim();
  if (!trimmed) {
    return side;
  }

  const sanitized = trimmed.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-');
  return `${side}-${sanitized.slice(0, 12)}`;
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} must be non-empty`);
  }

  return trimmed;
}
