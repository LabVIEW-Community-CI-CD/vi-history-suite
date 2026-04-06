import { describe, expect, it, vi } from 'vitest';

import {
  cleanupWindowsHostRuntimeSurface,
  inspectWindowsHostRuntimeSurface,
  launchWindowsHeadlessLabview
} from '../../src/cli/windowsHostRuntimeSurface';

describe('windowsHostRuntimeSurface', () => {
  it('parses Windows host runtime process observations deterministically', async () => {
    const execFileImpl = vi.fn((_file, _args, callback) => {
      callback(
        null,
        '[{"ProcessName":"LabVIEWCLI","Id":42,"Path":"C:\\\\Program Files (x86)\\\\National Instruments\\\\Shared\\\\LabVIEW CLI\\\\LabVIEWCLI.exe"},{"ProcessName":"LabVIEW","Id":7,"Path":"C:\\\\Program Files\\\\National Instruments\\\\LabVIEW 2026\\\\LabVIEW.exe"}]',
        ''
      );
      return {} as never;
    });

    await expect(
      inspectWindowsHostRuntimeSurface({
        execFileImpl: execFileImpl as never,
        nowIso: () => '2026-04-06T12:00:00.000Z'
      })
    ).resolves.toEqual({
      capturedAt: '2026-04-06T12:00:00.000Z',
      processes: [
        {
          processName: 'LabVIEW',
          pid: 7,
          path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
        },
        {
          processName: 'LabVIEWCLI',
          pid: 42,
          path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
        }
      ],
      processNames: ['LabVIEW', 'LabVIEWCLI']
    });
  });

  it('cleans the Windows host runtime surface and fails closed on PowerShell errors', async () => {
    const execFileImpl = vi.fn((_file, _args, callback) => {
      callback(new Error('cleanup failed') as never, '', 'cleanup failed');
      return {} as never;
    });

    await expect(
      cleanupWindowsHostRuntimeSurface({
        execFileImpl: execFileImpl as never
      })
    ).rejects.toThrow('cleanup failed');
  });

  it('launches headless LabVIEW and retains the process id', async () => {
    const execFileImpl = vi.fn((_file, _args, callback) => {
      callback(null, '{"Id":54860}', '');
      return {} as never;
    });

    await expect(
      launchWindowsHeadlessLabview('C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe', {
        execFileImpl: execFileImpl as never
      })
    ).resolves.toBe(54860);
  });
});
