import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  archiveComparisonReportSource,
  ArchivedComparisonReportSourceRecord,
  buildComparisonReportArchivePlanFromSelection,
  ComparisonReportArchivePlan
} from '../dashboard/comparisonReportArchive';
import {
  acquireWindowsContainerImage,
  ComparisonRuntimeSettings,
  locateComparisonRuntime,
  RuntimePlatform
} from './comparisonRuntimeLocator';
import { ViHistoryViewModel } from '../services/viHistoryModel';
import {
  ComparisonReportRevisionMetadata,
  persistComparisonReportPacket
} from './comparisonReportPacket';
import { executeComparisonReport } from './comparisonReportRuntimeExecution';
import { preflightComparisonReportRevisions } from './comparisonReportPreflight';

export interface ComparisonReportActionRequest {
  model: ViHistoryViewModel;
  selectedHash: string;
  baseHash?: string;
  headlessRequested?: boolean;
  reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
  cancellationToken?: vscode.CancellationToken;
}

export interface ComparisonReportActionResult {
  outcome:
    | 'opened-comparison-report'
    | 'retained-comparison-report-evidence'
    | 'missing-retained-comparison-report'
    | 'invalid-retained-comparison-report'
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
  retainedArchiveAvailable?: boolean;
  archiveFailureReason?: 'retained-archive-unavailable' | 'retained-archive-write-failed';
  displayedEvidenceKind?: 'generated-report' | 'packet';
  title?: string;
}

export interface ComparisonReportActionDeps {
  preflightComparisonReport?: typeof preflightComparisonReportRevisions;
  persistComparisonReport?: typeof persistComparisonReportPacket;
  createWebviewPanel?: typeof vscode.window.createWebviewPanel;
  uriFile?: typeof vscode.Uri.file;
  joinPath?: typeof vscode.Uri.joinPath;
  locateRuntime?: typeof locateComparisonRuntime;
  acquireWindowsContainerImage?: typeof acquireWindowsContainerImage;
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
        localResourceSegment: 'reports',
        retainedArchiveAvailable: ensured.result.retainedArchiveAvailable ?? false,
        archiveFailureReason: ensured.result.archiveFailureReason
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

    const baseHash = request.baseHash ?? selectedCommit.previousHash;
    if (!baseHash) {
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
      baseHash
    });
    const pathExists = deps.pathExists ?? defaultPathExists;
    if (!(await pathExists(archivePlan.sourceRecordFilePath))) {
      return {
        outcome: 'missing-retained-comparison-report'
      };
    }

    const sourceRecord = await readValidatedArchivedComparisonReportSourceRecord({
      storageRoot: context.storageUri.fsPath,
      expectedArchivePlan: archivePlan,
      selectedHash: selectedCommit.hash,
      baseHash,
      pathExists,
      readFile: deps.readFile ?? fs.readFile
    });
    if (!sourceRecord) {
      return {
        outcome: 'invalid-retained-comparison-report'
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

    return openPersistedComparisonReportPanel(
      {
        context,
        record: sourceRecord.packetRecord,
        packetFilePath: sourceRecord.archivePlan.packetFilePath,
        reportFilePath: sourceRecord.archivePlan.reportFilePath,
        metadataFilePath: sourceRecord.archivePlan.metadataFilePath,
        localResourceSegment: 'report-history',
        retainedArchiveAvailable: true
      },
      deps
    );
  };
}

