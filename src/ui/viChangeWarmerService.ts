import * as vscode from 'vscode';

import {
  createViChangeWarmScheduler,
  type ViChangeWarmScheduler
} from '../reporting/viPreview/viChangeWarmScheduler';

/**
 * VHS-REQ-664: registers a {@link vscode.FileSystemWatcher} for LabVIEW source
 * files and warms the preview render cache and the semantic comparison
 * narrative cache for a VI when it changes on disk, so a reviewer finds both
 * the preview and the Source Control "what changed" hover ready.
 *
 * Change events are debounced per path — LabVIEW rewrites a VI several times
 * while saving — and settled changes are processed one at a time, so a burst of
 * edits never starts overlapping background LabVIEW runs. All gating
 * (Docker-only, the opt-in setting, preview-enabled, trust) and the concrete
 * preview/comparison warm work live in the injected `onSettledChange`, which the
 * extension builds over the tested `viChangeWarmScheduler` core; this service is
 * the thin VS Code host binding.
 */

/** Glob matching the LabVIEW source files whose changes trigger warming. */
const VI_CHANGE_GLOB = '**/*.{vi,vit,vim,ctl}';

export interface ViChangeWarmerServiceDeps {
  /**
   * Warms the caches for one settled VI change. Reads live gate state and
   * performs the permitted warms. Best-effort: it must never throw. Built by the
   * extension over the tested scheduler/gating/orchestrator core.
   */
  onSettledChange: (viFsPath: string) => Promise<void>;
}

export interface ViChangeWarmerService {
  dispose(): void;
}

export function createViChangeWarmerService(
  context: vscode.ExtensionContext,
  deps: ViChangeWarmerServiceDeps
): ViChangeWarmerService {
  let disposed = false;
  // Serialize settled warms so concurrent VI changes never start overlapping
  // background LabVIEW runs; each waits for the previous to finish.
  let chain: Promise<void> = Promise.resolve();

  const scheduler: ViChangeWarmScheduler = createViChangeWarmScheduler({
    onSettled: (fsPath) => {
      if (disposed) {
        return;
      }
      chain = chain.then(async () => {
        if (disposed) {
          return;
        }
        try {
          await deps.onSettledChange(fsPath);
        } catch {
          /* best-effort background warm; a failure must never surface */
        }
      });
    }
  });

  const watcher = vscode.workspace.createFileSystemWatcher(VI_CHANGE_GLOB);
  const note = (uri: vscode.Uri): void => {
    // Only on-disk files can be rendered/compared; ignore virtual URIs.
    if (uri.scheme === 'file') {
      scheduler.note(uri.fsPath);
    }
  };
  watcher.onDidChange(note);
  watcher.onDidCreate(note);
  context.subscriptions.push(watcher);

  return {
    dispose(): void {
      disposed = true;
      scheduler.dispose();
      watcher.dispose();
    }
  };
}
