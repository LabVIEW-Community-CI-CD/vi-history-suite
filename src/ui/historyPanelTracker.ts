import * as vscode from 'vscode';

import { ViHistoryViewModel } from '../services/viHistoryModel';

export interface HistoryPanelMessage {
  command?: string;
  hash?: string;
  selectedHashes?: string[];
  pageId?: string;
  warningMessage?: string;
  reviewOutcome?: string;
  reviewConfidence?: string;
  reviewNote?: string;
}

export interface DashboardPanelMessage {
  command?: string;
  filePath?: string;
  kind?: string;
  label?: string;
}

export interface DocumentationPanelMessage {
  command?: string;
  pageId?: string;
  href?: string;
}

export interface HistoryPanelActionSummary {
  command: string;
  hash?: string;
  baseHash?: string;
  outcome:
    | 'copied-hash'
    | 'copied-review-packet'
    | 'created-decision-record'
    | 'opened-review-dashboard'
    | 'opened-commit'
    | 'diffed-previous'
    | 'opened-comparison-report'
    | 'retained-comparison-report-evidence'
    | 'cancelled'
    | 'workspace-untrusted'
    | 'ignored-missing-hash'
    | 'insufficient-dashboard-commits'
    | 'insufficient-decision-commits'
    | 'missing-dashboard-storage'
    | 'missing-decision-storage'
    | 'missing-repository-url'
    | 'missing-review-scenario'
    | 'scenario-contract-mismatch'
    | 'missing-git-uri'
    | 'missing-selected-commit'
    | 'missing-storage-uri'
    | 'missing-previous-hash'
    | 'missing-retained-comparison-report'
    | 'invalid-retained-comparison-report'
    | 'opened-documentation'
    | 'opened-benchmark-status'
    | 'missing-bundled-documentation'
    | 'unknown-documentation-page'
    | 'submitted-human-review'
    | 'failed-human-review-submission'
    | 'invalid-human-review-submission'
    | 'missing-human-review-storage'
    | 'canonical-machine-mismatch'
    | 'nondeterministic-human-review-surface'
    | 'unsupported-command';
  openedUri?: string;
  leftUri?: string;
  rightUri?: string;
  title?: string;
  copiedHash?: string;
  copiedTextLength?: number;
  reportStatus?: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
  runtimeExecutionState?: 'not-run' | 'not-available' | 'succeeded' | 'failed';
  blockedReason?: string;
  runtimeFailureReason?: string;
  comparisonRuntimePanelStatus?: 'idle' | 'blocked' | 'failed' | 'succeeded' | 'cancelled';
  comparisonRuntimePanelSummary?: string;
  comparisonRuntimePanelNextAction?: string;
  comparisonRuntimePanelDetails?: Array<{
    label: string;
    value: string;
  }>;
  runtimeDiagnosticReason?: string;
  runtimeDiagnosticNotes?: string[];
  runtimeDiagnosticLogSourcePath?: string;
  runtimeDiagnosticLogArtifactPath?: string;
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
  cancellationStage?: string;
  packetFilePath?: string;
  reportFilePath?: string;
  metadataFilePath?: string;
  reportWebviewUri?: string;
  generatedReportExists?: boolean;
  retainedArchiveAvailable?: boolean;
  archiveFailureReason?: 'retained-archive-unavailable' | 'retained-archive-write-failed';
  dashboardFilePath?: string;
  dashboardJsonFilePath?: string;
  dashboardPairCount?: number;
  dashboardArchivedPairCount?: number;
  dashboardMissingPairCount?: number;
  scenarioId?: string;
  decisionRecordJsonPath?: string;
  decisionRecordMarkdownPath?: string;
  mismatchSummary?: string;
  documentationPageId?: string;
  documentationPageTitle?: string;
  documentationManifestPath?: string;
  documentationPageFilePath?: string;
  requestedDocumentationPageId?: string;
  documentationFallbackUsed?: boolean;
  benchmarkWindowsLatestRunPath?: string;
  benchmarkHostLaunchReceiptPath?: string;
  benchmarkHostLatestSummaryPath?: string;
  benchmarkHostLogPath?: string;
  benchmarkHostState?: 'missing' | 'running' | 'stalled' | 'completed' | 'failed';
  humanReviewSubmissionFilePath?: string;
  humanReviewLatestManifestPath?: string;
  humanReviewCanonicalMachineFilePath?: string;
  humanReviewMachineFingerprintId?: string;
  humanReviewCanonicalMachineFingerprintId?: string;
  humanReviewValidationMessage?: string;
}

export interface DashboardArtifactActionSummary {
  command: 'openDashboardArtifact';
  outcome:
    | 'opened-artifact-panel'
    | 'opened-artifact-editor'
    | 'ignored-malformed'
    | 'ignored-outside-storage'
    | 'ignored-kind-mismatch';
  kind?: 'packet-html' | 'report-html' | 'metadata-json' | 'source-record-json';
  label?: string;
  filePath?: string;
  title?: string;
  openedUri?: string;
}

export interface OpenedHistoryPanelSummary {
  title: string;
  targetFsPath: string;
  relativePath: string;
  commitCount: number;
  eligible: boolean;
  historyWindow?: ViHistoryViewModel['historyWindow'];
  renderedHtml: string;
}

