import * as path from 'node:path';
import { randomBytes } from 'node:crypto';

import * as vscode from 'vscode';

import type { ViPreviewCache } from '../reporting/viPreview/viPreviewCache';
import {
  renderViPreviewForFile,
  type RenderViPreviewForFileResult
} from '../reporting/viPreview/viPreviewFileRender';
import { buildViPreviewWebviewHtml } from '../reporting/viPreview/viPreviewWebview';
import { selectViPreviewDocument } from '../reporting/viPreview/viPreviewRenderMode';
import { toViPreviewSessionRuntime } from '../reporting/viPreview/viPreviewSessionRuntime';
import {
  buildViPreviewRenderDeps,
  buildViPreviewRenderSourceDeps,
  createViPreviewCache,
  getViPreviewOperationDirectory,
  isViPreviewEnabled,
  resolvePreviewRuntime
} from './viPreviewRenderHost';
import { resolveViPreviewRenderSource } from '../reporting/viPreview/viPreviewRenderSource';
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

/**
 * Whether the interactive block-diagram presentation is enabled
 * (`viHistorySuite.preview.blockDiagramInteractive`, default false). When on,
 * the editor renders the scripted in-place case-stepper viewer; otherwise it
 * shows the static, script-free document. (VHS-REQ-659.)
 */
function isBlockDiagramInteractiveEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('viHistorySuite')
    .get<boolean>('preview.blockDiagramInteractive', false);
}

/**
 * Whether the host-native runtime may render previews LIVE
 * (`viHistorySuite.preview.allowHostNativeRender`, default false). Normally
 * previews are generated on Docker and the host only displays from the cache;
 * the Vagrant LabVIEW VM (host-native x86, no Docker) turns this on so it can
 * both generate the cache AND visualize, to troubleshoot without Docker.
 * (VHS-REQ-659.)
 */
