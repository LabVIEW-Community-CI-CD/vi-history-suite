import { createHash } from 'node:crypto';
import * as path from 'node:path';

import { normalizeRelativeGitPath } from '../git/gitCli';

export type ComparisonReportType = 'diff' | 'print';
export type ComparisonReportFormat = 'HTMLSingleFile' | 'HTML' | 'XML' | 'PlainText' | 'MicrosoftWord';

/**
 * VHS-REQ-645: user-configurable comparison report flags surfaced through native
 * VS Code settings (`viHistorySuite.report.*`). The booleans map 1:1 to the
 * LabVIEWCLI `CreateComparisonReport` difference-suppression filters (verified
 * against the operation's own `-Help`). All fields are optional; an omitted field
 * preserves the shipped default (single-file HTML, compare everything).
 */
export interface ComparisonReportOptions {
  reportFormat?: ComparisonReportFormat;
  /** `-noattr`: do not compare VI attributes. */
  ignoreViAttributes?: boolean;
  /** `-nofp`: do not compare front panels. */
  ignoreFrontPanel?: boolean;
  /** `-nofppos`: do not compare front-panel object size/position. */
  ignoreFrontPanelObjectPosition?: boolean;
  /** `-nobd`: do not compare block diagrams. */
  ignoreBlockDiagram?: boolean;
  /** `-nobdcosm`: do not compare block-diagram object appearance (incl. position/size). */
  ignoreBlockDiagramCosmetic?: boolean;
}

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
  runtimeDiagnosticLogFilePath: string;
  runtimeProcessObservationFilePath: string;
  allowedLocalRootPaths: string[];
}

export interface StagedRevisionPlanOptions {
  stagingDirectory: string;
  fullFilename: string;
  leftRevisionId?: string;
  rightRevisionId?: string;
  /**
   * VHS-REQ-624: normalized repo-relative path of the compared VI. When provided,
   * the staged VIs are placed at the VI's relative depth inside the materialized
   * selected-revision tree so in-repo dependencies resolve at load time. When
   * omitted, staging falls back to the flat single-file layout.
   */
  normalizedRelativePath?: string;
}

export interface StagedRevisionPlan {
  leftFilename: string;
  leftFilePath: string;
  rightFilename: string;
  rightFilePath: string;
  /**
   * VHS-REQ-624: root of the materialized selected (newest) revision tree that
   * both staged VIs live inside. The default builder uses the staging directory.
   */
  treeRoot?: string;
  /**
   * VHS-REQ-624: revision whose surrounding tree is materialized once (the
   * selected/newest revision). Both staged VIs resolve dependencies against it.
   */
  treeRevisionId?: string;
  /**
   * VHS-REQ-624: repo-relative directory (POSIX) of the compared VI within the
   * tree. Empty string when the VI sits at the repository root.
   */
  relativeDirectory?: string;
  /**
   * VHS-REQ-624: pathspec materialized from the selected revision. Defaults to
   * the whole repository (`.`) so all in-repo dependencies are present.
   */
  materializedPathspec?: string;
}

export interface LabviewCliComparisonReportPlanOptions {
  leftViPath: string;
  rightViPath: string;
  reportFilePath: string;
  labviewPath?: string;
  portNumber?: number;
  reportFormat?: ComparisonReportFormat;
  overwrite?: boolean;
  createOutputDirectory?: boolean;
  headless?: boolean;
  logToConsole?: boolean;
  description?: string;
  /**
   * VHS-REQ-645: difference-suppression filters passed straight through to the
   * LabVIEWCLI `CreateComparisonReport` operation. Each emits its flag only when
   * true, so the default invocation (all false/undefined) compares everything.
   */
  ignoreViAttributes?: boolean;
  ignoreFrontPanel?: boolean;
  ignoreFrontPanelObjectPosition?: boolean;
  ignoreBlockDiagram?: boolean;
  ignoreBlockDiagramCosmetic?: boolean;
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
const RUNTIME_DIAGNOSTIC_LOG_FILENAME = 'runtime-diagnostic-log.txt';
const RUNTIME_PROCESS_OBSERVATION_FILENAME = 'runtime-process-observation.json';

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
    runtimeDiagnosticLogFilePath: path.join(reportDirectory, RUNTIME_DIAGNOSTIC_LOG_FILENAME),
    runtimeProcessObservationFilePath: path.join(
      reportDirectory,
      RUNTIME_PROCESS_OBSERVATION_FILENAME
    ),
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

