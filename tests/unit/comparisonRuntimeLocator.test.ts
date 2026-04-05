import { describe, expect, it, vi } from 'vitest';

import {
  buildDocumentedRuntimeCandidates,
  buildWindowsRegistryQueryPlans,
  locateComparisonRuntime,
  parseWindowsRegistryLabviewCandidates,
  pathExistsWithFsAccess,
  queryWindowsContainerProviderFacts,
  queryWindowsContainerImageAvailability,
  runWindowsRegistryQuery
} from '../../src/reporting/comparisonRuntimeLocator';
import type { WindowsContainerProviderFacts } from '../../src/reporting/comparisonRuntimeLocator';

function buildCleanWindowsHostDeps() {
  return {
    hostPlatform: 'win32' as const,
    readFile: vi.fn().mockResolvedValue('server.tcp.enabled=True\nserver.tcp.port=3363\n') as never,
    observeWindowsProcesses: vi.fn().mockResolvedValue({
      capturedAt: '2026-04-05T00:00:00.000Z',
      hostPlatform: 'win32',
      runtimePlatform: 'win32',
      trigger: 'preflight',
      observedProcesses: [],
      observedProcessNames: [],
      labviewProcessObserved: false,
      labviewCliProcessObserved: false,
      lvcompareProcessObserved: false
    }),
    observeWindowsTcpListeners: vi.fn().mockResolvedValue([])
  };
}

function buildConflictedWindowsHostDeps() {
  return {
    hostPlatform: 'win32' as const,
    readFile: vi.fn().mockResolvedValue('server.tcp.enabled=True\nserver.tcp.port=3363\n') as never,
    observeWindowsProcesses: vi.fn().mockResolvedValue({
      capturedAt: '2026-04-05T00:00:00.000Z',
      hostPlatform: 'win32',
      runtimePlatform: 'win32',
      trigger: 'preflight',
      observedProcesses: [
        {
          imageName: 'LabVIEW.exe',
          pid: 1234,
          sessionName: 'Console',
          sessionNumber: 1,
          memUsage: '100,000 K'
        }
      ],
      observedProcessNames: ['LabVIEW.exe'],
      labviewProcessObserved: true,
      labviewCliProcessObserved: false,
      lvcompareProcessObserved: false
    }),
    observeWindowsTcpListeners: vi.fn().mockResolvedValue([])
  };
}

function buildWindowsContainerFacts(
  overrides: Partial<WindowsContainerProviderFacts> = {}
): WindowsContainerProviderFacts {
  return {
    image: 'nationalinstruments/labview:2026q1-windows',
    hostPlatform: 'win32',
    dockerCliAvailable: true,
    dockerDaemonReachable: true,
    windowsContainerCapabilityAvailable: true,
    windowsContainerHostMode: 'windows',
    imageAvailable: true,
    notes: ['Docker daemon is reachable in Windows-container mode and governed image is present locally.'],
    ...overrides
  };
}

