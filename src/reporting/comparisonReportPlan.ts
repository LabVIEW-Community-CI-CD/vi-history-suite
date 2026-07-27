import * as path from 'node:path';

import { createDeterministicId } from '../support/deterministicId';
import { requireNonEmpty } from '../support/requireNonEmpty';
import { normalizeRelativeGitPath } from '../git/gitCli';

export type ComparisonReportType = 'diff' | 'print';

/**
 * VHS-REQ-645: user-configurable comparison report flags surfaced through native
 * VS Code settings (`viHistorySuite.report.*`). The booleans map 1:1 to the
 * LabVIEWCLI `CreateComparisonReport` difference-suppression filters (verified
 * against the operation's own `-Help`). All fields are optional; an omitted field
 * preserves the shipped default (compare everything). The report output format
 * is fixed to single-file HTML (VHS-REQ-640) and is not configurable.
 */
export interface ComparisonReportOptions {
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
   * VHS-REQ-624: root of the materialized BASE (left) revision tree the left
   * staged VI lives inside, so it resolves its in-repo dependencies as they
   * existed at the base revision. The default builder nests it under the staging
   * directory.
   */
  leftTreeRoot?: string;
  /**
   * VHS-REQ-624: root of the materialized SELECTED (right) revision tree the
   * right staged VI lives inside, so it resolves its in-repo dependencies as
   * they existed at the selected revision. The default builder nests it under
   * the staging directory.
   */
  rightTreeRoot?: string;
  /**
   * VHS-REQ-624: base (left) revision whose surrounding tree is materialized so
   * the left staged VI resolves its own revision's in-repo dependencies.
   */
  leftTreeRevisionId?: string;
  /**
   * VHS-REQ-624: selected (right) revision whose surrounding tree is materialized
   * so the right staged VI resolves its own revision's in-repo dependencies.
   */
  rightTreeRevisionId?: string;
  /**
   * VHS-REQ-624: repo-relative directory (POSIX) of the compared VI within each
   * revision tree. Empty string when the VI sits at the repository root.
   */
  relativeDirectory?: string;
  /**
   * VHS-REQ-624: pathspec materialized from each revision. Defaults to the whole
   * repository (`.`) so all in-repo dependencies are present.
   */
  materializedPathspec?: string;
}

export interface LabviewCliComparisonReportPlanOptions {
  leftViPath: string;
  rightViPath: string;
  reportFilePath: string;
  labviewPath?: string;
  portNumber?: number;
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
/**
 * VHS-REQ-624: per-revision staged-tree subdirectories nested under the staging
 * directory. The base (left) revision tree and the selected (right) revision
 * tree are materialized separately so each compared VI resolves its own
 * revision's in-repo dependencies.
 */
export const LEFT_TREE_SUBDIRECTORY = 'left';
export const RIGHT_TREE_SUBDIRECTORY = 'right';
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

  // VHS-REQ-624: materialize each revision's surrounding tree separately (base
  // into the left subtree, selected into the right subtree) and place each
  // staged VI at its repo-relative depth inside its OWN revision tree so each VI
  // resolves the in-repo dependencies as they existed at that VI's revision.
  const relativeDirectory = deriveRelativeDirectory(options.normalizedRelativePath);
  const leftTreeRevisionId = options.leftRevisionId?.trim() ?? '';
  const rightTreeRevisionId = options.rightRevisionId?.trim() ?? '';
  const leftTreeRoot = path.join(stagingDirectory, LEFT_TREE_SUBDIRECTORY);
  const rightTreeRoot = path.join(stagingDirectory, RIGHT_TREE_SUBDIRECTORY);

  return {
    leftFilename,
    leftFilePath: path.join(leftTreeRoot, relativeDirectory, leftFilename),
    rightFilename,
    rightFilePath: path.join(rightTreeRoot, relativeDirectory, rightFilename),
    leftTreeRoot,
    rightTreeRoot,
    leftTreeRevisionId,
    rightTreeRevisionId,
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
    // VHS-REQ-640: comparison reports are always generated as a self-contained
    // single-file HTML document (images embedded as data URIs, no sibling
    // `<report>_files/` directory). The multi-file `html` report type made the
    // webview request hundreds of per-object images at once, exhausting the
    // resource loader so later images rendered as path text; single-file emits
    // zero sub-requests. This is fixed, not configurable.
    '-ReportType',
    'htmlsinglefile',
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
