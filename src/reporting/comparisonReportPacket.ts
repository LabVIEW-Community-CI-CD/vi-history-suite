import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  buildComparisonArtifactPlan,
  buildStagedRevisionPlan,
  ComparisonArtifactPlan,
  ComparisonReportType,
  StagedRevisionPlan
} from './comparisonReportPlan';
import { buildComparisonRuntimeDoctorSummary } from './comparisonRuntimeDoctor';
import { ComparisonRuntimeSelection } from './comparisonRuntimeLocator';
import { ComparisonReportPreflightResult } from './comparisonReportPreflight';

export type ComparisonReportRuntimeExecutionState =
  | 'not-run'
  | 'not-available'
  | 'succeeded'
  | 'failed';

export interface ComparisonReportRuntimeExecution {
  state: ComparisonReportRuntimeExecutionState;
  attempted: boolean;
  reportExists: boolean;
  acquisitionState?: 'not-required' | 'required' | 'acquired' | 'failed';
  doctorSummaryLines?: string[];
  blockedReason?: string;
  failureReason?: string;
  diagnosticReason?: string;
  diagnosticNotes?: string[];
  diagnosticLogSourcePath?: string;
  diagnosticLogArtifactPath?: string;
  labviewIniPath?: string;
  labviewTcpPort?: number;
  headlessDiagnosticArtifactPaths?: string[];
  headlessSessionResetExecutable?: string;
  headlessSessionResetArgs?: string[];
  headlessSessionResetExitCode?: number;
  headlessSessionResetStdoutFilePath?: string;
  headlessSessionResetStderrFilePath?: string;
  executable?: string;
  args?: string[];
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  exitCode?: number;
  signal?: string;
  stdoutFilePath?: string;
  stderrFilePath?: string;
  processObservationArtifactPath?: string;
  processObservationCapturedAt?: string;
  processObservationTrigger?: string;
  observedProcessNames?: string[];
  labviewProcessObserved?: boolean;
  labviewCliProcessObserved?: boolean;
  lvcompareProcessObserved?: boolean;
  exitProcessObservationCapturedAt?: string;
  exitProcessObservationTrigger?: string;
  exitObservedProcessNames?: string[];
  labviewProcessObservedAtExit?: boolean;
  labviewCliProcessObservedAtExit?: boolean;
  lvcompareProcessObservedAtExit?: boolean;
}

export interface ComparisonReportRevisionMetadata {
  hash: string;
  authorDate?: string;
  authorName?: string;
  subject?: string;
}

export interface PersistComparisonReportPacketOptions {
  storageRoot: string;
  repositoryRoot: string;
  relativePath: string;
  reportType: ComparisonReportType;
  selectedHash: string;
  baseHash: string;
  selectedRevision?: ComparisonReportRevisionMetadata;
  baseRevision?: ComparisonReportRevisionMetadata;
  preflight: ComparisonReportPreflightResult;
  runtimeSelection: ComparisonRuntimeSelection;
}

export interface ComparisonReportPacketRecord {
  generatedAt: string;
  reportTitle: string;
  reportStatus: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
  reportType: ComparisonReportType;
  selectedHash: string;
  baseHash: string;
  selectedRevision?: ComparisonReportRevisionMetadata;
  baseRevision?: ComparisonReportRevisionMetadata;
  artifactPlan: ComparisonArtifactPlan;
  stagedRevisionPlan: StagedRevisionPlan;
  preflight: ComparisonReportPreflightResult;
  runtimeSelection: ComparisonRuntimeSelection;
  runtimeExecutionState: ComparisonReportRuntimeExecutionState;
  runtimeExecution: ComparisonReportRuntimeExecution;
}

export interface PersistComparisonReportPacketResult {
  record: ComparisonReportPacketRecord;
  packetFilePath: string;
  reportFilePath: string;
  metadataFilePath: string;
}

export interface ComparisonReportPacketDeps {
  now?: () => string;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
}

