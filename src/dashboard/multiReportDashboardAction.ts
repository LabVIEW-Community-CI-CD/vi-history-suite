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
  uriFile?: typeof vscode.Uri.file;
}

export function createMultiReportDashboardAction(
  context: vscode.ExtensionContext,
  deps: MultiReportDashboardActionDeps = {}
): (request: MultiReportDashboardActionRequest) => Promise<MultiReportDashboardActionResult> {
  return async (request) => {
    if (!context.storageUri) {
      return { outcome: 'missing-storage-uri' };
    }

    if (request.model.commits.length < 3) {
      return { outcome: 'insufficient-commits' };
    }

    const buildDashboard = deps.buildDashboard ?? buildAndPersistMultiReportDashboard;
    const dashboard = await buildDashboard(context.storageUri.fsPath, request.model);
    const createWebviewPanel = deps.createWebviewPanel ?? vscode.window.createWebviewPanel;
    const uriFile = deps.uriFile ?? vscode.Uri.file;
    const panel = createWebviewPanel(
      'viHistorySuite.reviewDashboard',
      `VI Review Dashboard: ${request.model.relativePath.split('/').pop() ?? request.model.relativePath}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: false,
        localResourceRoots: [context.storageUri]
      }
    );
    panel.webview.html = renderMultiReportDashboardHtml(dashboard.record, {
      assetUriResolver: (absolutePath) =>
        panel.webview.asWebviewUri(uriFile(absolutePath)).toString()
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
