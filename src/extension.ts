import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';

import { createOpenViHistoryCommand } from './commands/openViHistoryCommand';
import { createBenchmarkStatusAction } from './benchmark/benchmarkStatusAction';
import { buildComparisonReportArchivePlanFromSelection } from './dashboard/comparisonReportArchive';
import { createMultiReportDashboardAction } from './dashboard/multiReportDashboardAction';
import { createBundledDocumentationAction } from './docs/bundledDocumentationAction';
import { getBuiltInGitApi } from './git/gitApi';
import { getFileHistoryCount } from './git/gitCli';
import {
  EligibilityDebugSnapshot,
  ViEligibilityIndexer
} from './indexing/viEligibilityIndexer';
import {
  createComparisonReportAction,
  createEnsureComparisonReportEvidenceAction,
  readComparisonRuntimeSettings,
  createOpenRetainedComparisonReportAction
} from './reporting/comparisonReportAction';
import {
  createHumanReviewSubmissionAction,
  resolveHumanReviewMachineCapability
} from './review/humanReviewSubmissionAction';
import { createReviewDecisionRecordAction } from './scenarios/reviewDecisionRecordAction';
import { ViHistoryViewModel } from './services/viHistoryModel';
import { getViHistoryServiceSettings, ViHistoryService } from './services/viHistoryService';
import {
  DashboardArtifactActionSummary,
  OpenedDocumentationPanelSummary,
  DashboardPanelMessage,
  HistoryPanelActionSummary,
  HistoryPanelMessage,
  HistoryPanelTracker,
  OpenedDashboardPanelSummary,
  OpenedHistoryPanelSummary
} from './ui/historyPanelTracker';
import {
  ensureLocalRuntimeSettingsCli,
  resolveLocalRuntimeSettingsCliGovernanceContract
} from './tooling/localRuntimeSettingsCli';

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
  getLastOpenedDocumentationPanel(): OpenedDocumentationPanelSummary | undefined;
  getOpenDocumentationPanelCount(): number;
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
  const humanReviewMachineCapability = resolveHumanReviewMachineCapability();
  const humanReviewSubmissionAction = humanReviewMachineCapability.isCanonicalHostMachine
    ? createHumanReviewSubmissionAction(context)
    : undefined;
  const benchmarkStatusAction = humanReviewMachineCapability.isCanonicalHostMachine
    ? createBenchmarkStatusAction(context)
    : undefined;
  const bundledDocumentationAction = createBundledDocumentationAction(context, panelTracker);
  const multiReportDashboardAction = createMultiReportDashboardAction(
    context,
    {
      ensureComparisonReportEvidence: ensureComparisonReportEvidenceAction,
      getHistoryServiceSettings: getViHistoryServiceSettings,
      getRuntimeSettings: readComparisonRuntimeSettings,
      getFileHistoryCount
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
        reviewDecisionRecordAction,
        bundledDocumentationAction,
        humanReviewSubmissionAction,
        benchmarkStatusAction
      )
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'labviewViHistory.openDocumentation',
      async (pageId?: string) => {
        const result = await bundledDocumentationAction({
          pageId: typeof pageId === 'string' ? pageId : undefined
        });
        if (result.outcome === 'missing-bundled-documentation') {
          void vscode.window.showWarningMessage(
            'Bundled VI History documentation is not available in this extension build.'
          );
        } else if (result.outcome === 'unknown-documentation-page') {
          void vscode.window.showInformationMessage(
            'VI History could not resolve the requested bundled documentation page.'
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('labviewViHistory.prepareLocalRuntimeSettingsCli', async () => {
      if (!context.globalStorageUri) {
        void vscode.window.showWarningMessage(
          'VI History could not prepare the local runtime settings CLI because extension-global storage is unavailable.'
        );
        return {
          outcome: 'missing-global-storage-uri' as const
        };
      }

      const materializedCli = await ensureLocalRuntimeSettingsCli(
        context.globalStorageUri.fsPath,
        context.extensionPath
      );
      const governanceContract = resolveLocalRuntimeSettingsCliGovernanceContract();

      void vscode.window.showInformationMessage(
        [
          `Prepared VI History local runtime settings CLI at ${materializedCli.rootDirectoryPath}.`,
          `Governed settings targets: default user settings.json at ${governanceContract.defaultSettingsFilePath} or an explicit --settings-file path.`,
          'This prepare command is admitted in untrusted workspaces because it only materializes the launcher; installed compare remains disabled there.'
        ].join(' ')
      );

      return {
        outcome: 'prepared-local-runtime-settings-cli' as const,
        ...materializedCli,
        ...governanceContract
      };
    })
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
    getLastOpenedDocumentationPanel: () => panelTracker.getLastOpenedDocumentationPanel(),
    getOpenDocumentationPanelCount: () => panelTracker.getDocumentationOpenCount(),
    clearHistoryPanelTracking: () => panelTracker.clear()
  };
}

export function deactivate(): void {
  // Nothing to do yet.
}
