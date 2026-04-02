import * as vscode from 'vscode';

import { ViHistoryViewModel } from '../services/viHistoryModel';

export interface OpenedHistoryPanelSummary {
  title: string;
  targetFsPath: string;
  relativePath: string;
  commitCount: number;
  eligible: boolean;
}

export class HistoryPanelTracker {
  private lastOpenedPanel: OpenedHistoryPanelSummary | undefined;
  private openCount = 0;

  record(panel: vscode.WebviewPanel, targetUri: vscode.Uri, model: ViHistoryViewModel): void {
    this.openCount += 1;
    this.lastOpenedPanel = {
      title: panel.title,
      targetFsPath: targetUri.fsPath,
      relativePath: model.relativePath,
      commitCount: model.commits.length,
      eligible: model.eligible
    };
  }

  getLastOpenedPanel(): OpenedHistoryPanelSummary | undefined {
    return this.lastOpenedPanel;
  }

  getOpenCount(): number {
    return this.openCount;
  }

  clear(): void {
    this.lastOpenedPanel = undefined;
    this.openCount = 0;
  }
}

