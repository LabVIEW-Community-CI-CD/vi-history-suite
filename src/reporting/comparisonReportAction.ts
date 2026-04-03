import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  archiveComparisonReportSource,
  ArchivedComparisonReportSourceRecord,
  buildComparisonReportArchivePlanFromSelection
} from '../dashboard/comparisonReportArchive';
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
  cancellationToken?: vscode.CancellationToken;
}

export interface ComparisonReportActionResult {
  outcome:
    | 'opened-comparison-report'
    | 'retained-comparison-report-evidence'
    | 'missing-retained-comparison-report'
    | 'cancelled'
    | 'workspace-untrusted'
    | 'missing-storage-uri'
    | 'missing-selected-commit'
    | 'missing-previous-hash';
  cancellationStage?: string;
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
  readFile?: typeof fs.readFile;
  pathExists?: (targetPath: string) => Promise<boolean>;
  getRuntimeSettings?: () => ComparisonRuntimeSettings;
  archiveComparisonReportSource?: typeof archiveComparisonReportSource;
}

export function createComparisonReportAction(
  context: vscode.ExtensionContext,
  deps: ComparisonReportActionDeps = {}
): (request: ComparisonReportActionRequest) => Promise<ComparisonReportActionResult> {
  return async (request: ComparisonReportActionRequest): Promise<ComparisonReportActionResult> => {
    const ensured = await ensureComparisonReportEvidence(context, request, deps);
    if (!('packet' in ensured)) {
      return ensured;
    }

    await request.reportProgress?.({
      message: 'Opening retained comparison-report view.',
      increment: 5
    });
    if (request.cancellationToken?.isCancellationRequested) {
      return buildCancelledComparisonReportResult('before-comparison-report-open', ensured.packet);
    }

    return openPersistedComparisonReportPanel(
      {
        context,
        record: ensured.packet.record,
        packetFilePath: ensured.packet.packetFilePath,
        reportFilePath: ensured.packet.reportFilePath,
        metadataFilePath: ensured.packet.metadataFilePath,
        localResourceSegment: 'reports'
      },
      deps
    );
  };
}

export function createEnsureComparisonReportEvidenceAction(
  context: vscode.ExtensionContext,
  deps: ComparisonReportActionDeps = {}
): (request: ComparisonReportActionRequest) => Promise<ComparisonReportActionResult> {
  return async (request: ComparisonReportActionRequest): Promise<ComparisonReportActionResult> => {
    const ensured = await ensureComparisonReportEvidence(context, request, deps);
    return 'packet' in ensured ? ensured.result : ensured;
  };
}

export function createOpenRetainedComparisonReportAction(
  context: vscode.ExtensionContext,
  deps: ComparisonReportActionDeps = {}
): (request: ComparisonReportActionRequest) => Promise<ComparisonReportActionResult> {
  return async (request: ComparisonReportActionRequest): Promise<ComparisonReportActionResult> => {
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-retained-comparison-resolution'
      };
    }

    if (!vscode.workspace.isTrusted) {
      return { outcome: 'workspace-untrusted' };
    }

    if (!context.storageUri) {
      return { outcome: 'missing-storage-uri' };
    }

    const selectedCommit = request.model.commits.find((commit) => commit.hash === request.selectedHash);
    if (!selectedCommit) {
      return { outcome: 'missing-selected-commit' };
    }

    if (!selectedCommit.previousHash) {
      return { outcome: 'missing-previous-hash' };
    }

    await request.reportProgress?.({
      message: 'Resolving retained pair comparison evidence.',
      increment: 40
    });
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-retained-comparison-open'
      };
    }

    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: context.storageUri.fsPath,
      repositoryRoot: request.model.repositoryRoot,
      relativePath: request.model.relativePath,
      reportType: 'diff',
      selectedHash: selectedCommit.hash,
      baseHash: selectedCommit.previousHash
    });
    const pathExists = deps.pathExists ?? defaultPathExists;
    if (!(await pathExists(archivePlan.sourceRecordFilePath))) {
      return {
        outcome: 'missing-retained-comparison-report'
      };
    }

    await request.reportProgress?.({
      message: 'Opening retained pair comparison view.',
      increment: 60
    });
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-retained-comparison-open'
      };
    }
    const sourceRecord = JSON.parse(
      await (deps.readFile ?? fs.readFile)(archivePlan.sourceRecordFilePath, 'utf8')
    ) as ArchivedComparisonReportSourceRecord;
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-retained-comparison-open'
      };
    }

    return openPersistedComparisonReportPanel(
      {
        context,
        record: sourceRecord.packetRecord,
        packetFilePath: sourceRecord.archivePlan.packetFilePath,
        reportFilePath: sourceRecord.archivePlan.reportFilePath,
        metadataFilePath: sourceRecord.archivePlan.metadataFilePath,
        localResourceSegment: 'report-history'
      },
      deps
    );
  };
}

