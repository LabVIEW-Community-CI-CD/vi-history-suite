/**
 * Unit tests for the shared Docker daemon container-mode resolution
 * (VHS-REQ-649/650), relocated from the picker command tests when the prober and
 * confirmed-platform resolver moved into `src/tooling/dockerDaemonPlatform.ts`.
 */

import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  defaultProbeDockerDaemonPlatform,
  resolveConfirmedContainerPlatform,
  resolveHostContainerPlatform
} from '../../src/tooling/dockerDaemonPlatform';

describe('resolveHostContainerPlatform (VHS-REQ-649)', () => {
  it('maps win32 to windows and everything else to linux', () => {
    expect(resolveHostContainerPlatform('win32')).toBe('windows');
    expect(resolveHostContainerPlatform('linux')).toBe('linux');
    expect(resolveHostContainerPlatform('darwin')).toBe('linux');
  });
});

describe('resolveConfirmedContainerPlatform (VHS-REQ-649/650)', () => {
  it('returns the probed Docker daemon mode when the probe succeeds (VHS-REQ-649.6)', async () => {
    expect(await resolveConfirmedContainerPlatform(async () => 'linux')).toBe('linux');
    expect(await resolveConfirmedContainerPlatform(async () => 'windows')).toBe('windows');
  });

  it('returns undefined (unknown) when the probe is inconclusive, not a host guess (VHS-REQ-649.6, VHS-REQ-650.6)', async () => {
    // Docker stopped/timing out: the mode is unknown. It must NOT be reported as
    // the host OS, so stale cross-platform detection cannot fire on a guess.
    expect(await resolveConfirmedContainerPlatform(async () => undefined)).toBeUndefined();
  });

  it('returns undefined when the probe rejects, never blocking selection (VHS-REQ-649.6)', async () => {
    const rejectingProbe = vi.fn().mockRejectedValue(new Error('docker info failed'));
    expect(await resolveConfirmedContainerPlatform(rejectingProbe)).toBeUndefined();
  });

  it('returns the explicit override without probing the daemon (VHS-REQ-649.6)', async () => {
    const probe = vi.fn();
    expect(await resolveConfirmedContainerPlatform(probe as never, 'windows')).toBe('windows');
    expect(probe).not.toHaveBeenCalled();
  });
});

// The default prober is the real docker-info I/O edge behind VHS-REQ-649's
// Docker-mode detection. Its spawn boundary is injected (repository convention),
// so its output mapping and fail-closed-to-unknown behavior are verifiable.
function makeFakeDockerChild() {
  const stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  const stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn(), resume: vi.fn() });
  const child = Object.assign(new EventEmitter(), { stdout, stderr, kill: vi.fn() });
  return { child, stdout };
}

describe('defaultProbeDockerDaemonPlatform (VHS-REQ-649)', () => {
  it('probes docker info and maps a windows OSType to the windows container platform (VHS-REQ-649.6)', async () => {
    const { child, stdout } = makeFakeDockerChild();
    const spawnImpl = vi.fn(() => child);

    const probe = defaultProbeDockerDaemonPlatform(spawnImpl as never);
    stdout.emit('data', 'windows\n');
    child.emit('close', 0);

    expect(await probe).toBe('windows');
    expect(spawnImpl).toHaveBeenCalledWith(
      'docker',
      ['info', '--format', '{{.OSType}}'],
      { windowsHide: true }
    );
  });

  it('maps a trimmed, case-insensitive linux OSType to the linux container platform (VHS-REQ-649.6)', async () => {
    const { child, stdout } = makeFakeDockerChild();

    const probe = defaultProbeDockerDaemonPlatform(vi.fn(() => child) as never);
    stdout.emit('data', '  LINUX\n');
    child.emit('close', 0);

    expect(await probe).toBe('linux');
  });

  it('resolves undefined (unknown) for unrecognized daemon output (VHS-REQ-649.6)', async () => {
    const { child, stdout } = makeFakeDockerChild();

    const probe = defaultProbeDockerDaemonPlatform(vi.fn(() => child) as never);
    stdout.emit('data', 'moby\n');
    child.emit('close', 0);

    expect(await probe).toBeUndefined();
  });

  it('resolves undefined when the child process errors (Docker unavailable) (VHS-REQ-649.6)', async () => {
    const { child } = makeFakeDockerChild();

    const probe = defaultProbeDockerDaemonPlatform(vi.fn(() => child) as never);
    child.emit('error', new Error('spawn docker ENOENT'));

    expect(await probe).toBeUndefined();
  });

  it('resolves undefined when spawning throws synchronously (Docker CLI missing) (VHS-REQ-649.6)', async () => {
    const spawnImpl = vi.fn(() => {
      throw new Error('docker CLI missing');
    });

    expect(await defaultProbeDockerDaemonPlatform(spawnImpl as never)).toBeUndefined();
  });

  it('resolves undefined and kills a wedged daemon when the probe times out (VHS-REQ-649.6)', async () => {
    vi.useFakeTimers();
    try {
      const { child } = makeFakeDockerChild();

      const probe = defaultProbeDockerDaemonPlatform(vi.fn(() => child) as never);
      await vi.advanceTimersByTimeAsync(5_000);

      expect(await probe).toBeUndefined();
      expect(child.kill).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles once and ignores late events after resolving', async () => {
    const { child, stdout } = makeFakeDockerChild();

    const probe = defaultProbeDockerDaemonPlatform(vi.fn(() => child) as never);
    stdout.emit('data', 'linux');
    child.emit('close', 0);
    expect(await probe).toBe('linux');

    // A late error event must neither throw nor change the resolved value.
    expect(() => child.emit('error', new Error('late'))).not.toThrow();
  });
});
