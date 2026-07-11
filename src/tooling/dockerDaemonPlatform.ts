/**
 * VHS-REQ-649/650: Docker daemon container-mode resolution.
 *
 * Shared boundary for determining which container platform (`windows` |
 * `linux`) the active Docker engine runs, used by the image-version picker
 * (VHS-REQ-649) and the runtime status bar (VHS-REQ-650). The default prober
 * shells out to `docker info`, so this module owns the `child_process`
 * dependency that the platform-pure `containerImageCatalog` must not carry.
 *
 * Confirmed-mode guarantee: `resolveConfirmedContainerPlatform` returns a
 * platform only when it is an explicit override or a successful probe, and
 * `undefined` when the mode cannot be determined. Callers MUST treat `undefined`
 * as "unknown" and MUST NOT assume the host OS is the engine mode — Docker
 * Desktop on a Windows host commonly runs Linux containers — so a valid
 * selection is never flagged against a guess.
 */

import { spawn } from 'node:child_process';

import { ContainerImagePlatform } from './containerImageCatalog';

/** Bounded wait for the `docker info` daemon-mode probe before giving up. */
const DOCKER_DAEMON_PROBE_TIMEOUT_MS = 5_000;

/** Resolve the container platform a comparison would target on this host OS. */
export function resolveHostContainerPlatform(
  platform: NodeJS.Platform = process.platform
): ContainerImagePlatform {
  return platform === 'win32' ? 'windows' : 'linux';
}

/**
 * VHS-REQ-649: Injected boundary returning the active Docker daemon container
 * mode (`windows` | `linux`), or undefined when Docker is unavailable, the
 * daemon is unreachable, or the mode cannot be determined. The default
 * implementation runs `docker info --format {{.OSType}}`.
 */
export type DockerDaemonPlatformProber = () => Promise<ContainerImagePlatform | undefined>;

/**
 * VHS-REQ-649/650: Resolve the *confirmed* active container platform — an
 * explicit override or a successfully probed Docker daemon mode — or undefined
 * when the daemon mode cannot be determined (Docker stopped, unreachable, or the
 * probe times out / rejects).
 *
 * Callers MUST treat undefined as "unknown" and MUST NOT assume the host OS is
 * the engine mode: Docker Desktop on a Windows host commonly runs Linux
 * containers once started, so a stopped/timing-out probe does not mean
 * Windows-container mode. Display surfaces (image listing) may fall back to the
 * host default so selection still works, but correctness-sensitive decisions —
 * notably flagging a stale cross-platform selection (VHS-REQ-650) — must use
 * only this confirmed value so a valid selection is never falsely flagged
 * against a guess.
 */
export async function resolveConfirmedContainerPlatform(
  probeDaemonPlatform: DockerDaemonPlatformProber,
  explicitPlatform?: ContainerImagePlatform
): Promise<ContainerImagePlatform | undefined> {
  if (explicitPlatform) {
    return explicitPlatform;
  }
  try {
    return await probeDaemonPlatform();
  } catch {
    // VHS-REQ-649: a throwing/rejecting probe must never block selection; treat
    // it as an inconclusive (unknown) mode, not a host-OS assumption.
    return undefined;
  }
}

/**
 * VHS-REQ-649: Default Docker daemon container-mode prober. Runs
 * `docker info --format {{.OSType}}` with discrete arguments (no shell) and maps
 * the result to `windows`/`linux`. Any failure — missing Docker CLI, unreachable
 * daemon, unrecognized output, or a wedged daemon that does not respond within
 * `DOCKER_DAEMON_PROBE_TIMEOUT_MS` — resolves to undefined so the caller falls
 * back to the host default rather than erroring or hanging. The `spawnImpl`
 * boundary is injected in tests (following the repository's spawn-injection
 * convention); production uses the real `node:child_process.spawn`.
 */
export const defaultProbeDockerDaemonPlatform = (
  spawnImpl: typeof spawn = spawn
): Promise<ContainerImagePlatform | undefined> =>
  new Promise((resolve) => {
    let stdout = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let child: ReturnType<typeof spawn> | undefined;
    const finish = (value: ContainerImagePlatform | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve(value);
    };
    try {
      child = spawnImpl('docker', ['info', '--format', '{{.OSType}}'], { windowsHide: true });
      timer = setTimeout(() => {
        child?.kill();
        finish(undefined);
      }, DOCKER_DAEMON_PROBE_TIMEOUT_MS);
      timer.unref?.();
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
      });
      // Drain stderr so an erroring daemon does not leave an unconsumed stream.
      child.stderr?.resume();
      child.on('error', () => finish(undefined));
      child.on('close', () => {
        const mode = stdout.trim().toLowerCase();
        finish(mode === 'windows' || mode === 'linux' ? mode : undefined);
      });
    } catch {
      finish(undefined);
    }
  });
