import * as vscode from 'vscode';

import { createOpenViHistoryCommand } from './commands/openViHistoryCommand';
import { getBuiltInGitApi } from './git/gitApi';
import {
  EligibilityDebugSnapshot,
  ViEligibilityIndexer
} from './indexing/viEligibilityIndexer';
import { createComparisonReportAction } from './reporting/comparisonReportAction';
import { ViHistoryViewModel } from './services/viHistoryModel';
import { ViHistoryService } from './services/viHistoryService';
import {
  HistoryPanelActionSummary,
  HistoryPanelMessage,
  HistoryPanelTracker,
  OpenedHistoryPanelSummary
} from './ui/historyPanelTracker';

export interface ViHistorySuiteApi {
  refreshEligibility(): Promise<void>;
  isEligible(uri: vscode.Uri): boolean;
  loadHistory(uri: vscode.Uri): Promise<ViHistoryViewModel>;
  getEligibilityDebugSnapshot(): EligibilityDebugSnapshot;
  getLastOpenedPanel(): OpenedHistoryPanelSummary | undefined;
  getOpenHistoryPanelCount(): number;
  dispatchLastPanelMessage(message: HistoryPanelMessage): Promise<void>;
  getLastPanelActionSummary(): HistoryPanelActionSummary | undefined;
  getPanelActionCount(): number;
  clearHistoryPanelTracking(): void;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<ViHistorySuiteApi> {
  const gitApi = await getBuiltInGitApi();
  const eligibilityIndexer = new ViEligibilityIndexer(gitApi);
  const historyService = new ViHistoryService(gitApi);
  const panelTracker = new HistoryPanelTracker();
  const comparisonReportAction = createComparisonReportAction(context);

  context.subscriptions.push(eligibilityIndexer);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'labviewViHistory.open',
      createOpenViHistoryCommand(
        historyService,
        eligibilityIndexer,
        gitApi,
        panelTracker,
        comparisonReportAction
      )
    )
  );

  await eligibilityIndexer.start();

  return {
    refreshEligibility: async () => eligibilityIndexer.refresh(),
    isEligible: (uri: vscode.Uri) => eligibilityIndexer.isEligible(uri),
    loadHistory: (uri: vscode.Uri) => historyService.load(uri),
    getEligibilityDebugSnapshot: () => eligibilityIndexer.getDebugSnapshot(),
    getLastOpenedPanel: () => panelTracker.getLastOpenedPanel(),
    getOpenHistoryPanelCount: () => panelTracker.getOpenCount(),
    dispatchLastPanelMessage: (message: HistoryPanelMessage) =>
      panelTracker.dispatchLastPanelMessage(message),
    getLastPanelActionSummary: () => panelTracker.getLastActionSummary(),
    getPanelActionCount: () => panelTracker.getActionCount(),
    clearHistoryPanelTracking: () => panelTracker.clear()
  };
}

export function deactivate(): void {
  // Nothing to do yet.
}
