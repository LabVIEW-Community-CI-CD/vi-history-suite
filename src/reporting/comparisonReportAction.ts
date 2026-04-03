import * as vscode from 'vscode';

import { archiveComparisonReportSource } from '../dashboard/comparisonReportArchive';
import {
  ComparisonRuntimeSettings,
  locateComparisonRuntime,
  RuntimePlatform
} from './comparisonRuntimeLocator';
import { ViHistoryViewModel } from '../services/viHistoryModel';
import { persistComparisonReportPacket } from './comparisonReportPacket';
import { executeComparisonReport } from './comparisonReportRuntimeExecution';
import { preflightComparisonReportRevisions } from './comparisonReportPreflight';

export interface ComparisonReportActionRequest {
  model: ViHistoryViewModel;
  selectedHash: string;
  reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
}

export interface ComparisonReportActionResult {
  outcome:
    | 'opened-comparison-report'
    | 'workspace-untrusted'
    | 'missing-storage-uri'
    | 'missing-selected-commit'
    | 'missing-previous-hash';
  reportStatus?: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
  runtimeExecutionState?: 'not-run' | 'not-available' | 'succeeded' | 'failed';
  blockedReason?: string;
  runtimeFailureReason?: string;
  runtimeDiagnosticReason?: string;
  runtimeDiagnosticNotes?: string[];
  runtimeDiagnosticLogSourcePath?: string;
  runtimeDiagnosticLogArtifactPath?: string;
  runtimeDoctorSummaryLines?: string[];
  runtimeExecutable?: string;
  runtimeArgs?: string[];
  runtimeProcessObservationArtifactPath?: string;
  runtimeProcessObservationCapturedAt?: string;
  runtimeProcessObservationTrigger?: string;
  runtimeObservedProcessNames?: string[];
  runtimeLabviewProcessObserved?: boolean;
  runtimeLabviewCliProcessObserved?: boolean;
  runtimeLvcompareProcessObserved?: boolean;
  runtimeExitProcessObservationCapturedAt?: string;
  runtimeExitProcessObservationTrigger?: string;
  runtimeExitObservedProcessNames?: string[];
  runtimeLabviewProcessObservedAtExit?: boolean;
  runtimeLabviewCliProcessObservedAtExit?: boolean;
  runtimeLvcompareProcessObservedAtExit?: boolean;
  packetFilePath?: string;
  reportFilePath?: string;
  metadataFilePath?: string;
  reportWebviewUri?: string;
  generatedReportExists?: boolean;
  title?: string;
}

export interface ComparisonReportActionDeps {
  preflightComparisonReport?: typeof preflightComparisonReportRevisions;
  persistComparisonReport?: typeof persistComparisonReportPacket;
  createWebviewPanel?: typeof vscode.window.createWebviewPanel;
  uriFile?: typeof vscode.Uri.file;
  joinPath?: typeof vscode.Uri.joinPath;
  locateRuntime?: typeof locateComparisonRuntime;
  executeComparisonReport?: typeof executeComparisonReport;
  getRuntimeSettings?: () => ComparisonRuntimeSettings;
  archiveComparisonReportSource?: typeof archiveComparisonReportSource;
}