async function readValidatedArchivedComparisonReportSourceRecord(options: {
  storageRoot: string;
  expectedArchivePlan: ReturnType<typeof buildComparisonReportArchivePlanFromSelection>;
  selectedHash: string;
  baseHash: string;
  pathExists: (targetPath: string) => Promise<boolean>;
  readFile: typeof fs.readFile;
}): Promise<ArchivedComparisonReportSourceRecord | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      await options.readFile(options.expectedArchivePlan.sourceRecordFilePath, 'utf8')
    );
  } catch {
    return undefined;
  }

  if (
    !isValidArchivedComparisonReportSourceRecord(
      parsed,
      options.storageRoot,
      options.expectedArchivePlan,
      options.selectedHash,
      options.baseHash
    )
  ) {
    return undefined;
  }

  if (!(await options.pathExists(parsed.archivePlan.packetFilePath))) {
    return undefined;
  }

  return parsed;
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

  const baseHash = request.baseHash ?? selectedCommit.previousHash;
  if (!baseHash) {
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
    leftRevisionId: baseHash,
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
  let runtimeSelection = await (deps.locateRuntime ?? locateComparisonRuntime)(
    resolveRuntimePlatform(process.platform),
    (deps.getRuntimeSettings ?? readComparisonRuntimeSettings)()
  );
  if (request.cancellationToken?.isCancellationRequested) {
    return {
      outcome: 'cancelled',
      cancellationStage: 'after-runtime-selection'
    };
  }

  const containerImage = runtimeSelection.containerImage ?? runtimeSelection.windowsContainerImage;
  if (
    runtimeSelection.provider !== 'host-native' &&
    runtimeSelection.provider !== 'unavailable' &&
    (runtimeSelection.containerAcquisitionState ?? runtimeSelection.windowsContainerAcquisitionState) ===
      'required' &&
    containerImage
  ) {
    await request.reportProgress?.({
      message: `Acquiring governed container image ${containerImage}.`,
      increment: 10
    });

    const acquisition = await (
      deps.acquireWindowsContainerImage ?? acquireWindowsContainerImage
    )(containerImage, process.platform, {
      reportProgress: request.reportProgress
    });

    runtimeSelection = applyWindowsContainerAcquisitionResult(runtimeSelection, acquisition);
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'after-runtime-acquisition'
      };
    }
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
    baseHash,
    selectedRevision: {
      hash: selectedCommit.hash,
      authorDate: selectedCommit.authorDate,
      authorName: selectedCommit.authorName,
      subject: selectedCommit.subject
    },
    baseRevision: toRevisionMetadata(
      request.model.commits.find((commit) => commit.hash === baseHash),
      baseHash
    ),
    preflight,
    runtimeSelection: {
      ...runtimeSelection,
      headlessRequested: request.headlessRequested || runtimeSelection.headlessRequested
    }
  });
  if (request.cancellationToken?.isCancellationRequested) {
    return buildCancelledComparisonReportResult('after-packet-persist', packet);
  }

  if (packet.record.reportStatus === 'ready-for-runtime') {
    await request.reportProgress?.({
      message: 'Executing LabVIEW comparison-report runtime.',
      increment: 20
    });
    packet = await (deps.executeComparisonReport ?? executeComparisonReport)({
      record: packet.record,
      repositoryRoot: request.model.repositoryRoot,
      cancellationToken: request.cancellationToken
    });
    if (request.cancellationToken?.isCancellationRequested) {
      return buildCancelledComparisonReportResult('after-runtime-execution', packet);
    }
  }
  let retainedArchiveAvailable = false;
  let archiveFailureReason:
    | ComparisonReportActionResult['archiveFailureReason']
    | undefined;
  if (canArchiveComparisonReport(packet.record)) {
    await request.reportProgress?.({
      message: 'Archiving comparison-report evidence.',
      increment: 5
    });
    try {
      await (deps.archiveComparisonReportSource ?? archiveComparisonReportSource)(packet.record);
      retainedArchiveAvailable = true;
    } catch {
      archiveFailureReason = 'retained-archive-write-failed';
    }
    if (request.cancellationToken?.isCancellationRequested) {
      return buildCancelledComparisonReportResult('after-archive', packet, {
        retainedArchiveAvailable,
        archiveFailureReason
      });
    }
  } else {
    archiveFailureReason = 'retained-archive-unavailable';
  }

  return {
    packet,
    result: buildRetainedComparisonReportEvidenceResult(packet, {
      retainedArchiveAvailable,
      archiveFailureReason
    })
  };
}

function applyWindowsContainerAcquisitionResult(
  runtimeSelection: Awaited<ReturnType<typeof locateComparisonRuntime>>,
  acquisition: Awaited<ReturnType<typeof acquireWindowsContainerImage>>
): Awaited<ReturnType<typeof locateComparisonRuntime>> {
  if (acquisition.acquisitionState === 'acquired') {
    return {
      ...runtimeSelection,
      containerImage: acquisition.image,
      containerImageAvailable: true,
      containerAcquisitionState: 'acquired',
      windowsContainerImage: acquisition.image,
      windowsContainerImageAvailable: true,
      windowsContainerAcquisitionState: 'acquired',
      notes: [
        ...runtimeSelection.notes,
        `Governed container image ${acquisition.image} was acquired before container launch.`,
        ...acquisition.notes
      ]
    };
  }

  return {
    ...runtimeSelection,
    blockedReason: 'container-image-acquisition-failed',
    containerImage: acquisition.image,
    containerImageAvailable: false,
    containerAcquisitionState: 'failed',
    windowsContainerImage: acquisition.image,
    windowsContainerImageAvailable: false,
    windowsContainerAcquisitionState: 'failed',
    notes: [
      ...runtimeSelection.notes,
      `Governed container image ${acquisition.image} could not be acquired before container launch.`,
      ...acquisition.notes
    ]
  };
}

