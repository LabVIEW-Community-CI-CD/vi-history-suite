import * as path from 'node:path';
import * as vscode from 'vscode';

import { GitApi } from '../git/gitApi';
import { ViEligibilityIndexer } from '../indexing/viEligibilityIndexer';
import {
  ComparisonReportActionResult,
} from '../reporting/comparisonReportAction';
import {
  MultiReportDashboardActionResult,
} from '../dashboard/multiReportDashboardAction';
import { ViHistoryService } from '../services/viHistoryService';
import {
  renderHistoryPanelHtml,
  renderHistoryReviewPacketText
} from '../ui/historyPanel';
import {
  HistoryPanelMessage,
  HistoryPanelTracker
} from '../ui/historyPanelTracker';

export function createOpenViHistoryCommand(
  historyService: ViHistoryService,
  eligibilityIndexer: ViEligibilityIndexer,
  gitApi: GitApi | undefined,
  panelTracker?: HistoryPanelTracker,
  comparisonReportAction?: (request: {
    model: Awaited<ReturnType<ViHistoryService['load']>>;
    selectedHash: string;
    reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
    cancellationToken?: vscode.CancellationToken;
  }) => Promise<ComparisonReportActionResult>,
  multiReportDashboardAction?: (request: {
    model: Awaited<ReturnType<ViHistoryService['load']>>;
    reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
    cancellationToken?: vscode.CancellationToken;
  }) => Promise<MultiReportDashboardActionResult>
): (uri?: vscode.Uri) => Promise<void> {
  return async (uri?: vscode.Uri) => {
    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) {
      void vscode.window.showInformationMessage(
        'Select a tracked LabVIEW VI to open VI History.'
      );
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
    const renderedHtml = renderHistoryPanelHtml(model);
    const panel = vscode.window.createWebviewPanel(
      'viHistorySuite.history',
      `VI History: ${path.basename(targetUri.fsPath)}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true
      }
    );

    panel.webview.html = renderedHtml;
    const handleMessage = async (message: HistoryPanelMessage) => {
      const command = String(message.command ?? '');
      const hash = String(message.hash ?? '');

      if (command === 'copyReviewPacket') {
        const reviewPacket = renderHistoryReviewPacketText(model);
        await vscode.env.clipboard.writeText(reviewPacket);
        panelTracker?.recordAction({
          command,
          outcome: 'copied-review-packet',
          copiedTextLength: reviewPacket.length
        });
        return;
      }

      if (command === 'openDashboard') {
        if (!multiReportDashboardAction) {
          panelTracker?.recordAction({
            command,
            outcome: 'unsupported-command'
          });
          return;
        }

        const result = await runProgressWrappedAction(
          'Building VI Review Dashboard',
          (reportProgress, cancellationToken) =>
            multiReportDashboardAction({
              model,
              reportProgress,
              cancellationToken
            })
        );
        if (result.outcome === 'cancelled') {
          void vscode.window.showInformationMessage(
            'VI Review Dashboard refresh was cancelled. Retained dashboard artifacts, if any, were preserved.'
          );
        } else if (result.outcome === 'workspace-untrusted') {
          void vscode.window.showWarningMessage(
            'VI Review Dashboard is disabled in untrusted workspaces.'
          );
        } else if (result.outcome === 'missing-storage-uri') {
          void vscode.window.showWarningMessage(
            'VI Review Dashboard requires an open workspace so concentrated dashboard artifacts can be stored under workspace-scoped extension storage.'
          );
        } else if (result.outcome === 'insufficient-commits') {
          void vscode.window.showInformationMessage(
            'VI Review Dashboard requires at least three retained commits for the selected VI.'
          );
        }

        panelTracker?.recordAction({
          command,
          outcome:
            result.outcome === 'opened-review-dashboard'
              ? 'opened-review-dashboard'
              : result.outcome === 'cancelled'
                ? 'cancelled'
              : result.outcome === 'workspace-untrusted'
                ? 'workspace-untrusted'
              : result.outcome === 'missing-storage-uri'
                ? 'missing-dashboard-storage'
                : 'insufficient-dashboard-commits',
          dashboardFilePath: result.dashboardFilePath,
          dashboardJsonFilePath: result.dashboardJsonFilePath,
          dashboardPairCount: result.dashboardPairCount,
          dashboardArchivedPairCount: result.dashboardArchivedPairCount,
          dashboardMissingPairCount: result.dashboardMissingPairCount,
          cancellationStage: result.cancellationStage,
          title: result.title
        });
        return;
      }

      if (!hash) {
        panelTracker?.recordAction({
          command,
          outcome: 'ignored-missing-hash'
        });
        return;
      }

      if (command === 'copyHash') {
        await vscode.env.clipboard.writeText(hash);
        panelTracker?.recordAction({
          command,
          hash,
          outcome: 'copied-hash',
          copiedHash: hash
        });
        return;
      }

      if (command === 'generateComparisonReport') {
        if (!comparisonReportAction) {
          panelTracker?.recordAction({
            command,
            hash,
            outcome: 'unsupported-command'
          });
          return;
        }

        const result = await runProgressWrappedAction(
          'Generating VI Comparison Report',
          (reportProgress, cancellationToken) =>
            comparisonReportAction({
              model,
              selectedHash: hash,
              reportProgress,
              cancellationToken
            })
        );

        if (result.outcome === 'cancelled') {
          void vscode.window.showInformationMessage(
            'VI History comparison report generation was cancelled. Retained comparison-report artifacts, if any, were preserved.'
          );
        } else if (result.outcome === 'workspace-untrusted') {
          void vscode.window.showWarningMessage(
            'VI History comparison reports are disabled in untrusted workspaces.'
          );
        } else if (result.outcome === 'missing-storage-uri') {
          void vscode.window.showWarningMessage(
            'VI History comparison reports require an open workspace so reports can be stored under workspace-scoped extension storage.'
          );
        } else if (result.outcome === 'missing-selected-commit') {
          void vscode.window.showInformationMessage(
            'VI History could not resolve the selected retained revision for report generation.'
          );
        } else if (result.outcome === 'missing-previous-hash') {
          void vscode.window.showInformationMessage(
            'VI History has no previous retained revision for this entry.'
          );
        }

        const actionSummary: Parameters<HistoryPanelTracker['recordAction']>[0] = {
          command,
          hash,
          outcome: result.outcome,
          reportStatus: result.reportStatus,
          runtimeExecutionState: result.runtimeExecutionState,
          blockedReason: result.blockedReason,
          runtimeFailureReason: result.runtimeFailureReason,
          cancellationStage: result.cancellationStage,
          packetFilePath: result.packetFilePath,
          reportFilePath: result.reportFilePath,
          metadataFilePath: result.metadataFilePath,
          reportWebviewUri: result.reportWebviewUri,
          generatedReportExists: result.generatedReportExists,
          title: result.title
        };
        if (result.runtimeDiagnosticReason) {
          actionSummary.runtimeDiagnosticReason = result.runtimeDiagnosticReason;
        }
        if (result.runtimeDiagnosticNotes?.length) {
          actionSummary.runtimeDiagnosticNotes = result.runtimeDiagnosticNotes;
        }
        if (result.runtimeDiagnosticLogSourcePath) {
          actionSummary.runtimeDiagnosticLogSourcePath =
            result.runtimeDiagnosticLogSourcePath;
        }
        if (result.runtimeDiagnosticLogArtifactPath) {
          actionSummary.runtimeDiagnosticLogArtifactPath =
            result.runtimeDiagnosticLogArtifactPath;
        }
        if (result.runtimeExecutable) {
          actionSummary.runtimeExecutable = result.runtimeExecutable;
        }
        if (result.runtimeArgs?.length) {
          actionSummary.runtimeArgs = result.runtimeArgs;
        }
        if (result.runtimeProcessObservationArtifactPath) {
          actionSummary.runtimeProcessObservationArtifactPath =
            result.runtimeProcessObservationArtifactPath;
        }
        if (result.runtimeProcessObservationCapturedAt) {
          actionSummary.runtimeProcessObservationCapturedAt =
            result.runtimeProcessObservationCapturedAt;
        }
        if (result.runtimeProcessObservationTrigger) {
          actionSummary.runtimeProcessObservationTrigger =
            result.runtimeProcessObservationTrigger;
        }
        if (result.runtimeObservedProcessNames?.length) {
          actionSummary.runtimeObservedProcessNames = result.runtimeObservedProcessNames;
        }
        if (result.runtimeLabviewProcessObserved !== undefined) {
          actionSummary.runtimeLabviewProcessObserved =
            result.runtimeLabviewProcessObserved;
        }
        if (result.runtimeLabviewCliProcessObserved !== undefined) {
          actionSummary.runtimeLabviewCliProcessObserved =
            result.runtimeLabviewCliProcessObserved;
        }
        if (result.runtimeLvcompareProcessObserved !== undefined) {
          actionSummary.runtimeLvcompareProcessObserved =
            result.runtimeLvcompareProcessObserved;
        }
        if (result.runtimeExitProcessObservationCapturedAt) {
          actionSummary.runtimeExitProcessObservationCapturedAt =
            result.runtimeExitProcessObservationCapturedAt;
        }
        if (result.runtimeExitProcessObservationTrigger) {
          actionSummary.runtimeExitProcessObservationTrigger =
            result.runtimeExitProcessObservationTrigger;
        }
        if (result.runtimeExitObservedProcessNames?.length) {
          actionSummary.runtimeExitObservedProcessNames =
            result.runtimeExitObservedProcessNames;
        }
        if (result.runtimeLabviewProcessObservedAtExit !== undefined) {
          actionSummary.runtimeLabviewProcessObservedAtExit =
            result.runtimeLabviewProcessObservedAtExit;
        }
        if (result.runtimeLabviewCliProcessObservedAtExit !== undefined) {
          actionSummary.runtimeLabviewCliProcessObservedAtExit =
            result.runtimeLabviewCliProcessObservedAtExit;
        }
        if (result.runtimeLvcompareProcessObservedAtExit !== undefined) {
          actionSummary.runtimeLvcompareProcessObservedAtExit =
            result.runtimeLvcompareProcessObservedAtExit;
        }
        panelTracker?.recordAction(actionSummary);
        return;
      }

      const gitUri = gitApi?.toGitUri(targetUri, hash);
      if (!gitUri) {
        void vscode.window.showWarningMessage(
          'VI History could not resolve the selected Git revision.'
        );
        panelTracker?.recordAction({
          command,
          hash,
          outcome: 'missing-git-uri'
        });
        return;
      }

      if (command === 'openCommit') {
        await vscode.commands.executeCommand('vscode.open', gitUri, {
          preview: false
        });
        panelTracker?.recordAction({
          command,
          hash,
          outcome: 'opened-commit',
          openedUri: gitUri.toString()
        });
        return;
      }

      if (command === 'diffPrevious') {
        const selectedCommit = model.commits.find((commit) => commit.hash === hash);
        if (!selectedCommit?.previousHash) {
          void vscode.window.showInformationMessage(
            'VI History has no previous retained revision for this entry.'
          );
          panelTracker?.recordAction({
            command,
            hash,
            outcome: 'missing-previous-hash'
          });
          return;
        }

        const previousUri = gitApi?.toGitUri(targetUri, selectedCommit.previousHash);
        if (!previousUri) {
          panelTracker?.recordAction({
            command,
            hash,
            outcome: 'missing-git-uri'
          });
          return;
        }

        const title = `${path.basename(targetUri.fsPath)} (${selectedCommit.previousHash.slice(0, 8)}..${hash.slice(0, 8)})`;
        await vscode.commands.executeCommand(
          'vscode.diff',
          previousUri,
          gitUri,
          title
        );
        panelTracker?.recordAction({
          command,
          hash,
          outcome: 'diffed-previous',
          leftUri: previousUri.toString(),
          rightUri: gitUri.toString(),
          title
        });
        return;
      }

      panelTracker?.recordAction({
        command,
        hash,
        outcome: 'unsupported-command'
      });
    };
    panelTracker?.record(panel, targetUri, model, renderedHtml, handleMessage);
    panel.webview.onDidReceiveMessage(handleMessage);
  };
}

async function runProgressWrappedAction<Result>(
  title: string,
  task: (
    reportProgress: (update: { message: string; increment?: number }) => void,
    cancellationToken: vscode.CancellationToken
  ) => Promise<Result>
): Promise<Result> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: true
    },
    async (progress, cancellationToken) =>
      task((update) => {
        progress.report(update);
      }, cancellationToken)
  );
}
