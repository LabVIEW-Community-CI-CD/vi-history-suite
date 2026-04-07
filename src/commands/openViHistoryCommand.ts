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
  BenchmarkStatusActionResult
} from '../benchmark/benchmarkStatusAction';
import {
  ReviewDecisionRecordActionResult,
} from '../scenarios/reviewDecisionRecordAction';
import {
  HumanReviewSubmissionActionResult
} from '../review/humanReviewSubmissionAction';
import { ViHistoryService } from '../services/viHistoryService';
import {
  renderHistoryPanelHtml,
  renderHistoryReviewPacketText
} from '../ui/historyPanel';
import {
  HistoryPanelMessage,
  HistoryPanelTracker
} from '../ui/historyPanelTracker';
import { ViHistoryViewModel } from '../services/viHistoryModel';

interface ComparisonRuntimePanelDetail {
  label: string;
  value: string;
}

export function createOpenViHistoryCommand(
  historyService: ViHistoryService,
  eligibilityIndexer: ViEligibilityIndexer,
  gitApi: GitApi | undefined,
  panelTracker?: HistoryPanelTracker,
  comparisonReportAction?: (request: {
    model: Awaited<ReturnType<ViHistoryService['load']>>;
    selectedHash: string;
    baseHash?: string;
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
    baseHash?: string;
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
  }) => Promise<DocumentationActionResult>,
  humanReviewSubmissionAction?: (request: {
    model: Awaited<ReturnType<ViHistoryService['load']>>;
    source: 'history-panel';
    draftOutcome?: string;
    draftConfidence?: string;
    draftNote?: string;
  }) => Promise<HumanReviewSubmissionActionResult>,
  openBenchmarkStatusAction?: (request: {
    authorityRepoRoot: string;
  }) => Promise<BenchmarkStatusActionResult>
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

    const loadedModel = await historyService.load(targetUri);
    if (!loadedModel.eligible) {
      void vscode.window.showInformationMessage(
        'The selected file is not currently eligible for VI History.'
      );
      return;
    }
    const isComparisonReportCapableVi =
      loadedModel.signature === 'LVIN' || loadedModel.signature === 'LVCC';
    const repositorySupport = loadedModel.repositorySupport;
    const coreReviewActionsAllowed =
      repositorySupport?.allowCoreReviewActions ?? true;
    const decisionRecordActionsAllowed =
      repositorySupport?.allowDecisionRecordActions ?? true;
    const benchmarkStatusAllowed =
      repositorySupport?.allowBenchmarkStatus ?? true;
    const humanReviewSubmissionAllowed =
      repositorySupport?.allowHumanReviewSubmission ?? true;
    const surfaceCapabilities = {
      comparisonGenerationAvailable:
        coreReviewActionsAllowed &&
        isComparisonReportCapableVi &&
        comparisonReportAction !== undefined,
      retainedComparisonOpenAvailable:
        coreReviewActionsAllowed &&
        isComparisonReportCapableVi &&
        openRetainedComparisonReportAction !== undefined,
      dashboardAvailable:
        coreReviewActionsAllowed && multiReportDashboardAction !== undefined,
      decisionRecordAvailable:
        decisionRecordActionsAllowed &&
        reviewDecisionRecordAction !== undefined,
      documentationAvailable: openDocumentationAction !== undefined,
      benchmarkStatusAvailable:
        benchmarkStatusAllowed && openBenchmarkStatusAction !== undefined,
      humanReviewSubmissionAvailable:
        humanReviewSubmissionAllowed &&
        humanReviewSubmissionAction !== undefined
    };
    let model = await hydrateRetainedComparisonEvidenceAvailability(
      {
        ...loadedModel,
        surfaceCapabilities
      },
      hasRetainedComparisonReport
    );
    if (repositorySupport?.tier === 'unsupported') {
      void vscode.window.showWarningMessage(repositorySupport.supportGuidance);
    }
    const renderedHtml = renderHistoryPanelHtml(
      model,
      panelTracker?.getLastActionSummary()
    );
    const panel = vscode.window.createWebviewPanel(
      'viHistorySuite.history',
      `VI History: ${path.basename(targetUri.fsPath)}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true
      }
    );

    let panelDisposed = false;
    panel.onDidDispose(() => {
      panelDisposed = true;
    });
    const safeUpdatePanelHtml = (html: string): void => {
      if (panelDisposed) {
        return;
      }
      try {
        panel.webview.html = html;
      } catch {
        panelDisposed = true;
      }
    };
    const safePostPanelMessage = async (message: unknown): Promise<void> => {
      if (panelDisposed) {
        return;
      }
      try {
        await panel.webview.postMessage(message);
      } catch {
        panelDisposed = true;
      }
    };

    safeUpdatePanelHtml(renderedHtml);
    const handleMessage = async (message: HistoryPanelMessage) => {
      const command = String(message.command ?? '');
      const hash = String(message.hash ?? '');
      const selectedHashes = Array.isArray(message.selectedHashes)
        ? message.selectedHashes
            .map((value) => String(value).trim())
            .filter((value) => value.length > 0)
        : [];
      const recordComparisonResult = (
        actionCommand: string,
        hashValue: string,
        baseHashValue: string | undefined,
        result: ComparisonReportActionResult,
        runtimePanelUpdate:
          | {
              type: 'comparisonRuntimeResult';
              status: 'idle' | 'blocked' | 'failed' | 'succeeded' | 'cancelled';
              summary: string;
              nextAction: string;
              details: ComparisonRuntimePanelDetail[];
            }
          | undefined
      ): void => {
        const actionSummary: Parameters<HistoryPanelTracker['recordAction']>[0] = {
          command: actionCommand,
          hash: hashValue,
          baseHash: baseHashValue,
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
        if (runtimePanelUpdate && result.runtimeDoctorSummaryLines?.length) {
          actionSummary.comparisonRuntimePanelStatus = runtimePanelUpdate.status;
          actionSummary.comparisonRuntimePanelSummary = runtimePanelUpdate.summary;
          actionSummary.comparisonRuntimePanelNextAction =
            runtimePanelUpdate.nextAction;
          actionSummary.comparisonRuntimePanelDetails =
            runtimePanelUpdate.details;
        }
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
            baseHash?: string;
            reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
            cancellationToken?: vscode.CancellationToken;
          }) => Promise<ComparisonReportActionResult>)
          | undefined,
          explicitPair?: {
            selectedHash: string;
            baseHash?: string;
          }
      ): Promise<void> => {
        const selectedHash = explicitPair?.selectedHash ?? hash;
        const baseHash = explicitPair?.baseHash;
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
              selectedHash,
              baseHash,
              reportProgress: async (update) => {
                reportProgress(update);
                const runtimeProgressUpdate = buildComparisonRuntimeProgressPanelUpdate(
                  actionCommand,
                  selectedHash,
                  baseHash,
                  model,
                  update
                );
                if (runtimeProgressUpdate) {
                  void safePostPanelMessage(runtimeProgressUpdate);
                }
              },
              cancellationToken
            })
        );
        const runtimePanelUpdate = buildComparisonRuntimePanelUpdate(
          actionCommand,
          selectedHash,
          baseHash,
          model,
          result
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
            'No retained VI Comparison Report exists for this pair yet. Use the commit checkboxes to generate retained evidence for it.'
          );
        } else if (result.outcome === 'invalid-retained-comparison-report') {
          void vscode.window.showInformationMessage(
            'Retained VI Comparison evidence for this pair is stale or invalid. Use the commit checkboxes to rebuild retained evidence for it.'
          );
        }
        const runtimeWarningMessage = buildComparisonRuntimeWarningMessage(
          actionCommand,
          result
        );
        if (runtimeWarningMessage) {
          void vscode.window.showWarningMessage(runtimeWarningMessage);
        }
        const runtimeInformationMessage = buildComparisonRuntimeInformationMessage(
          actionCommand,
          result
        );
        if (runtimeInformationMessage) {
          void vscode.window.showInformationMessage(runtimeInformationMessage);
        }

        if (
          actionCommand === 'generateComparisonReport' &&
          (result.outcome === 'opened-comparison-report' ||
            result.outcome === 'retained-comparison-report-evidence')
        ) {
          if (result.retainedArchiveAvailable === false) {
            void vscode.window.showInformationMessage(
              'VI Comparison Report opened, but retained pair evidence was not archived for later reuse. Use the commit checkboxes to rebuild retained evidence for this pair if it is not yet reviewable.'
            );
          } else {
            const selectedCommit = model.commits.find((commit) => commit.hash === selectedHash);
            if (selectedCommit && (!baseHash || selectedCommit.previousHash === baseHash)) {
              selectedCommit.retainedComparisonEvidenceAvailable = true;
              safeUpdatePanelHtml(renderHistoryPanelHtml(
                model,
                panelTracker?.getLastActionSummary()
              ));
            }
          }
        }

        recordComparisonResult(
          actionCommand,
          selectedHash,
          baseHash,
          result,
          runtimePanelUpdate
        );
        if (runtimePanelUpdate) {
          void safePostPanelMessage(runtimePanelUpdate);
        }
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

      if (command === 'openBenchmarkStatus') {
        if (!openBenchmarkStatusAction) {
          void vscode.window.showInformationMessage(
            'Benchmark status is only available on the canonical Windows 11 host machine.'
          );
          panelTracker?.recordAction({
            command,
            outcome: 'unsupported-command'
          });
          return;
        }

        const result = await openBenchmarkStatusAction({
          authorityRepoRoot: model.repositoryRoot
        });
        panelTracker?.recordAction({
          command,
          outcome: 'opened-benchmark-status',
          title: result.title,
          benchmarkWindowsLatestRunPath: result.windowsLatestRunPath,
          benchmarkHostLaunchReceiptPath: result.hostLaunchReceiptPath,
          benchmarkHostLatestSummaryPath: result.hostLatestSummaryPath,
          benchmarkHostLogPath: result.hostLogPath,
          benchmarkHostState: result.hostState
        });
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
        if (result.outcome === 'opened-review-dashboard') {
          model = await hydrateRetainedComparisonEvidenceAvailability(
            model,
            hasRetainedComparisonReport
          );
          panel.webview.html = renderHistoryPanelHtml(
            model,
            panelTracker?.getLastActionSummary()
          );
        }
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

      if (command === 'submitHumanReview') {
        if (!humanReviewSubmissionAction) {
          void safePostPanelMessage({
            type: 'humanReviewSubmissionResult',
            status: 'blocked',
            message:
              'Blocked: host-machine review submission is not available in this extension build.'
          });
          void vscode.window.showInformationMessage(
            'Host-machine human review submission is not available in this extension build.'
          );
          panelTracker?.recordAction({
            command,
            outcome: 'unsupported-command'
          });
          return;
        }

        let result;
        try {
          result = await humanReviewSubmissionAction({
            model,
            source: 'history-panel',
            draftOutcome: message.reviewOutcome,
            draftConfidence: message.reviewConfidence,
            draftNote: message.reviewNote
          });
        } catch {
          const humanReviewSubmissionStatusMessage =
            'Host review submission failed before the retained artifact could be written. Retry after confirming the workspace is local and deterministic.';
          void vscode.window.showErrorMessage(humanReviewSubmissionStatusMessage);
          void safePostPanelMessage({
            type: 'humanReviewSubmissionResult',
            status: 'blocked',
            message: humanReviewSubmissionStatusMessage
          });
          panelTracker?.recordAction({
            command,
            outcome: 'failed-human-review-submission'
          });
          return;
        }
        let humanReviewSubmissionStatusMessage =
          'Host review submission did not complete.';
        if (result.outcome === 'submitted-human-review') {
          humanReviewSubmissionStatusMessage =
            'Host review submitted and retained in latest-human-review-submission.json.';
          void vscode.window.showInformationMessage(
            'Host-machine review submitted and retained. Future sessions can consume the retained latest-review manifest automatically.'
          );
        } else if (result.outcome === 'workspace-untrusted') {
          humanReviewSubmissionStatusMessage =
            'Blocked: host-machine review submission is disabled in untrusted workspaces.';
          void vscode.window.showWarningMessage(
            'Host-machine review submission is disabled in untrusted workspaces.'
          );
        } else if (result.outcome === 'missing-storage-uri') {
          humanReviewSubmissionStatusMessage =
            'Blocked: open the repository as a workspace before submitting the host review.';
          void vscode.window.showWarningMessage(
            'Host-machine review submission requires an open workspace so review artifacts can be stored under workspace-scoped extension storage.'
          );
        } else if (result.outcome === 'canonical-machine-mismatch') {
          humanReviewSubmissionStatusMessage =
            'Blocked: this machine is not the canonical Windows 11 host allowed to submit the maintainer review.';
          void vscode.window.showWarningMessage(
            'This review submission was blocked because the current machine fingerprint does not match the canonical Windows 11 review host.'
          );
        } else if (result.outcome === 'nondeterministic-review-surface') {
          humanReviewSubmissionStatusMessage =
            result.validationMessage ??
            'Blocked: host-machine review submission requires the deterministic local fixture workspace instead of a OneDrive-backed path.';
          void vscode.window.showWarningMessage(humanReviewSubmissionStatusMessage);
        } else if (result.validationMessage) {
          humanReviewSubmissionStatusMessage = result.validationMessage;
          void vscode.window.showInformationMessage(result.validationMessage);
        }
        void safePostPanelMessage({
          type: 'humanReviewSubmissionResult',
          status:
            result.outcome === 'submitted-human-review'
              ? 'success'
              : result.outcome === 'invalid-human-review-submission'
                ? 'validation'
                : 'blocked',
          message: humanReviewSubmissionStatusMessage
        });

        panelTracker?.recordAction({
          command,
          outcome:
            result.outcome === 'submitted-human-review'
              ? 'submitted-human-review'
              : result.outcome === 'workspace-untrusted'
                ? 'workspace-untrusted'
              : result.outcome === 'missing-storage-uri'
                ? 'missing-human-review-storage'
              : result.outcome === 'canonical-machine-mismatch'
                ? 'canonical-machine-mismatch'
                : result.outcome === 'nondeterministic-review-surface'
                  ? 'nondeterministic-human-review-surface'
                : 'invalid-human-review-submission',
          humanReviewSubmissionFilePath: result.submissionFilePath,
          humanReviewLatestManifestPath: result.latestSubmissionFilePath,
          humanReviewCanonicalMachineFilePath: result.canonicalHostMachineFilePath,
          humanReviewMachineFingerprintId: result.machineFingerprintId,
          humanReviewCanonicalMachineFingerprintId:
            result.canonicalMachineFingerprintId,
          humanReviewValidationMessage: result.validationMessage
        });
        return;
      }

      if (command === 'generateComparisonReportFromSelection') {
        const explicitPair = resolveExplicitComparisonPair(model, selectedHashes);
        if (!explicitPair) {
          void vscode.window.showInformationMessage(
            'Select two distinct retained revisions to generate a comparison report.'
          );
          panelTracker?.recordAction({
            command,
            outcome: 'ignored-missing-hash'
          });
          return;
        }

        await runComparisonReportCommand(
          command,
          'Generating VI Comparison Report',
          'VI History comparison report generation was cancelled. Retained comparison-report artifacts, if any, were preserved.',
          comparisonReportAction,
          explicitPair
        );
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

async function hydrateRetainedComparisonEvidenceAvailability(
  model: ViHistoryViewModel,
  hasRetainedComparisonReport:
    | ((
        request: {
          model: Awaited<ReturnType<ViHistoryService['load']>>;
          selectedHash: string;
          baseHash: string;
        }
      ) => Promise<boolean>)
    | undefined
): Promise<ViHistoryViewModel> {
  if (!hasRetainedComparisonReport) {
    return model;
  }

  return {
    ...model,
    commits: await Promise.all(
      model.commits.map(async (commit) => ({
        ...commit,
        retainedComparisonEvidenceAvailable: commit.previousHash
          ? await hasRetainedComparisonReport({
              model,
              selectedHash: commit.hash,
              baseHash: commit.previousHash
            })
          : false
      }))
    )
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

function buildComparisonRuntimePanelUpdate(
  actionCommand: string,
  selectedHash: string,
  baseHash: string | undefined,
  model: Awaited<ReturnType<ViHistoryService['load']>>,
  result: ComparisonReportActionResult
):
  | {
      type: 'comparisonRuntimeResult';
      status: 'idle' | 'blocked' | 'failed' | 'succeeded' | 'cancelled';
      summary: string;
      nextAction: string;
      details: ComparisonRuntimePanelDetail[];
    }
  | undefined {
  if (
    result.reportStatus === undefined &&
    result.runtimeExecutionState === undefined &&
    result.runtimeDoctorSummaryLines === undefined
  ) {
    return undefined;
  }

  const selectedCommit = model.commits.find((commit) => commit.hash === selectedHash);
  const effectiveBaseHash = baseHash ?? selectedCommit?.previousHash;
  const pairLabel = effectiveBaseHash
    ? `${selectedHash.slice(0, 8)} vs ${effectiveBaseHash.slice(0, 8)}`
    : selectedHash.slice(0, 8);
  const commandLabel = deriveComparisonCommandLabel(actionCommand);
  const runtimeProvider = deriveRuntimeProviderFromDoctorSummary(
    result.runtimeDoctorSummaryLines
  );
  const executionMode = deriveRuntimeExecutionModeFromDoctorSummary(
    result.runtimeDoctorSummaryLines
  );
  const acquisitionState = deriveWindowsContainerAcquisitionStateFromDoctorSummary(
    result.runtimeDoctorSummaryLines
  );
  const rejectedProviderSummary = deriveRejectedProviderSummaryFromDoctorSummary(
    result.runtimeDoctorSummaryLines
  );
  const segments = [
    `${commandLabel} for ${pairLabel}.`,
    `Provider: ${runtimeProvider ?? 'none'}.`,
    `Execution mode: ${executionMode ?? 'auto'}.`,
    `Report status: ${result.reportStatus ?? 'none'}.`,
    `Runtime state: ${result.runtimeExecutionState ?? 'none'}.`
  ];

  if (acquisitionState) {
    segments.push(`Container image acquisition: ${acquisitionState}.`);
  }
  if (rejectedProviderSummary) {
    segments.push(`Rejected providers: ${rejectedProviderSummary}.`);
  }
  if (result.blockedReason) {
    segments.push(`Blocked reason: ${result.blockedReason}.`);
  }
  if (result.runtimeFailureReason) {
    segments.push(`Failure reason: ${result.runtimeFailureReason}.`);
  }
  if (result.runtimeDiagnosticReason) {
    segments.push(`Diagnostic reason: ${result.runtimeDiagnosticReason}.`);
  }

  const details = buildComparisonRuntimePanelDetails(
    result,
    runtimeProvider,
    executionMode,
    acquisitionState,
    rejectedProviderSummary
  );

  return {
    type: 'comparisonRuntimeResult',
    status: deriveComparisonRuntimePanelStatus(result),
    summary: segments.join(' '),
    nextAction:
      deriveComparisonRuntimeNextAction(result.runtimeDoctorSummaryLines) ??
      'Next action: open the retained comparison packet for the full governed runtime summary.',
    details
  };
}

function buildComparisonRuntimeProgressPanelUpdate(
  actionCommand: string,
  selectedHash: string,
  baseHash: string | undefined,
  model: Awaited<ReturnType<ViHistoryService['load']>>,
  update: { message: string; increment?: number }
):
  | {
      type: 'comparisonRuntimeProgress';
      status: 'running' | 'acquiring';
      summary: string;
      nextAction: string;
      details: ComparisonRuntimePanelDetail[];
    }
  | undefined {
  const status = deriveComparisonRuntimeProgressStatus(update.message);
  if (!status) {
    return undefined;
  }

  const selectedCommit = model.commits.find((commit) => commit.hash === selectedHash);
  const effectiveBaseHash = baseHash ?? selectedCommit?.previousHash;
  const pairLabel = effectiveBaseHash
    ? `${selectedHash.slice(0, 8)} vs ${effectiveBaseHash.slice(0, 8)}`
    : selectedHash.slice(0, 8);
  const commandLabel = deriveComparisonCommandLabel(actionCommand);
  return {
    type: 'comparisonRuntimeProgress',
    status,
    summary: `${commandLabel} for ${pairLabel} in progress. ${stripTerminalPunctuation(update.message)}.`,
    nextAction:
      'Next action: wait for comparison report generation to finish or cancel from the VS Code progress notification if you need to stop this run.',
    details: []
  };
}

function buildComparisonRuntimeWarningMessage(
  actionCommand: string,
  result: ComparisonReportActionResult
): string | undefined {
  if (!result.runtimeDoctorSummaryLines?.length) {
    return undefined;
  }

  const status = deriveComparisonRuntimePanelStatus(result);
  if (status !== 'blocked' && status !== 'failed') {
    return undefined;
  }

  const commandLabel = deriveComparisonCommandLabel(actionCommand);
  const runtimeProvider = deriveRuntimeProviderFromDoctorSummary(
    result.runtimeDoctorSummaryLines
  );
  const executionMode = deriveRuntimeExecutionModeFromDoctorSummary(
    result.runtimeDoctorSummaryLines
  );
  const acquisitionState = deriveWindowsContainerAcquisitionStateFromDoctorSummary(
    result.runtimeDoctorSummaryLines
  );
  const rejectedProviderSummary = deriveRejectedProviderSummaryFromDoctorSummary(
    result.runtimeDoctorSummaryLines
  );
  const segments = [
    status === 'blocked'
      ? `${commandLabel} blocked.`
      : `${commandLabel} runtime failed.`
  ];

  if (runtimeProvider) {
    segments.push(`Provider: ${runtimeProvider}.`);
  }
  if (executionMode) {
    segments.push(`Execution mode: ${executionMode}.`);
  }
  if (acquisitionState) {
    segments.push(`Container image acquisition: ${acquisitionState}.`);
  }
  if (rejectedProviderSummary) {
    segments.push(`Rejected providers: ${rejectedProviderSummary}.`);
  }
  if (result.blockedReason) {
    segments.push(`Blocked reason: ${result.blockedReason}.`);
  }
  if (result.runtimeFailureReason) {
    segments.push(`Failure reason: ${result.runtimeFailureReason}.`);
  }
  if (result.runtimeDiagnosticReason) {
    segments.push(`Diagnostic reason: ${result.runtimeDiagnosticReason}.`);
  }

  const nextAction = deriveComparisonRuntimeNextAction(
    result.runtimeDoctorSummaryLines
  );
  if (nextAction) {
    segments.push(nextAction);
  }

  return segments.join(' ');
}

function buildComparisonRuntimeInformationMessage(
  actionCommand: string,
  result: ComparisonReportActionResult
): string | undefined {
  if (!result.runtimeDoctorSummaryLines?.length) {
    return undefined;
  }

  if (result.retainedArchiveAvailable === false) {
    return undefined;
  }

  const status = deriveComparisonRuntimePanelStatus(result);
  if (status !== 'succeeded') {
    return undefined;
  }

  const commandLabel = deriveComparisonCommandLabel(actionCommand);
  const runtimeProvider = deriveRuntimeProviderFromDoctorSummary(
    result.runtimeDoctorSummaryLines
  );
  const executionMode = deriveRuntimeExecutionModeFromDoctorSummary(
    result.runtimeDoctorSummaryLines
  );
  const acquisitionState = deriveWindowsContainerAcquisitionStateFromDoctorSummary(
    result.runtimeDoctorSummaryLines
  );
  const rejectedProviderSummary = deriveRejectedProviderSummaryFromDoctorSummary(
    result.runtimeDoctorSummaryLines
  );
  const segments = [`${commandLabel} completed.`];

  if (runtimeProvider) {
    segments.push(`Provider: ${runtimeProvider}.`);
  }
  if (executionMode) {
    segments.push(`Execution mode: ${executionMode}.`);
  }
  if (acquisitionState) {
    segments.push(`Container image acquisition: ${acquisitionState}.`);
  }
  if (rejectedProviderSummary) {
    segments.push(`Rejected providers: ${rejectedProviderSummary}.`);
  }

  return segments.join(' ');
}

function deriveComparisonRuntimePanelStatus(
  result: ComparisonReportActionResult
): 'idle' | 'blocked' | 'failed' | 'succeeded' | 'cancelled' {
  if (result.outcome === 'cancelled') {
    return 'cancelled';
  }

  if (
    result.reportStatus === 'blocked-preflight' ||
    result.reportStatus === 'blocked-runtime' ||
    result.runtimeExecutionState === 'not-available'
  ) {
    return 'blocked';
  }

  if (result.runtimeExecutionState === 'failed') {
    return 'failed';
  }

  if (result.runtimeExecutionState === 'succeeded') {
    return 'succeeded';
  }

  return 'idle';
}

function deriveComparisonRuntimeProgressStatus(
  message: string
): 'running' | 'acquiring' | undefined {
  if (
    message.startsWith('Acquiring governed container image ') ||
    message.startsWith('Pulling governed container image:') ||
    message.startsWith('Governed container image ready:')
  ) {
    return 'acquiring';
  }

  if (
    message === 'Selecting comparison-report runtime.' ||
    message === 'Persisting governed comparison-report packet.' ||
    message === 'Executing LabVIEW comparison-report runtime.' ||
    message === 'Archiving comparison-report evidence.'
  ) {
    return 'running';
  }

  return undefined;
}

function deriveComparisonCommandLabel(actionCommand: string): string {
  if (actionCommand === 'diffPrevious') {
    return 'Open compare';
  }
  if (actionCommand === 'generateComparisonReportFromSelection') {
    return 'Selected compare';
  }
  return 'Generate compare';
}

function resolveExplicitComparisonPair(
  model: ViHistoryViewModel,
  selectedHashes: string[]
): { selectedHash: string; baseHash: string } | undefined {
  const uniqueHashes = [...new Set(selectedHashes)];
  if (uniqueHashes.length !== 2) {
    return undefined;
  }

  const rankedCommits = uniqueHashes
    .map((candidateHash) => ({
      hash: candidateHash,
      index: model.commits.findIndex((commit) => commit.hash === candidateHash)
    }))
    .filter((candidate) => candidate.index >= 0)
    .sort((left, right) => left.index - right.index);

  if (rankedCommits.length !== 2) {
    return undefined;
  }

  return {
    selectedHash: rankedCommits[0].hash,
    baseHash: rankedCommits[1].hash
  };
}

function deriveComparisonRuntimeNextAction(
  summaryLines: string[] | undefined
): string | undefined {
  return summaryLines?.find((line) => line.startsWith('Next action:'));
}

function deriveRuntimeProviderFromDoctorSummary(
  summaryLines: string[] | undefined
): string | undefined {
  const selectedProviderLine = summaryLines?.find((line) =>
    line.startsWith('Selected provider=')
  );
  if (!selectedProviderLine) {
    return undefined;
  }

  const match = selectedProviderLine.match(/^Selected provider=([^;]+);/);
  return match?.[1];
}

function deriveRuntimeExecutionModeFromDoctorSummary(
  summaryLines: string[] | undefined
): string | undefined {
  const executionModeLine = summaryLines?.find((line) =>
    line.startsWith('Selected execution mode=')
  );
  if (!executionModeLine) {
    return undefined;
  }

  const match = executionModeLine.match(/^Selected execution mode=([^.;]+)[.;]?$/);
  return match?.[1];
}

function deriveWindowsContainerAcquisitionStateFromDoctorSummary(
  summaryLines: string[] | undefined
): string | undefined {
  const toolFactsLine = summaryLines?.find((line) => line.startsWith('Tool facts:'));
  if (!toolFactsLine) {
    return undefined;
  }

  const match = toolFactsLine.match(/ContainerAcquisitionState=([^;]+)/);
  return match?.[1];
}

function stripTerminalPunctuation(value: string): string {
  return value.replace(/[.!?]+$/u, '');
}

function deriveRejectedProviderSummaryFromDoctorSummary(
  summaryLines: string[] | undefined
): string | undefined {
  const rejectedProviderDetails = summaryLines
    ?.filter((line) => line.startsWith('Provider decision: rejected '))
    .map((line) => {
      const match = line.match(/^Provider decision: rejected ([^ ]+) because (.+)\.$/);
      if (!match) {
        return undefined;
      }

      const [, provider, reason] = match;
      return `${provider} because ${reason}`;
    })
    .filter((value): value is string => Boolean(value));

  if (!rejectedProviderDetails?.length) {
    return undefined;
  }

  return rejectedProviderDetails.join(' | ');
}

function buildComparisonRuntimePanelDetails(
  result: ComparisonReportActionResult,
  runtimeProvider: string | undefined,
  executionMode: string | undefined,
  acquisitionState: string | undefined,
  rejectedProviderSummary: string | undefined
): ComparisonRuntimePanelDetail[] {
  const details: ComparisonRuntimePanelDetail[] = [
    {
      label: 'Provider',
      value: runtimeProvider ?? 'none'
    },
    {
      label: 'Execution mode',
      value: executionMode ?? 'auto'
    },
    {
      label: 'Report status',
      value: result.reportStatus ?? 'none'
    },
    {
      label: 'Runtime state',
      value: result.runtimeExecutionState ?? 'none'
    }
  ];

  if (acquisitionState) {
    details.push({
      label: 'Container image acquisition',
      value: acquisitionState
    });
  }

  if (rejectedProviderSummary) {
    details.push({
      label: 'Rejected providers',
      value: rejectedProviderSummary
    });
  }

  if (result.blockedReason) {
    details.push({
      label: 'Blocked reason',
      value: result.blockedReason
    });
  }

  if (result.runtimeFailureReason) {
    details.push({
      label: 'Failure reason',
      value: result.runtimeFailureReason
    });
  }

  if (result.runtimeDiagnosticReason) {
    details.push({
      label: 'Diagnostic reason',
      value: result.runtimeDiagnosticReason
    });
  }

  return details;
}
