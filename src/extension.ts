import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';

import { createOpenViHistoryCommand } from './commands/openViHistoryCommand';
import { buildComparisonReportArchivePlanFromSelection } from './dashboard/comparisonReportArchive';
import { createMultiReportDashboardAction } from './dashboard/multiReportDashboardAction';
import { getBuiltInGitApi } from './git/gitApi';
import {
  EligibilityDebugSnapshot,
  ViEligibilityIndexer
} from './indexing/viEligibilityIndexer';
import {
  createComparisonReportAction,
  createEnsureComparisonReportEvidenceAction,
  createOpenRetainedComparisonReportAction
} from './reporting/comparisonReportAction';
import { createReviewDecisionRecordAction } from './scenarios/reviewDecisionRecordAction';
import { ViHistoryViewModel } from './services/viHistoryModel';
import { ViHistoryService } from './services/viHistoryService';
import {
  DashboardArtifactActionSummary,
  DashboardPanelMessage,
  HistoryPanelActionSummary,
  HistoryPanelMessage,
  HistoryPanelTracker,
  OpenedDashboardPanelSummary,
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
  getLastOpenedDashboardPanel(): OpenedDashboardPanelSummary | undefined;
  getOpenDashboardPanelCount(): number;
  dispatchLastDashboardPanelMessage(message: DashboardPanelMessage): Promise<void>;
  getLastDashboardArtifactActionSummary(): DashboardArtifactActionSummary | undefined;
  getDashboardArtifactActionCount(): number;
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
  const ensureComparisonReportEvidenceAction =
    createEnsureComparisonReportEvidenceAction(context);
  const openRetainedComparisonReportAction = createOpenRetainedComparisonReportAction(context);
  const reviewDecisionRecordAction = createReviewDecisionRecordAction(context);
  const multiReportDashboardAction = createMultiReportDashboardAction(
    context,
    {
      ensureComparisonReportEvidence: ensureComparisonReportEvidenceAction
    },
    panelTracker
  );
  const hasRetainedComparisonReport = async (request: {
    model: ViHistoryViewModel;
    selectedHash: string;
    baseHash: string;
  }): Promise<boolean> => {
    if (!context.storageUri) {
      return false;
    }

    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: context.storageUri.fsPath,
      repositoryRoot: request.model.repositoryRoot,
      relativePath: request.model.relativePath,
      reportType: 'diff',
      selectedHash: request.selectedHash,
      baseHash: request.baseHash
    });

    try {
      await fs.access(archivePlan.sourceRecordFilePath);
      return true;
    } catch {
      return false;
    }
  };

  context.subscriptions.push(eligibilityIndexer);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'labviewViHistory.open',
      createOpenViHistoryCommand(
        historyService,
        eligibilityIndexer,
        gitApi,
        panelTracker,
        comparisonReportAction,
        multiReportDashboardAction,
        openRetainedComparisonReportAction,
        hasRetainedComparisonReport,
        reviewDecisionRecordAction
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
    getLastOpenedDashboardPanel: () => panelTracker.getLastOpenedDashboardPanel(),
    getOpenDashboardPanelCount: () => panelTracker.getDashboardOpenCount(),
    dispatchLastDashboardPanelMessage: (message: DashboardPanelMessage) =>
      panelTracker.dispatchLastDashboardPanelMessage(message),
    getLastDashboardArtifactActionSummary: () =>
      panelTracker.getLastDashboardArtifactActionSummary(),
    getDashboardArtifactActionCount: () => panelTracker.getDashboardArtifactActionCount(),
    clearHistoryPanelTracking: () => panelTracker.clear()
  };
}

export function deactivate(): void {
  // Nothing to do yet.
}