export async function persistComparisonReportPacket(
  options: PersistComparisonReportPacketOptions,
  deps: ComparisonReportPacketDeps = {}
): Promise<PersistComparisonReportPacketResult> {
  const artifactPlan = buildComparisonArtifactPlan({
    storageRoot: options.storageRoot,
    repositoryRoot: options.repositoryRoot,
    relativePath: options.relativePath,
    reportType: options.reportType
  });
  const stagedRevisionPlan = buildStagedRevisionPlan({
    stagingDirectory: artifactPlan.stagingDirectory,
    fullFilename: artifactPlan.fullFilename,
    leftRevisionId: options.baseHash,
    rightRevisionId: options.selectedHash
  });

  const record: ComparisonReportPacketRecord = {
    generatedAt: (deps.now ?? defaultNow)(),
    reportTitle: `VI Comparison Report: ${artifactPlan.fullFilename}`,
    reportStatus: deriveReportStatus(options.preflight, options.runtimeSelection),
    reportType: options.reportType,
    selectedHash: options.selectedHash,
    baseHash: options.baseHash,
    selectedRevision: options.selectedRevision,
    baseRevision: options.baseRevision,
    artifactPlan,
    stagedRevisionPlan,
    preflight: options.preflight,
    runtimeSelection: options.runtimeSelection,
    runtimeExecution: buildInitialRuntimeExecution(options.preflight, options.runtimeSelection, artifactPlan),
    runtimeExecutionState:
      options.preflight.ready &&
      (options.runtimeSelection.provider === 'unavailable' ||
        options.runtimeSelection.blockedReason === 'windows-container-image-acquisition-failed' ||
        options.runtimeSelection.blockedReason === 'container-image-acquisition-failed')
        ? 'not-available'
        : 'not-run'
  };
  record.runtimeExecutionState = record.runtimeExecution.state;
  record.runtimeExecution.doctorSummaryLines = buildComparisonRuntimeDoctorSummary(record);

  await writeComparisonReportPacketRecord(record, deps);

  return {
    record,
    packetFilePath: artifactPlan.packetFilePath,
    reportFilePath: artifactPlan.reportFilePath,
    metadataFilePath: artifactPlan.metadataFilePath
  };
}

export async function writeComparisonReportPacketRecord(
  record: ComparisonReportPacketRecord,
  deps: ComparisonReportPacketDeps = {}
): Promise<void> {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;

  await mkdir(record.artifactPlan.reportDirectory, { recursive: true });
  await mkdir(record.artifactPlan.stagingDirectory, { recursive: true });
  await writeFile(record.artifactPlan.metadataFilePath, JSON.stringify(record, null, 2));
  await writeFile(record.artifactPlan.packetFilePath, renderComparisonReportPacketHtml(record));
}

