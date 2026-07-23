import { describe, expect, it } from 'vitest';

import type { ViPreviewRuntimeSelection } from '../../src/reporting/viPreview/viPreviewExecution';
import {
  selectLaunchedLabviewPid,
  toViPreviewSessionRuntime,
  viPreviewSessionKey
} from '../../src/reporting/viPreview/viPreviewSessionRuntime';

function selection(overrides: Partial<ViPreviewRuntimeSelection>): ViPreviewRuntimeSelection {
  return { provider: 'host-native', ...overrides } as ViPreviewRuntimeSelection;
}

describe('toViPreviewSessionRuntime', () => {
  it('maps linux-container with an image on any host', () => {
    for (const platform of ['linux', 'win32', 'darwin'] as NodeJS.Platform[]) {
      const result = toViPreviewSessionRuntime(
        selection({
          provider: 'linux-container',
          containerImage: 'ni/labview:2026q1-linux',
          containerLabviewPath: '/usr/local/bin/labview',
          connectTimeoutSeconds: 200
        }),
        platform
      );
      expect(result).toEqual({
        provider: 'linux-container',
        containerImage: 'ni/labview:2026q1-linux',
        containerLabviewPath: '/usr/local/bin/labview',
        connectTimeoutSeconds: 200
      });
    }
  });

  it('returns undefined for linux-container without an image', () => {
    expect(toViPreviewSessionRuntime(selection({ provider: 'linux-container' }), 'linux')).toBeUndefined();
  });

  it('maps windows-container with an image only on a Windows host', () => {
    const runtime = selection({ provider: 'windows-container', containerImage: 'ni/labview:2026-windows' });
    expect(toViPreviewSessionRuntime(runtime, 'win32')).toEqual({
      provider: 'windows-container',
      containerImage: 'ni/labview:2026-windows',
      containerLabviewPath: undefined,
      connectTimeoutSeconds: undefined
    });
    // A non-Windows host bridges Docker through Windows PowerShell => no session.
    expect(toViPreviewSessionRuntime(runtime, 'linux')).toBeUndefined();
  });

  it('maps host-native only on a Windows host with a resolved LabVIEWCLI', () => {
    const runtime = selection({
      provider: 'host-native',
      labviewCliPath: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      labviewExePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      portNumber: 3364
    });
    expect(toViPreviewSessionRuntime(runtime, 'win32')).toEqual({
      provider: 'host-native',
      labviewCliPath: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      labviewExePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      portNumber: 3364
    });
    expect(toViPreviewSessionRuntime(runtime, 'linux')).toBeUndefined();
  });

  it('returns undefined for host-native without a LabVIEWCLI path', () => {
    expect(toViPreviewSessionRuntime(selection({ provider: 'host-native' }), 'win32')).toBeUndefined();
  });
});

describe('viPreviewSessionKey', () => {
  it('keys container sessions by provider and image', () => {
    expect(viPreviewSessionKey({ provider: 'linux-container', containerImage: 'img-a' })).toBe(
      'linux-container::img-a'
    );
    expect(viPreviewSessionKey({ provider: 'windows-container', containerImage: 'img-b' })).toBe(
      'windows-container::img-b'
    );
  });

  it('keys host-native sessions by the LabVIEWCLI path, resolved install, and port', () => {
    expect(
      viPreviewSessionKey({
        provider: 'host-native',
        labviewCliPath: 'C:\\cli.exe',
        labviewExePath: 'C:\\LabVIEW 2026\\LabVIEW.exe',
        portNumber: 3364
      })
    ).toBe('host-native::C:\\cli.exe::C:\\LabVIEW 2026\\LabVIEW.exe::3364');
  });

  it('changes the host key when the resolved install or port changes', () => {
    const base = { provider: 'host-native' as const, labviewCliPath: 'C:\\cli.exe' };
    const a = viPreviewSessionKey({ ...base, labviewExePath: 'C:\\LabVIEW 2026\\LabVIEW.exe', portNumber: 3364 });
    const differentInstall = viPreviewSessionKey({ ...base, labviewExePath: 'C:\\LabVIEW 2024\\LabVIEW.exe', portNumber: 3364 });
    const differentPort = viPreviewSessionKey({ ...base, labviewExePath: 'C:\\LabVIEW 2026\\LabVIEW.exe', portNumber: 3363 });
    expect(a).not.toBe(differentInstall);
    expect(a).not.toBe(differentPort);
  });
});

describe('selectLaunchedLabviewPid', () => {
  it('claims the single new instance when none was running at start', () => {
    expect(selectLaunchedLabviewPid([], [42])).toBe(42);
  });

  it('owns nothing when a LabVIEW was already running at start (reused)', () => {
    // Pre-existing user LabVIEW; a render reused it (no new instance) or the user
    // has one open — never reclaim it.
    expect(selectLaunchedLabviewPid([7], [7])).toBeUndefined();
    expect(selectLaunchedLabviewPid([7], [7, 42])).toBeUndefined();
  });

  it('owns nothing when the launch is ambiguous (zero or several new instances)', () => {
    expect(selectLaunchedLabviewPid([], [])).toBeUndefined();
    // Two new instances (e.g. the user launched LabVIEW concurrently) => bail safe.
    expect(selectLaunchedLabviewPid([], [42, 43])).toBeUndefined();
  });
});

describe('viPreviewSessionRuntime edge branches (VHS-REQ-659)', () => {
  it('returns undefined for an unrecognized provider (fail-safe default)', () => {
    // A provider outside the known set falls through every branch to the final
    // `return undefined`, so the caller renders per-invocation.
    expect(
      toViPreviewSessionRuntime(
        { provider: 'unknown-provider' } as unknown as ViPreviewRuntimeSelection,
        'win32'
      )
    ).toBeUndefined();
  });

  it('keys a host-native session with empty segments when optional fields are absent', () => {
    // The three `?? ''` fallbacks (CLI path, install path, port) all fire.
    expect(viPreviewSessionKey({ provider: 'host-native' })).toBe('host-native::::::');
  });

  it('keys a container session with an empty image segment when no image is set', () => {
    // The container branch's `?? ''` image fallback fires for both providers.
    expect(viPreviewSessionKey({ provider: 'linux-container' })).toBe('linux-container::');
    expect(viPreviewSessionKey({ provider: 'windows-container' })).toBe('windows-container::');
  });
});
