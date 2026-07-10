import * as path from 'node:path';

import * as vscode from 'vscode';

import type { ViPreviewCache } from '../reporting/viPreview/viPreviewCache';
import {
  renderViPreviewForFile,
  type RenderViPreviewForFileResult
} from '../reporting/viPreview/viPreviewFileRender';
import { buildViPreviewWebviewHtml } from '../reporting/viPreview/viPreviewWebview';
import {
  buildViPreviewRenderDeps,
  createViPreviewCache,
  getViPreviewOperationDirectory,
  resolvePreviewRuntime
} from './viPreviewRenderHost';
import type { ViPreviewSessionManager } from './viPreviewSessionManager';

/**
 * VHS-REQ-659: opens a LabVIEW VI ("G code") as a self-contained HTML preview in
 * a read-only custom editor. Opening a `.vi`/`.vit`/`.vim`/`.ctl` renders the VI
 * through the configured comparison runtime (Host or Docker) and displays the
 * resulting NI `PrintToSingleFileHtml` document. Runtime resolution, caching,
 * and the render dependencies are shared with the background cache warmer via
 * `viPreviewRenderHost`; this provider is the thin VS Code host binding.
 */

export const VI_PREVIEW_VIEW_TYPE = 'viHistorySuite.viPreview';

export interface RegisterViPreviewCustomEditorOptions {
  /** Invoked with the VI path after a preview renders successfully (drives cache warming). */
  onPreviewOpened?: (viFsPath: string) => void;
  /** Shared warm-session manager; used for the Docker runtime so opens are fast once warm. */
  sessionManager?: ViPreviewSessionManager;
}

function describeUnavailable(reason: string): string {
  switch (reason) {
    case 'windows-powershell-host-unavailable':
      return 'VI preview could not find a host PowerShell to launch the Windows LabVIEW container. Windows container previews require a Windows host (or WSL interop). Switch to the Host or Linux container runtime with the "VI History: Runtime & Report Settings" command.';
    case 'labview-cli-selection-incomplete':
      return 'LabVIEW CLI could not be located. Set it up with the "VI History: Set Up Comparison Runtime" command, then reopen the VI.';
    case 'container-image-unavailable':
      return 'No LabVIEW container image is available. Select one with the "VI History: Runtime & Report Settings" command, then reopen the VI.';
    default:
      return `The comparison runtime is not available for preview (${reason}). Configure it with the "VI History: Runtime & Report Settings" command, then reopen the VI.`;
  }
}

function describeFailure(reason: string | undefined, stderr: string | undefined): string {
  const detail = stderr?.trim() ? `\n\n${stderr.trim()}` : '';
  if (reason === 'preview-output-not-produced') {
    return `LabVIEW ran but produced no preview document. The VI may be broken or depend on subVIs that are not available alongside it.${detail}`;
  }
  return `LabVIEW could not render this VI.${detail}`;
}

class ViPreviewDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {
    /* no resources to release */
  }
}

class ViPreviewEditorProvider implements vscode.CustomReadonlyEditorProvider<ViPreviewDocument> {
  private readonly cache: ViPreviewCache;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly onPreviewOpened?: (viFsPath: string) => void,
    private readonly sessionManager?: ViPreviewSessionManager
  ) {
    this.cache = createViPreviewCache(context);
  }

  openCustomDocument(uri: vscode.Uri): ViPreviewDocument {
    return new ViPreviewDocument(uri);
  }

  async resolveCustomEditor(
    document: ViPreviewDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    const fileName = path.basename(document.uri.fsPath);
    webviewPanel.webview.options = { enableScripts: false };
    webviewPanel.webview.html = buildViPreviewWebviewHtml({
      kind: 'loading',
      title: `Rendering ${fileName}…`,
      detail: 'Running LabVIEW to generate the preview. A cold container start can take a minute.'
    });

    if (!vscode.workspace.isTrusted) {
      webviewPanel.webview.html = buildViPreviewWebviewHtml({
        kind: 'error',
        title: 'Preview unavailable',
        message:
          'VI preview is disabled in untrusted workspaces because it runs LabVIEW as an external process. Trust this workspace to enable previews.'
      });
      return;
    }

    try {
      const runtime = await resolvePreviewRuntime();
      if (runtime.outcome === 'blocked') {
        webviewPanel.webview.html = buildViPreviewWebviewHtml({
          kind: 'error',
          title: 'Preview unavailable',
          message: describeUnavailable(runtime.reason)
        });
        return;
      }

      let result: RenderViPreviewForFileResult;
      if (
        runtime.runtime.provider === 'linux-container' &&
        runtime.runtime.containerImage &&
        this.sessionManager
      ) {
        // Reuse the shared warm session so an un-cached open renders in seconds
        // once the session is warm; interactive priority jumps the warm queue.
        result = await this.sessionManager.renderVi(
          {
            containerImage: runtime.runtime.containerImage,
            containerLabviewPath: runtime.runtime.containerLabviewPath,
            connectTimeoutSeconds: runtime.runtime.connectTimeoutSeconds
          },
          document.uri.fsPath,
          'interactive'
        );
      } else {
        result = await renderViPreviewForFile(
          {
            runtime: runtime.runtime,
            viFilePath: document.uri.fsPath,
            operationDirectory: getViPreviewOperationDirectory(this.context)
          },
          buildViPreviewRenderDeps(this.cache)
        );
      }

      if (result.outcome === 'rendered' && result.html) {
        webviewPanel.webview.html = buildViPreviewWebviewHtml({
          kind: 'rendered',
          labviewHtml: result.html
        });
        // Successful open signals user intent; warm the rest of the workspace.
        this.onPreviewOpened?.(document.uri.fsPath);
        return;
      }

      webviewPanel.webview.html = buildViPreviewWebviewHtml({
        kind: 'error',
        title: 'Preview failed',
        message:
          result.outcome === 'blocked'
            ? describeUnavailable(result.failureReason ?? 'runtime-unavailable')
            : describeFailure(result.failureReason, result.stderr)
      });
    } catch (error) {
      webviewPanel.webview.html = buildViPreviewWebviewHtml({
        kind: 'error',
        title: 'Preview failed',
        message: String((error as Error)?.message ?? error)
      });
    }
  }
}

/** Registers the VI preview custom editor and returns its disposable. */
export function registerViPreviewCustomEditor(
  context: vscode.ExtensionContext,
  options: RegisterViPreviewCustomEditorOptions = {}
): vscode.Disposable {
  const registration = vscode.window.registerCustomEditorProvider(
    VI_PREVIEW_VIEW_TYPE,
    new ViPreviewEditorProvider(context, options.onPreviewOpened, options.sessionManager),
    {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: { retainContextWhenHidden: true }
    }
  );
  context.subscriptions.push(registration);
  return registration;
}
