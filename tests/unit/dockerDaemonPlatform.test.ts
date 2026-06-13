/**
 * Unit tests for the shared Docker daemon container-mode resolution
 * (VHS-REQ-649/650), relocated from the picker command tests when the prober and
 * confirmed-platform resolver moved into `src/tooling/dockerDaemonPlatform.ts`.
 */

import { describe, expect, it, vi } from 'vitest';

import {
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
  it('returns the probed Docker daemon mode when the probe succeeds', async () => {
    expect(await resolveConfirmedContainerPlatform(async () => 'linux')).toBe('linux');
    expect(await resolveConfirmedContainerPlatform(async () => 'windows')).toBe('windows');
  });

  it('returns undefined (unknown) when the probe is inconclusive, not a host guess', async () => {
    // Docker stopped/timing out: the mode is unknown. It must NOT be reported as
    // the host OS, so stale cross-platform detection cannot fire on a guess.
    expect(await resolveConfirmedContainerPlatform(async () => undefined)).toBeUndefined();
  });

  it('returns undefined when the probe rejects, never blocking selection', async () => {
    const rejectingProbe = vi.fn().mockRejectedValue(new Error('docker info failed'));
    expect(await resolveConfirmedContainerPlatform(rejectingProbe)).toBeUndefined();
  });

  it('returns the explicit override without probing the daemon', async () => {
    const probe = vi.fn();
    expect(await resolveConfirmedContainerPlatform(probe as never, 'windows')).toBe('windows');
    expect(probe).not.toHaveBeenCalled();
  });
});
