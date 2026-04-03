import { describe, expect, it, vi } from 'vitest';

import {
  buildDocumentedRuntimeCandidates,
  buildWindowsRegistryQueryPlans,
  locateComparisonRuntime,
  parseWindowsRegistryLabviewCandidates,
  pathExistsWithFsAccess,
  queryWindowsContainerImageAvailability,
  runWindowsRegistryQuery
} from '../../src/reporting/comparisonRuntimeLocator';

describe('comparisonRuntimeLocator', () => {
  it('adds the missing labviewCliPath manifest contract through runtime settings usage', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        labviewCliPath: 'C:\\Tools\\LabVIEWCLI.exe',
        labviewExePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
        preferBitness: 'x64'
      },
      {
        queryWindowsContainerImage: vi.fn().mockResolvedValue(false),
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Tools\\LabVIEWCLI.exe',
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
          ].includes(filePath)
        )
      }
    );

    expect(result.engine).toBe('labview-cli');
    expect(result.provider).toBe('host-native');
    expect(result.labviewCli).toMatchObject({
      path: 'C:\\Tools\\LabVIEWCLI.exe',
      source: 'configured'
    });
    expect(result.labviewExe).toMatchObject({
      path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
      bitness: 'x64',
      source: 'configured'
    });
  });

  it('fails closed when an explicitly configured runtime path is missing', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        labviewCliPath: 'C:\\Broken\\LabVIEWCLI.exe'
      },
      {
        queryWindowsContainerImage: vi.fn().mockResolvedValue(false),
        pathExists: vi.fn().mockResolvedValue(false)
      }
    );

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('configured-labview-cli-path-missing');
    expect(result.notes[0]).toContain('Configured labview-cli path does not exist');
  });

  it('uses documented Windows scan roots and falls back to LVCompare when LabVIEWCLI is unavailable', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        preferBitness: 'x64'
      },
      {
        queryWindowsContainerImage: vi.fn().mockResolvedValue(false),
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(result.engine).toBe('lvcompare');
    expect(result.labviewExe?.bitness).toBe('x64');
    expect(result.lvCompare?.path).toBe(
      'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe'
    );
    expect(result.notes).toContain('LabVIEWCLI was not located; falling back to LVCompare.');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'windows-container-image-unavailable',
        detail:
          'Windows container image nationalinstruments/labview:2026q1-windows was not available to the current host.'
      },
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'host-native-lvcompare-fallback-selected',
        detail:
          'Host-native LabVIEW 2026 and LVCompare were available, while LabVIEWCLI was not located.'
      }
    ]);
  });

  it('defaults Windows auto bitness to x86 when both host installs are available', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        preferBitness: 'auto'
      },
      {
        queryWindowsContainerImage: vi.fn().mockResolvedValue(false),
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(result.engine).toBe('labview-cli');
    expect(result.labviewExe?.bitness).toBe('x86');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'windows-container-image-unavailable',
        detail:
          'Windows container image nationalinstruments/labview:2026q1-windows was not available to the current host.'
      },
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'host-native-labview-cli-selected',
        detail:
          'Host-native LabVIEW 2026 and LabVIEWCLI were available for comparison-report execution.'
      }
    ]);
  });

  it('honors an explicit x86 preference when both Windows bitnesses are available', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        preferBitness: 'x86'
      },
      {
        queryWindowsContainerImage: vi.fn().mockResolvedValue(false),
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(result.engine).toBe('labview-cli');
    expect(result.labviewExe?.bitness).toBe('x86');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'windows-x86-reference-lane-stays-host-native',
        detail:
          'Windows x86 comparison-report execution stays host-native, so the Windows container provider was not selected for this lane.'
      },
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'host-native-labview-cli-selected',
        detail:
          'Host-native LabVIEW 2026 and LabVIEWCLI were available, and the Windows x86 lane prefers host-native execution.'
      }
    ]);
  });

  it('prefers the isolated windows container provider for auto or x64 report execution when the image is available', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        preferBitness: 'auto'
      },
      {
        queryWindowsContainerImage: vi.fn().mockResolvedValue(true),
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(result.provider).toBe('windows-container');
    expect(result.engine).toBe('labview-cli');
    expect(result.windowsContainerImage).toBe('nationalinstruments/labview:2026q1-windows');
    expect(result.labviewExe?.path).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );
    expect(result.labviewCli?.path).toBe(
      'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
    );
    expect(result.notes[0]).toContain('isolated Windows container provider image');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'selected',
        reason: 'windows-container-preferred-and-available',
        detail:
          'Windows container image nationalinstruments/labview:2026q1-windows is available and Windows 64-bit comparison-report execution prefers isolation.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'windows-container-preferred-over-host-native',
        detail:
          'Host-native Windows 64-bit execution was not selected because isolated Windows container execution is preferred when available.'
      }
    ]);
  });

  it('retains the explicit macOS 2026 Q1 unsupported constraint', async () => {
    const result = await locateComparisonRuntime('darwin');

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('labview-2026q1-unsupported-on-macos');
    expect(result.notes[0]).toContain('LabVIEW 2026 Q1 report generation');
  });

  it('fails closed when no supported LabVIEW runtime can be found', async () => {
    const result = await locateComparisonRuntime(
      'linux',
      {},
      {
        pathExists: vi.fn().mockResolvedValue(false)
      }
    );

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('labview-exe-not-found');
    expect(result.notes).toContain(
      'Install LabVIEW 2026 Q1 or configure viHistorySuite.labviewExePath to an explicit LabVIEW 2026 executable.'
    );
  });

  it('retains the best-effort Linux note when LabVIEW exists but no comparison tool is available', async () => {
    const result = await locateComparisonRuntime(
      'linux',
      {},
      {
        pathExists: vi.fn(async (filePath: string) =>
          filePath === '/usr/local/natinst/LabVIEW-2026Q1-64/labview'
        )
      }
    );

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('comparison-tool-not-found');
    expect(result.labviewExe?.path).toBe('/usr/local/natinst/LabVIEW-2026Q1-64/labview');
    expect(result.notes).toContain(
      'Linux report generation remains best-effort; configure viHistorySuite.labviewCliPath when LabVIEW CLI is installed outside documented scan roots.'
    );
    expect(result.notes).toContain(
      'Configure viHistorySuite.labviewCliPath or viHistorySuite.lvComparePath to an installed comparison tool when the documented scan roots do not contain one.'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-comparison-tool-not-found',
        detail:
          'A supported LabVIEW 2026 executable was located, but neither LabVIEWCLI nor LVCompare was located for host-native comparison-report execution.'
      }
    ]);
  });

  it('retains Windows registry probe plans and parses registry-discovered LabVIEW executables', async () => {
    expect(buildWindowsRegistryQueryPlans()).toEqual([
      {
        command: 'reg',
        args: ['query', 'HKLM\\SOFTWARE\\National Instruments\\LabVIEW', '/s', '/reg:64'],
        keyPath: 'HKLM\\SOFTWARE\\National Instruments\\LabVIEW',
        regView: '64'
      },
      {
        command: 'reg',
        args: [
          'query',
          'HKLM\\SOFTWARE\\WOW6432Node\\National Instruments\\LabVIEW',
          '/s',
          '/reg:32'
        ],
        keyPath: 'HKLM\\SOFTWARE\\WOW6432Node\\National Instruments\\LabVIEW',
        regView: '32'
      }
    ]);

    expect(
      parseWindowsRegistryLabviewCandidates(`
HKEY_LOCAL_MACHINE\\SOFTWARE\\National Instruments\\LabVIEW
    LabVIEWPath    REG_SZ    C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe
HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\National Instruments\\LabVIEW
    LabVIEWPath    REG_SZ    C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe
`)
    ).toEqual([
      {
        kind: 'labview-exe',
        path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
        source: 'registry',
        exists: true,
        bitness: 'x64'
      },
      {
        kind: 'labview-exe',
        path: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
        source: 'registry',
        exists: true,
        bitness: 'x86'
      }
    ]);
  });

  it('publishes documented candidate roots for supported platforms', () => {
    expect(buildDocumentedRuntimeCandidates('win32')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'labview-exe',
          path:
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
          bitness: 'x64'
        }),
        expect.objectContaining({
          kind: 'labview-cli',
          path:
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
        })
      ])
    );
    expect(buildDocumentedRuntimeCandidates('linux')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'labview-exe',
          path: '/usr/local/natinst/LabVIEW-2026Q1-64/labview'
        }),
        expect.objectContaining({
          kind: 'lvcompare',
          path: '/usr/local/bin/LVCompare'
        })
      ])
    );
    expect(buildDocumentedRuntimeCandidates('darwin')).toEqual([]);
  });

  it('covers the default filesystem and registry helpers deterministically', async () => {
    await expect(
      pathExistsWithFsAccess('/tmp/example', vi.fn().mockResolvedValue(undefined) as never)
    ).resolves.toBe(true);
    await expect(
      pathExistsWithFsAccess(
        '/tmp/missing',
        vi.fn().mockRejectedValue(new Error('missing')) as never
      )
    ).resolves.toBe(false);

    await expect(
      runWindowsRegistryQuery(
        buildWindowsRegistryQueryPlans()[0]!,
        vi.fn().mockResolvedValue({
          stdout: 'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
        })
      )
    ).resolves.toBe('C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe');
  });

  it('probes Windows container image availability through the correct host command path', async () => {
    const windowsRunner = vi.fn().mockResolvedValue({ stdout: '' });
    await expect(
      queryWindowsContainerImageAvailability(
        'nationalinstruments/labview:2026q1-windows',
        'win32',
        windowsRunner
      )
    ).resolves.toBe(true);
    expect(windowsRunner).toHaveBeenCalledWith(
      'docker',
      ['image', 'inspect', 'nationalinstruments/labview:2026q1-windows'],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    );

    const linuxRunner = vi.fn().mockResolvedValue({ stdout: '' });
    await expect(
      queryWindowsContainerImageAvailability(
        'nationalinstruments/labview:2026q1-windows',
        'linux',
        linuxRunner
      )
    ).resolves.toBe(true);
    expect(linuxRunner).toHaveBeenCalledWith(
      '/mnt/c/Windows/System32/cmd.exe',
      ['/c', 'docker', 'image', 'inspect', 'nationalinstruments/labview:2026q1-windows'],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    );

    await expect(
      queryWindowsContainerImageAvailability(
        'nationalinstruments/labview:2026q1-windows',
        'win32',
        vi.fn().mockRejectedValue(new Error('docker-missing'))
      )
    ).resolves.toBe(false);

    await expect(
      queryWindowsContainerImageAvailability(
        'nationalinstruments/labview:2026q1-windows',
        'linux',
        vi.fn().mockRejectedValue(new Error('cmd-missing'))
      )
    ).resolves.toBe(false);
  });

  it('ignores failed registry probes and can fall back to the first configured LabVIEW path when bitness is unknown', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        labviewCliPath: 'D:\\NI\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        labviewExePath: 'D:\\NI\\LabVIEW\\LabVIEW.exe',
        preferBitness: 'x64'
      },
      {
        queryWindowsContainerImage: vi.fn().mockResolvedValue(false),
        pathExists: vi.fn(async (filePath: string) =>
          [
            'D:\\NI\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
            'D:\\NI\\LabVIEW\\LabVIEW.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockRejectedValue(new Error('registry unavailable'))
      }
    );

    expect(result.engine).toBe('labview-cli');
    expect(result.labviewExe?.path).toBe('D:\\NI\\LabVIEW\\LabVIEW.exe');
    expect(result.labviewExe?.bitness).toBeUndefined();
  });

  it('uses the default filesystem access path when no path-exists dependency is injected', async () => {
    const result = await locateComparisonRuntime('linux', {
      labviewExePath: __filename,
      lvComparePath: __filename
    });

    expect(result.engine).toBe('lvcompare');
    expect(result.provider).toBe('host-native');
    expect(result.labviewExe?.path).toBe(__filename);
    expect(result.lvCompare?.path).toBe(__filename);
  });
});
