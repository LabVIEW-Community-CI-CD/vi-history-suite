import * as path from 'node:path';

import * as vscode from 'vscode';

import {
  formatWarmStatusLabel,
  formatWarmStatusTooltip,
  shouldWarmViPreviewProvider,
  warmViPreviewCache,
  type ViPreviewBackgroundWarmingMode
} from '../reporting/viPreview/viPreviewCacheWarmer';
import { toViPreviewSessionRuntime } from '../reporting/viPreview/viPreviewSessionRuntime';
import { resolvePreviewRuntime } from './viPreviewRenderHost';
import type { ViPreviewSessionManager } from './viPreviewSessionManager';

/**
 * VHS-REQ-659: background preview cache warmer service.
 *
 * After the first VI preview opens, this service silently pre-renders the
 * remaining workspace VIs through the shared warm session (LabVIEW stays
 * resident, so only the first render is slow), populating the render cache so
 * later opens are instant. Warm renders are issued at background priority so a
 * concurrent interactive open jumps ahead. Progress is shown only as a
 * quietly-increasing status-bar percentage.
 *
 * Whether warming runs is governed by the `viHistorySuite.preview.backgroundWarming`
 * setting (`shouldWarmViPreviewProvider`): `docker-only` (default) warms only the
 * container providers so a host-native run never occupies the user's host
 * LabVIEW; `always` also warms host-native; `off` disables it. Warming runs at
 * most once per session and is cancelled on disposal. The session lifecycle is
 * owned by the shared session manager, not this service.
 */

const VI_PREVIEW_WARM_GLOB = '**/*.{vi,vit,vim,ctl}';
const VI_PREVIEW_WARM_EXCLUDE = '**/{node_modules,.git,out,dist,.vscode-test}/**';
/**
 * Upper bound on VIs warmed per session. Generous so the warmer silently caches
 * an entire repo's previews (VHS-REQ-659, #649); bounded only to avoid runaway
 * background work on a pathological tree. The render cache (`createViPreviewCache`)
 * retains at least this many entries so full-repo warming never self-evicts.
 */
const MAX_WARM_FILES = 5000;
/** How long the completed indicator lingers before it is retired. */
const WARM_DONE_LINGER_MS = 5000;
/** Longer linger for the all-failed outcome so the warning is not missed. */
const WARM_FAILED_LINGER_MS = 15000;

/**
 * Reads the `viHistorySuite.preview.backgroundWarming` mode, falling back to the
 * safe `docker-only` default for an unset or unexpected value.
 */
function readBackgroundWarmingMode(): ViPreviewBackgroundWarmingMode {
  const value = vscode.workspace
    .getConfiguration('viHistorySuite')
    .get<string>('preview.backgroundWarming', 'docker-only');
  return value === 'always' || value === 'off' ? value : 'docker-only';
}

export interface ViPreviewCacheWarmerService {
  /** Signals that a preview opened; starts a warm cycle once (idempotent per cycle). */
  notePreviewOpened(viFsPath: string): void;
  /** Starts background caching of the whole workspace (no VI excluded). */
  startWarming(): void;
  /** Cancels an in-progress/scheduled warm cycle and allows a later restart. */
  cancelWarming(): void;
  dispose(): void;
}