describe('comparisonRuntimeLocator', () => {
  it('adds the missing labviewCliPath manifest contract through runtime settings usage', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
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
        ),
        ...cleanHost
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
    const cleanHost = buildCleanWindowsHostDeps();
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
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...cleanHost
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
        reason: 'auto-clean-host-did-not-require-docker',
        detail:
          'Docker was not selected because the validated Windows host runtime surface was clean for host-native execution.'
      },
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'auto-selected-clean-host-native-lvcompare-fallback',
        detail:
          'Auto execution selected host-native LabVIEW 2026 plus LVCompare because the validated Windows host runtime surface was clean and LabVIEWCLI was not located.'
      }
    ]);
  });

  it('defaults Windows auto bitness to x86 when both host installs are available', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
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
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...cleanHost
      }
    );

    expect(result.engine).toBe('labview-cli');
    expect(result.labviewExe?.bitness).toBe('x86');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'auto-clean-host-did-not-require-docker',
        detail:
          'Docker was not selected because the validated Windows host runtime surface was clean for host-native execution.'
      },
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'auto-selected-clean-host-native',
        detail:
          'Auto execution selected host-native LabVIEW 2026 plus LabVIEWCLI because the validated Windows host runtime surface was clean.'
      }
    ]);
  });

  it('honors an explicit x86 preference when both Windows bitnesses are available', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
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
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...cleanHost
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

  it('uses the windows container provider when no compatible host-native runtime is available and the image is available', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        preferBitness: 'auto'
      },
      {
        queryWindowsContainerProviderFacts: vi
          .fn()
          .mockResolvedValue(buildWindowsContainerFacts()),
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(result.executionMode).toBe('auto');
    expect(result.provider).toBe('windows-container');
    expect(result.engine).toBe('labview-cli');
    expect(result.windowsContainerImage).toBe('nationalinstruments/labview:2026q1-windows');
    expect(result.labviewExe?.path).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );
    expect(result.labviewCli?.path).toBe(
      'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
    );
    expect(result.notes[0]).toContain(
      'No compatible host-native LabVIEW 2026 runtime was located'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'selected',
        reason: 'windows-container-selected-host-runtime-unavailable',
        detail:
          'Docker daemon was reachable in windows-container mode with governed Windows container image nationalinstruments/labview:2026q1-windows present locally, so isolated execution was selected because no compatible host-native LabVIEW 2026 runtime was located.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-labview-exe-not-found',
        detail:
          'No supported LabVIEW 2026 executable was located for host-native comparison-report execution.'
      }
    ]);
  });

  it('prefers clean host-native execution in auto mode even when the windows container image is available', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        preferBitness: 'x64'
      },
      {
        queryWindowsContainerImage: vi.fn().mockResolvedValue(true),
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...cleanHost
      }
    );

    expect(result.provider).toBe('host-native');
    expect(result.engine).toBe('labview-cli');
    expect(result.hostLabviewIniPath).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.ini'
    );
    expect(result.hostLabviewTcpPort).toBe(3363);
    expect(result.hostRuntimeConflictDetected).toBe(false);
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'auto-clean-host-did-not-require-docker',
        detail:
          'Docker was not selected because the validated Windows host runtime surface was clean for host-native execution.'
      },
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'auto-selected-clean-host-native',
        detail:
          'Auto execution selected host-native LabVIEW 2026 plus LabVIEWCLI because the validated Windows host runtime surface was clean.'
      }
    ]);
  });

  it('retains the explicit macOS 2026 Q1 unsupported constraint', async () => {
    const result = await locateComparisonRuntime('darwin');

    expect(result.executionMode).toBe('auto');
    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('labview-2026q1-unsupported-on-macos');
    expect(result.notes[0]).toContain('LabVIEW 2026 Q1 report generation');
  });

  it('honors host-only mode by selecting host-native execution even when the windows container image is available', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'host-only',
        preferBitness: 'x64'
      },
      {
        queryWindowsContainerImage: vi.fn().mockResolvedValue(true),
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...cleanHost
      }
    );

    expect(result.executionMode).toBe('host-only');
    expect(result.provider).toBe('host-native');
    expect(result.engine).toBe('labview-cli');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'execution-mode-host-only-disallows-docker',
        detail:
          'Windows container execution was not selected because host-only execution was requested.'
      },
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'execution-mode-host-only-selected-host-native',
        detail:
          'Host-only execution was requested and host-native LabVIEW 2026 plus LabVIEWCLI were available.'
      }
    ]);
  });

  it('fails closed for docker-only mode when the windows container image is unavailable even if host-native runtime exists', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'docker-only',
        preferBitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi
          .fn()
          .mockResolvedValue(buildWindowsContainerFacts({ imageAvailable: false })),
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...cleanHost
      }
    );

    expect(result.executionMode).toBe('docker-only');
    expect(result.provider).toBe('windows-container');
    expect(result.windowsContainerImageAvailable).toBe(false);
    expect(result.windowsContainerAcquisitionState).toBe('required');
    expect(result.notes).toContain(
      'Docker daemon was reachable in windows-container mode, and governed Windows container image nationalinstruments/labview:2026q1-windows will be acquired before launch for docker-only execution.'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'selected',
        reason: 'execution-mode-docker-only-selected-windows-container',
        detail:
          'Docker daemon was reachable in windows-container mode, and governed Windows container image nationalinstruments/labview:2026q1-windows will be acquired before launch for docker-only execution.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'execution-mode-docker-only-disallows-host-native',
        detail:
          'Host-native execution was not selected because docker-only execution was requested.'
      }
    ]);
  });

  it('fails closed for docker-only mode when x86 Windows execution is requested', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'docker-only',
        preferBitness: 'x86'
      },
      {
        queryWindowsContainerImage: vi.fn().mockResolvedValue(false),
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(result.executionMode).toBe('docker-only');
    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('docker-only-requires-windows-x64-provider');
    expect(result.notes).toContain(
      'Docker-only execution currently requires the governed Windows 64-bit container provider; Windows x86 execution remains host-native.'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'docker-only-windows-x64-provider-required',
        detail:
          'Docker-only execution currently requires the governed Windows 64-bit container provider; Windows x86 execution remains host-native.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'execution-mode-docker-only-disallows-host-native',
        detail:
          'Host-native execution was not selected because docker-only execution was requested.'
      }
    ]);
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

  it('prefers Linux LabVIEWCLI from the NI prebuilt container scan roots before falling back to LVCompare', async () => {
    const result = await locateComparisonRuntime(
      'linux',
      {},
      {
        pathExists: vi.fn(async (filePath: string) =>
          [
            '/usr/local/natinst/LabVIEW-2026-64/labview',
            '/usr/local/bin/LabVIEWCLI',
            '/usr/local/bin/LVCompare'
          ].includes(filePath)
        )
      }
    );

    expect(result.provider).toBe('host-native');
    expect(result.engine).toBe('labview-cli');
    expect(result.labviewExe?.path).toBe('/usr/local/natinst/LabVIEW-2026-64/labview');
    expect(result.labviewCli?.path).toBe('/usr/local/bin/LabVIEWCLI');
    expect(result.lvCompare?.path).toBe('/usr/local/bin/LVCompare');
    expect(result.notes).not.toContain('LabVIEWCLI was not located; falling back to LVCompare.');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'host-native-labview-cli-selected',
        detail: 'Host-native LabVIEW 2026 and LabVIEWCLI were available for comparison-report execution.'
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
          kind: 'labview-cli',
          path: '/usr/local/bin/LabVIEWCLI'
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

  it('derives canonical Windows container provider facts before selecting Docker', async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'windows\n' })
      .mockResolvedValueOnce({ stdout: '[]' });

    await expect(
      queryWindowsContainerProviderFacts(
        'nationalinstruments/labview:2026q1-windows',
        'win32',
        runner
      )
    ).resolves.toEqual({
      image: 'nationalinstruments/labview:2026q1-windows',
      hostPlatform: 'win32',
      dockerCliAvailable: true,
      dockerDaemonReachable: true,
      windowsContainerCapabilityAvailable: true,
      windowsContainerHostMode: 'windows',
      imageAvailable: true,
      notes: [
        'Docker daemon is reachable in Windows-container mode and governed image nationalinstruments/labview:2026q1-windows is present locally.'
      ]
    });

    expect(runner.mock.calls).toEqual([
      [
        'docker',
        ['info', '--format', '{{.OSType}}'],
        {
          windowsHide: true,
          maxBuffer: 1024 * 1024
        }
      ],
      [
        'docker',
        ['image', 'inspect', 'nationalinstruments/labview:2026q1-windows'],
        {
          windowsHide: true,
          maxBuffer: 1024 * 1024
        }
      ]
    ]);
  });

  it('ignores failed registry probes and can fall back to the first configured LabVIEW path when bitness is unknown', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
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
        queryWindowsRegistry: vi.fn().mockRejectedValue(new Error('registry unavailable')),
        ...cleanHost
      }
    );

    expect(result.engine).toBe('labview-cli');
    expect(result.labviewExe?.path).toBe('D:\\NI\\LabVIEW\\LabVIEW.exe');
    expect(result.labviewExe?.bitness).toBeUndefined();
  });

  it('switches auto mode to docker when the validated windows host runtime surface is contaminated', async () => {
    const conflictedHost = buildConflictedWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        preferBitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi
          .fn()
          .mockResolvedValue(buildWindowsContainerFacts()),
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...conflictedHost
      }
    );

    expect(result.provider).toBe('windows-container');
    expect(result.engine).toBe('labview-cli');
    expect(result.hostLabviewTcpPort).toBe(3363);
    expect(result.hostRuntimeConflictDetected).toBe(true);
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'selected',
        reason: 'auto-required-docker-because-host-runtime-conflict',
        detail:
          'Docker daemon was reachable in windows-container mode with governed Windows container image nationalinstruments/labview:2026q1-windows present locally, so isolated execution was selected because the validated Windows host runtime surface was contaminated.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-runtime-surface-contaminated',
        detail:
          'Host-native execution was not selected because the validated Windows host runtime surface was contaminated by existing LabVIEW-related activity.'
      }
    ]);
  });

  it('fails closed in auto mode when the windows host runtime surface is contaminated and docker is unavailable', async () => {
    const conflictedHost = buildConflictedWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        preferBitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi
          .fn()
          .mockResolvedValue(buildWindowsContainerFacts({ imageAvailable: false })),
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...conflictedHost
      }
    );

    expect(result.provider).toBe('windows-container');
    expect(result.windowsContainerImageAvailable).toBe(false);
    expect(result.windowsContainerAcquisitionState).toBe('required');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'selected',
        reason: 'auto-required-docker-because-host-runtime-conflict',
        detail:
          'Docker daemon was reachable in windows-container mode, and governed Windows container image nationalinstruments/labview:2026q1-windows will be acquired before launch, so isolated execution was selected because the validated Windows host runtime surface was contaminated.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-runtime-surface-contaminated',
        detail:
          'Host-native execution was not selected because the validated Windows host runtime surface was contaminated by existing LabVIEW-related activity.'
      }
    ]);
  });

  it('fails closed in host-only mode when the windows host runtime surface is contaminated', async () => {
    const conflictedHost = buildConflictedWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'host-only',
        preferBitness: 'x64'
      },
      {
        queryWindowsContainerImage: vi.fn().mockResolvedValue(true),
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...conflictedHost
      }
    );

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('windows-host-runtime-surface-contaminated');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'execution-mode-host-only-disallows-docker',
        detail: 'Windows container execution was not selected because host-only execution was requested.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-runtime-surface-contaminated',
        detail:
          'Validated Windows host runtime facts showed existing LabVIEW-related process or governed VI Server port activity, so host-native execution was not selected.'
      }
    ]);
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