async function ensureComparisonReportEvidence(
  context: vscode.ExtensionContext,
  request: ComparisonReportActionRequest,
  deps: ComparisonReportActionDeps
): Promise<
  | ComparisonReportActionResult
  | {
      packet: Awaited<ReturnType<typeof persistComparisonReportPacket>>;
      result: ComparisonReportActionResult;
    }
> {
  if (request.cancellationToken?.isCancellationRequested) {
    return {
      outcome: 'cancelled',
      cancellationStage: 'before-revision-pair-resolution'
    };
  }

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

  if (request.cancellationToken?.isCancellationRequested) {
    return {
      outcome: 'cancelled',
      cancellationStage: 'before-preflight'
    };
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
  if (request.cancellationToken?.isCancellationRequested) {
    return {
      outcome: 'cancelled',
      cancellationStage: 'after-preflight'
    };
  }

  await request.reportProgress?.({
    message: 'Selecting comparison-report runtime.',
    increment: 20
  });
  const runtimeSelection = await (deps.locateRuntime ?? locateComparisonRuntime)(
    resolveRuntimePlatform(process.platform),
    (deps.getRuntimeSettings ?? readComparisonRuntimeSettings)()
  );
  if (request.cancellationToken?.isCancellationRequested) {
    return {
      outcome: 'cancelled',
      cancellationStage: 'after-runtime-selection'
    };
  }

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
  if (request.cancellationToken?.isCancellationRequested) {
    return buildCancelledComparisonReportResult('after-packet-persist', packet);
  }

  if (packet.record.reportStatus === 'ready-for-runtime') {
    await request.reportProgress?.({
      message: 'Executing NI comparison-report runtime.',
      increment: 20
    });
    packet = await (deps.executeComparisonReport ?? executeComparisonReport)({
      record: packet.record,
      repositoryRoot: request.model.repositoryRoot
    });
    if (request.cancellationToken?.isCancellationRequested) {
      return buildCancelledComparisonReportResult('after-runtime-execution', packet);
    }
  }
  if (canArchiveComparisonReport(packet.record)) {
    await request.reportProgress?.({
      message: 'Archiving comparison-report evidence.',
      increment: 5
    });
    await (deps.archiveComparisonReportSource ?? archiveComparisonReportSource)(packet.record);
    if (request.cancellationToken?.isCancellationRequested) {
      return buildCancelledComparisonReportResult('after-archive', packet);
    }
  }

  return {
    packet,
    result: buildRetainedComparisonReportEvidenceResult(packet)
  };
}

function buildCancelledComparisonReportResult(
  cancellationStage: string,
  packet: Awaited<ReturnType<typeof persistComparisonReportPacket>> | Awaited<ReturnType<typeof executeComparisonReport>>
): ComparisonReportActionResult {
  return {
    outcome: 'cancelled',
    cancellationStage,
    reportStatus: packet.record.reportStatus,
    runtimeExecutionState: packet.record.runtimeExecutionState,
    blockedReason: deriveComparisonBlockedReason(packet.record),
    runtimeFailureReason: packet.record.runtimeExecution.failureReason,
    packetFilePath: packet.packetFilePath,
    reportFilePath: packet.reportFilePath,
    metadataFilePath: packet.metadataFilePath,
    generatedReportExists: packet.record.runtimeExecution.reportExists
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

function deriveComparisonBlockedReason(
  record: Awaited<ReturnType<typeof persistComparisonReportPacket>>['record']
): string | undefined {
  return record.reportStatus === 'blocked-runtime'
    ? record.runtimeSelection?.blockedReason
    : record.reportStatus === 'blocked-preflight'
      ? record.preflight?.blockedReason
      : undefined;
}

function buildRetainedComparisonReportEvidenceResult(
  packet: Awaited<ReturnType<typeof persistComparisonReportPacket>> | Awaited<ReturnType<typeof executeComparisonReport>>
): ComparisonReportActionResult {
  return {
    outcome: 'retained-comparison-report-evidence',
    reportStatus: packet.record.reportStatus,
    runtimeExecutionState: packet.record.runtimeExecutionState,
    blockedReason: deriveComparisonBlockedReason(packet.record),
    runtimeFailureReason: packet.record.runtimeExecution.failureReason,
    runtimeDiagnosticReason: packet.record.runtimeExecution.diagnosticReason,
    runtimeDiagnosticNotes: packet.record.runtimeExecution.diagnosticNotes,
    runtimeDiagnosticLogSourcePath: packet.record.runtimeExecution.diagnosticLogSourcePath,
    runtimeDiagnosticLogArtifactPath: packet.record.runtimeExecution.diagnosticLogArtifactPath,
    runtimeDoctorSummaryLines: packet.record.runtimeExecution.doctorSummaryLines,
    runtimeExecutable: packet.record.runtimeExecution.executable,
    runtimeArgs: packet.record.runtimeExecution.args,
    runtimeProcessObservationArtifactPath:
      packet.record.runtimeExecution.processObservationArtifactPath,
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
    packetFilePath: packet.packetFilePath,
    reportFilePath: packet.reportFilePath,
    metadataFilePath: packet.metadataFilePath,
    generatedReportExists: packet.record.runtimeExecution.reportExists,
    title: packet.record.reportTitle
  };
}

async function openPersistedComparisonReportPanel(
  options: {
    context: vscode.ExtensionContext;
    record: Awaited<ReturnType<typeof persistComparisonReportPacket>>['record'];
    packetFilePath: string;
    reportFilePath: string;
    metadataFilePath: string;
    localResourceSegment: 'reports' | 'report-history';
  },
  deps: ComparisonReportActionDeps
): Promise<ComparisonReportActionResult> {
  const createWebviewPanel = deps.createWebviewPanel ?? vscode.window.createWebviewPanel;
  const uriFile = deps.uriFile ?? vscode.Uri.file;
  const joinPath = deps.joinPath ?? vscode.Uri.joinPath;
  const repoRootUri = joinPath(
    options.context.storageUri!,
    options.localResourceSegment,
    options.record.artifactPlan.repoId
  );
  const packetFileUri = uriFile(options.packetFilePath);
  const reportFileUri = uriFile(options.reportFilePath);
  const panel = createWebviewPanel(
    'viHistorySuite.comparisonReport',
    options.record.reportTitle,
    vscode.ViewColumn.Active,
    {
      enableScripts: false,
      localResourceRoots: [options.context.storageUri!, repoRootUri]
    }
  );
  const renderedContentUri = panel.webview.asWebviewUri(
    options.record.runtimeExecution.reportExists ? reportFileUri : packetFileUri
  );
  const panelHtmlOptions = {
    title: options.record.reportTitle,
    reportWebviewUri: renderedContentUri.toString(),
    reportStatus: options.record.reportStatus,
    runtimeExecutionState: options.record.runtimeExecutionState,
    blockedReason:
      options.record.reportStatus === 'blocked-runtime'
        ? options.record.runtimeSelection?.blockedReason
        : options.record.reportStatus === 'blocked-preflight'
          ? options.record.preflight?.blockedReason
          : undefined,
    runtimeFailureReason: options.record.runtimeExecution.failureReason,
    runtimeDiagnosticReason: options.record.runtimeExecution.diagnosticReason,
    runtimeDiagnosticNotes: options.record.runtimeExecution.diagnosticNotes,
    runtimeDiagnosticLogSourcePath: options.record.runtimeExecution.diagnosticLogSourcePath,
    runtimeDoctorSummaryLines: options.record.runtimeExecution.doctorSummaryLines,
    runtimeProcessObservationArtifactPath:
      options.record.runtimeExecution.processObservationArtifactPath,
    runtimeExecutable: options.record.runtimeExecution.executable,
    runtimeArgs: options.record.runtimeExecution.args,
    runtimeProcessObservationCapturedAt:
      options.record.runtimeExecution.processObservationCapturedAt,
    runtimeProcessObservationTrigger: options.record.runtimeExecution.processObservationTrigger,
    runtimeObservedProcessNames: options.record.runtimeExecution.observedProcessNames,
    runtimeLabviewProcessObserved: options.record.runtimeExecution.labviewProcessObserved,
    runtimeLabviewCliProcessObserved: options.record.runtimeExecution.labviewCliProcessObserved,
    runtimeLvcompareProcessObserved: options.record.runtimeExecution.lvcompareProcessObserved,
    runtimeExitProcessObservationCapturedAt:
      options.record.runtimeExecution.exitProcessObservationCapturedAt,
    runtimeExitProcessObservationTrigger:
      options.record.runtimeExecution.exitProcessObservationTrigger,
    runtimeExitObservedProcessNames: options.record.runtimeExecution.exitObservedProcessNames,
    runtimeLabviewProcessObservedAtExit:
      options.record.runtimeExecution.labviewProcessObservedAtExit,
    runtimeLabviewCliProcessObservedAtExit:
      options.record.runtimeExecution.labviewCliProcessObservedAtExit,
    runtimeLvcompareProcessObservedAtExit:
      options.record.runtimeExecution.lvcompareProcessObservedAtExit,
    generatedReportExists: options.record.runtimeExecution.reportExists,
    cspSource: panel.webview.cspSource
  } as const;
  panel.webview.html = options.record.runtimeExecution.reportExists
    ? await renderGeneratedComparisonReportPanelHtml({
        ...panelHtmlOptions,
        reportFilePath: options.reportFilePath,
        reportDirectoryWebviewUri: ensureTrailingSlash(
          panel.webview.asWebviewUri(uriFile(path.dirname(options.reportFilePath))).toString()
        ),
        readFile: deps.readFile ?? fs.readFile
      })
    : await renderPersistedComparisonReportPacketPanelHtml({
        ...panelHtmlOptions,
        packetFilePath: options.packetFilePath,
        packetDirectoryWebviewUri: ensureTrailingSlash(
          panel.webview.asWebviewUri(uriFile(path.dirname(options.packetFilePath))).toString()
        ),
        readFile: deps.readFile ?? fs.readFile
      });

  const result: ComparisonReportActionResult = {
    outcome: 'opened-comparison-report',
    reportStatus: options.record.reportStatus,
    runtimeExecutionState: options.record.runtimeExecutionState,
    blockedReason:
      options.record.reportStatus === 'blocked-runtime'
        ? options.record.runtimeSelection?.blockedReason
        : options.record.reportStatus === 'blocked-preflight'
          ? options.record.preflight?.blockedReason
          : undefined,
    runtimeFailureReason: options.record.runtimeExecution.failureReason,
    packetFilePath: options.packetFilePath,
    reportFilePath: options.reportFilePath,
    metadataFilePath: options.metadataFilePath,
    reportWebviewUri: renderedContentUri.toString(),
    generatedReportExists: options.record.runtimeExecution.reportExists,
    title: panel.title
  };

  if (options.record.runtimeExecution.diagnosticReason) {
    result.runtimeDiagnosticReason = options.record.runtimeExecution.diagnosticReason;
  }
  if (options.record.runtimeExecution.diagnosticNotes?.length) {
    result.runtimeDiagnosticNotes = options.record.runtimeExecution.diagnosticNotes;
  }
  if (options.record.runtimeExecution.diagnosticLogSourcePath) {
    result.runtimeDiagnosticLogSourcePath =
      options.record.runtimeExecution.diagnosticLogSourcePath;
  }
  if (options.record.runtimeExecution.diagnosticLogArtifactPath) {
    result.runtimeDiagnosticLogArtifactPath =
      options.record.runtimeExecution.diagnosticLogArtifactPath;
  }
  if (options.record.runtimeExecution.doctorSummaryLines?.length) {
    result.runtimeDoctorSummaryLines =
      options.record.runtimeExecution.doctorSummaryLines;
  }
  if (options.record.runtimeExecution.executable) {
    result.runtimeExecutable = options.record.runtimeExecution.executable;
  }
  if (options.record.runtimeExecution.args?.length) {
    result.runtimeArgs = options.record.runtimeExecution.args;
  }
  if (options.record.runtimeExecution.processObservationArtifactPath) {
    result.runtimeProcessObservationArtifactPath =
      options.record.runtimeExecution.processObservationArtifactPath;
  }
  if (options.record.runtimeExecution.processObservationCapturedAt) {
    result.runtimeProcessObservationCapturedAt =
      options.record.runtimeExecution.processObservationCapturedAt;
  }
  if (options.record.runtimeExecution.processObservationTrigger) {
    result.runtimeProcessObservationTrigger =
      options.record.runtimeExecution.processObservationTrigger;
  }
  if (options.record.runtimeExecution.observedProcessNames !== undefined) {
    result.runtimeObservedProcessNames = options.record.runtimeExecution.observedProcessNames;
  }
  if (options.record.runtimeExecution.labviewProcessObserved !== undefined) {
    result.runtimeLabviewProcessObserved = options.record.runtimeExecution.labviewProcessObserved;
  }
  if (options.record.runtimeExecution.labviewCliProcessObserved !== undefined) {
    result.runtimeLabviewCliProcessObserved =
      options.record.runtimeExecution.labviewCliProcessObserved;
  }
  if (options.record.runtimeExecution.lvcompareProcessObserved !== undefined) {
    result.runtimeLvcompareProcessObserved = options.record.runtimeExecution.lvcompareProcessObserved;
  }
  if (options.record.runtimeExecution.exitProcessObservationCapturedAt) {
    result.runtimeExitProcessObservationCapturedAt =
      options.record.runtimeExecution.exitProcessObservationCapturedAt;
  }
  if (options.record.runtimeExecution.exitProcessObservationTrigger) {
    result.runtimeExitProcessObservationTrigger =
      options.record.runtimeExecution.exitProcessObservationTrigger;
  }
  if (options.record.runtimeExecution.exitObservedProcessNames !== undefined) {
    result.runtimeExitObservedProcessNames =
      options.record.runtimeExecution.exitObservedProcessNames;
  }
  if (options.record.runtimeExecution.labviewProcessObservedAtExit !== undefined) {
    result.runtimeLabviewProcessObservedAtExit =
      options.record.runtimeExecution.labviewProcessObservedAtExit;
  }
  if (options.record.runtimeExecution.labviewCliProcessObservedAtExit !== undefined) {
    result.runtimeLabviewCliProcessObservedAtExit =
      options.record.runtimeExecution.labviewCliProcessObservedAtExit;
  }
  if (options.record.runtimeExecution.lvcompareProcessObservedAtExit !== undefined) {
    result.runtimeLvcompareProcessObservedAtExit =
      options.record.runtimeExecution.lvcompareProcessObservedAtExit;
  }

  return result;
}

async function defaultPathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
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
  const statusMarkup = renderComparisonReportPanelStatusMarkup(options);

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
    ${statusMarkup}
    <iframe data-testid="comparison-report-panel-frame" src="${safeUri}" title="${safeTitle}"></iframe>
  </body>
</html>`;
}

async function renderGeneratedComparisonReportPanelHtml(options: {
  title: string;
  reportFilePath: string;
  reportDirectoryWebviewUri: string;
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
  readFile: typeof fs.readFile;
}): Promise<string> {
  const originalReportHtml = await options.readFile(options.reportFilePath, 'utf8');
  const csp = [
    "default-src 'none'",
    `img-src ${options.cspSource} https: data:`,
    `style-src ${options.cspSource} 'unsafe-inline'`,
    `font-src ${options.cspSource} https: data:`
  ].join('; ');
  const headInjection = `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(
    csp
  )}" /><base href="${escapeHtml(options.reportDirectoryWebviewUri)}" /><style>
      body { margin: 0; background: white; }
      .vihs-runtime-status { font-family: var(--vscode-font-family); margin: 0; padding: 16px; background: var(--vscode-editor-background); color: var(--vscode-foreground); border-bottom: 1px solid var(--vscode-panel-border); }
      .vihs-runtime-status ul { margin: 4px 0 0 18px; }
    </style>`;
  const withHead = /<head\b[^>]*>/i.test(originalReportHtml)
    ? originalReportHtml.replace(/<head\b[^>]*>/i, (match) => `${match}${headInjection}`)
    : `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
        options.title
      )}</title></head><body>${originalReportHtml}</body></html>`;
  const statusMarkup = renderComparisonReportPanelStatusMarkup(options).replace(
    'class="status"',
    'class="status vihs-runtime-status"'
  );

  if (/<body\b[^>]*>/i.test(withHead)) {
    return withHead.replace(/<body\b([^>]*)>/i, `<body$1>${statusMarkup}`);
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
    options.title
  )}</title></head><body>${statusMarkup}${withHead}</body></html>`;
}

