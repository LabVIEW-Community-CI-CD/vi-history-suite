import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { readArchivedComparisonReportSourceRecordFromSelection } from './comparisonReportArchive';
import {
  buildDashboardPairEtaAccuracyRecord,
  buildDashboardPairProgressPrefix,
  buildPairEtaAccuracySample,
  DASHBOARD_PAIR_ETA_ACCURACY_FILENAME,
  deriveEstimatedPairSeconds,
  formatEstimatedDuration,
  isDashboardPairEtaEligible,
  MultiReportDashboardEtaAccuracyRecord,
  MultiReportDashboardEtaAccuracySample
} from './dashboardEtaAccuracy';
import {
  attachDashboardEtaAccuracyContext,
  buildDashboardLatestRunFilePath,
  buildDashboardLatestRunRecord,
  MultiReportDashboardLatestRunExperimentRecord,
  MultiReportDashboardLatestRunProgressEvent
} from './dashboardLatestRun';
import {
  buildAndPersistMultiReportDashboard,
  BuildMultiReportDashboardResult,
  MultiReportDashboardPreparationSummary,
  renderMultiReportDashboardHtml
} from './multiReportDashboard';
import {
  seedRetainedDashboardEvidence,
  SeedRetainedDashboardEvidenceDeps,
  SeedRetainedDashboardEvidenceResult
} from './retainedDashboardEvidence';
import { getFileHistoryCount } from '../git/gitCli';
import { ComparisonReportActionResult } from '../reporting/comparisonReportAction';
import { readComparisonRuntimeSettings } from '../reporting/comparisonReportAction';
import { ViHistoryViewModel } from '../services/viHistoryModel';
import { getViHistoryServiceSettings } from '../services/viHistoryService';
import { HistoryPanelTracker } from '../ui/historyPanelTracker';

export interface MultiReportDashboardActionRequest {
  model: ViHistoryViewModel;
  reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
  cancellationToken?: vscode.CancellationToken;
}

export interface MultiReportDashboardActionResult {
  outcome:
    | 'opened-review-dashboard'
    | 'cancelled'
    | 'workspace-untrusted'
    | 'missing-storage-uri'
    | 'insufficient-commits';
  cancellationStage?: string;
  dashboardFilePath?: string;
  dashboardJsonFilePath?: string;
  dashboardPairCount?: number;
  dashboardArchivedPairCount?: number;
  dashboardMissingPairCount?: number;
  title?: string;
}

export interface MultiReportDashboardActionDeps {
  buildDashboard?: (
    storageRoot: string,
    model: ViHistoryViewModel,
    options?: {
      reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
      pairConcentrationIncrementTotal?: number;
      assetIncrementTotal?: number;
    }
  ) => Promise<BuildMultiReportDashboardResult>;
  createWebviewPanel?: typeof vscode.window.createWebviewPanel;
  executeCommand?: typeof vscode.commands.executeCommand;
  uriFile?: typeof vscode.Uri.file;
  ensureComparisonReportEvidence?: (request: {
    model: ViHistoryViewModel;
    selectedHash: string;
    headlessRequested?: boolean;
    reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
    cancellationToken?: vscode.CancellationToken;
  }) => Promise<ComparisonReportActionResult>;
  readArchivedComparisonReportSourceRecord?: typeof readArchivedComparisonReportSourceRecordFromSelection;
  seedRetainedDashboardEvidence?: (
    storageRoot: string,
    model: ViHistoryViewModel
  ) => Promise<SeedRetainedDashboardEvidenceResult>;
  pathExists?: (targetPath: string) => Promise<boolean>;
  readFile?: typeof fs.readFile;
  writeFile?: typeof fs.writeFile;
  now?: () => number;
  getHistoryServiceSettings?: typeof getViHistoryServiceSettings;
  getRuntimeSettings?: typeof readComparisonRuntimeSettings;
  getFileHistoryCount?: typeof getFileHistoryCount;
}

interface DashboardPairEvidenceCandidate {
  selectedHash: string;
  baseHash: string;
  reason: 'missing-archive' | 'missing-generated-report' | 'missing-report-file';
}

type PreparedDashboardPairOutcome =
  | 'generated-report'
  | 'blocked'
  | 'failed'
  | 'no-generated-report'
  | 'missing-retained-archive';

