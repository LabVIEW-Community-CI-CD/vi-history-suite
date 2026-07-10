import type { ViPreviewRuntimeSelection } from './viPreviewExecution';

/**
 * VHS-REQ-659: warm preview session runtime shapes and pure selection logic.
 *
 * A warm session keeps LabVIEW resident between renders so repeat renders are
 * fast. Three providers can host one:
 * - `linux-container` / `windows-container` — a detached LabVIEW container.
 * - `host-native` — a resident host LabVIEW (launched headless by LabVIEWCLI,
 *   which persists and is reused across renders).
 *
 * These helpers are pure so the platform gating and session identity stay
 * unit-testable without VS Code, Docker, or a LabVIEW runtime.
 */

export type ViPreviewSessionProvider = 'linux-container' | 'windows-container' | 'host-native';

export interface ViPreviewSessionRuntime {
  provider: ViPreviewSessionProvider;
  /** Container image reference (container providers only). */
  containerImage?: string;
  /** In-container LabVIEW executable (container providers only). */
  containerLabviewPath?: string;
  /** VI Server connect window in seconds (container providers). */
  connectTimeoutSeconds?: number;
  /** Host LabVIEWCLI executable (host-native only). */
  labviewCliPath?: string;
  /** Host `-LabVIEWPath` value (host-native only). */
  labviewExePath?: string;
  /** VI Server port (host-native: the selected install's configured port). */
  portNumber?: number;
}

/**
 * Maps a resolved preview runtime to a warm-session runtime, or `undefined` when
 * the runtime cannot host a warm session on this platform (the caller then
 * renders per-invocation).
 *
 * The warm session drives Docker / LabVIEW processes directly, so:
 * - `linux-container` sessions work on any host (the local `docker` runs Linux
 *   containers everywhere Docker Desktop / engine is available).
 * - `windows-container` sessions require a Windows host; a non-Windows host
 *   driving Windows containers bridges Docker through Windows PowerShell and is
 *   left to the per-invocation plan.
 * - `host-native` sessions manage a resident host LabVIEW process and are
 *   currently limited to a Windows host (validated scope); other hosts use the
 *   per-invocation plan.
 */
export function toViPreviewSessionRuntime(
  runtime: ViPreviewRuntimeSelection,
  processPlatform: NodeJS.Platform
): ViPreviewSessionRuntime | undefined {
  if (runtime.provider === 'linux-container') {
    return runtime.containerImage
      ? {
          provider: 'linux-container',
          containerImage: runtime.containerImage,
          containerLabviewPath: runtime.containerLabviewPath,
          connectTimeoutSeconds: runtime.connectTimeoutSeconds
        }
      : undefined;
  }
  if (runtime.provider === 'windows-container') {
    return runtime.containerImage && processPlatform === 'win32'
      ? {
          provider: 'windows-container',
          containerImage: runtime.containerImage,
          containerLabviewPath: runtime.containerLabviewPath,
          connectTimeoutSeconds: runtime.connectTimeoutSeconds
        }
      : undefined;
  }
  if (runtime.provider === 'host-native') {
    return runtime.labviewCliPath && processPlatform === 'win32'
      ? {
          provider: 'host-native',
          labviewCliPath: runtime.labviewCliPath,
          labviewExePath: runtime.labviewExePath,
          portNumber: runtime.portNumber
        }
      : undefined;
  }
  return undefined;
}

/**
 * Stable identity for a warm session; the session manager disposes and
 * re-creates the session when this key changes (e.g. the image or host CLI
 * differs).
 */
export function viPreviewSessionKey(runtime: ViPreviewSessionRuntime): string {
  return runtime.provider === 'host-native'
    ? `host-native::${runtime.labviewCliPath ?? ''}::${runtime.labviewExePath ?? ''}::${runtime.portNumber ?? ''}`
    : `${runtime.provider}::${runtime.containerImage ?? ''}`;
}

/**
 * Selects the single host `LabVIEW.exe` PID a warm host session may reclaim on
 * dispose, given the PIDs present when the session started (`basePids`) and those
 * present right after its first render (`postFirstRenderPids`).
 *
 * Fail-safe: returns a PID only when we are certain LabVIEWCLI launched it — no
 * LabVIEW was running at session start AND exactly one new instance appeared. If
 * the session reused a pre-existing user LabVIEW (`basePids` non-empty) or the
 * result is ambiguous (zero or several new instances, e.g. the user launched
 * LabVIEW concurrently), it returns `undefined` so dispose force-kills nothing —
 * a resident instance is leaked rather than risk closing the user's LabVIEW and
 * losing unsaved work.
 */
export function selectLaunchedLabviewPid(
  basePids: readonly number[],
  postFirstRenderPids: readonly number[]
): number | undefined {
  if (basePids.length !== 0) {
    return undefined;
  }
  const appeared = postFirstRenderPids.filter((pid) => !basePids.includes(pid));
  return appeared.length === 1 ? appeared[0] : undefined;
}