export function createViPreviewCacheWarmerService(
  _context: vscode.ExtensionContext,
  sessionManager: ViPreviewSessionManager
): ViPreviewCacheWarmerService {
  let disposed = false;
  // Latched when a warm cycle starts so repeated triggers do not re-warm; reset
  // by `cancelCurrentCycle` so a later restart (e.g. re-enabling) can run again.
  let hasRunThisSession = false;
  // Per-cycle cancellation token; `cancelCurrentCycle` flips `cancelled` so an
  // in-flight warm loop stops after the current render.
  let cycleToken: { cancelled: boolean } | undefined;
  let doneTimer: ReturnType<typeof setTimeout> | undefined;
  let statusItem: vscode.StatusBarItem | undefined;

  async function run(excludeFsPath: string, token: { cancelled: boolean }): Promise<void> {
    const mode = readBackgroundWarmingMode();
    if (disposed || token.cancelled || mode === 'off') {
      return;
    }
    const runtime = await resolvePreviewRuntime();
    // Background warming pre-renders the workspace through a warm session so
    // later opens are instant. Whether it runs for the resolved provider is
    // governed by the `viHistorySuite.preview.backgroundWarming` setting:
    // `docker-only` (default) limits it to the container providers so it never
    // occupies the user's host LabVIEW, `always` also warms host-native, and
    // `off` disables it (handled above). Interactive opens still warm the host
    // session on demand regardless of this setting.
    const sessionRuntime =
      runtime.outcome === 'ready'
        ? toViPreviewSessionRuntime(runtime.runtime, process.platform)
        : undefined;
    if (
      disposed ||
      token.cancelled ||
      !sessionRuntime ||
      !shouldWarmViPreviewProvider(sessionRuntime.provider, mode)
    ) {
      return;
    }

    const uris = await vscode.workspace.findFiles(
      VI_PREVIEW_WARM_GLOB,
      VI_PREVIEW_WARM_EXCLUDE,
      MAX_WARM_FILES
    );
    const excludeNormalized = path.normalize(excludeFsPath);
    const viFilePaths = uris
      .map((uri) => uri.fsPath)
      .filter((fsPath) => path.normalize(fsPath) !== excludeNormalized);

    if (disposed || token.cancelled || viFilePaths.length === 0) {
      return;
    }

    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusItem.show();

    const finalProgress = await warmViPreviewCache(viFilePaths, {
      renderOne: async (viFilePath) => {
        const result = await sessionManager.renderVi(sessionRuntime, viFilePath, 'warm');
        return result.outcome === 'rendered' ? 'succeeded' : 'failed';
      },
      onProgress: (progress) => {
        if (statusItem) {
          statusItem.text = formatWarmStatusLabel(progress);
          statusItem.tooltip = formatWarmStatusTooltip(progress);
        }
      },
      isCancelled: () => disposed || token.cancelled
    });

    if (statusItem && !(disposed || token.cancelled)) {
      // When nothing could be cached (every render failed), make the indicator
      // noticeable — warn-colored and lingering longer — instead of a silent
      // success, so the user can react (e.g. check the runtime).
      const cachingFailed = finalProgress.succeeded === 0 && finalProgress.failed > 0;
      if (cachingFailed) {
        statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      }
      doneTimer = setTimeout(
        () => statusItem?.dispose(),
        cachingFailed ? WARM_FAILED_LINGER_MS : WARM_DONE_LINGER_MS
      );
    } else {
      statusItem?.dispose();
    }
  }

  function begin(excludeFsPath: string): void {
    if (disposed || hasRunThisSession) {
      return;
    }
    hasRunThisSession = true;
    const token = { cancelled: false };
    cycleToken = token;
    // Warm immediately (no start debounce): kick off the background workspace
    // warm as soon as a preview opens.
    void run(excludeFsPath, token)
      .catch(() => undefined)
      .finally(() => {
        if (cycleToken === token) {
          cycleToken = undefined;
        }
      });
  }

  function cancelCurrentCycle(): void {
    if (cycleToken) {
      cycleToken.cancelled = true;
      cycleToken = undefined;
    }
    // Allow a later restart (e.g. the user re-enables VI preview).
    hasRunThisSession = false;
    if (doneTimer) {
      clearTimeout(doneTimer);
      doneTimer = undefined;
    }
    statusItem?.dispose();
    statusItem = undefined;
  }

  return {
    notePreviewOpened(viFsPath: string): void {
      begin(viFsPath);
    },
    startWarming(): void {
      begin('');
    },
    cancelWarming(): void {
      cancelCurrentCycle();
    },
    dispose(): void {
      disposed = true;
      cancelCurrentCycle();
    }
  };
}