  // VHS-REQ-624: place the staged VIs at their repo-relative depth inside the
  // materialized selected-revision tree (rooted at the staging directory) so
  // sibling dependencies resolve at load time. Falls back to a flat layout when
  // no relative path is supplied.
  const relativeDirectory = deriveRelativeDirectory(options.normalizedRelativePath);
  const treeRevisionId = options.rightRevisionId?.trim() ?? '';

  return {
    leftFilename,
    leftFilePath: path.join(stagingDirectory, relativeDirectory, leftFilename),
    rightFilename,
    rightFilePath: path.join(stagingDirectory, relativeDirectory, rightFilename),
    treeRoot: stagingDirectory,
    treeRevisionId,
    relativeDirectory,
    materializedPathspec: '.'
  };
}

export function buildLabviewCliCreateComparisonReportPlan(
  options: LabviewCliComparisonReportPlanOptions
): ComparisonCommandPlan {
  const args = [
    '-LogToConsole',
    options.logToConsole ?? true ? 'TRUE' : 'FALSE',
    '-OperationName',
    'CreateComparisonReport',
    '-VI1',
    requireNonEmpty(options.leftViPath, 'leftViPath'),
    '-VI2',
    requireNonEmpty(options.rightViPath, 'rightViPath'),
    '-ReportType',
    mapReportFormatToCliValue(options.reportFormat ?? 'HTML'),
    '-ReportPath',
    requireNonEmpty(options.reportFilePath, 'reportFilePath')
  ];

  if (options.labviewPath?.trim()) {
    args.push('-LabVIEWPath', options.labviewPath.trim());
  }

  if (Number.isInteger(options.portNumber) && (options.portNumber ?? 0) > 0) {
    args.push('-PortNumber', String(options.portNumber));
  }

  if (options.description?.trim()) {
    args.push('-description', options.description.trim());
  }

  if (options.createOutputDirectory ?? true) {
    args.push('-c');
  }

  if (options.overwrite ?? true) {
    args.push('-o');
  }

  if (options.headless ?? false) {
    args.push('-Headless');
  }

  // VHS-REQ-645: difference-suppression filters (verified flag names from the
  // LabVIEWCLI CreateComparisonReport operation help). Each is emitted only when
  // its option is true so the default invocation compares everything.
  if (options.ignoreViAttributes) {
    args.push('-noattr');
  }
  if (options.ignoreFrontPanel) {
    args.push('-nofp');
  }
  if (options.ignoreFrontPanelObjectPosition) {
    args.push('-nofppos');
  }
  if (options.ignoreBlockDiagram) {
    args.push('-nobd');
  }
  if (options.ignoreBlockDiagramCosmetic) {
    args.push('-nobdcosm');
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

function deriveRelativeDirectory(normalizedRelativePath?: string): string {
  const trimmed = normalizedRelativePath?.trim();
  if (!trimmed) {
    return '';
  }

  const posixPath = trimmed.replace(/\\/g, '/');
  const directory = path.posix.dirname(posixPath);
  if (directory === '.' || directory === '/' || directory === '') {
    return '';
  }
  // VHS-REQ-624 (security): the staged tree directory is joined onto the staging
  // root, so reject anything that is not a plain relative subpath. Absolute paths,
  // Windows drive prefixes, and `..` traversal segments fall back to flat staging
  // rather than escaping the report workspace.
  const normalizedSegments = directory.split('/');
  const isUnsafe =
    directory.startsWith('/') ||
    /^[A-Za-z]:/.test(directory) ||
    normalizedSegments.some((segment) => segment === '..');
  if (isUnsafe) {
    return '';
  }
  return directory;
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

function mapReportFormatToCliValue(reportFormat: ComparisonReportFormat): string {
  switch (reportFormat) {
    case 'HTMLSingleFile':
      return 'htmlsinglefile';
    case 'HTML':
      return 'html';
    case 'XML':
      return 'xml';
    case 'PlainText':
      return 'plaintext';
    case 'MicrosoftWord':
      return 'microsoftword';
  }
}
