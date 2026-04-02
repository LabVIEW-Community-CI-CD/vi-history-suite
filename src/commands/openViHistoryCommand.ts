import * as path from 'node:path';
import * as vscode from 'vscode';

import { GitApi } from '../git/gitApi';
import { ViEligibilityIndexer } from '../indexing/viEligibilityIndexer';
import { ViHistoryService } from '../services/viHistoryService';
import { renderHistoryPanelHtml } from '../ui/historyPanel';
import { HistoryPanelTracker } from '../ui/historyPanelTracker';

export function createOpenViHistoryCommand(
  historyService: ViHistoryService,
  eligibilityIndexer: ViEligibilityIndexer,
  gitApi: GitApi | undefined,
  panelTracker?: HistoryPanelTracker
): (uri?: vscode.Uri) => Promise<void> {
  return async (uri?: vscode.Uri) => {
    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) {
      return;
    }

    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        'VI History is disabled in untrusted workspaces.'
      );
      return;
    }

    if (!eligibilityIndexer.isEligible(targetUri)) {
      void vscode.window.showInformationMessage(
        'The selected file is not currently eligible for VI History.'
      );
      return;
    }

    const model = await historyService.load(targetUri);
    const panel = vscode.window.createWebviewPanel(
      'viHistorySuite.history',
      `VI History: ${path.basename(targetUri.fsPath)}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true
      }
    );

    panelTracker?.record(panel, targetUri, model);
    panel.webview.html = renderHistoryPanelHtml(model);

    panel.webview.onDidReceiveMessage(async (message) => {
      const hash = String(message.hash ?? '');
      if (!hash) {
        return;
      }

      if (message.command === 'copyHash') {
        await vscode.env.clipboard.writeText(hash);
        return;
      }

      const gitUri = gitApi?.toGitUri(targetUri, hash);
      if (!gitUri) {
        return;
      }

      if (message.command === 'openCommit') {
        const document = await vscode.workspace.openTextDocument(gitUri);
        await vscode.window.showTextDocument(document, {
          preview: false
        });
        return;
      }

      if (message.command === 'diffPrevious') {
        const selectedCommit = model.commits.find((commit) => commit.hash === hash);
        if (!selectedCommit?.previousHash) {
          return;
        }

        const previousUri = gitApi?.toGitUri(targetUri, selectedCommit.previousHash);
        if (!previousUri) {
          return;
        }

        await vscode.commands.executeCommand(
          'vscode.diff',
          previousUri,
          gitUri,
          `${path.basename(targetUri.fsPath)} (${selectedCommit.previousHash.slice(0, 8)}..${hash.slice(0, 8)})`
        );
      }
    });
  };
}
