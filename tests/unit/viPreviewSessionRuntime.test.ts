import { describe, expect, it } from 'vitest';

import type { ViPreviewRuntimeSelection } from '../../src/reporting/viPreview/viPreviewExecution';
import {
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

  it('keys host-native sessions by the LabVIEWCLI path', () => {
    expect(viPreviewSessionKey({ provider: 'host-native', labviewCliPath: 'C:\\cli.exe' })).toBe(
      'host-native::C:\\cli.exe'
    );
  });
});
