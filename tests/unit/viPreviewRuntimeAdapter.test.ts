import { describe, expect, it } from 'vitest';

import { mapComparisonRuntimeSelectionToViPreview } from '../../src/reporting/viPreview/viPreviewRuntimeAdapter';

describe('mapComparisonRuntimeSelectionToViPreview', () => {
  it('maps a host-native selection to a host-native preview runtime', () => {
    const result = mapComparisonRuntimeSelectionToViPreview({
      provider: 'host-native',
      labviewCli: { path: '/usr/local/bin/LabVIEWCLI', exists: true },
      labviewExe: { path: '/opt/lv/labview', exists: true },
      hostLabviewTcpPort: 3363
    });

    expect(result).toEqual({
      outcome: 'ready',
      runtime: {
        provider: 'host-native',
        labviewCliPath: '/usr/local/bin/LabVIEWCLI',
        labviewExePath: '/opt/lv/labview',
        portNumber: 3363
      }
    });
  });

  it('maps a linux-container selection and resolves the image-derived LabVIEW path', () => {
    const result = mapComparisonRuntimeSelectionToViPreview(
      { provider: 'linux-container', containerImage: 'nationalinstruments/labview:2026q1patch2-linux' },
      { connectTimeoutSeconds: 200 }
    );

    expect(result.outcome).toBe('ready');
    if (result.outcome !== 'ready') {
      return;
    }
    expect(result.runtime.provider).toBe('linux-container');
    expect(result.runtime.containerImage).toBe('nationalinstruments/labview:2026q1patch2-linux');
    expect(result.runtime.containerLabviewPath).toContain('labview');
    expect(result.runtime.connectTimeoutSeconds).toBe(200);
  });

  it('maps a windows-container selection to a ready runtime with the host PowerShell (VHS-REQ-659.4)', () => {
    const result = mapComparisonRuntimeSelectionToViPreview(
      {
        provider: 'windows-container',
        containerImage: 'ni/labview:2026-windows',
        labviewExe: { path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe', exists: true }
      },
      { connectTimeoutSeconds: 200, processPlatform: 'win32' }
    );

    expect(result.outcome).toBe('ready');
    if (result.outcome !== 'ready') {
      return;
    }
    expect(result.runtime.provider).toBe('windows-container');
    expect(result.runtime.containerImage).toBe('ni/labview:2026-windows');
    expect(result.runtime.containerLabviewPath).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );
    expect(result.runtime.connectTimeoutSeconds).toBe(200);
    expect(result.runtime.windowsPowerShellHostExecutable).toBe('powershell.exe');
  });

  it('leaves the windows PowerShell host unresolved when no platform is supplied (VHS-REQ-659.4)', () => {
    const result = mapComparisonRuntimeSelectionToViPreview({
      provider: 'windows-container',
      containerImage: 'ni/labview:2026-windows'
    });
    expect(result.outcome).toBe('ready');
    if (result.outcome !== 'ready') {
      return;
    }
    expect(result.runtime.windowsPowerShellHostExecutable).toBeUndefined();
  });

  it('blocks an unavailable runtime and preserves the blocked reason', () => {
    expect(
      mapComparisonRuntimeSelectionToViPreview({
        provider: 'unavailable',
        blockedReason: 'labview-cli-not-found'
      })
    ).toEqual({ outcome: 'blocked', reason: 'labview-cli-not-found' });

    expect(mapComparisonRuntimeSelectionToViPreview({ provider: 'unavailable' })).toEqual({
      outcome: 'blocked',
      reason: 'runtime-unavailable'
    });
  });
});