function buildCancelledComparisonReportResult(
  cancellationStage: string,
  packet: Awaited<ReturnType<typeof persistComparisonReportPacket>> | Awaited<ReturnType<typeof executeComparisonReport>>,
  options: {
    retainedArchiveAvailable?: boolean;
    archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
  } = {}
): ComparisonReportActionResult {
  const result: ComparisonReportActionResult = {
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
  if (options.retainedArchiveAvailable !== undefined) {
    result.retainedArchiveAvailable = options.retainedArchiveAvailable;
  }
  if (options.archiveFailureReason) {
    result.archiveFailureReason = options.archiveFailureReason;
  }
  return result;
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
  packet: Awaited<ReturnType<typeof persistComparisonReportPacket>> | Awaited<ReturnType<typeof executeComparisonReport>>,
  options: {
    retainedArchiveAvailable?: boolean;
    archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
  } = {}
): ComparisonReportActionResult {
  const result: ComparisonReportActionResult = {
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
  if (options.retainedArchiveAvailable !== undefined) {
    result.retainedArchiveAvailable = options.retainedArchiveAvailable;
  }
  if (options.archiveFailureReason) {
    result.archiveFailureReason = options.archiveFailureReason;
  }
  return result;
}

async function openPersistedComparisonReportPanel(
  options: {
    context: vscode.ExtensionContext;
    record: Awaited<ReturnType<typeof persistComparisonReportPacket>>['record'];
    packetFilePath: string;
    reportFilePath: string;
    metadataFilePath: string;
    localResourceSegment: 'reports' | 'report-history';
    retainedArchiveAvailable: boolean;
    archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
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
  const packetWebviewUri = panel.webview.asWebviewUri(packetFileUri).toString();
  const reportWebviewUri = panel.webview.asWebviewUri(reportFileUri).toString();
  const panelHtmlOptions = {
    title: options.record.reportTitle,
    relativePath: options.record.artifactPlan.normalizedRelativePath,
    selectedHash: options.record.selectedHash,
    baseHash: options.record.baseHash,
    selectedRevision: options.record.selectedRevision,
    baseRevision: options.record.baseRevision,
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
    retainedArchiveAvailable: options.retainedArchiveAvailable,
    archiveFailureReason: options.archiveFailureReason,
    cspSource: panel.webview.cspSource
  } as const;
  const packetPanelHtmlOptions = {
    ...panelHtmlOptions,
    reportWebviewUri: packetWebviewUri,
    packetFilePath: options.packetFilePath,
    packetDirectoryWebviewUri: ensureTrailingSlash(
      panel.webview.asWebviewUri(uriFile(path.dirname(options.packetFilePath))).toString()
    ),
    readFile: deps.readFile ?? fs.readFile
  } as const;
  let displayedEvidenceKind: 'generated-report' | 'packet' =
    options.record.runtimeExecution.reportExists ? 'generated-report' : 'packet';
  if (options.record.runtimeExecution.reportExists) {
    try {
      panel.webview.html = await renderGeneratedComparisonReportPanelHtml({
        ...panelHtmlOptions,
        displayedEvidenceKind,
        reportFilePath: options.reportFilePath,
        reportDirectoryWebviewUri: ensureTrailingSlash(
          panel.webview.asWebviewUri(uriFile(path.dirname(options.reportFilePath))).toString()
        ),
        readFile: deps.readFile ?? fs.readFile
      });
    } catch {
      displayedEvidenceKind = 'packet';
      panel.webview.html = await renderPersistedComparisonReportPacketPanelHtml({
        ...packetPanelHtmlOptions,
        displayedEvidenceKind
      });
    }
  } else {
    panel.webview.html = await renderPersistedComparisonReportPacketPanelHtml({
      ...packetPanelHtmlOptions,
      displayedEvidenceKind
    });
  }

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
    reportWebviewUri:
      displayedEvidenceKind === 'generated-report' ? reportWebviewUri : packetWebviewUri,
    generatedReportExists: options.record.runtimeExecution.reportExists,
    displayedEvidenceKind,
    title: panel.title
  };
  if (options.retainedArchiveAvailable !== undefined) {
    result.retainedArchiveAvailable = options.retainedArchiveAvailable;
  }
  if (options.archiveFailureReason) {
    result.archiveFailureReason = options.archiveFailureReason;
  }

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
  relativePath?: string;
  selectedHash?: string;
  baseHash?: string;
  selectedRevision?: ComparisonReportRevisionMetadata;
  baseRevision?: ComparisonReportRevisionMetadata;
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
  retainedArchiveAvailable: boolean;
  archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
  displayedEvidenceKind: 'generated-report' | 'packet';
  cspSource: string;
}): string {
  const safeTitle = escapeHtml(options.title);
  const safeUri = escapeHtml(options.reportWebviewUri);
  const contextMarkup = renderComparisonReportPanelContextMarkup(options);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${escapeHtml(options.cspSource)} https:; style-src 'unsafe-inline';" />
    <title>${safeTitle}</title>
    <style>
      body { font-family: var(--vscode-font-family); margin: 0; padding: 16px; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
      .vihs-compare-context { margin-bottom: 12px; padding: 16px; border: 1px solid #d0d0d0; background: white; color: #111; }
      .vihs-compare-context-grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 12px 16px; margin-top: 12px; }
      .vihs-compare-context-card { border: 1px solid #d0d0d0; padding: 12px; background: #fafafa; }
      .vihs-compare-context-card div { margin-top: 6px; }
      .vihs-compare-context-muted { color: #555; }
      iframe { width: 100%; height: 80vh; border: 1px solid var(--vscode-panel-border); background: white; }
    </style>
  </head>
  <body>
    ${contextMarkup}
    <iframe data-testid="comparison-report-panel-frame" src="${safeUri}" title="${safeTitle}"></iframe>
  </body>
</html>`;
}

async function renderGeneratedComparisonReportPanelHtml(options: {
  title: string;
  relativePath?: string;
  selectedHash?: string;
  baseHash?: string;
  selectedRevision?: ComparisonReportRevisionMetadata;
  baseRevision?: ComparisonReportRevisionMetadata;
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
  retainedArchiveAvailable: boolean;
  archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
  displayedEvidenceKind: 'generated-report' | 'packet';
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
      .vihs-compare-context { font-family: var(--vscode-font-family); margin: 0; padding: 16px; background: white; color: #111; border-bottom: 1px solid #d0d0d0; }
      .vihs-compare-context-grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 12px 16px; margin-top: 12px; }
      .vihs-compare-context-card { border: 1px solid #d0d0d0; padding: 12px; background: #fafafa; }
      .vihs-compare-context-card div { margin-top: 6px; }
      .vihs-compare-context-muted { color: #555; }
    </style>`;
  const withHead = /<head\b[^>]*>/i.test(originalReportHtml)
    ? originalReportHtml.replace(/<head\b[^>]*>/i, (match) => `${match}${headInjection}`)
    : `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
        options.title
      )}</title></head><body>${originalReportHtml}</body></html>`;
  const contextMarkup = renderComparisonReportPanelContextMarkup(options);

  if (/<body\b[^>]*>/i.test(withHead)) {
    return withHead.replace(/<body\b([^>]*)>/i, `<body$1>${contextMarkup}`);
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
    options.title
  )}</title></head><body>${contextMarkup}${withHead}</body></html>`;
}

async function renderPersistedComparisonReportPacketPanelHtml(options: {
  title: string;
  relativePath?: string;
  selectedHash?: string;
  baseHash?: string;
  selectedRevision?: ComparisonReportRevisionMetadata;
  baseRevision?: ComparisonReportRevisionMetadata;
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
  retainedArchiveAvailable: boolean;
  archiveFailureReason?: ComparisonReportActionResult['archiveFailureReason'];
  displayedEvidenceKind: 'generated-report' | 'packet';
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
    )}" /><base href="${escapeHtml(options.packetDirectoryWebviewUri)}" /><style>
      body { margin: 0; background: white; }
      .vihs-compare-context { font-family: var(--vscode-font-family); margin: 0; padding: 16px; background: white; color: #111; border-bottom: 1px solid #d0d0d0; }
      .vihs-compare-context-grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 12px 16px; margin-top: 12px; }
      .vihs-compare-context-card { border: 1px solid #d0d0d0; padding: 12px; background: #fafafa; }
      .vihs-compare-context-card div { margin-top: 6px; }
      .vihs-compare-context-muted { color: #555; }
    </style>`;
    const withHead = /<head\b[^>]*>/i.test(originalPacketHtml)
      ? originalPacketHtml.replace(/<head\b[^>]*>/i, (match) => `${match}${headInjection}`)
      : `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
          options.title
        )}</title></head><body>${originalPacketHtml}</body></html>`;
    const contextMarkup = renderComparisonReportPanelContextMarkup(options);

    if (/<body\b[^>]*>/i.test(withHead)) {
      return withHead.replace(/<body\b([^>]*)>/i, `<body$1>${contextMarkup}`);
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
      options.title
    )}</title></head><body>${contextMarkup}${withHead}</body></html>`;
  } catch {
    return renderComparisonReportPanelHtml(options);
  }
}

function renderComparisonReportPanelContextMarkup(options: {
  relativePath?: string;
  selectedHash?: string;
  baseHash?: string;
  selectedRevision?: ComparisonReportRevisionMetadata;
  baseRevision?: ComparisonReportRevisionMetadata;
}): string {
  return `<div class="vihs-compare-context" data-testid="comparison-report-panel-context">
      <strong>Comparison context</strong>
      <div><strong>Relative path:</strong> ${renderPanelRevisionMetadataValue(options.relativePath)}</div>
      <div class="vihs-compare-context-grid">
        ${renderComparisonReportPanelRevisionCard(
          'Selected revision',
          options.selectedHash,
          options.selectedRevision,
          'comparison-report-panel-context-selected'
        )}
        ${renderComparisonReportPanelRevisionCard(
          'Base revision',
          options.baseHash,
          options.baseRevision,
          'comparison-report-panel-context-base'
        )}
      </div>
    </div>`;
}

function renderComparisonReportPanelRevisionCard(
  label: string,
  hash: string | undefined,
  revision: ComparisonReportRevisionMetadata | undefined,
  testId: string
): string {
  return `<div class="vihs-compare-context-card" data-testid="${testId}">
      <strong>${escapeHtml(label)}</strong>
      <div><code>${escapeHtml(revision?.hash ?? hash ?? 'not retained')}</code></div>
      <div><strong>Date:</strong> ${renderPanelRevisionMetadataValue(revision?.authorDate)}</div>
      <div><strong>Author:</strong> ${renderPanelRevisionMetadataValue(revision?.authorName)}</div>
      <div><strong>Subject:</strong> ${renderPanelRevisionMetadataValue(revision?.subject)}</div>
    </div>`;
}

function renderPanelRevisionMetadataValue(value: string | undefined): string {
  return value && value.length > 0
    ? escapeHtml(value)
    : '<span class="vihs-compare-context-muted">not retained</span>';
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

function toRevisionMetadata(
  commit: Pick<ViHistoryViewModel['commits'][number], 'hash' | 'authorDate' | 'authorName' | 'subject'> | undefined,
  fallbackHash: string
): ComparisonReportRevisionMetadata {
  if (!commit) {
    return {
      hash: fallbackHash
    };
  }

  return {
    hash: commit.hash,
    authorDate: commit.authorDate,
    authorName: commit.authorName,
    subject: commit.subject
  };
}

function isValidArchivedComparisonReportSourceRecord(
  value: unknown,
  _storageRoot: string,
  expectedArchivePlan: ComparisonReportArchivePlan,
  selectedHash: string,
  baseHash: string
): value is ArchivedComparisonReportSourceRecord {
  if (!isRecord(value) || !isRecord(value.archivePlan) || !isRecord(value.packetRecord)) {
    return false;
  }

  const archivePlan = value.archivePlan;
  const packetRecord = value.packetRecord;
  if (
    !matchesExpectedArchivePath(archivePlan.sourceRecordFilePath, expectedArchivePlan.sourceRecordFilePath) ||
    !matchesExpectedArchivePath(archivePlan.packetFilePath, expectedArchivePlan.packetFilePath) ||
    !matchesExpectedArchivePath(archivePlan.reportFilePath, expectedArchivePlan.reportFilePath) ||
    !matchesExpectedArchivePath(archivePlan.metadataFilePath, expectedArchivePlan.metadataFilePath)
  ) {
    return false;
  }

  if (packetRecord.selectedHash !== selectedHash || packetRecord.baseHash !== baseHash) {
    return false;
  }

  if (!isValidArchivedComparisonPacketRecord(packetRecord, expectedArchivePlan)) {
    return false;
  }

  return true;
}

function isValidArchivedComparisonPacketRecord(
  value: Record<string, any>,
  expectedArchivePlan: ComparisonReportArchivePlan
): boolean {
  if (
    typeof value.reportTitle !== 'string' ||
    value.reportTitle.length === 0 ||
    !isValidComparisonReportStatus(value.reportStatus) ||
    !isValidComparisonRuntimeExecutionState(value.runtimeExecutionState) ||
    !isRecord(value.runtimeExecution) ||
    !isValidComparisonRuntimeExecutionState(value.runtimeExecution.state) ||
    typeof value.runtimeExecution.reportExists !== 'boolean' ||
    !isRecord(value.artifactPlan)
  ) {
    return false;
  }

  const artifactPlan = value.artifactPlan;
  return (
    typeof artifactPlan.repoId === 'string' &&
    artifactPlan.repoId.length > 0 &&
    typeof artifactPlan.fileId === 'string' &&
    artifactPlan.fileId.length > 0 &&
    artifactPlan.repoId === expectedArchivePlan.repoId &&
    artifactPlan.fileId === expectedArchivePlan.fileId &&
    typeof artifactPlan.reportFilename === 'string' &&
    artifactPlan.reportFilename.length > 0 &&
    artifactPlan.reportFilename === path.basename(expectedArchivePlan.reportFilePath) &&
    typeof artifactPlan.packetFilename === 'string' &&
    artifactPlan.packetFilename.length > 0 &&
    artifactPlan.packetFilename === path.basename(expectedArchivePlan.packetFilePath)
  );
}

function isValidComparisonReportStatus(
  value: unknown
): value is ComparisonReportActionResult['reportStatus'] {
  return value === 'ready-for-runtime' || value === 'blocked-preflight' || value === 'blocked-runtime';
}

function isValidComparisonRuntimeExecutionState(
  value: unknown
): value is ComparisonReportActionResult['runtimeExecutionState'] {
  return value === 'not-run' || value === 'not-available' || value === 'succeeded' || value === 'failed';
}

function matchesExpectedArchivePath(value: unknown, expectedPath: string): boolean {
  return typeof value === 'string' && value.length > 0 && path.resolve(value) === path.resolve(expectedPath);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object';
}

export function readComparisonRuntimeSettings(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'> = vscode.workspace.getConfiguration(
    'viHistorySuite'
  )
): ComparisonRuntimeSettings {
  const labviewVersion = readTrimmedStringSetting(configuration, 'labviewVersion');
  const labviewBitness = readConfiguredLabviewBitness(configuration);
  const configuredProvider = readConfiguredRuntimeProvider(configuration);

  return {
    requestedProvider:
      configuredProvider.provider ??
      (configuredProvider.invalidProvider ? undefined : 'host'),
    invalidRequestedProvider: configuredProvider.invalidProvider,
    requireVersionAndBitness: true,
    labviewVersion,
    bitness: labviewBitness
  };
}

function readTrimmedStringSetting(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'>,
  key: string
): string | undefined {
  const value = configuration.get<string>(key);
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readConfiguredLabviewBitness(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'>
): 'x86' | 'x64' | undefined {
  const value = readTrimmedStringSetting(configuration, 'labviewBitness');
  if (value === 'x86' || value === 'x64') {
    return value;
  }

  return undefined;
}

function readConfiguredRuntimeProvider(
  configuration: Pick<vscode.WorkspaceConfiguration, 'get'>
): { provider?: 'host' | 'docker'; invalidProvider?: string } {
  const value = readTrimmedStringSetting(configuration, 'runtimeProvider');
  if (!value) {
    return {};
  }

  if (value === 'host' || value === 'docker') {
    return { provider: value };
  }

  return { invalidProvider: value };
}

export function resolveRuntimePlatform(platform: NodeJS.Platform): RuntimePlatform {
  if (platform === 'win32' || platform === 'linux' || platform === 'darwin') {
    return platform;
  }

  return 'linux';
}