export function renderComparisonReportPacketHtml(record: ComparisonReportPacketRecord): string {
  const left = record.preflight.left;
  const right = record.preflight.right;
  const runtimeSelection = record.runtimeSelection;
  const runtimeExecution = record.runtimeExecution;
  const runtimeNote = renderRuntimeNote(record);
  const comparisonContextMarkup = renderComparisonContextSection(record);
  const runtimeDoctorMarkup =
    runtimeExecution.doctorSummaryLines && runtimeExecution.doctorSummaryLines.length > 0
      ? `<div class="note" data-testid="comparison-report-runtime-doctor">
      <strong>Runtime doctor:</strong>
      <ul>${runtimeExecution.doctorSummaryLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
    </div>`
      : '';
  const generatedReportSection = runtimeExecution.reportExists
    ? `<div class="status" data-testid="comparison-report-generated-report">
      <strong>Generated report file:</strong> ${escapeHtml(record.artifactPlan.reportFilename)}<br />
      <strong>Generated report path:</strong> ${escapeHtml(record.artifactPlan.reportFilePath)}
    </div>
    <iframe
      data-testid="comparison-report-generated-frame"
      src="${escapeHtml(record.artifactPlan.reportFilename)}"
      title="${escapeHtml(record.reportTitle)}"
    ></iframe>`
    : `<div class="note" data-testid="comparison-report-generated-report-missing">
      <strong>Generated report:</strong> No LabVIEW-generated HTML report is currently retained at the governed output path.
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(record.reportTitle)}</title>
    <style>
      body { font-family: sans-serif; margin: 24px; }
      .context { margin-bottom: 16px; padding: 16px; border: 1px solid #888; background: #fff; color: #111; }
      .context-grid { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 12px 16px; margin-top: 12px; }
      .context-card { border: 1px solid #d0d0d0; padding: 12px; background: #fafafa; }
      .context-card div { margin-top: 6px; }
      .muted { color: #555; }
      .status { margin-bottom: 16px; padding: 12px; border: 1px solid #888; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 8px 16px; margin-bottom: 16px; }
      .note { margin-bottom: 16px; padding: 12px; border-left: 4px solid #0a84ff; }
      iframe { width: 100%; height: 70vh; border: 1px solid #888; margin-top: 12px; }
      code { word-break: break-all; }
    </style>
  </head>
  <body>
    <h1 data-testid="comparison-report-title">${escapeHtml(record.reportTitle)}</h1>
    ${comparisonContextMarkup}
    <div class="status" data-testid="comparison-report-status">
      <strong>Status:</strong> ${escapeHtml(record.reportStatus)}<br />
      <strong>Runtime execution:</strong> ${escapeHtml(record.runtimeExecutionState)}<br />
      <strong>Generated at:</strong> ${escapeHtml(record.generatedAt)}
    </div>
    <div class="grid" data-testid="comparison-report-plan">
      <div><strong>Report type:</strong> ${escapeHtml(record.reportType)}</div>
      <div><strong>Relative path:</strong> ${escapeHtml(record.artifactPlan.normalizedRelativePath)}</div>
      <div><strong>Selected revision:</strong> <code>${escapeHtml(record.selectedHash)}</code></div>
      <div><strong>Base revision:</strong> <code>${escapeHtml(record.baseHash)}</code></div>
      <div><strong>Report file:</strong> ${escapeHtml(record.artifactPlan.reportFilename)}</div>
      <div><strong>Packet file:</strong> ${escapeHtml(record.artifactPlan.packetFilename)}</div>
      <div><strong>Metadata file:</strong> ${escapeHtml(path.basename(record.artifactPlan.metadataFilePath))}</div>
      <div><strong>Left staged file:</strong> ${escapeHtml(record.stagedRevisionPlan.leftFilename)}</div>
      <div><strong>Right staged file:</strong> ${escapeHtml(record.stagedRevisionPlan.rightFilename)}</div>
    </div>
    <div class="note" data-testid="comparison-report-runtime-note">
      <strong>Runtime note:</strong> ${escapeHtml(runtimeNote)}
    </div>
    ${runtimeDoctorMarkup}
    <h2>Runtime selection</h2>
    <div class="grid" data-testid="comparison-report-runtime-selection">
      <div><strong>Execution mode:</strong> ${escapeHtml(runtimeSelection.executionMode ?? 'auto')}</div>
      <div><strong>Provider:</strong> ${escapeHtml(runtimeSelection.provider)}</div>
      <div><strong>Engine:</strong> ${escapeHtml(runtimeSelection.engine ?? 'none')}</div>
      <div><strong>Blocked reason:</strong> ${escapeHtml(runtimeSelection.blockedReason ?? 'none')}</div>
      <div><strong>Bitness:</strong> ${escapeHtml(runtimeSelection.bitness)}</div>
      <div><strong>LabVIEW path:</strong> ${escapeHtml(runtimeSelection.labviewExe?.path ?? 'none')}</div>
      <div><strong>LabVIEWCLI path:</strong> ${escapeHtml(runtimeSelection.labviewCli?.path ?? 'none')}</div>
      <div><strong>LVCompare path:</strong> ${escapeHtml(runtimeSelection.lvCompare?.path ?? 'none')}</div>
      <div><strong>Docker CLI available:</strong> ${escapeHtml(
        runtimeSelection.dockerCliAvailable === undefined
          ? 'none'
          : runtimeSelection.dockerCliAvailable
            ? 'yes'
            : 'no'
      )}</div>
      <div><strong>Docker daemon reachable:</strong> ${escapeHtml(
        runtimeSelection.dockerDaemonReachable === undefined
          ? 'none'
          : runtimeSelection.dockerDaemonReachable
            ? 'yes'
            : 'no'
      )}</div>
      <div><strong>Container host mode:</strong> ${escapeHtml(
        runtimeSelection.containerHostMode ?? 'none'
      )}</div>
      <div><strong>Container capability:</strong> ${escapeHtml(
        runtimeSelection.containerCapabilityAvailable === undefined
          ? 'none'
          : runtimeSelection.containerCapabilityAvailable
            ? 'yes'
            : 'no'
      )}</div>
      <div><strong>Container image:</strong> ${escapeHtml(runtimeSelection.containerImage ?? 'none')}</div>
      <div><strong>Container image present:</strong> ${escapeHtml(
        runtimeSelection.containerImageAvailable === undefined
          ? 'none'
          : runtimeSelection.containerImageAvailable
            ? 'yes'
            : 'no'
      )}</div>
      <div><strong>Container acquisition state:</strong> ${escapeHtml(
        runtimeSelection.containerAcquisitionState ?? 'none'
      )}</div>
      <div><strong>Runtime platform:</strong> ${escapeHtml(
        runtimeSelection.containerRuntimePlatform ?? runtimeSelection.platform
      )}</div>
      <div><strong>Host LabVIEW.ini:</strong> ${escapeHtml(runtimeSelection.hostLabviewIniPath ?? 'none')}</div>
      <div><strong>Host VI Server port:</strong> ${escapeHtml(
        runtimeSelection.hostLabviewTcpPort === undefined
          ? 'none'
          : String(runtimeSelection.hostLabviewTcpPort)
      )}</div>
      <div><strong>Host conflict detected:</strong> ${escapeHtml(
        runtimeSelection.hostRuntimeConflictDetected === undefined
          ? 'none'
          : runtimeSelection.hostRuntimeConflictDetected
            ? 'yes'
            : 'no'
      )}</div>
      <div><strong>Platform:</strong> ${escapeHtml(runtimeSelection.platform)}</div>
    </div>
    <div class="note" data-testid="comparison-report-runtime-selection-notes">
      <strong>Runtime notes:</strong> ${escapeHtml(runtimeSelection.notes.join(' | ') || 'none')}
    </div>
    <h2>Execution summary</h2>
    <div class="grid" data-testid="comparison-report-runtime-execution">
      <div><strong>Attempted:</strong> ${runtimeExecution.attempted ? 'yes' : 'no'}</div>
      <div><strong>Report exists:</strong> ${runtimeExecution.reportExists ? 'yes' : 'no'}</div>
      <div><strong>Acquisition state:</strong> ${escapeHtml(
        runtimeExecution.acquisitionState ?? 'none'
      )}</div>
      <div><strong>Failure reason:</strong> ${escapeHtml(runtimeExecution.failureReason ?? 'none')}</div>
      <div><strong>Blocked reason:</strong> ${escapeHtml(runtimeExecution.blockedReason ?? 'none')}</div>
      <div><strong>Executable:</strong> ${escapeHtml(runtimeExecution.executable ?? 'none')}</div>
      <div><strong>Exit code:</strong> ${escapeHtml(
        runtimeExecution.exitCode === undefined ? 'none' : String(runtimeExecution.exitCode)
      )}</div>
      <div><strong>Duration (ms):</strong> ${escapeHtml(
        runtimeExecution.durationMs === undefined ? 'none' : String(runtimeExecution.durationMs)
      )}</div>
      <div><strong>Signal:</strong> ${escapeHtml(runtimeExecution.signal ?? 'none')}</div>
      <div><strong>Stdout artifact:</strong> ${escapeHtml(runtimeExecution.stdoutFilePath ?? 'none')}</div>
      <div><strong>Stderr artifact:</strong> ${escapeHtml(runtimeExecution.stderrFilePath ?? 'none')}</div>
      <div><strong>Process observation artifact:</strong> ${escapeHtml(
        runtimeExecution.processObservationArtifactPath ?? 'none'
      )}</div>
      <div><strong>Headless diagnostic artifacts:</strong> ${escapeHtml(
        runtimeExecution.headlessDiagnosticArtifactPaths?.join(' | ') ?? 'none'
      )}</div>
      <div><strong>Selected LabVIEW.ini path:</strong> ${escapeHtml(
        runtimeExecution.labviewIniPath ?? 'none'
      )}</div>
      <div><strong>Selected LabVIEW TCP port:</strong> ${escapeHtml(
        runtimeExecution.labviewTcpPort === undefined
          ? 'none'
          : String(runtimeExecution.labviewTcpPort)
      )}</div>
      <div><strong>Headless session reset executable:</strong> ${escapeHtml(
        runtimeExecution.headlessSessionResetExecutable ?? 'none'
      )}</div>
      <div><strong>Headless session reset args:</strong> ${escapeHtml(
        runtimeExecution.headlessSessionResetArgs?.join(' ') ?? 'none'
      )}</div>
      <div><strong>Headless session reset exit code:</strong> ${escapeHtml(
        runtimeExecution.headlessSessionResetExitCode === undefined
          ? 'none'
          : String(runtimeExecution.headlessSessionResetExitCode)
      )}</div>
      <div><strong>Headless session reset stdout artifact:</strong> ${escapeHtml(
        runtimeExecution.headlessSessionResetStdoutFilePath ?? 'none'
      )}</div>
      <div><strong>Headless session reset stderr artifact:</strong> ${escapeHtml(
        runtimeExecution.headlessSessionResetStderrFilePath ?? 'none'
      )}</div>
      <div><strong>Process observation captured at:</strong> ${escapeHtml(
        runtimeExecution.processObservationCapturedAt ?? 'none'
      )}</div>
      <div><strong>Process observation trigger:</strong> ${escapeHtml(
        runtimeExecution.processObservationTrigger ?? 'none'
      )}</div>
      <div><strong>Observed process names:</strong> ${escapeHtml(
        runtimeExecution.observedProcessNames?.join(' | ') || 'none'
      )}</div>
      <div><strong>Observed LabVIEW.exe:</strong> ${renderOptionalYesNo(
        runtimeExecution.labviewProcessObserved
      )}</div>
      <div><strong>Observed LabVIEWCLI.exe:</strong> ${renderOptionalYesNo(
        runtimeExecution.labviewCliProcessObserved
      )}</div>
      <div><strong>Observed LVCompare.exe:</strong> ${renderOptionalYesNo(
        runtimeExecution.lvcompareProcessObserved
      )}</div>
      <div><strong>Exit process observation captured at:</strong> ${escapeHtml(
        runtimeExecution.exitProcessObservationCapturedAt ?? 'none'
      )}</div>
      <div><strong>Exit process observation trigger:</strong> ${escapeHtml(
        runtimeExecution.exitProcessObservationTrigger ?? 'none'
      )}</div>
      <div><strong>Exit observed process names:</strong> ${escapeHtml(
        runtimeExecution.exitObservedProcessNames?.join(' | ') || 'none'
      )}</div>
      <div><strong>Observed LabVIEW.exe at exit:</strong> ${renderOptionalYesNo(
        runtimeExecution.labviewProcessObservedAtExit
      )}</div>
      <div><strong>Observed LabVIEWCLI.exe at exit:</strong> ${renderOptionalYesNo(
        runtimeExecution.labviewCliProcessObservedAtExit
      )}</div>
      <div><strong>Observed LVCompare.exe at exit:</strong> ${renderOptionalYesNo(
        runtimeExecution.lvcompareProcessObservedAtExit
      )}</div>
      <div><strong>Diagnostic reason:</strong> ${escapeHtml(runtimeExecution.diagnosticReason ?? 'none')}</div>
      <div><strong>Diagnostic log artifact:</strong> ${escapeHtml(runtimeExecution.diagnosticLogArtifactPath ?? 'none')}</div>
      <div><strong>Diagnostic log source:</strong> ${escapeHtml(runtimeExecution.diagnosticLogSourcePath ?? 'none')}</div>
    </div>
    <div class="note" data-testid="comparison-report-runtime-command">
      <strong>Command:</strong> ${escapeHtml(renderCommand(runtimeExecution))}
    </div>
    <div class="note" data-testid="comparison-report-runtime-diagnostics">
      <strong>Diagnostic notes:</strong> ${escapeHtml(
        runtimeExecution.diagnosticNotes?.join(' | ') || 'none'
      )}
    </div>
    <h2>Generated report</h2>
    ${generatedReportSection}
    <h2>Preflight</h2>
    <div class="grid" data-testid="comparison-report-preflight">
      <div><strong>Ready for runtime:</strong> ${record.preflight.ready ? 'yes' : 'no'}</div>
      <div><strong>Blocked reason:</strong> ${escapeHtml(record.preflight.blockedReason ?? 'none')}</div>
      <div><strong>Left blob:</strong> <code>${escapeHtml(left.blobSpecifier)}</code></div>
      <div><strong>Left signature:</strong> ${escapeHtml(left.signature ?? 'not-a-vi')}</div>
      <div><strong>Right blob:</strong> <code>${escapeHtml(right.blobSpecifier)}</code></div>
      <div><strong>Right signature:</strong> ${escapeHtml(right.signature ?? 'not-a-vi')}</div>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function defaultNow(): string {
  return new Date().toISOString();
}

function buildInitialRuntimeExecution(
  preflight: ComparisonReportPreflightResult,
  runtimeSelection: ComparisonRuntimeSelection,
  artifactPlan: ComparisonArtifactPlan
): ComparisonReportRuntimeExecution {
  if (preflight.ready && runtimeSelection.provider === 'unavailable') {
    return {
      state: 'not-available',
      attempted: false,
      reportExists: false,
      acquisitionState:
        runtimeSelection.containerAcquisitionState ?? runtimeSelection.windowsContainerAcquisitionState,
      blockedReason: runtimeSelection.blockedReason,
      stdoutFilePath: artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: artifactPlan.runtimeStderrFilePath,
      diagnosticLogArtifactPath: artifactPlan.runtimeDiagnosticLogFilePath,
      diagnosticNotes: []
    };
  }

  if (
    preflight.ready &&
    (runtimeSelection.blockedReason === 'container-image-acquisition-failed' ||
      runtimeSelection.blockedReason === 'windows-container-image-acquisition-failed')
  ) {
    return {
      state: 'not-available',
      attempted: false,
      reportExists: false,
      acquisitionState:
        runtimeSelection.containerAcquisitionState ?? runtimeSelection.windowsContainerAcquisitionState,
      blockedReason: runtimeSelection.blockedReason,
      stdoutFilePath: artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: artifactPlan.runtimeStderrFilePath,
      diagnosticLogArtifactPath: artifactPlan.runtimeDiagnosticLogFilePath,
      diagnosticNotes: []
    };
  }

  return {
    state: 'not-run',
    attempted: false,
    reportExists: false,
    acquisitionState:
      runtimeSelection.containerAcquisitionState ?? runtimeSelection.windowsContainerAcquisitionState,
    stdoutFilePath: artifactPlan.runtimeStdoutFilePath,
    stderrFilePath: artifactPlan.runtimeStderrFilePath,
    diagnosticLogArtifactPath: artifactPlan.runtimeDiagnosticLogFilePath,
    diagnosticNotes: []
  };
}

function renderRuntimeNote(record: ComparisonReportPacketRecord): string {
  if (record.runtimeExecutionState === 'not-available') {
    if (
      record.runtimeExecution.blockedReason === 'container-image-acquisition-failed' ||
      record.runtimeExecution.blockedReason === 'windows-container-image-acquisition-failed'
    ) {
      return 'No LabVIEW-generated comparison report has been executed because the governed container image could not be acquired before runtime launch.';
    }

    return 'No LabVIEW-generated comparison report has been executed because the governed runtime selection is currently unavailable for this workspace and platform.';
  }

  if (record.runtimeExecutionState === 'succeeded') {
    return 'LabVIEW-generated comparison report execution succeeded and the governed HTML output is retained at the report path shown below.';
  }

  if (record.runtimeExecutionState === 'failed') {
    return 'LabVIEW-generated comparison report execution was attempted, but the governed output is not currently usable. Review the retained execution summary and stdout/stderr artifact paths below.';
  }

  return 'No LabVIEW-generated comparison report has been executed yet. This retained packet captures the governed preflight, runtime selection, and artifact plan for the selected revision pair.';
}

function renderComparisonContextSection(record: ComparisonReportPacketRecord): string {
  return `<div class="context" data-testid="comparison-report-context">
      <strong>Comparison context</strong>
      <div><strong>Relative path:</strong> ${escapeHtml(record.artifactPlan.normalizedRelativePath)}</div>
      <div class="context-grid">
        ${renderRevisionContextCard(
          'Selected revision',
          record.selectedHash,
          record.selectedRevision,
          'comparison-report-context-selected'
        )}
        ${renderRevisionContextCard(
          'Base revision',
          record.baseHash,
          record.baseRevision,
          'comparison-report-context-base'
        )}
      </div>
    </div>`;
}

function renderRevisionContextCard(
  label: string,
  hash: string,
  revision: ComparisonReportRevisionMetadata | undefined,
  testId: string
): string {
  return `<div class="context-card" data-testid="${testId}">
      <strong>${escapeHtml(label)}</strong>
      <div><code>${escapeHtml(revision?.hash ?? hash)}</code></div>
      <div><strong>Date:</strong> ${renderRevisionMetadataValue(revision?.authorDate)}</div>
      <div><strong>Author:</strong> ${renderRevisionMetadataValue(revision?.authorName)}</div>
      <div><strong>Subject:</strong> ${renderRevisionMetadataValue(revision?.subject)}</div>
    </div>`;
}

function renderRevisionMetadataValue(value: string | undefined): string {
  return value && value.length > 0
    ? escapeHtml(value)
    : '<span class="muted">not retained</span>';
}

function renderCommand(runtimeExecution: ComparisonReportRuntimeExecution): string {
  if (!runtimeExecution.executable) {
    return 'none';
  }

  return [runtimeExecution.executable, ...(runtimeExecution.args ?? [])].join(' ');
}

function renderOptionalYesNo(value: boolean | undefined): string {
  if (value === undefined) {
    return 'none';
  }

  return value ? 'yes' : 'no';
}

function deriveReportStatus(
  preflight: ComparisonReportPreflightResult,
  runtimeSelection: ComparisonRuntimeSelection
): 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime' {
  if (!preflight.ready) {
    return 'blocked-preflight';
  }

  if (runtimeSelection.provider === 'unavailable') {
    return 'blocked-runtime';
  }

  if (
    runtimeSelection.blockedReason === 'container-image-acquisition-failed' ||
    runtimeSelection.blockedReason === 'windows-container-image-acquisition-failed'
  ) {
    return 'blocked-runtime';
  }

  return 'ready-for-runtime';
}