async function renderPersistedComparisonReportPacketPanelHtml(options: {
  title: string;
  packetFilePath: string;
  packetDirectoryWebviewUri: string;
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
  readFile: typeof fs.readFile;
}): Promise<string> {
  try {
    const originalPacketHtml = await options.readFile(options.packetFilePath, 'utf8');
    const csp = [
      "default-src 'none'",
      `frame-src ${options.cspSource} https:`,
      `img-src ${options.cspSource} https: data:`,
      `style-src ${options.cspSource} 'unsafe-inline'`,
      `font-src ${options.cspSource} https: data:`
    ].join('; ');
    const headInjection = `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(
      csp
    )}" /><base href="${escapeHtml(options.packetDirectoryWebviewUri)}" />`;

    if (/<head\b[^>]*>/i.test(originalPacketHtml)) {
      return originalPacketHtml.replace(/<head\b[^>]*>/i, (match) => `${match}${headInjection}`);
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
      options.title
    )}</title></head><body>${originalPacketHtml}</body></html>`;
  } catch {
    return renderComparisonReportPanelHtml(options);
  }
}

function renderComparisonReportPanelStatusMarkup(options: {
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
}): string {
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
    options.runtimeObservedProcessNames !== undefined
      ? `<div><strong>Observed process names:</strong> ${escapeHtml(
          options.runtimeObservedProcessNames.length > 0
            ? options.runtimeObservedProcessNames.join(' | ')
            : 'none'
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
    options.runtimeExitObservedProcessNames !== undefined
      ? `<div><strong>Exit observed process names:</strong> ${escapeHtml(
          options.runtimeExitObservedProcessNames.length > 0
            ? options.runtimeExitObservedProcessNames.join(' | ')
            : 'none'
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

  return `<div class="status" data-testid="comparison-report-panel-status">
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
    </div>`;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
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
