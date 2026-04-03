import * as vscode from 'vscode';

import { ViHistoryViewModel } from '../services/viHistoryModel';

export interface HistoryPanelMessage {
  command?: string;
  hash?: string;
}

export interface HistoryPanelActionSummary {
  command: string;
  hash?: string;
  outcome:
    | 'copied-hash'
    | 'copied-review-packet'
    | 'opened-commit'
    | 'diffed-previous'
    | 'opened-comparison-report'
    | 'ignored-missing-hash'
    | 'missing-git-uri'
    | 'missing-selected-commit'
    | 'missing-storage-uri'
    | 'missing-previous-hash'
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
  packetFilePath?: string;
  reportFilePath?: string;
  metadataFilePath?: string;
  reportWebviewUri?: string;
  generatedReportExists?: boolean;
}

export interface OpenedHistoryPanelSummary {
  title: string;
  targetFsPath: string;
  relativePath: string;
  commitCount: number;
  eligible: boolean;
  renderedHtml: string;
}

export class HistoryPanelTracker {
  private lastOpenedPanel: OpenedHistoryPanelSummary | undefined;
  private lastActionSummary: HistoryPanelActionSummary | undefined;
  private openCount = 0;
  private actionCount = 0;
  private lastMessageDispatcher:
    | ((message: HistoryPanelMessage) => Promise<void>)
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

  async dispatchLastPanelMessage(message: HistoryPanelMessage): Promise<void> {
    if (!this.lastMessageDispatcher) {
      return;
    }

    await this.lastMessageDispatcher(message);
  }

  clear(): void {
    this.lastOpenedPanel = undefined;
    this.lastActionSummary = undefined;
    this.openCount = 0;
    this.actionCount = 0;
    this.lastMessageDispatcher = undefined;
  }
}
