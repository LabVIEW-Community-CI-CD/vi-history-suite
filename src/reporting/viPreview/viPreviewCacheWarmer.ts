/**
 * VHS-REQ-659: background preview cache warmer (progress + serial loop).
 *
 * After the user opens a VI preview under the Docker (container) runtime, the
 * extension silently pre-renders the remaining VIs so later opens are instant
 * (served from the render cache). Because each render is an expensive container
 * launch, warming is strictly serial. A monotonically increasing percentage is
 * surfaced so the user can see caching progress without any intrusive prompt.
 *
 * This module holds the pure progress math and the DI-driven warm loop so both
 * stay unit-testable without VS Code, a filesystem, or Docker.
 */

export interface ViPreviewWarmProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  /** Floor(completed/total*100), clamped 0..100; increases monotonically. */
  percent: number;
  done: boolean;
}

export function computeWarmPercent(completed: number, total: number): number {
  if (total <= 0) {
    return 100;
  }
  const percent = Math.floor((completed / total) * 100);
  return Math.max(0, Math.min(100, percent));
}

/** Status-bar label for a warm progress snapshot (uses VS Code codicon markup). */
export function formatWarmStatusLabel(progress: ViPreviewWarmProgress): string {
  if (progress.done) {
    return '$(check) VI previews cached';
  }
  return `$(sync~spin) Caching VI previews ${progress.percent}%`;
}

export type WarmRenderOutcome = 'succeeded' | 'failed';

export interface WarmViPreviewCacheDeps {
  /** Renders (and caches) one VI. Rejections are treated as `failed`. */
  renderOne: (viFilePath: string) => Promise<WarmRenderOutcome>;
  /** Receives a snapshot after the initial state and after each render. */
  onProgress: (progress: ViPreviewWarmProgress) => void;
  /** Polled before each render; when true the loop stops early (done). */
  isCancelled?: () => boolean;
}

/**
 * Warms the preview cache for `viFilePaths` serially, reporting progress after
 * each. Never throws: a failing render counts as `failed` and the loop
 * continues. Stops early (marking done) when `isCancelled` returns true.
 */
export async function warmViPreviewCache(
  viFilePaths: readonly string[],
  deps: WarmViPreviewCacheDeps
): Promise<ViPreviewWarmProgress> {
  const total = viFilePaths.length;
  let completed = 0;
  let succeeded = 0;
  let failed = 0;

  const snapshot = (done: boolean): ViPreviewWarmProgress => {
    const progress: ViPreviewWarmProgress = {
      total,
      completed,
      succeeded,
      failed,
      percent: computeWarmPercent(completed, total),
      done
    };
    deps.onProgress(progress);
    return progress;
  };

  snapshot(total === 0);

  for (const viFilePath of viFilePaths) {
    if (deps.isCancelled?.()) {
      return snapshot(true);
    }

    let outcome: WarmRenderOutcome;
    try {
      outcome = await deps.renderOne(viFilePath);
    } catch {
      outcome = 'failed';
    }

    completed += 1;
    if (outcome === 'succeeded') {
      succeeded += 1;
    } else {
      failed += 1;
    }
    snapshot(completed >= total);
  }

  return snapshot(true);
}