function isHostNativeRenderAllowed(): boolean {
  return vscode.workspace
    .getConfiguration('viHistorySuite')
    .get<boolean>('preview.allowHostNativeRender', false);
}

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
  if (reason === 'labview-preview-operation-load-failed') {
    return `LabVIEW could not load the preview operation (error 1125). This usually means the selected LabVIEW is too old to render previews — select LabVIEW 2025 or newer with the "VI History: Runtime & Report Settings" command, then reopen the VI.${detail}`;
  }
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

  /**
   * Displays a rendered LabVIEW document in the webview. Interactive
   * block-diagram mode runs an inline (nonce'd) script; the static document mode
   * does not. The selected presentation is computed FIRST, then scripts are
   * enabled only when the interactive viewer was actually returned — the
   * selector falls back to the static document (for example a `.ctl` with no
   * diagram or a malformed export), and that fallback must stay host-level
   * script-disabled like the normal document path. (VHS-REQ-659.)
   */
  private renderResultToWebview(
    webviewPanel: vscode.WebviewPanel,
    labviewHtml: string,
    viFsPath: string
  ): void {
    const interactive = isBlockDiagramInteractiveEnabled();
    const nonce = interactive ? randomBytes(16).toString('base64') : undefined;
    const selected = selectViPreviewDocument({
      labviewHtml,
      mode: interactive ? 'interactive' : 'document',
      nonce
    });
    webviewPanel.webview.options = { enableScripts: selected.mode === 'interactive' };
    webviewPanel.webview.html = selected.html;
    // Successful open signals user intent; warm the rest of the workspace.
    this.onPreviewOpened?.(viFsPath);
  }

  async resolveCustomEditor(
    document: ViPreviewDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    const fileName = path.basename(document.uri.fsPath);
    webviewPanel.webview.options = { enableScripts: false };

    // VHS-REQ-659: VI Preview is opt-in and Docker-only. When the feature is off
    // (the default), show an enable prompt instead of rendering, so a freshly
    // installed extension never runs LabVIEW until the user turns it on from the
    // Runtime & Report Settings panel (where the toggle appears under Docker).
    if (!isViPreviewEnabled()) {
      webviewPanel.webview.html = buildViPreviewWebviewHtml({
        kind: 'error',
        title: 'VI Preview is off',
        message:
          'VI Preview is off. Select the Docker runtime and enable VI preview in the "VI History: Runtime & Report Settings" command, then reopen this VI.'
      });
      return;
    }

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

      // VI Preview renders live only on the Docker runtime. Docker's job is to
      // GENERATE the cache; the host then DISPLAYS from it. So on a host-native
      // runtime (for example the Vagrant LabVIEW VM, where Docker cannot run) we
      // still serve a cached preview — a cache hit launches no external process
      // — and only guide the user to Docker when the cache misses. The Vagrant
      // VM opts into `preview.allowHostNativeRender` so it can BOTH generate the
      // cache and visualize (troubleshoot without Docker); when that is on we
      // fall through to the normal render path below. (VHS-REQ-659.)
      if (runtime.runtime.provider === 'host-native' && !isHostNativeRenderAllowed()) {
        const cachedSource = await resolveViPreviewRenderSource(
          document.uri,
          buildViPreviewRenderSourceDeps(document.uri)
        );
        try {
          const cachePeek = await renderViPreviewForFile(
            {
              runtime: runtime.runtime,
              viFilePath: cachedSource.renderPath,
              operationDirectory: getViPreviewOperationDirectory(this.context),
              cacheOnly: true
            },
            buildViPreviewRenderDeps(this.cache)
          );
          if (cachePeek.outcome === 'rendered' && cachePeek.html) {
            this.renderResultToWebview(webviewPanel, cachePeek.html, document.uri.fsPath);
            return;
          }
        } finally {
          await cachedSource.cleanup();
        }
        webviewPanel.webview.html = buildViPreviewWebviewHtml({
          kind: 'error',
          title: 'VI Preview requires Docker to generate the cache',
          message:
            'This VI has no cached preview yet, and previews are generated on the Docker runtime. Generate the cache on Docker (the caching runs in the background once VI Preview is on), then reopen this VI here on the Host runtime to view it — the display reads the cache and does not run Docker.'
        });
        return;
      }

      // Reuse a warm LabVIEW session when the resolved runtime can host one on
      // this platform (container providers, or host-native on Windows); otherwise
      // render per-invocation. `toViPreviewSessionRuntime` encodes the gating.
      const sessionRuntime = this.sessionManager
        ? toViPreviewSessionRuntime(runtime.runtime, process.platform)
        : undefined;

      // A Source Control diff opens the base (committed) side as a non-`file`
      // URI (scheme `git`) whose bytes live in the Git blob, not on disk; its
      // `fsPath` resolves to the working-tree file, so without this the base and
      // modified previews would render identically. Materialize non-`file` URIs
      // to a temp copy so each side renders its own content. (VHS-REQ-659.)
      const renderSource = await resolveViPreviewRenderSource(
        document.uri,
        buildViPreviewRenderSourceDeps(document.uri)
      );
      try {
        let result: RenderViPreviewForFileResult;
        if (sessionRuntime && this.sessionManager) {
          // Reuse the shared warm session so an un-cached open renders in seconds
          // once the session is warm; interactive priority jumps the warm queue.
          result = await this.sessionManager.renderVi(
            sessionRuntime,
            renderSource.renderPath,
            'interactive'
          );
        } else {
          result = await renderViPreviewForFile(
            {
              runtime: runtime.runtime,
              viFilePath: renderSource.renderPath,
              operationDirectory: getViPreviewOperationDirectory(this.context)
            },
            buildViPreviewRenderDeps(this.cache)
          );
        }

        if (result.outcome === 'rendered' && result.html) {
          this.renderResultToWebview(webviewPanel, result.html, document.uri.fsPath);
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
      } finally {
        await renderSource.cleanup();
      }
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
