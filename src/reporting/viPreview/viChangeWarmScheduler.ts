/**
 * VHS-REQ-664: proactively warm the preview render cache and the semantic
 * comparison narrative cache for a VI that just changed on disk, so a reviewer
 * finds both the preview and the Source Control "what changed" hover ready
 * without waiting on a cold LabVIEW run.
 *
 * This module holds the vscode-free, injected core: an immediate per-change
 * dispatcher (no debounce timer), a gating decision that encodes the Docker-only
 * + opt-in + trust rules, and a best-effort per-VI warm orchestrator. The
 * `FileSystemWatcher` host binding and the concrete preview/comparison warm
 * implementations live in `src/ui/viChangeWarmerService.ts`.
 */

// --- Change dispatcher ------------------------------------------------------

export interface ViChangeWarmSchedulerDeps {
  /** Invoked for each noted change path. */
  onSettled: (fsPath: string) => void;
}

export interface ViChangeWarmScheduler {
  /** Notes a change for `fsPath` and dispatches it immediately (no debounce). */
  note(fsPath: string): void;
  /** No-op retained for lifecycle symmetry (there are no pending timers). */
  dispose(): void;
}

/**
 * Creates a change dispatcher. Each `note` dispatches `onSettled` immediately —
 * there is no debounce timer (single-cycle model: no wait). Redundant warms from
 * an editor's multi-write save are absorbed downstream by the warm orchestrator's
 * single-flight serialization, not by a timed coalescer.
 */
export function createViChangeWarmScheduler(deps: ViChangeWarmSchedulerDeps): ViChangeWarmScheduler {
  return {
    note(fsPath: string): void {
      deps.onSettled(fsPath);
    },
    dispose(): void {
      /* no pending timers to cancel */
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
