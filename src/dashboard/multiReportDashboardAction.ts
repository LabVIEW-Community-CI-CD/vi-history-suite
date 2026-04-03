import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { readArchivedComparisonReportSourceRecordFromSelection } from './comparisonReportArchive';
import {
  buildAndPersistMultiReportDashboard,
  BuildMultiReportDashboardResult,
  renderMultiReportDashboardHtml
} from './multiReportDashboard';
import { ComparisonReportActionResult } from '../reporting/comparisonReportAction';
import { ViHistoryViewModel } from '../services/viHistoryModel';
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
    reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
    cancellationToken?: vscode.CancellationToken;
  }) => Promise<ComparisonReportActionResult>;
  readArchivedComparisonReportSourceRecord?: typeof readArchivedComparisonReportSourceRecordFromSelection;
  pathExists?: (targetPath: string) => Promise<boolean>;
}

interface DashboardPairEvidenceCandidate {
  selectedHash: string;
  baseHash: string;
  reason: 'missing-archive' | 'missing-generated-report' | 'missing-report-file';
}

const DASHBOARD_PAIR_EVIDENCE_INCREMENT_TOTAL = 40;
const DASHBOARD_PAIR_CONCENTRATION_INCREMENT_TOTAL = 30;
const DEFAULT_DASHBOARD_PAIR_CONCENTRATION_INCREMENT_TOTAL = 70;
const DASHBOARD_ASSET_INCREMENT_TOTAL = 10;
const DASHBOARD_OPEN_INCREMENT = 15;
const EXPECTED_COMPARISON_EVIDENCE_INCREMENT_TOTAL = 95;

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
    const ensureComparisonReportEvidence = deps.ensureComparisonReportEvidence;
    const pairsNeedingEvidence = await collectDashboardPairsNeedingEvidence(
      storageUri.fsPath,
      request.model,
      deps
    );
    await request.reportProgress?.({
      message: 'Preparing VI Review Dashboard commit window.',
      increment: 5
    });
    let pairConcentrationIncrementTotal =
      DEFAULT_DASHBOARD_PAIR_CONCENTRATION_INCREMENT_TOTAL;
    if (pairsNeedingEvidence.length > 0 && ensureComparisonReportEvidence) {
      pairConcentrationIncrementTotal = DASHBOARD_PAIR_CONCENTRATION_INCREMENT_TOTAL;
      const pairBudget =
        pairsNeedingEvidence.length > 0
          ? DASHBOARD_PAIR_EVIDENCE_INCREMENT_TOTAL / pairsNeedingEvidence.length
          : 0;
      for (const [index, pair] of pairsNeedingEvidence.entries()) {
        if (request.cancellationToken?.isCancellationRequested) {
          return {
            outcome: 'cancelled',
            cancellationStage: 'during-dashboard-pair-generation'
          };
        }

        let remainingPairIncrement = pairBudget;
        const pairPrefix = `Preparing dashboard pair ${index + 1}/${pairsNeedingEvidence.length}: `;
        const scaledPairProgress = async (update: {
          message: string;
          increment?: number;
        }): Promise<void> => {
          const scaledIncrement =
            typeof update.increment === 'number' && update.increment > 0
              ? Math.min(
                  remainingPairIncrement,
                  (update.increment / EXPECTED_COMPARISON_EVIDENCE_INCREMENT_TOTAL) *
                    pairBudget
                )
              : 0;
          remainingPairIncrement = Math.max(0, remainingPairIncrement - scaledIncrement);
          await request.reportProgress?.({
            message: `${pairPrefix}${update.message}`,
            increment: scaledIncrement > 0 ? scaledIncrement : undefined
          });
        };

        const result = await ensureComparisonReportEvidence({
          model: request.model,
          selectedHash: pair.selectedHash,
          reportProgress: scaledPairProgress,
          cancellationToken: request.cancellationToken
        });
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

        await request.reportProgress?.({
          message: buildDashboardPairPreparedMessage(
            index,
            pairsNeedingEvidence.length,
            pair,
            result
          ),
          increment: remainingPairIncrement > 0 ? remainingPairIncrement : undefined
        });
      }
    }
    const dashboard = await buildDashboard(storageUri.fsPath, request.model, {
      reportProgress: request.reportProgress,
      pairConcentrationIncrementTotal,
      assetIncrementTotal: DASHBOARD_ASSET_INCREMENT_TOTAL
    });
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
    await request.reportProgress?.({
      message: 'Opening VI Review Dashboard.',
      increment: DASHBOARD_OPEN_INCREMENT
    });
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
        artifactPanel.webview.html = renderDashboardArtifactHtml({
          title: payload.label,
          artifactUri
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
  const completionLabel = result.generatedReportExists
    ? 'retained generated comparison metadata is ready'
    : 'retained pair evidence was refreshed without a generated comparison report';
  return `Prepared dashboard pair ${index + 1}/${total}: ${pairLabel} (${reasonLabel}); ${completionLabel}.`;
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

function renderDashboardArtifactHtml(options: {
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

async function defaultPathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