export function createComparisonReportAction(
  context: vscode.ExtensionContext,
  deps: ComparisonReportActionDeps = {}
): (request: ComparisonReportActionRequest) => Promise<ComparisonReportActionResult> {
  return async (request: ComparisonReportActionRequest): Promise<ComparisonReportActionResult> => {
    if (!vscode.workspace.isTrusted) {
      return { outcome: 'workspace-untrusted' };
    }

    await request.reportProgress?.({
      message: 'Resolving retained revision pair.',
      increment: 10
    });
    const selectedCommit = request.model.commits.find((commit) => commit.hash === request.selectedHash);
    if (!selectedCommit) {
      return { outcome: 'missing-selected-commit' };
    }

    if (!selectedCommit.previousHash) {
      return { outcome: 'missing-previous-hash' };
    }

    if (!context.storageUri) {
      return { outcome: 'missing-storage-uri' };
    }

    await request.reportProgress?.({
      message: 'Validating retained VI revisions.',
      increment: 20
    });
    const preflight = await (deps.preflightComparisonReport ?? preflightComparisonReportRevisions)({
      repoRoot: request.model.repositoryRoot,
      relativePath: request.model.relativePath,
      leftRevisionId: selectedCommit.previousHash,
      rightRevisionId: selectedCommit.hash
    });
    await request.reportProgress?.({
      message: 'Selecting comparison-report runtime.',
      increment: 20
    });
    const runtimeSelection = await (deps.locateRuntime ?? locateComparisonRuntime)(
      resolveRuntimePlatform(process.platform),
      (deps.getRuntimeSettings ?? readComparisonRuntimeSettings)()
    );

    await request.reportProgress?.({
      message: 'Persisting governed comparison-report packet.',
      increment: 20
    });
    let packet = await (deps.persistComparisonReport ?? persistComparisonReportPacket)({
      storageRoot: context.storageUri.fsPath,
      repositoryRoot: request.model.repositoryRoot,
      relativePath: request.model.relativePath,
      reportType: 'diff',
      selectedHash: selectedCommit.hash,
      baseHash: selectedCommit.previousHash,
      preflight,
      runtimeSelection
    });
    if (packet.record.reportStatus === 'ready-for-runtime') {
      await request.reportProgress?.({
        message: 'Executing NI comparison-report runtime.',
        increment: 20
      });
      packet = await (deps.executeComparisonReport ?? executeComparisonReport)({
        record: packet.record,
        repositoryRoot: request.model.repositoryRoot
      });
    }
    if (canArchiveComparisonReport(packet.record)) {
      await request.reportProgress?.({
        message: 'Archiving comparison-report evidence.',
        increment: 5
      });
      await (deps.archiveComparisonReportSource ?? archiveComparisonReportSource)(packet.record);
    }

    const createWebviewPanel = deps.createWebviewPanel ?? vscode.window.createWebviewPanel;
    const uriFile = deps.uriFile ?? vscode.Uri.file;
    const joinPath = deps.joinPath ?? vscode.Uri.joinPath;
    const repoRootUri = joinPath(context.storageUri, 'reports', packet.record.artifactPlan.repoId);
    const packetFileUri = uriFile(packet.packetFilePath);

    await request.reportProgress?.({
      message: 'Opening retained comparison-report view.',
      increment: 5
    });
    const panel = createWebviewPanel(
      'viHistorySuite.comparisonReport',
      packet.record.reportTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: false,
        localResourceRoots: [context.storageUri, repoRootUri]
      }
    );
    const reportWebviewUri = panel.webview.asWebviewUri(packetFileUri);
    panel.webview.html = renderComparisonReportPanelHtml({
      title: packet.record.reportTitle,
      reportWebviewUri: reportWebviewUri.toString(),
      reportStatus: packet.record.reportStatus,
      runtimeExecutionState: packet.record.runtimeExecutionState,
      blockedReason:
        packet.record.reportStatus === 'blocked-runtime'
          ? packet.record.runtimeSelection.blockedReason
          : preflight.blockedReason,
      runtimeFailureReason: packet.record.runtimeExecution.failureReason,
      runtimeDiagnosticReason: packet.record.runtimeExecution.diagnosticReason,
      runtimeDiagnosticNotes: packet.record.runtimeExecution.diagnosticNotes,
      runtimeDiagnosticLogSourcePath: packet.record.runtimeExecution.diagnosticLogSourcePath,
      runtimeDoctorSummaryLines: packet.record.runtimeExecution.doctorSummaryLines,
      runtimeProcessObservationArtifactPath:
        packet.record.runtimeExecution.processObservationArtifactPath,
      runtimeExecutable: packet.record.runtimeExecution.executable,
      runtimeArgs: packet.record.runtimeExecution.args,
      runtimeProcessObservationCapturedAt:
        packet.record.runtimeExecution.processObservationCapturedAt,
      runtimeProcessObservationTrigger: packet.record.runtimeExecution.processObservationTrigger,
      runtimeObservedProcessNames: packet.record.runtimeExecution.observedProcessNames,
      runtimeLabviewProcessObserved: packet.record.runtimeExecution.labviewProcessObserved,
      runtimeLabviewCliProcessObserved: packet.record.runtimeExecution.labviewCliProcessObserved,
      runtimeLvcompareProcessObserved: packet.record.runtimeExecution.lvcompareProcessObserved,
      runtimeExitProcessObservationCapturedAt:
        packet.record.runtimeExecution.exitProcessObservationCapturedAt,
      runtimeExitProcessObservationTrigger:
        packet.record.runtimeExecution.exitProcessObservationTrigger,
      runtimeExitObservedProcessNames: packet.record.runtimeExecution.exitObservedProcessNames,
      runtimeLabviewProcessObservedAtExit:
        packet.record.runtimeExecution.labviewProcessObservedAtExit,
      runtimeLabviewCliProcessObservedAtExit:
        packet.record.runtimeExecution.labviewCliProcessObservedAtExit,
      runtimeLvcompareProcessObservedAtExit:
        packet.record.runtimeExecution.lvcompareProcessObservedAtExit,
      generatedReportExists: packet.record.runtimeExecution.reportExists,
      cspSource: panel.webview.cspSource
    });

    const result: ComparisonReportActionResult = {
      outcome: 'opened-comparison-report',
      reportStatus: packet.record.reportStatus,
      runtimeExecutionState: packet.record.runtimeExecutionState,
      blockedReason:
        packet.record.reportStatus === 'blocked-runtime'
          ? packet.record.runtimeSelection.blockedReason
          : preflight.blockedReason,
      runtimeFailureReason: packet.record.runtimeExecution.failureReason,
      packetFilePath: packet.packetFilePath,
      reportFilePath: packet.reportFilePath,
      metadataFilePath: packet.metadataFilePath,
      reportWebviewUri: reportWebviewUri.toString(),
      generatedReportExists: packet.record.runtimeExecution.reportExists,
      title: panel.title
    };

    if (packet.record.runtimeExecution.diagnosticReason) {
      result.runtimeDiagnosticReason = packet.record.runtimeExecution.diagnosticReason;
    }
    if (packet.record.runtimeExecution.diagnosticNotes?.length) {
      result.runtimeDiagnosticNotes = packet.record.runtimeExecution.diagnosticNotes;
    }
    if (packet.record.runtimeExecution.diagnosticLogSourcePath) {
      result.runtimeDiagnosticLogSourcePath =
        packet.record.runtimeExecution.diagnosticLogSourcePath;
    }
    if (packet.record.runtimeExecution.diagnosticLogArtifactPath) {
      result.runtimeDiagnosticLogArtifactPath =
        packet.record.runtimeExecution.diagnosticLogArtifactPath;
    }
    if (packet.record.runtimeExecution.doctorSummaryLines?.length) {
      result.runtimeDoctorSummaryLines =
        packet.record.runtimeExecution.doctorSummaryLines;
    }
    if (packet.record.runtimeExecution.executable) {
      result.runtimeExecutable = packet.record.runtimeExecution.executable;
    }
    if (packet.record.runtimeExecution.args?.length) {
      result.runtimeArgs = packet.record.runtimeExecution.args;
    }
    if (packet.record.runtimeExecution.processObservationArtifactPath) {
      result.runtimeProcessObservationArtifactPath =
        packet.record.runtimeExecution.processObservationArtifactPath;
    }
    if (packet.record.runtimeExecution.processObservationCapturedAt) {
      result.runtimeProcessObservationCapturedAt =
        packet.record.runtimeExecution.processObservationCapturedAt;
    }
    if (packet.record.runtimeExecution.processObservationTrigger) {
      result.runtimeProcessObservationTrigger =
        packet.record.runtimeExecution.processObservationTrigger;
    }
    if (packet.record.runtimeExecution.observedProcessNames?.length) {
      result.runtimeObservedProcessNames = packet.record.runtimeExecution.observedProcessNames;
    }
    if (packet.record.runtimeExecution.labviewProcessObserved !== undefined) {
      result.runtimeLabviewProcessObserved = packet.record.runtimeExecution.labviewProcessObserved;
    }
    if (packet.record.runtimeExecution.labviewCliProcessObserved !== undefined) {
      result.runtimeLabviewCliProcessObserved =
        packet.record.runtimeExecution.labviewCliProcessObserved;
    }
    if (packet.record.runtimeExecution.lvcompareProcessObserved !== undefined) {
      result.runtimeLvcompareProcessObserved = packet.record.runtimeExecution.lvcompareProcessObserved;
    }
    if (packet.record.runtimeExecution.exitProcessObservationCapturedAt) {
      result.runtimeExitProcessObservationCapturedAt =
        packet.record.runtimeExecution.exitProcessObservationCapturedAt;
    }
    if (packet.record.runtimeExecution.exitProcessObservationTrigger) {
      result.runtimeExitProcessObservationTrigger =
        packet.record.runtimeExecution.exitProcessObservationTrigger;
    }
    if (packet.record.runtimeExecution.exitObservedProcessNames?.length) {
      result.runtimeExitObservedProcessNames =
        packet.record.runtimeExecution.exitObservedProcessNames;
    }
    if (packet.record.runtimeExecution.labviewProcessObservedAtExit !== undefined) {
      result.runtimeLabviewProcessObservedAtExit =
        packet.record.runtimeExecution.labviewProcessObservedAtExit;
    }
    if (packet.record.runtimeExecution.labviewCliProcessObservedAtExit !== undefined) {
      result.runtimeLabviewCliProcessObservedAtExit =
        packet.record.runtimeExecution.labviewCliProcessObservedAtExit;
    }
    if (packet.record.runtimeExecution.lvcompareProcessObservedAtExit !== undefined) {
      result.runtimeLvcompareProcessObservedAtExit =
        packet.record.runtimeExecution.lvcompareProcessObservedAtExit;
    }

    return result;
  };
}

