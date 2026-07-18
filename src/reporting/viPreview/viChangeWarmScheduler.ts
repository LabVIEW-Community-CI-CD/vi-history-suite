/**
 * VHS-REQ-664: proactively warm the preview render cache and the semantic
 * comparison narrative cache for a VI that just changed on disk, so a reviewer
 * finds both the preview and the Source Control "what changed" hover ready
 * without waiting on a cold LabVIEW run.
 *
 * This module holds the vscode-free, injected-timer core: a per-path debouncer
 * that coalesces the several writes LabVIEW makes per save, a gating decision
 * that encodes the Docker-only + opt-in + trust rules, and a best-effort per-VI
 * warm orchestrator. The `FileSystemWatcher` host binding and the concrete
 * preview/comparison warm implementations live in
 * `src/ui/viChangeWarmerService.ts`.
 */

// --- Debounce scheduler -----------------------------------------------------

export interface ViChangeWarmSchedulerDeps {
  /** Debounce window (ms) that coalesces rapid writes for the same path. */
  debounceMs: number;
  /** Invoked once a path settles (no further change within the window). */
  onSettled: (fsPath: string) => void;
  /** Injected timer scheduler (host `setTimeout`) so debouncing is testable. */
  setTimeout: (handler: () => void, ms: number) => unknown;
  /** Injected timer canceller (host `clearTimeout`). */
  clearTimeout: (handle: unknown) => void;
}

export interface ViChangeWarmScheduler {
  /** Notes a change for `fsPath`, (re)arming its debounce timer. */
  note(fsPath: string): void;
  /** Cancels every pending timer (e.g. on disposal). */
  dispose(): void;
}

/**
 * Creates a per-path debouncer. Repeated `note` calls for the same path within
 * the window collapse to a single `onSettled`, so the burst of writes LabVIEW
 * makes while saving a VI triggers exactly one warm.
 */
export function createViChangeWarmScheduler(deps: ViChangeWarmSchedulerDeps): ViChangeWarmScheduler {
  const timers = new Map<string, unknown>();

  function clearFor(fsPath: string): void {
    const handle = timers.get(fsPath);
    if (handle !== undefined) {
      deps.clearTimeout(handle);
      timers.delete(fsPath);
    }
  }

  return {
    note(fsPath: string): void {
      clearFor(fsPath);
      const handle = deps.setTimeout(() => {
        timers.delete(fsPath);
        deps.onSettled(fsPath);
      }, deps.debounceMs);
      timers.set(fsPath, handle);
    },
    dispose(): void {
      for (const handle of timers.values()) {
        deps.clearTimeout(handle);
      }
      timers.clear();
    }
  };
}

// --- Gating -----------------------------------------------------------------

export interface ViChangeWarmGateInput {
  /** `viHistorySuite.preview.warmOnChange` (default true). */
  warmOnChangeEnabled: boolean;
  /** Whether the resolved comparison runtime is a container (Docker) provider. */
  isDocker: boolean;
  /** `viHistorySuite.preview.enabled` — gates the preview render warm. */
  previewEnabled: boolean;
  /** Workspace trust — gates the comparison warm (it launches LabVIEW). */
  isTrusted: boolean;
}

export interface ViChangeWarmPlan {
  warmPreview: boolean;
  warmComparison: boolean;
}

/**
 * Decides what to warm for a changed VI. The hard gate is Docker plus the
 * `warmOnChange` setting; the preview render warm additionally requires the
 * opt-in preview feature, and the comparison narrative warm additionally
 * requires workspace trust because it launches an external LabVIEW process.
 */
export function resolveViChangeWarmPlan(input: ViChangeWarmGateInput): ViChangeWarmPlan {
  if (!input.warmOnChangeEnabled || !input.isDocker) {
    return { warmPreview: false, warmComparison: false };
  }
  return {
    warmPreview: input.previewEnabled,
    warmComparison: input.isTrusted
  };
}

/** True when a plan asks for no warming at all (lets callers skip cheaply). */
export function isViChangeWarmPlanEmpty(plan: ViChangeWarmPlan): boolean {
  return !plan.warmPreview && !plan.warmComparison;
}

// --- Orchestrator -----------------------------------------------------------

export interface WarmChangedViDeps {
  /** Renders + caches the VI's preview (through the shared warm session). */
  warmPreview: (viFsPath: string) => Promise<void>;
  /** Runs the HEAD-vs-working comparison + records the semantic narrative. */
  warmComparison: (viFsPath: string) => Promise<void>;
}

export interface WarmChangedViResult {
  previewWarmed: boolean;
  comparisonWarmed: boolean;
}

/**
 * Warms the requested caches for one changed VI. Each warm is best-effort and
 * independent: a preview-warm failure never blocks the comparison warm, and
 * neither throws to the caller — a background warm must never surface an error.
 * Preview (fast, warm session) runs before the heavier comparison so a reviewer
 * who opens the preview immediately does not wait behind the comparison.
 */
export async function warmChangedVi(
  viFsPath: string,
  plan: ViChangeWarmPlan,
  deps: WarmChangedViDeps
): Promise<WarmChangedViResult> {
  const result: WarmChangedViResult = { previewWarmed: false, comparisonWarmed: false };

  if (plan.warmPreview) {
    try {
      await deps.warmPreview(viFsPath);
      result.previewWarmed = true;
    } catch {
      /* best-effort: preview warm failure must not affect comparison warm */
    }
  }

  if (plan.warmComparison) {
    try {
      await deps.warmComparison(viFsPath);
      result.comparisonWarmed = true;
    } catch {
      /* best-effort: comparison warm failure must never surface */
    }
  }

  return result;
}
