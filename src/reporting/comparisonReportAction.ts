import * as vscode from 'vscode';

import { ViHistoryViewModel } from '../services/viHistoryModel';
import { persistComparisonReportPacket } from './comparisonReportPacket';
import { preflightComparisonReportRevisions } from './comparisonReportPreflight';

export interface ComparisonReportActionRequest {
  model: ViHistoryViewModel;
  selectedHash: string;
}

export interface ComparisonReportActionResult {
  outcome:
    | 'opened-comparison-report'
    | 'missing-storage-uri'
    | 'missing-selected-commit'
    | 'missing-previous-hash';
  reportStatus?: 'ready-for-runtime' | 'blocked-preflight';
  blockedReason?: string;
  reportFilePath?: string;
  metadataFilePath?: string;
  reportWebviewUri?: string;
  title?: string;
}

export interface ComparisonReportActionDeps {
  preflightComparisonReport?: typeof preflightComparisonReportRevisions;
  persistComparisonReport?: typeof persistComparisonReportPacket;
  createWebviewPanel?: typeof vscode.window.createWebviewPanel;
  uriFile?: typeof vscode.Uri.file;
  joinPath?: typeof vscode.Uri.joinPath;
}

export function createComparisonReportAction(
  context: vscode.ExtensionContext,
  deps: ComparisonReportActionDeps = {}
): (request: ComparisonReportActionRequest) => Promise<ComparisonReportActionResult> {
  return async (request: ComparisonReportActionRequest): Promise<ComparisonReportActionResult> => {
    const selectedCommit = request.model.commits.find((commit) => commit.hash === request.selectedHash);
    if (!selectedCommit) {
      return { outcome: 'missing-selected-commit' };
    }

    if (!selectedCommit.previousHash) {
      return { outcome: 'missing-previous-hash' };
    }

    if (!context.storageUri) {
      return { outcome: 'missing-storage-uri' };
    }

    const preflight = await (deps.preflightComparisonReport ?? preflightComparisonReportRevisions)({
      repoRoot: request.model.repositoryRoot,
      relativePath: request.model.relativePath,
      leftRevisionId: selectedCommit.previousHash,
      rightRevisionId: selectedCommit.hash
    });

    const packet = await (deps.persistComparisonReport ?? persistComparisonReportPacket)({
      storageRoot: context.storageUri.fsPath,
      repositoryRoot: request.model.repositoryRoot,
      relativePath: request.model.relativePath,
      reportType: 'diff',
      selectedHash: selectedCommit.hash,
      baseHash: selectedCommit.previousHash,
      preflight
    });

    const createWebviewPanel = deps.createWebviewPanel ?? vscode.window.createWebviewPanel;
    const uriFile = deps.uriFile ?? vscode.Uri.file;
    const joinPath = deps.joinPath ?? vscode.Uri.joinPath;
    const repoRootUri = joinPath(context.storageUri, 'reports', packet.record.artifactPlan.repoId);
    const reportFileUri = uriFile(packet.reportFilePath);

    const panel = createWebviewPanel(
      'viHistorySuite.comparisonReport',
      packet.record.reportTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: false,
        localResourceRoots: [context.storageUri, repoRootUri]
      }
    );
    const reportWebviewUri = panel.webview.asWebviewUri(reportFileUri);
    panel.webview.html = renderComparisonReportPanelHtml({
      title: packet.record.reportTitle,
      reportWebviewUri: reportWebviewUri.toString(),
      reportStatus: packet.record.reportStatus,
      cspSource: panel.webview.cspSource
    });

    return {
      outcome: 'opened-comparison-report',
      reportStatus: packet.record.reportStatus,
      blockedReason: preflight.blockedReason,
      reportFilePath: packet.reportFilePath,
      metadataFilePath: packet.metadataFilePath,
      reportWebviewUri: reportWebviewUri.toString(),
      title: panel.title
    };
  };
}

export function renderComparisonReportPanelHtml(options: {
  title: string;
  reportWebviewUri: string;
  reportStatus: 'ready-for-runtime' | 'blocked-preflight';
  cspSource: string;
}): string {
  const safeTitle = escapeHtml(options.title);
  const safeUri = escapeHtml(options.reportWebviewUri);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${escapeHtml(options.cspSource)} https:; style-src 'unsafe-inline';" />
    <title>${safeTitle}</title>
    <style>
      body { font-family: var(--vscode-font-family); margin: 0; padding: 16px; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
      .status { margin-bottom: 12px; }
      iframe { width: 100%; height: 80vh; border: 1px solid var(--vscode-panel-border); background: white; }
    </style>
  </head>
  <body>
    <div class="status" data-testid="comparison-report-panel-status">
      <strong>Status:</strong> ${escapeHtml(options.reportStatus)}
    </div>
    <iframe data-testid="comparison-report-panel-frame" src="${safeUri}" title="${safeTitle}"></iframe>
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