const DASHBOARD_PAIR_EVIDENCE_INCREMENT_TOTAL = 40;
const DASHBOARD_PAIR_CONCENTRATION_INCREMENT_TOTAL = 30;
const DEFAULT_DASHBOARD_PAIR_CONCENTRATION_INCREMENT_TOTAL = 70;
const DASHBOARD_ASSET_INCREMENT_TOTAL = 10;
const DASHBOARD_OPEN_INCREMENT = 15;
const EXPECTED_COMPARISON_EVIDENCE_INCREMENT_TOTAL = 95;
const DASHBOARD_PAIR_KEEPALIVE_INTERVAL_MS = 15000;
export function createMultiReportDashboardAction(
  context: vscode.ExtensionContext,
  deps: MultiReportDashboardActionDeps = {},
  panelTracker?: HistoryPanelTracker
): (request: MultiReportDashboardActionRequest) => Promise<MultiReportDashboardActionResult> {
  return async (request) => {
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-dashboard-build'
      };
    }

    if (!vscode.workspace.isTrusted) {
      return { outcome: 'workspace-untrusted' };
    }

    if (!context.storageUri) {
      return { outcome: 'missing-storage-uri' };
    }
    const storageUri = context.storageUri;

    if (request.model.commits.length < 3) {
      return { outcome: 'insufficient-commits' };
    }

    const buildDashboard = deps.buildDashboard ?? buildAndPersistMultiReportDashboard;
    const seedRetainedDashboardEvidenceAction =
      deps.seedRetainedDashboardEvidence ??
      ((storageRoot: string, model: ViHistoryViewModel) =>
        seedRetainedDashboardEvidence(storageRoot, model, {
          readFile,
          writeFile,
          pathExists
        } satisfies SeedRetainedDashboardEvidenceDeps));
    const ensureComparisonReportEvidence = deps.ensureComparisonReportEvidence;
    const pathExists = deps.pathExists ?? defaultPathExists;
    const readFile = deps.readFile ?? fs.readFile;
    const writeFile = deps.writeFile ?? fs.writeFile;
    const now = deps.now ?? Date.now;
    const actionStartMs = now();
    const progressEvents: MultiReportDashboardLatestRunProgressEvent[] = [];
    const reportProgress = async (update: { message: string; increment?: number }): Promise<void> => {
      progressEvents.push({
        offsetMs: Math.max(0, now() - actionStartMs),
        message: update.message,
        increment: update.increment
      });
      await request.reportProgress?.(update);
    };
    const historyServiceSettings =
      deps.getHistoryServiceSettings?.() ?? safeGetHistoryServiceSettings();
    const runtimeSettings =
      deps.getRuntimeSettings?.() ?? safeReadComparisonRuntimeSettings();
    const modelHistoryWindow = request.model.historyWindow;
    const shouldAttemptRetainedSeed = Boolean(request.model.repositorySupport?.familyId);
    let totalCommitCount: number | undefined = modelHistoryWindow?.totalCommitCount;
    const fileHistoryCountProbe = deps.getFileHistoryCount;
    if (totalCommitCount === undefined && fileHistoryCountProbe) {
      try {
        totalCommitCount = await fileHistoryCountProbe(
          request.model.repositoryRoot,
          request.model.relativePath
        );
      } catch {
        totalCommitCount = undefined;
      }
    }
    let seededEvidence: SeedRetainedDashboardEvidenceResult = {
      importedPairCount: 0,
      importedGeneratedPairCount: 0,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 0,
      candidateCount: 0
    };
    if (shouldAttemptRetainedSeed) {
      await reportProgress({
        message: 'Checking governed retained dashboard evidence.'
      });
      seededEvidence = await seedRetainedDashboardEvidenceAction(
        storageUri.fsPath,
        request.model
      );
    }
    if (seededEvidence.importedPairCount > 0) {
      const seededOutcomeParts: string[] = [];
      if (seededEvidence.importedGeneratedPairCount > 0) {
        seededOutcomeParts.push(
          `${seededEvidence.importedGeneratedPairCount} generated`
        );
      }
      if (seededEvidence.importedFailedPairCount > 0) {
        seededOutcomeParts.push(
          `${seededEvidence.importedFailedPairCount} failed`
        );
      }
      if (seededEvidence.importedBlockedPairCount > 0) {
        seededOutcomeParts.push(
          `${seededEvidence.importedBlockedPairCount} blocked`
        );
      }
      await reportProgress({
        message:
          `Seeded ${seededEvidence.importedPairCount} dashboard pair(s) from governed retained evidence` +
          `${seededOutcomeParts.length > 0 ? ` (${seededOutcomeParts.join(', ')})` : ''}.`
      });
    }
    const pairEvidenceScanStartMs = now();
    const pairsNeedingEvidence = await collectDashboardPairsNeedingEvidence(
      storageUri.fsPath,
      request.model,
      deps
    );
    const pairsNeedingEvidenceScanDurationMs = Math.max(0, now() - pairEvidenceScanStartMs);
    await reportProgress({
      message: 'Preparing VI Review Dashboard commit window.',
      increment: 5
    });
    let pairConcentrationIncrementTotal =
      DEFAULT_DASHBOARD_PAIR_CONCENTRATION_INCREMENT_TOTAL;
    let etaAccuracyRecord: MultiReportDashboardEtaAccuracyRecord | undefined;
    let preparationSummary: MultiReportDashboardPreparationSummary = {
      mode:
        seededEvidence.importedPairCount > 0
          ? 'seeded-retained-before-build'
          : 'retained-evidence-complete',
      pairsNeedingEvidenceCount: pairsNeedingEvidence.length,
      seededImportedPairCount: seededEvidence.importedPairCount,
      preparedPairCount: 0,
      preparedGeneratedReportCount: 0,
      preparedBlockedPairCount: 0,
      preparedFailedPairCount: 0,
      preparedNoGeneratedReportCount: 0,
      preparedMissingRetainedArchiveCount: 0
    };
    if (seededEvidence.importedPairCount > 0) {
      if (pairsNeedingEvidence.length === 0) {
        await reportProgress({
          message:
            'Concentrating governed retained dashboard evidence only; no local pair refresh is needed.'
        });
      } else {
        await reportProgress({
          message:
            `Concentrating governed retained dashboard evidence only; ${pairsNeedingEvidence.length} pair(s) remain missing in the retained set and will stay explicit in the dashboard.`
        });
      }
    } else if (pairsNeedingEvidence.length === 0) {
      await reportProgress({
        message:
          'All adjacent retained pairs already have retained comparison evidence. Concentrating retained dashboard metadata only.'
      });
    } else if (ensureComparisonReportEvidence) {
      await reportProgress({
        message: `Preparing ${pairsNeedingEvidence.length} dashboard pair(s) that still need retained comparison evidence.`
      });
    } else {
      preparationSummary = {
        mode: 'backfill-unavailable',
        pairsNeedingEvidenceCount: pairsNeedingEvidence.length,
        preparedPairCount: 0,
        preparedGeneratedReportCount: 0,
        preparedBlockedPairCount: 0,
        preparedFailedPairCount: 0,
        preparedNoGeneratedReportCount: 0,
        preparedMissingRetainedArchiveCount: 0
      };
      await reportProgress({
        message: `This build cannot refresh ${pairsNeedingEvidence.length} dashboard pair(s) from Open dashboard. Concentrating the currently retained archive set only.`
      });
    }
    const evidencePreparationStartMs = now();
    if (
      seededEvidence.importedPairCount === 0 &&
      pairsNeedingEvidence.length > 0 &&
      ensureComparisonReportEvidence
    ) {
      preparationSummary = {
        mode: 'backfilled-before-build',
        pairsNeedingEvidenceCount: pairsNeedingEvidence.length,
        preparedPairCount: 0,
        preparedGeneratedReportCount: 0,
        preparedBlockedPairCount: 0,
        preparedFailedPairCount: 0,
        preparedNoGeneratedReportCount: 0,
        preparedMissingRetainedArchiveCount: 0
      };
      pairConcentrationIncrementTotal = DASHBOARD_PAIR_CONCENTRATION_INCREMENT_TOTAL;
      const pairBudget =
        pairsNeedingEvidence.length > 0
          ? DASHBOARD_PAIR_EVIDENCE_INCREMENT_TOTAL / pairsNeedingEvidence.length
          : 0;
      const completedPairDurationsMs: number[] = [];
      let etaEligiblePairCount = 0;
      const etaAccuracySamples: MultiReportDashboardEtaAccuracySample[] = [];
      for (const [index, pair] of pairsNeedingEvidence.entries()) {
        if (request.cancellationToken?.isCancellationRequested) {
          return {
            outcome: 'cancelled',
            cancellationStage: 'during-dashboard-pair-generation'
          };
        }

        let remainingPairIncrement = pairBudget;
        const pairStartMs = now();
        const estimatedPairSeconds = deriveEstimatedPairSeconds(completedPairDurationsMs);
        const pairPrefix = buildDashboardPairProgressPrefix(
          index,
          pairsNeedingEvidence.length,
          completedPairDurationsMs
        );
        let lastPairStepMessage = 'Preparing retained comparison evidence.';
        const scaledPairProgress = async (update: {
          message: string;
          increment?: number;
        }): Promise<void> => {
          lastPairStepMessage = update.message;
          const scaledIncrement =
            typeof update.increment === 'number' && update.increment > 0
              ? Math.min(
                  remainingPairIncrement,
                  (update.increment / EXPECTED_COMPARISON_EVIDENCE_INCREMENT_TOTAL) *
                    pairBudget
                )
              : 0;
          remainingPairIncrement = Math.max(0, remainingPairIncrement - scaledIncrement);
          await reportProgress({
            message: `${pairPrefix}${update.message}`,
            increment: scaledIncrement > 0 ? scaledIncrement : undefined
          });
        };

        const keepaliveTimer = setInterval(() => {
          const elapsedMs = Math.max(0, now() - pairStartMs);
          void reportProgress({
            message: buildDashboardPairKeepaliveMessage(
              pairPrefix,
              completedPairDurationsMs.length === 0,
              lastPairStepMessage,
              elapsedMs
            )
          });
        }, DASHBOARD_PAIR_KEEPALIVE_INTERVAL_MS);
        keepaliveTimer.unref?.();

        let result: ComparisonReportActionResult;
        try {
          result = await ensureComparisonReportEvidence({
            model: request.model,
            selectedHash: pair.selectedHash,
            headlessRequested: true,
            reportProgress: scaledPairProgress,
            cancellationToken: request.cancellationToken
          });
        } finally {
          clearInterval(keepaliveTimer);
        }
        if (result.outcome === 'cancelled') {
          return {
            outcome: 'cancelled',
            cancellationStage: result.cancellationStage
              ? `during-dashboard-pair-generation:${result.cancellationStage}`
              : 'during-dashboard-pair-generation'
          };
        }
        if (result.outcome === 'workspace-untrusted' || result.outcome === 'missing-storage-uri') {
          return { outcome: result.outcome };
        }
        const pairDurationMs = Math.max(0, now() - pairStartMs);
        const etaEligible = isDashboardPairEtaEligible(result.generatedReportExists);
        if (etaEligible) {
          etaEligiblePairCount += 1;
          completedPairDurationsMs.push(pairDurationMs);
        }
        if (estimatedPairSeconds !== undefined && etaEligible) {
          etaAccuracySamples.push(
            buildPairEtaAccuracySample(
              index,
              pairsNeedingEvidence.length,
              estimatedPairSeconds,
              pairDurationMs,
              now
            )
          );
        }

        await reportProgress({
          message: buildDashboardPairPreparedMessage(
            index,
            pairsNeedingEvidence.length,
            pair,
            result
          ),
          increment: remainingPairIncrement > 0 ? remainingPairIncrement : undefined
        });
        preparationSummary.preparedPairCount = index + 1;
        applyPreparedDashboardPairOutcome(preparationSummary, result);
      }
      etaAccuracyRecord = buildDashboardPairEtaAccuracyRecord(
        pairsNeedingEvidence.length,
        etaEligiblePairCount,
        etaAccuracySamples,
        now
      );
    }
    const evidencePreparationDurationMs = Math.max(0, now() - evidencePreparationStartMs);
    const dashboardBuildStartMs = now();
    const dashboard = await buildDashboard(storageUri.fsPath, request.model, {
      reportProgress,
      pairConcentrationIncrementTotal,
      assetIncrementTotal: DASHBOARD_ASSET_INCREMENT_TOTAL
    });
    const dashboardBuildDurationMs = Math.max(0, now() - dashboardBuildStartMs);
    const dashboardDirectoryExists = await pathExists(
      dashboard.record.artifactPlan.dashboardDirectory
    );
    if (dashboardDirectoryExists) {
      const etaAccuracyFilePath = etaAccuracyRecord
        ? path.join(
            dashboard.record.artifactPlan.dashboardDirectory,
            DASHBOARD_PAIR_ETA_ACCURACY_FILENAME
          )
        : undefined;
      const etaAccuracyRecordWithContext = attachDashboardEtaAccuracyContext(
        etaAccuracyRecord,
        {
          source: 'vscode-dashboard-action',
          workspaceStorageRoot: storageUri.fsPath,
          repositoryName: dashboard.record.repositoryName,
          repositoryRoot: dashboard.record.repositoryRoot,
          relativePath: dashboard.record.relativePath,
          signature: dashboard.record.signature,
          dashboardGeneratedAt: dashboard.record.generatedAt,
          dashboardDirectory: dashboard.record.artifactPlan.dashboardDirectory,
          dashboardJsonFilePath: dashboard.jsonFilePath,
          dashboardHtmlFilePath: dashboard.htmlFilePath,
          etaAccuracyFilePath
        }
      );
      await writeFile(
        dashboard.htmlFilePath,
        renderMultiReportDashboardHtml(dashboard.record, {
          etaAccuracyRecord: etaAccuracyRecordWithContext,
          preparationSummary
        }),
        'utf8'
      );
      if (etaAccuracyRecordWithContext && etaAccuracyFilePath) {
        await writeFile(
          etaAccuracyFilePath,
          JSON.stringify(etaAccuracyRecordWithContext, null, 2),
          'utf8'
        );
      }
      const totalDurationMs = Math.max(0, now() - actionStartMs);
      const dashboardOpenDurationMs = 0;
      await writeFile(
        buildDashboardLatestRunFilePath(storageUri.fsPath),
        JSON.stringify(
          buildDashboardLatestRunRecord({
            source: 'vscode-dashboard-action',
            workspaceStorageRoot: storageUri.fsPath,
            dashboard,
            etaAccuracyRecord: etaAccuracyRecordWithContext,
            preparationSummary,
            experiment: buildDashboardLatestRunExperimentRecord({
              loadedCommitCount: request.model.commits.length,
              loadedPairCount: Math.max(0, request.model.commits.length - 1),
              historyWindowMode:
                modelHistoryWindow?.mode ?? historyServiceSettings.historyWindowMode,
              configuredMaxHistoryEntries:
                modelHistoryWindow?.configuredMaxEntries ??
                historyServiceSettings.maxHistoryEntries,
              effectiveHistoryEntryCeiling:
                modelHistoryWindow?.effectiveEntryCeiling ??
                historyServiceSettings.historyLimit,
              totalCommitCount,
              historyTruncated: modelHistoryWindow?.truncated,
              historyWindowDecision: modelHistoryWindow?.decision,
              strictRsrcHeader: historyServiceSettings.strictRsrcHeader,
              runtimeSettings,
              pairsNeedingEvidenceScanDurationMs,
              evidencePreparationDurationMs,
              dashboardBuildDurationMs,
              dashboardOpenDurationMs,
              totalDurationMs,
              progressEvents
            }),
            recordedAt: new Date(now()).toISOString()
          }),
          null,
          2
        ),
        'utf8'
      );
      etaAccuracyRecord = etaAccuracyRecordWithContext;
    }
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'after-dashboard-build',
        dashboardFilePath: dashboard.htmlFilePath,
        dashboardJsonFilePath: dashboard.jsonFilePath,
        dashboardPairCount: dashboard.record.commitWindow.pairCount,
        dashboardArchivedPairCount: dashboard.record.summary.archivedPairCount,
        dashboardMissingPairCount: dashboard.record.summary.missingPairCount
      };
    }
    const createWebviewPanel = deps.createWebviewPanel ?? vscode.window.createWebviewPanel;
    const executeCommand = deps.executeCommand ?? vscode.commands.executeCommand;
    const uriFile = deps.uriFile ?? vscode.Uri.file;
    const dashboardOpenStartMs = now();
    await reportProgress({
      message: 'Opening VI Review Dashboard.',
      increment: DASHBOARD_OPEN_INCREMENT
    });
    if (request.cancellationToken?.isCancellationRequested) {
      return {
        outcome: 'cancelled',
        cancellationStage: 'before-dashboard-open',
        dashboardFilePath: dashboard.htmlFilePath,
        dashboardJsonFilePath: dashboard.jsonFilePath,
        dashboardPairCount: dashboard.record.commitWindow.pairCount,
        dashboardArchivedPairCount: dashboard.record.summary.archivedPairCount,
        dashboardMissingPairCount: dashboard.record.summary.missingPairCount
      };
    }
    const panel = createWebviewPanel(
      'viHistorySuite.reviewDashboard',
      `VI Review Dashboard: ${request.model.relativePath.split('/').pop() ?? request.model.relativePath}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [storageUri]
      }
    );
    const renderedHtml = renderMultiReportDashboardHtml(dashboard.record, {
      preparationSummary,
      etaAccuracyRecord,
      assetUriResolver: (absolutePath) =>
        panel.webview.asWebviewUri(uriFile(absolutePath)).toString()
    });
    panel.webview.html = renderedHtml;
    const handleDashboardMessage = async (message: unknown) => {
      const payload = normalizeDashboardArtifactMessage(message);
      if (!payload) {
        panelTracker?.recordDashboardArtifactAction({
          command: 'openDashboardArtifact',
          outcome: 'ignored-malformed'
        });
        return;
      }

      const storageRoot = path.resolve(storageUri.fsPath);
      const artifactPath = path.resolve(payload.filePath);
      if (!isDescendantPath(storageRoot, artifactPath)) {
        panelTracker?.recordDashboardArtifactAction({
          command: 'openDashboardArtifact',
          outcome: 'ignored-outside-storage',
          kind: payload.kind,
          label: payload.label,
          filePath: artifactPath
        });
        void vscode.window.showWarningMessage(
          'VI Review Dashboard ignored an artifact path outside workspace-scoped extension storage.'
        );
        return;
      }

      if (!doesArtifactPathMatchKind(artifactPath, payload.kind)) {
        panelTracker?.recordDashboardArtifactAction({
          command: 'openDashboardArtifact',
          outcome: 'ignored-kind-mismatch',
          kind: payload.kind,
          label: payload.label,
          filePath: artifactPath
        });
        void vscode.window.showWarningMessage(DASHBOARD_ARTIFACT_CONTRACT_WARNING);
        return;
      }

      if (payload.kind === 'packet-html' || payload.kind === 'report-html') {
        const artifactPanel = createWebviewPanel(
          'viHistorySuite.reviewDashboardArtifact',
          payload.label,
          vscode.ViewColumn.Active,
          {
            enableScripts: false,
            localResourceRoots: [storageUri]
          }
        );
        const artifactUri = artifactPanel.webview.asWebviewUri(uriFile(artifactPath)).toString();
        artifactPanel.webview.html = await renderDashboardArtifactHtml({
          title: payload.label,
          artifactFilePath: artifactPath,
          artifactDirectoryWebviewUri: ensureTrailingSlash(
            artifactPanel.webview.asWebviewUri(uriFile(path.dirname(artifactPath))).toString()
          ),
          cspSource: artifactPanel.webview.cspSource,
          readFile
        });
        panelTracker?.recordDashboardArtifactAction({
          command: 'openDashboardArtifact',
          outcome: 'opened-artifact-panel',
          kind: payload.kind,
          label: payload.label,
          filePath: artifactPath,
          title: artifactPanel.title,
          openedUri: artifactUri
        });
        return;
      }

      await executeCommand('vscode.open', uriFile(artifactPath), {
        preview: false
      });
      panelTracker?.recordDashboardArtifactAction({
        command: 'openDashboardArtifact',
        outcome: 'opened-artifact-editor',
        kind: payload.kind,
        label: payload.label,
        filePath: artifactPath
      });
    };
    panelTracker?.recordDashboard(
      {
        title: panel.title,
        relativePath: request.model.relativePath,
        commitCount: request.model.commits.length,
        dashboardFilePath: dashboard.htmlFilePath,
        dashboardJsonFilePath: dashboard.jsonFilePath,
        dashboardPairCount: dashboard.record.commitWindow.pairCount,
        dashboardArchivedPairCount: dashboard.record.summary.archivedPairCount,
        dashboardMissingPairCount: dashboard.record.summary.missingPairCount,
        renderedHtml
      },
      handleDashboardMessage
    );
    panel.webview.onDidReceiveMessage(handleDashboardMessage);

    const dashboardOpenDurationMs = Math.max(0, now() - dashboardOpenStartMs);
    try {
      await writeFile(
        buildDashboardLatestRunFilePath(storageUri.fsPath),
        JSON.stringify(
          buildDashboardLatestRunRecord({
            source: 'vscode-dashboard-action',
            workspaceStorageRoot: storageUri.fsPath,
            dashboard,
            etaAccuracyRecord,
            preparationSummary,
            experiment: buildDashboardLatestRunExperimentRecord({
              loadedCommitCount: request.model.commits.length,
              loadedPairCount: Math.max(0, request.model.commits.length - 1),
              historyWindowMode:
                modelHistoryWindow?.mode ?? historyServiceSettings.historyWindowMode,
              configuredMaxHistoryEntries:
                modelHistoryWindow?.configuredMaxEntries ??
                historyServiceSettings.maxHistoryEntries,
              effectiveHistoryEntryCeiling:
                modelHistoryWindow?.effectiveEntryCeiling ??
                historyServiceSettings.historyLimit,
              totalCommitCount,
              historyTruncated: modelHistoryWindow?.truncated,
              historyWindowDecision: modelHistoryWindow?.decision,
              strictRsrcHeader: historyServiceSettings.strictRsrcHeader,
              runtimeSettings,
              pairsNeedingEvidenceScanDurationMs,
              evidencePreparationDurationMs,
              dashboardBuildDurationMs,
              dashboardOpenDurationMs,
              totalDurationMs: Math.max(0, now() - actionStartMs),
              progressEvents
            }),
            recordedAt: new Date(now()).toISOString()
          }),
          null,
          2
        ),
        'utf8'
      );
    } catch {
      // Best-effort retention only; a successful dashboard open should not fail on manifest refresh.
    }

    return {
      outcome: 'opened-review-dashboard',
      dashboardFilePath: dashboard.htmlFilePath,
      dashboardJsonFilePath: dashboard.jsonFilePath,
      dashboardPairCount: dashboard.record.commitWindow.pairCount,
      dashboardArchivedPairCount: dashboard.record.summary.archivedPairCount,
      dashboardMissingPairCount: dashboard.record.summary.missingPairCount,
      title: panel.title
    };
  };
}

function buildDashboardLatestRunExperimentRecord(options: {
  loadedCommitCount: number;
  loadedPairCount: number;
  historyWindowMode: 'auto' | 'capped';
  configuredMaxHistoryEntries: number;
  effectiveHistoryEntryCeiling: number;
  totalCommitCount?: number;
  historyTruncated?: boolean;
  historyWindowDecision?: string;
  strictRsrcHeader: boolean;
  runtimeSettings: ReturnType<typeof readComparisonRuntimeSettings>;
  pairsNeedingEvidenceScanDurationMs: number;
  evidencePreparationDurationMs: number;
  dashboardBuildDurationMs: number;
  dashboardOpenDurationMs: number;
  totalDurationMs: number;
  progressEvents: MultiReportDashboardLatestRunProgressEvent[];
}): MultiReportDashboardLatestRunExperimentRecord {
  const historyTruncated =
    options.historyTruncated ??
    (options.totalCommitCount !== undefined
      ? options.totalCommitCount > options.loadedCommitCount
      : options.loadedCommitCount >= options.effectiveHistoryEntryCeiling);
  return {
    host: {
      vscodeVersion: vscode.version,
      platform: process.platform,
      arch: process.arch
    },
    configuration: {
      strictRsrcHeader: options.strictRsrcHeader,
      historyWindowMode: options.historyWindowMode,
      maxHistoryEntries: options.configuredMaxHistoryEntries,
      effectiveHistoryEntryCeiling: options.effectiveHistoryEntryCeiling,
      executionMode: 'docker-only',
      bitness: 'x64',
      windowsContainerImage: options.runtimeSettings.windowsContainerImage,
      linuxContainerImage: options.runtimeSettings.linuxContainerImage
    },
    historyWindow: {
      loadedCommitCount: options.loadedCommitCount,
      loadedPairCount: options.loadedPairCount,
      configuredMaxHistoryEntries: options.configuredMaxHistoryEntries,
      effectiveHistoryEntryCeiling: options.effectiveHistoryEntryCeiling,
      totalCommitCount: options.totalCommitCount,
      historyTruncated,
      decision: options.historyWindowDecision,
      loadedFractionOfTotal:
        options.totalCommitCount && options.totalCommitCount > 0
          ? roundRatio(options.loadedCommitCount / options.totalCommitCount)
          : undefined
    },
    timings: {
      totalDurationMs: options.totalDurationMs,
      pairsNeedingEvidenceScanDurationMs: options.pairsNeedingEvidenceScanDurationMs,
      evidencePreparationDurationMs: options.evidencePreparationDurationMs,
      dashboardBuildDurationMs: options.dashboardBuildDurationMs,
      dashboardOpenDurationMs: options.dashboardOpenDurationMs
    },
    progress: {
      eventCount: options.progressEvents.length,
      events: options.progressEvents
    }
  };
}

function safeGetHistoryServiceSettings(): ReturnType<typeof getViHistoryServiceSettings> {
  try {
    return getViHistoryServiceSettings();
  } catch {
    return {
      strictRsrcHeader: false,
      historyWindowMode: 'auto',
      maxHistoryEntries: 100,
      historyLimit: 1000
    };
  }
}

function safeReadComparisonRuntimeSettings(): ReturnType<typeof readComparisonRuntimeSettings> {
  try {
    return readComparisonRuntimeSettings();
  } catch {
    return {
      executionMode: 'docker-only',
      bitness: 'x64',
      windowsContainerImage: 'nationalinstruments/labview:2026q1-windows',
      linuxContainerImage: 'nationalinstruments/labview:2026q1-linux'
    };
  }
}

function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

async function collectDashboardPairsNeedingEvidence(
  storageRoot: string,
  model: ViHistoryViewModel,
  deps: MultiReportDashboardActionDeps
): Promise<DashboardPairEvidenceCandidate[]> {
  const readArchivedSourceRecord =
    deps.readArchivedComparisonReportSourceRecord ??
    readArchivedComparisonReportSourceRecordFromSelection;
  const pathExists = deps.pathExists ?? defaultPathExists;
  const pairs: DashboardPairEvidenceCandidate[] = [];

  for (const commit of model.commits) {
    if (!commit.previousHash) {
      continue;
    }

    try {
      const sourceRecord = await readArchivedSourceRecord({
        storageRoot,
        repositoryRoot: model.repositoryRoot,
        relativePath: model.relativePath,
        reportType: 'diff',
        selectedHash: commit.hash,
        baseHash: commit.previousHash
      });
      if (!sourceRecord) {
        pairs.push({
          selectedHash: commit.hash,
          baseHash: commit.previousHash,
          reason: 'missing-archive'
        });
        continue;
      }

      if (!sourceRecord.packetRecord.runtimeExecution.reportExists) {
        pairs.push({
          selectedHash: commit.hash,
          baseHash: commit.previousHash,
          reason: 'missing-generated-report'
        });
        continue;
      }

      if (!(await pathExists(sourceRecord.archivePlan.reportFilePath))) {
        pairs.push({
          selectedHash: commit.hash,
          baseHash: commit.previousHash,
          reason: 'missing-report-file'
        });
      }
    } catch {
      pairs.push({
        selectedHash: commit.hash,
        baseHash: commit.previousHash,
        reason: 'missing-archive'
      });
    }
  }

  return pairs;
}

function buildDashboardPairPreparedMessage(
  index: number,
  total: number,
  pair: DashboardPairEvidenceCandidate,
  result: ComparisonReportActionResult
): string {
  const pairLabel = `${pair.selectedHash.slice(0, 8)} vs ${pair.baseHash.slice(0, 8)}`;
  const reasonLabel =
    pair.reason === 'missing-archive'
      ? 'missing archive'
      : pair.reason === 'missing-generated-report'
      ? 'missing generated report'
      : 'missing retained report file';
  const completionLabel = describePreparedDashboardPairOutcome(result);
  return `Prepared dashboard pair ${index + 1}/${total}: ${pairLabel} (${reasonLabel}); ${completionLabel}.`;
}

function applyPreparedDashboardPairOutcome(
  summary: MultiReportDashboardPreparationSummary,
  result: ComparisonReportActionResult
): void {
  const outcome = classifyPreparedDashboardPairOutcome(result);
  if (outcome === 'generated-report') {
    summary.preparedGeneratedReportCount += 1;
    return;
  }
  if (outcome === 'blocked') {
    summary.preparedBlockedPairCount += 1;
    return;
  }
  if (outcome === 'failed') {
    summary.preparedFailedPairCount += 1;
    return;
  }
  if (outcome === 'missing-retained-archive') {
    summary.preparedMissingRetainedArchiveCount += 1;
    return;
  }
  summary.preparedNoGeneratedReportCount += 1;
}

function classifyPreparedDashboardPairOutcome(
  result: ComparisonReportActionResult
): PreparedDashboardPairOutcome {
  if (result.retainedArchiveAvailable === false) {
    return 'missing-retained-archive';
  }
  if (result.generatedReportExists) {
    return 'generated-report';
  }
  if (
    result.reportStatus === 'blocked-preflight' ||
    result.reportStatus === 'blocked-runtime' ||
    Boolean(result.blockedReason)
  ) {
    return 'blocked';
  }
  if (
    result.runtimeExecutionState === 'failed' ||
    Boolean(result.runtimeFailureReason)
  ) {
    return 'failed';
  }
  return 'no-generated-report';
}

function describePreparedDashboardPairOutcome(
  result: ComparisonReportActionResult
): string {
  if (result.retainedArchiveAvailable === false) {
    return `comparison view opened, but retained archive evidence is unavailable${formatPreparedDashboardPairReason(
      result.archiveFailureReason === 'retained-archive-write-failed'
        ? 'archive write failed'
        : 'archive contract unavailable'
    )}`;
  }
  if (result.generatedReportExists) {
    return 'retained generated comparison metadata is ready';
  }
  if (
    result.reportStatus === 'blocked-preflight' ||
    result.reportStatus === 'blocked-runtime' ||
    result.blockedReason
  ) {
    return `retained pair evidence is blocked${formatPreparedDashboardPairReason(result.blockedReason ?? result.runtimeDiagnosticReason)}`;
  }
  if (
    result.runtimeExecutionState === 'failed' ||
    result.runtimeFailureReason
  ) {
    return `retained pair evidence reflects a failed runtime${formatPreparedDashboardPairReason(result.runtimeFailureReason ?? result.runtimeDiagnosticReason)}`;
  }
  return 'retained pair evidence was refreshed without a generated comparison report';
}

function formatPreparedDashboardPairReason(reason: string | undefined): string {
  const normalizedReason = reason?.trim();
  return normalizedReason ? ` (${normalizedReason})` : '';
}

interface DashboardArtifactMessage {
  command: 'openDashboardArtifact';
  filePath: string;
  kind: 'packet-html' | 'report-html' | 'metadata-json' | 'source-record-json';
  label: string;
}

const DASHBOARD_ARTIFACT_CONTRACT_WARNING =
  'VI Review Dashboard ignored an artifact path that did not match the governed retained artifact contract.';

function normalizeDashboardArtifactMessage(message: unknown): DashboardArtifactMessage | undefined {
  if (!message || typeof message !== 'object') {
    return undefined;
  }

  const command = Reflect.get(message, 'command');
  if (command !== 'openDashboardArtifact') {
    return undefined;
  }

  const filePath = Reflect.get(message, 'filePath');
  const kind = Reflect.get(message, 'kind');
  const label = Reflect.get(message, 'label');
  if (
    typeof filePath !== 'string' ||
    typeof kind !== 'string' ||
    typeof label !== 'string' ||
    !filePath.trim() ||
    !label.trim()
  ) {
    return undefined;
  }

  if (
    kind !== 'packet-html' &&
    kind !== 'report-html' &&
    kind !== 'metadata-json' &&
    kind !== 'source-record-json'
  ) {
    return undefined;
  }

  return {
    command: 'openDashboardArtifact',
    filePath,
    kind,
    label
  };
}

function isDescendantPath(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function doesArtifactPathMatchKind(
  artifactPath: string,
  kind: DashboardArtifactMessage['kind']
): boolean {
  const basename = path.basename(artifactPath).toLowerCase();

  switch (kind) {
    case 'packet-html':
      return basename === 'report-packet.html' || basename === 'packet.html';
    case 'report-html':
      return /^(diff|print)-report-.+\.html$/i.test(basename);
    case 'metadata-json':
      return basename === 'report-metadata.json';
    case 'source-record-json':
      return basename === 'source-record.json';
  }
}

export function renderDashboardArtifactHtml(options: {
  title: string;
  artifactFilePath: string;
  artifactDirectoryWebviewUri: string;
  cspSource: string;
  readFile: typeof fs.readFile;
}): Promise<string> {
  return renderInlineDashboardArtifactHtml(options);
}

async function renderInlineDashboardArtifactHtml(options: {
  title: string;
  artifactFilePath: string;
  artifactDirectoryWebviewUri: string;
  cspSource: string;
  readFile: typeof fs.readFile;
}): Promise<string> {
  try {
    const originalHtml = await options.readFile(options.artifactFilePath, 'utf8');
    const csp = [
      "default-src 'none'",
      `frame-src ${options.cspSource} https:`,
      `img-src ${options.cspSource} https: data:`,
      `style-src ${options.cspSource} 'unsafe-inline'`,
      `font-src ${options.cspSource} https: data:`
    ].join('; ');
    const headInjection = `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(
      csp
    )}" /><base href="${escapeHtml(options.artifactDirectoryWebviewUri)}" /><style>
        body { margin: 0; background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-foreground, #ddd); }
        .vihs-dashboard-artifact-header {
          font-family: var(--vscode-font-family, Segoe UI, sans-serif);
          padding: 12px 16px;
          border-bottom: 1px solid var(--vscode-panel-border, #555);
          background: var(--vscode-editor-background, #1e1e1e);
          color: var(--vscode-foreground, #ddd);
        }
      </style>`;
    const withHead = /<head\b[^>]*>/i.test(originalHtml)
      ? originalHtml.replace(/<head\b[^>]*>/i, (match) => `${match}${headInjection}`)
      : `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
          options.title
        )}</title></head><body>${originalHtml}</body></html>`;
    const headerMarkup = `<div class="vihs-dashboard-artifact-header"><strong>${escapeHtml(
      options.title
    )}</strong></div>`;

    if (/<body\b[^>]*>/i.test(withHead)) {
      return withHead.replace(/<body\b([^>]*)>/i, `<body$1>${headerMarkup}`);
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8" />${headInjection}<title>${escapeHtml(
      options.title
    )}</title></head><body>${headerMarkup}${withHead}</body></html>`;
  } catch {
    return renderDashboardArtifactIframeHtml({
      title: options.title,
      artifactUri: `${options.artifactDirectoryWebviewUri}${encodeURIComponent(
        path.basename(options.artifactFilePath)
      )}`
    });
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function renderDashboardArtifactIframeHtml(options: {
  title: string;
  artifactUri: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(options.title)}</title>
    <style>
      body {
        margin: 0;
        font-family: var(--vscode-font-family, Segoe UI, sans-serif);
        color: var(--vscode-foreground, #ddd);
        background: var(--vscode-editor-background, #1e1e1e);
      }
      header {
        padding: 12px 16px;
        border-bottom: 1px solid var(--vscode-panel-border, #555);
      }
      iframe {
        width: 100%;
        height: calc(100vh - 58px);
        border: 0;
      }
    </style>
  </head>
  <body>
    <header><strong>${escapeHtml(options.title)}</strong></header>
    <iframe src="${escapeHtml(options.artifactUri)}" title="${escapeHtml(options.title)}"></iframe>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildDashboardPairKeepaliveMessage(
  pairPrefix: string,
  etaCalibrationPending: boolean,
  lastPairStepMessage: string,
  elapsedMs: number
): string {
  const elapsedSeconds = Math.max(1, Math.ceil(elapsedMs / 1000));
  const normalizedStep = lastPairStepMessage.trim().replace(/\.$/, '');
  const calibrationNote = etaCalibrationPending ? 'first pair calibrates ETA; ' : '';
  return `${pairPrefix}Still working; ${calibrationNote}elapsed ${formatEstimatedDuration(
    elapsedSeconds
  )}. Last step: ${normalizedStep}.`;
}

async function defaultPathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
