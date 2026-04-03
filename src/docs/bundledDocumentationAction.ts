import * as vscode from 'vscode';

import {
  loadBundledDocumentationPage,
  renderBundledDocumentationPanelHtml
} from './bundledDocumentation';
import {
  DocumentationPanelMessage,
  HistoryPanelTracker
} from '../ui/historyPanelTracker';

export interface DocumentationActionResult {
  outcome:
    | 'opened-documentation'
    | 'missing-bundled-documentation'
    | 'unknown-documentation-page';
  pageId?: string;
  pageTitle?: string;
  title?: string;
  manifestFilePath?: string;
  pageFilePath?: string;
}

export function createBundledDocumentationAction(
  context: vscode.ExtensionContext,
  panelTracker?: HistoryPanelTracker
): (request?: { pageId?: string }) => Promise<DocumentationActionResult> {
  let panel: vscode.WebviewPanel | undefined;

  const openPage = async (request?: { pageId?: string }): Promise<DocumentationActionResult> => {
    let loaded;
    try {
      loaded = await loadBundledDocumentationPage(context.extensionUri, request?.pageId);
    } catch {
      return {
        outcome: 'missing-bundled-documentation'
      };
    }

    if (!loaded) {
      return {
        outcome: 'unknown-documentation-page',
        pageId: request?.pageId
      };
    }

    if (!panel) {
      panel = vscode.window.createWebviewPanel(
        'viHistorySuite.documentation',
        `VI History Docs: ${loaded.page.title}`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true
        }
      );

      panel.onDidDispose(() => {
        panel = undefined;
      });

      panel.webview.onDidReceiveMessage(async (message: DocumentationPanelMessage) => {
        const command = String(message.command ?? '');
        if (command === 'openPage') {
          await openPage({
            pageId: message.pageId
          });
          return;
        }

        if (command === 'openExternal' && message.href) {
          await vscode.env.openExternal(vscode.Uri.parse(message.href));
        }
      });
    } else {
      panel.reveal(vscode.ViewColumn.Beside, false);
    }

    const extensionVersion = String(context.extension.packageJSON.version ?? 'unknown');
    const renderedHtml = renderBundledDocumentationPanelHtml({
      extensionVersion,
      manifest: loaded.manifest,
      page: loaded.page,
      pageBodyHtml: loaded.pageBodyHtml
    });

    panel.title = `VI History Docs: ${loaded.page.title}`;
    panel.webview.html = renderedHtml;

    panelTracker?.recordDocumentation({
      title: panel.title,
      pageId: loaded.page.id,
      pageTitle: loaded.page.title,
      bundledVersion: extensionVersion,
      manifestFilePath: loaded.manifestFilePath,
      pageFilePath: loaded.pageFilePath,
      renderedHtml
    });

    return {
      outcome: 'opened-documentation',
      pageId: loaded.page.id,
      pageTitle: loaded.page.title,
      title: panel.title,
      manifestFilePath: loaded.manifestFilePath,
      pageFilePath: loaded.pageFilePath
    };
  };

  return openPage;
}
