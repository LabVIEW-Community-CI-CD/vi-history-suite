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
import {
  DocumentationActionResult
} from '../docs/bundledDocumentationAction';
import {
  ReviewDecisionRecordActionResult,
} from '../scenarios/reviewDecisionRecordAction';
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
  }) => Promise<MultiReportDashboardActionResult>,
  openRetainedComparisonReportAction?: (request: {
    model: Awaited<ReturnType<ViHistoryService['load']>>;
    selectedHash: string;
    reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
    cancellationToken?: vscode.CancellationToken;
  }) => Promise<ComparisonReportActionResult>,
  hasRetainedComparisonReport?: (request: {
    model: Awaited<ReturnType<ViHistoryService['load']>>;
    selectedHash: string;
    baseHash: string;
  }) => Promise<boolean>,
  reviewDecisionRecordAction?: (request: {
    model: Awaited<ReturnType<ViHistoryService['load']>>;
    reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
    cancellationToken?: vscode.CancellationToken;
  }) => Promise<ReviewDecisionRecordActionResult>,
  openDocumentationAction?: (request?: {
    pageId?: string;
  }) => Promise<DocumentationActionResult>
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

    const loadedModel = await historyService.load(targetUri);
    const isComparisonReportCapableVi =
      loadedModel.signature === 'LVIN' || loadedModel.signature === 'LVCC';
    const surfaceCapabilities = {
      comparisonGenerationAvailable:
        isComparisonReportCapableVi && comparisonReportAction !== undefined,
      retainedComparisonOpenAvailable:
        isComparisonReportCapableVi && openRetainedComparisonReportAction !== undefined,
      dashboardAvailable: multiReportDashboardAction !== undefined,
      decisionRecordAvailable: reviewDecisionRecordAction !== undefined,
      documentationAvailable: openDocumentationAction !== undefined
    };
    const model = hasRetainedComparisonReport
      ? {
          ...loadedModel,
          commits: await Promise.all(
            loadedModel.commits.map(async (commit) => ({
              ...commit,
              retainedComparisonEvidenceAvailable: commit.previousHash
                ? await hasRetainedComparisonReport({
                    model: loadedModel,
                    selectedHash: commit.hash,
                    baseHash: commit.previousHash
                  })
                : false
            }))
          ),
          surfaceCapabilities
        }
      : {
          ...loadedModel,
          surfaceCapabilities
        };
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
      const recordComparisonResult = (
        actionCommand: string,
        hashValue: string,
        result: ComparisonReportActionResult
      ): void => {
        const actionSummary: Parameters<HistoryPanelTracker['recordAction']>[0] = {
          command: actionCommand,
          hash: hashValue,
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
        if (result.retainedArchiveAvailable !== undefined) {
          actionSummary.retainedArchiveAvailable = result.retainedArchiveAvailable;
        }
        if (result.archiveFailureReason) {
          actionSummary.archiveFailureReason = result.archiveFailureReason;
        }
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
      };

      const runComparisonReportCommand = async (
        actionCommand: string,
        title: string,
        cancelledMessage: string,
        action:
          | ((request: {
              model: Awaited<ReturnType<ViHistoryService['load']>>;
              selectedHash: string;
              reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
              cancellationToken?: vscode.CancellationToken;
            }) => Promise<ComparisonReportActionResult>)
          | undefined
      ): Promise<void> => {
        if (!action) {
          if (actionCommand === 'generateComparisonReport') {
            void vscode.window.showInformationMessage(
              'VI Comparison Report generation is not available in this extension build.'
            );
          } else if (actionCommand === 'diffPrevious') {
            void vscode.window.showInformationMessage(
              'Diff prev for LabVIEW VIs requires VI Comparison Report support in this extension build.'
            );
          }
          panelTracker?.recordAction({
            command: actionCommand,
            hash,
            outcome: 'unsupported-command'
          });
          return;
        }

        const result = await runProgressWrappedAction(
          title,
          (reportProgress, cancellationToken) =>
            action({
              model,
              selectedHash: hash,
              reportProgress,
              cancellationToken
            })
        );

        if (result.outcome === 'cancelled') {
          void vscode.window.showInformationMessage(cancelledMessage);
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
        } else if (result.outcome === 'missing-retained-comparison-report') {
          void vscode.window.showInformationMessage(
            'No retained VI Comparison Report exists for this pair yet. Use Generate compare to create retained evidence for it.'
          );
        } else if (result.outcome === 'invalid-retained-comparison-report') {
          void vscode.window.showInformationMessage(
            'Retained VI Comparison evidence for this pair is stale or invalid. Use Refresh compare to rebuild retained evidence for it.'
          );
        }

        if (
          actionCommand === 'generateComparisonReport' &&
          (result.outcome === 'opened-comparison-report' ||
            result.outcome === 'retained-comparison-report-evidence')
        ) {
          if (result.retainedArchiveAvailable === false) {
            void vscode.window.showInformationMessage(
              'VI Comparison Report opened, but retained pair evidence was not archived for later reuse. Use Refresh compare to rebuild retained evidence for this pair if Open compare remains unavailable.'
            );
          } else {
            const selectedCommit = model.commits.find((commit) => commit.hash === hash);
            if (selectedCommit?.previousHash) {
              selectedCommit.retainedComparisonEvidenceAvailable = true;
              panel.webview.html = renderHistoryPanelHtml(model);
            }
          }
        }

        recordComparisonResult(actionCommand, hash, result);
      };

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

      if (command === 'openDocumentation') {
        if (!openDocumentationAction) {
          void vscode.window.showInformationMessage(
            'Bundled VI History documentation is not available in this extension build.'
          );
          panelTracker?.recordAction({
            command,
            outcome: 'unsupported-command'
          });
          return;
        }

        const requestedPageId = message.pageId;
        let documentationFallbackUsed = false;
        let result = await openDocumentationAction({
          pageId: requestedPageId
        });
        if (result.outcome === 'unknown-documentation-page' && requestedPageId) {
          const fallbackResult = await openDocumentationAction();
          if (fallbackResult.outcome === 'opened-documentation') {
            documentationFallbackUsed = true;
            result = fallbackResult;
            void vscode.window.showInformationMessage(
              'VI History could not resolve the requested bundled documentation page. Opened the bundled overview page instead.'
            );
          } else {
            result = fallbackResult;
          }
        }
        if (result.outcome === 'missing-bundled-documentation') {
          void vscode.window.showWarningMessage(
            'Bundled VI History documentation is not available in this extension build.'
          );
        } else if (result.outcome === 'unknown-documentation-page') {
          void vscode.window.showInformationMessage(
            'VI History could not resolve the requested bundled documentation page.'
          );
        }

        const documentationActionSummary: Parameters<HistoryPanelTracker['recordAction']>[0] = {
          command,
          outcome:
            result.outcome === 'opened-documentation'
              ? 'opened-documentation'
              : result.outcome === 'missing-bundled-documentation'
                ? 'missing-bundled-documentation'
                : 'unknown-documentation-page',
          documentationPageId: result.pageId,
          documentationPageTitle: result.pageTitle,
          documentationManifestPath: result.manifestFilePath,
          documentationPageFilePath: result.pageFilePath,
          title: result.title
        };
        if (requestedPageId) {
          documentationActionSummary.requestedDocumentationPageId = requestedPageId;
        }
        if (documentationFallbackUsed) {
          documentationActionSummary.documentationFallbackUsed = true;
        }
        panelTracker?.recordAction(documentationActionSummary);
        return;
      }

      if (command === 'openDashboard') {
        if (!multiReportDashboardAction) {
          void vscode.window.showInformationMessage(
            'VI Review Dashboard is not available in this extension build.'
          );
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

      if (command === 'createDecisionRecord') {
        if (!reviewDecisionRecordAction) {
          void vscode.window.showInformationMessage(
            'VI review decision records are not available in this extension build.'
          );
          panelTracker?.recordAction({
            command,
            outcome: 'unsupported-command'
          });
          return;
        }

        const result = await runProgressWrappedAction(
          'Creating Review Decision Record',
          (reportProgress, cancellationToken) =>
            reviewDecisionRecordAction({
              model,
              reportProgress,
              cancellationToken
            })
        );
        if (result.outcome === 'cancelled') {
          void vscode.window.showInformationMessage(
            'VI review decision record creation was cancelled. Retained dashboard and decision-record artifacts, if any, were preserved.'
          );
        } else if (result.outcome === 'workspace-untrusted') {
          void vscode.window.showWarningMessage(
            'VI review decision records are disabled in untrusted workspaces.'
          );
        } else if (result.outcome === 'missing-storage-uri') {
          void vscode.window.showWarningMessage(
            'VI review decision records require an open workspace so decision artifacts can be stored under workspace-scoped extension storage.'
          );
        } else if (result.outcome === 'insufficient-commits') {
          void vscode.window.showInformationMessage(
            'VI review decision records require at least three retained commits for the selected VI.'
          );
        } else if (result.outcome === 'missing-repository-url') {
          void vscode.window.showInformationMessage(
            'VI review decision records require a Git origin remote URL so the active review scenario can be matched truthfully.'
          );
        } else if (result.outcome === 'missing-review-scenario') {
          void vscode.window.showInformationMessage(
            'No active VI review scenario matches this repository and VI yet.'
          );
        } else if (result.outcome === 'scenario-contract-mismatch') {
          void vscode.window.showInformationMessage(
            result.mismatchSummary ??
              'The retained dashboard evidence did not satisfy the selected review scenario contract.'
          );
        }

        panelTracker?.recordAction({
          command,
          outcome:
            result.outcome === 'created-decision-record'
              ? 'created-decision-record'
              : result.outcome === 'cancelled'
                ? 'cancelled'
              : result.outcome === 'workspace-untrusted'
                ? 'workspace-untrusted'
              : result.outcome === 'missing-storage-uri'
                ? 'missing-decision-storage'
              : result.outcome === 'insufficient-commits'
                ? 'insufficient-decision-commits'
              : result.outcome === 'missing-repository-url'
                ? 'missing-repository-url'
              : result.outcome === 'missing-review-scenario'
                ? 'missing-review-scenario'
                : 'scenario-contract-mismatch',
          dashboardFilePath: result.dashboardFilePath,
          dashboardJsonFilePath: result.dashboardJsonFilePath,
          decisionRecordJsonPath: result.decisionRecordJsonPath,
          decisionRecordMarkdownPath: result.decisionRecordMarkdownPath,
          scenarioId: result.scenarioId,
          mismatchSummary: result.mismatchSummary,
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
        await runComparisonReportCommand(
          command,
          'Generating VI Comparison Report',
          'VI History comparison report generation was cancelled. Retained comparison-report artifacts, if any, were preserved.',
          comparisonReportAction
        );
        return;
      }

      if (
        command === 'diffPrevious' &&
        isComparisonReportCapableVi &&
        (openRetainedComparisonReportAction || comparisonReportAction)
      ) {
        if (openRetainedComparisonReportAction) {
          await runComparisonReportCommand(
            command,
            'Opening retained VI Comparison Report',
            'Opening retained VI Comparison Report was cancelled before the retained comparison view opened.',
            openRetainedComparisonReportAction
          );
          return;
        }
        if (comparisonReportAction) {
          await runComparisonReportCommand(
            command,
            'Generating VI Comparison Report',
            'VI History comparison report generation was cancelled. Retained comparison-report artifacts, if any, were preserved.',
            comparisonReportAction
          );
          return;
        }
        return;
      }

      if (
        command === 'diffPrevious' &&
        isComparisonReportCapableVi &&
        !openRetainedComparisonReportAction &&
        !comparisonReportAction
      ) {
        void vscode.window.showInformationMessage(
          'Diff prev for LabVIEW VIs requires VI Comparison Report support in this extension build.'
        );
        panelTracker?.recordAction({
          command,
          hash,
          outcome: 'unsupported-command'
        });
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
