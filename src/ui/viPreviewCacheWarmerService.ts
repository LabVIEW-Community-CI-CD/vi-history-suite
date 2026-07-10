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
/** Upper bound on VIs warmed per session; keeps background work bounded. */
const MAX_WARM_FILES = 200;
/** Delay before warming so the just-opened preview finishes first. */
const WARM_START_DELAY_MS = 5000;
/** How long the completed indicator lingers before it is retired. */
const WARM_DONE_LINGER_MS = 5000;

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
  /** Signals that a preview opened; starts warming once (idempotent per session). */
  notePreviewOpened(viFsPath: string): void;
  dispose(): void;
}

export function createViPreviewCacheWarmerService(
  _context: vscode.ExtensionContext,
  sessionManager: ViPreviewSessionManager
): ViPreviewCacheWarmerService {
  let started = false;
  let cancelled = false;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let doneTimer: ReturnType<typeof setTimeout> | undefined;
  let statusItem: vscode.StatusBarItem | undefined;

  async function run(excludeFsPath: string): Promise<void> {
    const mode = readBackgroundWarmingMode();
    if (cancelled || mode === 'off') {
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
      cancelled ||
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

    if (cancelled || viFilePaths.length === 0) {
      return;
    }

    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusItem.show();

    await warmViPreviewCache(viFilePaths, {
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
      isCancelled: () => cancelled
    });

    if (statusItem && !cancelled) {
      doneTimer = setTimeout(() => statusItem?.dispose(), WARM_DONE_LINGER_MS);
    } else {
      statusItem?.dispose();
    }
  }

  return {
    notePreviewOpened(viFsPath: string): void {
      if (started || cancelled) {
        return;
      }
      started = true;
      startTimer = setTimeout(() => {
        void run(viFsPath).catch(() => undefined);
      }, WARM_START_DELAY_MS);
    },
    dispose(): void {
      cancelled = true;
      if (startTimer) {
        clearTimeout(startTimer);
      }
      if (doneTimer) {
        clearTimeout(doneTimer);
      }
      statusItem?.dispose();
    }
  };
}