function canArchiveComparisonReport(
  record: Parameters<typeof archiveComparisonReportSource>[0]
): boolean {
  return Boolean(
    record.artifactPlan.allowedLocalRootPaths?.[0] &&
      record.artifactPlan.normalizedRelativePath &&
      record.artifactPlan.reportFilename &&
      record.artifactPlan.packetFilename
  );
}

export function renderComparisonReportPanelHtml(options: {
  title: string;
  reportWebviewUri: string;
  reportStatus: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
  runtimeExecutionState: 'not-run' | 'not-available' | 'succeeded' | 'failed';
  blockedReason?: string;
  runtimeFailureReason?: string;
  runtimeDiagnosticReason?: string;
  runtimeDiagnosticNotes?: string[];
  runtimeDiagnosticLogSourcePath?: string;
  runtimeDoctorSummaryLines?: string[];
  runtimeProcessObservationArtifactPath?: string;
  runtimeExecutable?: string;
  runtimeArgs?: string[];
  runtimeProcessObservationCapturedAt?: string;
  runtimeProcessObservationTrigger?: string;
  runtimeObservedProcessNames?: string[];
  runtimeLabviewProcessObserved?: boolean;
  runtimeLabviewCliProcessObserved?: boolean;
  runtimeLvcompareProcessObserved?: boolean;
  runtimeExitProcessObservationCapturedAt?: string;
  runtimeExitProcessObservationTrigger?: string;
  runtimeExitObservedProcessNames?: string[];
  runtimeLabviewProcessObservedAtExit?: boolean;
  runtimeLabviewCliProcessObservedAtExit?: boolean;
  runtimeLvcompareProcessObservedAtExit?: boolean;
  generatedReportExists: boolean;
  cspSource: string;
}): string {
  const safeTitle = escapeHtml(options.title);
  const safeUri = escapeHtml(options.reportWebviewUri);
  const blockedReasonMarkup = options.blockedReason
    ? `<div><strong>Blocked reason:</strong> ${escapeHtml(options.blockedReason)}</div>`
    : '';
  const failureReasonMarkup = options.runtimeFailureReason
    ? `<div><strong>Runtime failure reason:</strong> ${escapeHtml(options.runtimeFailureReason)}</div>`
    : '';
  const diagnosticReasonMarkup = options.runtimeDiagnosticReason
    ? `<div><strong>Runtime diagnostic:</strong> ${escapeHtml(options.runtimeDiagnosticReason)}</div>`
    : '';
  const diagnosticLogSourceMarkup = options.runtimeDiagnosticLogSourcePath
    ? `<div><strong>Runtime diagnostic log source:</strong> ${escapeHtml(
        options.runtimeDiagnosticLogSourcePath
      )}</div>`
    : '';
  const diagnosticNotesMarkup =
    options.runtimeDiagnosticNotes && options.runtimeDiagnosticNotes.length > 0
      ? `<div><strong>Runtime notes:</strong><ul>${options.runtimeDiagnosticNotes
          .map((note) => `<li>${escapeHtml(note)}</li>`)
          .join('')}</ul></div>`
      : '';
  const runtimeDoctorMarkup =
    options.runtimeDoctorSummaryLines && options.runtimeDoctorSummaryLines.length > 0
      ? `<div data-testid="comparison-report-panel-runtime-doctor"><strong>Runtime doctor:</strong><ul>${options.runtimeDoctorSummaryLines
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join('')}</ul></div>`
      : '';
  const processObservationMarkup = options.runtimeProcessObservationArtifactPath
    ? `<div><strong>Process observation artifact:</strong> ${escapeHtml(
        options.runtimeProcessObservationArtifactPath
      )}</div>`
    : '';
  const runtimeExecutableMarkup = options.runtimeExecutable
    ? `<div><strong>Runtime executable:</strong> ${escapeHtml(options.runtimeExecutable)}</div>`
    : '';
  const runtimeArgsMarkup =
    options.runtimeArgs && options.runtimeArgs.length > 0
      ? `<div><strong>Runtime args:</strong> ${escapeHtml(options.runtimeArgs.join(' '))}</div>`
      : '';
  const processObservationCapturedAtMarkup = options.runtimeProcessObservationCapturedAt
    ? `<div><strong>Process observation captured at:</strong> ${escapeHtml(
        options.runtimeProcessObservationCapturedAt
      )}</div>`
    : '';
  const processObservationTriggerMarkup = options.runtimeProcessObservationTrigger
    ? `<div><strong>Process observation trigger:</strong> ${escapeHtml(
        options.runtimeProcessObservationTrigger
      )}</div>`
    : '';
  const observedProcessNamesMarkup =
    options.runtimeObservedProcessNames && options.runtimeObservedProcessNames.length > 0
      ? `<div><strong>Observed process names:</strong> ${escapeHtml(
          options.runtimeObservedProcessNames.join(' | ')
        )}</div>`
      : '';
  const observedLabviewMarkup = renderOptionalYesNoLine(
    'Observed LabVIEW.exe',
    options.runtimeLabviewProcessObserved
  );
  const observedLabviewCliMarkup = renderOptionalYesNoLine(
    'Observed LabVIEWCLI.exe',
    options.runtimeLabviewCliProcessObserved
  );
  const observedLvcompareMarkup = renderOptionalYesNoLine(
    'Observed LVCompare.exe',
    options.runtimeLvcompareProcessObserved
  );
  const exitProcessObservationCapturedAtMarkup = options.runtimeExitProcessObservationCapturedAt
    ? `<div><strong>Exit process observation captured at:</strong> ${escapeHtml(
        options.runtimeExitProcessObservationCapturedAt
      )}</div>`
    : '';
  const exitProcessObservationTriggerMarkup = options.runtimeExitProcessObservationTrigger
    ? `<div><strong>Exit process observation trigger:</strong> ${escapeHtml(
        options.runtimeExitProcessObservationTrigger
      )}</div>`
    : '';
  const exitObservedProcessNamesMarkup =
    options.runtimeExitObservedProcessNames && options.runtimeExitObservedProcessNames.length > 0
      ? `<div><strong>Exit observed process names:</strong> ${escapeHtml(
          options.runtimeExitObservedProcessNames.join(' | ')
        )}</div>`
      : '';
  const observedLabviewAtExitMarkup = renderOptionalYesNoLine(
    'Observed LabVIEW.exe at exit',
    options.runtimeLabviewProcessObservedAtExit
  );
  const observedLabviewCliAtExitMarkup = renderOptionalYesNoLine(
    'Observed LabVIEWCLI.exe at exit',
    options.runtimeLabviewCliProcessObservedAtExit
  );
  const observedLvcompareAtExitMarkup = renderOptionalYesNoLine(
    'Observed LVCompare.exe at exit',
    options.runtimeLvcompareProcessObservedAtExit
  );

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${escapeHtml(options.cspSource)} https:; style-src 'unsafe-inline';" />
    <title>${safeTitle}</title>
    <style>
      body { font-family: var(--vscode-font-family); margin: 0; padding: 16px; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
      .status { margin-bottom: 12px; }
      iframe { width: 100%; height: 80vh; border: 1px solid var(--vscode-panel-border); background: white; }
    </style>
  </head>
  <body>
    <div class="status" data-testid="comparison-report-panel-status">
      <strong>Status:</strong> ${escapeHtml(options.reportStatus)}
      <br />
      <strong>Runtime execution:</strong> ${escapeHtml(options.runtimeExecutionState)}
      <br />
      <strong>Generated report exists:</strong> ${options.generatedReportExists ? 'yes' : 'no'}
      ${blockedReasonMarkup}
      ${failureReasonMarkup}
      ${diagnosticReasonMarkup}
      ${diagnosticLogSourceMarkup}
      ${runtimeDoctorMarkup}
      ${diagnosticNotesMarkup}
      ${runtimeExecutableMarkup}
      ${runtimeArgsMarkup}
      ${processObservationMarkup}
      ${processObservationCapturedAtMarkup}
      ${processObservationTriggerMarkup}
      ${observedProcessNamesMarkup}
      ${observedLabviewMarkup}
      ${observedLabviewCliMarkup}
      ${observedLvcompareMarkup}
      ${exitProcessObservationCapturedAtMarkup}
      ${exitProcessObservationTriggerMarkup}
      ${exitObservedProcessNamesMarkup}
      ${observedLabviewAtExitMarkup}
      ${observedLabviewCliAtExitMarkup}
      ${observedLvcompareAtExitMarkup}
    </div>
    <iframe data-testid="comparison-report-panel-frame" src="${safeUri}" title="${safeTitle}"></iframe>
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

function renderOptionalYesNoLine(label: string, value: boolean | undefined): string {
  if (value === undefined) {
    return '';
  }

  return `<div><strong>${escapeHtml(label)}:</strong> ${value ? 'yes' : 'no'}</div>`;
}

export function readComparisonRuntimeSettings(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'> = vscode.workspace.getConfiguration(
    'viHistorySuite'
  )
): ComparisonRuntimeSettings {
  return {
    labviewCliPath: configuration.get<string>('labviewCliPath', ''),
    lvComparePath: configuration.get<string>('lvComparePath', ''),
    labviewExePath: configuration.get<string>('labviewExePath', ''),
    preferBitness: configuration.get<'auto' | 'x86' | 'x64'>('preferBitness', 'auto'),
    windowsContainerImage: configuration.get<string>(
      'windowsContainerImage',
      'nationalinstruments/labview:2026q1-windows'
    )
  };
}

export function resolveRuntimePlatform(platform: NodeJS.Platform): RuntimePlatform {
  if (platform === 'win32' || platform === 'linux' || platform === 'darwin') {
    return platform;
  }

  return 'linux';
}