export interface OpenedDashboardPanelSummary {
  title: string;
  relativePath: string;
  commitCount: number;
  dashboardFilePath: string;
  dashboardJsonFilePath: string;
  dashboardPairCount: number;
  dashboardArchivedPairCount: number;
  dashboardMissingPairCount: number;
  renderedHtml: string;
}

export interface OpenedDocumentationPanelSummary {
  title: string;
  pageId: string;
  pageTitle: string;
  bundledVersion: string;
  manifestFilePath: string;
  pageFilePath: string;
  renderedHtml: string;
}

export class HistoryPanelTracker {
  private lastOpenedPanel: OpenedHistoryPanelSummary | undefined;
  private lastActionSummary: HistoryPanelActionSummary | undefined;
  private lastOpenedDashboardPanel: OpenedDashboardPanelSummary | undefined;
  private lastDashboardArtifactActionSummary: DashboardArtifactActionSummary | undefined;
  private lastOpenedDocumentationPanel: OpenedDocumentationPanelSummary | undefined;
  private openCount = 0;
  private actionCount = 0;
  private dashboardOpenCount = 0;
  private dashboardArtifactActionCount = 0;
  private documentationOpenCount = 0;
  private lastMessageDispatcher:
    | ((message: HistoryPanelMessage) => Promise<void>)
    | undefined;
  private lastDashboardMessageDispatcher:
    | ((message: DashboardPanelMessage) => Promise<void>)
    | undefined;

  record(
    panel: vscode.WebviewPanel,
    targetUri: vscode.Uri,
    model: ViHistoryViewModel,
    renderedHtml: string,
    dispatchMessage: (message: HistoryPanelMessage) => Promise<void>
  ): void {
    this.openCount += 1;
    this.lastMessageDispatcher = dispatchMessage;
    this.lastOpenedPanel = {
      title: panel.title,
      targetFsPath: targetUri.fsPath,
      relativePath: model.relativePath,
      commitCount: model.commits.length,
      eligible: model.eligible,
      historyWindow: model.historyWindow,
      renderedHtml
    };
  }

  getLastOpenedPanel(): OpenedHistoryPanelSummary | undefined {
    return this.lastOpenedPanel;
  }

  getOpenCount(): number {
    return this.openCount;
  }

  recordAction(summary: HistoryPanelActionSummary): void {
    this.actionCount += 1;
    this.lastActionSummary = summary;
  }

  getLastActionSummary(): HistoryPanelActionSummary | undefined {
    return this.lastActionSummary;
  }

  getActionCount(): number {
    return this.actionCount;
  }

  recordDashboard(
    summary: OpenedDashboardPanelSummary,
    dispatchMessage: (message: DashboardPanelMessage) => Promise<void>
  ): void {
    this.dashboardOpenCount += 1;
    this.lastDashboardMessageDispatcher = dispatchMessage;
    this.lastOpenedDashboardPanel = summary;
  }

  getLastOpenedDashboardPanel(): OpenedDashboardPanelSummary | undefined {
    return this.lastOpenedDashboardPanel;
  }

  getDashboardOpenCount(): number {
    return this.dashboardOpenCount;
  }

  recordDashboardArtifactAction(summary: DashboardArtifactActionSummary): void {
    this.dashboardArtifactActionCount += 1;
    this.lastDashboardArtifactActionSummary = summary;
  }

  getLastDashboardArtifactActionSummary(): DashboardArtifactActionSummary | undefined {
    return this.lastDashboardArtifactActionSummary;
  }

  getDashboardArtifactActionCount(): number {
    return this.dashboardArtifactActionCount;
  }

  recordDocumentation(summary: OpenedDocumentationPanelSummary): void {
    this.documentationOpenCount += 1;
    this.lastOpenedDocumentationPanel = summary;
  }

  getLastOpenedDocumentationPanel(): OpenedDocumentationPanelSummary | undefined {
    return this.lastOpenedDocumentationPanel;
  }

  getDocumentationOpenCount(): number {
    return this.documentationOpenCount;
  }

  async dispatchLastPanelMessage(message: HistoryPanelMessage): Promise<void> {
    if (!this.lastMessageDispatcher) {
      return;
    }

    await this.lastMessageDispatcher(message);
  }

  async dispatchLastDashboardPanelMessage(message: DashboardPanelMessage): Promise<void> {
    if (!this.lastDashboardMessageDispatcher) {
      return;
    }

    await this.lastDashboardMessageDispatcher(message);
  }

  clear(): void {
    this.lastOpenedPanel = undefined;
    this.lastActionSummary = undefined;
    this.lastOpenedDashboardPanel = undefined;
    this.lastDashboardArtifactActionSummary = undefined;
    this.lastOpenedDocumentationPanel = undefined;
    this.openCount = 0;
    this.actionCount = 0;
    this.dashboardOpenCount = 0;
    this.dashboardArtifactActionCount = 0;
    this.documentationOpenCount = 0;
    this.lastMessageDispatcher = undefined;
    this.lastDashboardMessageDispatcher = undefined;
  }
}
