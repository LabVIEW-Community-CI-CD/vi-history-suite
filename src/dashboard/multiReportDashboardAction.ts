import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  buildAndPersistMultiReportDashboard,
  BuildMultiReportDashboardResult,
  renderMultiReportDashboardHtml
} from './multiReportDashboard';
import { ViHistoryViewModel } from '../services/viHistoryModel';

export interface MultiReportDashboardActionRequest {
  model: ViHistoryViewModel;
}

export interface MultiReportDashboardActionResult {
  outcome:
    | 'opened-review-dashboard'
    | 'workspace-untrusted'
    | 'missing-storage-uri'
    | 'insufficient-commits';
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
    model: ViHistoryViewModel
  ) => Promise<BuildMultiReportDashboardResult>;
  createWebviewPanel?: typeof vscode.window.createWebviewPanel;
  executeCommand?: typeof vscode.commands.executeCommand;
  uriFile?: typeof vscode.Uri.file;
}

export function createMultiReportDashboardAction(
  context: vscode.ExtensionContext,
  deps: MultiReportDashboardActionDeps = {}
): (request: MultiReportDashboardActionRequest) => Promise<MultiReportDashboardActionResult> {
  return async (request) => {
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
    const dashboard = await buildDashboard(storageUri.fsPath, request.model);
    const createWebviewPanel = deps.createWebviewPanel ?? vscode.window.createWebviewPanel;
    const executeCommand = deps.executeCommand ?? vscode.commands.executeCommand;
    const uriFile = deps.uriFile ?? vscode.Uri.file;
    const panel = createWebviewPanel(
      'viHistorySuite.reviewDashboard',
      `VI Review Dashboard: ${request.model.relativePath.split('/').pop() ?? request.model.relativePath}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [storageUri]
      }
    );
    panel.webview.html = renderMultiReportDashboardHtml(dashboard.record, {
      assetUriResolver: (absolutePath) =>
        panel.webview.asWebviewUri(uriFile(absolutePath)).toString()
    });
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      const payload = normalizeDashboardArtifactMessage(message);
      if (!payload) {
        return;
      }

      const storageRoot = path.resolve(storageUri.fsPath);
      const artifactPath = path.resolve(payload.filePath);
      if (!isDescendantPath(storageRoot, artifactPath)) {
        void vscode.window.showWarningMessage(
          'VI Review Dashboard ignored an artifact path outside workspace-scoped extension storage.'
        );
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
        return;
      }

      await executeCommand('vscode.open', uriFile(artifactPath), {
        preview: false
      });
    });

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

interface DashboardArtifactMessage {
  command: 'openDashboardArtifact';
  filePath: string;
  kind: 'packet-html' | 'report-html' | 'metadata-json' | 'source-record-json';
  label: string;
}

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
  if (rootPath === candidatePath) {
    return true;
  }

  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
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
