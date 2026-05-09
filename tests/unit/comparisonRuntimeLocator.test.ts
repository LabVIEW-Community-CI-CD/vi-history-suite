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
        bitness: 'x64'
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

  it('fails closed on Windows when only LVCompare is present and canonical LabVIEWCLI is unavailable', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi
          .fn()
          .mockResolvedValue(buildWindowsContainerFacts({ dockerCliAvailable: false })),
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

    expect(result.provider).toBe('unavailable');
    expect(result.engine).toBeUndefined();
    expect(result.blockedReason).toBe('canonical-labview-cli-not-found');
    expect(result.labviewExe?.bitness).toBe('x64');
    expect(result.lvCompare?.path).toBe(
      'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe'
    );
    expect(result.notes).toContain(
      'Canonical CreateComparisonReport execution requires LabVIEWCLI. LabVIEWCLI was not located, and LVCompare remains an internal parity-only surface rather than a public runtime-selection target.'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'auto-docker-not-installed',
        detail:
          'Docker container execution was not selected because Docker Desktop was not detected on this Windows host.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-comparison-tool-not-found',
        detail:
          'A supported LabVIEW 2025 or newer executable was located, but canonical CreateComparisonReport execution could not proceed because LabVIEWCLI was not located.'
      }
    ]);
  });

  it('defaults Windows bitness to x64 when both host installs are available', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi
          .fn()
          .mockResolvedValue(buildWindowsContainerFacts({ dockerCliAvailable: false })),
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
    expect(result.labviewExe?.bitness).toBe('x64');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'auto-docker-not-installed',
        detail:
          'Docker container execution was not selected because Docker Desktop was not detected on this Windows host.'
      },
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'auto-selected-host-native-because-docker-not-installed',
        detail:
          'Auto execution selected host-native LabVIEW 2025 or newer plus LabVIEWCLI because Docker Desktop was not detected on Windows.'
      }
    ]);
  });

  it('fails closed for the installed-user path when both version and bitness are missing', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'host-only',
        requireVersionAndBitness: true
      },
      {
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('labview-runtime-selection-required');
    expect(result.notes).toEqual([
      'Installed compare requires both viHistorySuite.labviewVersion and viHistorySuite.labviewBitness before local runtime preflight can proceed.'
    ]);
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'execution-mode-host-only-disallows-docker',
        detail:
          'Docker container execution was not selected because host-only execution was requested.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-runtime-selection-required',
        detail:
          'Host-native execution was not selected because installed compare requires both LabVIEW version and bitness settings before runtime preflight can proceed.'
      }
    ]);
  });

  it('fails closed for the installed-user path when bitness is missing', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'host-only',
        requireVersionAndBitness: true,
        labviewVersion: '2026'
      },
      {
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('labview-bitness-required');
    expect(result.notes).toEqual([
      'Installed compare requires viHistorySuite.labviewBitness before local runtime preflight can proceed.'
    ]);
  });

  it('fails closed for the installed-user path when the persisted provider is invalid', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        invalidRequestedProvider: 'weird',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('installed-provider-invalid');
    expect(result.notes).toEqual([
      'Installed compare requires viHistorySuite.runtimeProvider to be either host or docker before runtime preflight can proceed.'
    ]);
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'invalid-installed-provider',
        detail:
          'Docker container execution was not selected because viHistorySuite.runtimeProvider must be either host or docker.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'invalid-installed-provider',
        detail:
          'Host-native execution was not selected because viHistorySuite.runtimeProvider must be either host or docker.'
      }
    ]);
  });

  it('rejects host-native Windows runtime selection when requested LabVIEW cannot create comparison reports', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'host-only',
        requireVersionAndBitness: true,
        labviewVersion: '2024',
        bitness: 'x64'
      },
      {
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

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('labview-version-unsupported-for-comparison-report');
    expect(result.notes).toEqual([
      'LabVIEW 2024 cannot create the VI Comparison Report used by VI History Suite.',
      'Select LabVIEW 2025, LabVIEW 2026, or a newer local LabVIEW version; those versions can open earlier LabVIEW VIs without migrating the file before generating the report.'
    ]);
  });

  it('derives host-only execution from the persisted host provider for installed compare', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(buildWindowsContainerFacts()),
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

    expect(result.requestedProvider).toBe('host');
    expect(result.executionMode).toBe('host-only');
    expect(result.provider).toBe('host-native');
    expect(result.labviewCli?.path).toBe(
      'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'provider-request-host-disallows-docker',
        detail:
          'Docker container execution was not selected because the host provider was requested.'
      },
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'provider-request-host-selected-host-native',
        detail:
          'Host provider was requested and host-native LabVIEW 2025 or newer plus LabVIEWCLI were available.'
      }
    ]);
  });

  it('recognizes requested Windows LabVIEW 2025 host runtime scan roots', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2025',
        bitness: 'x64'
      },
      {
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files\\National Instruments\\LabVIEW 2025 Q3\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...cleanHost
      }
    );

    expect(result.provider).toBe('host-native');
    expect(result.engine).toBe('labview-cli');
    expect(result.labviewExe?.path).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2025 Q3\\LabVIEW.exe'
    );
  });

  it('recognizes the Linux LabVIEW 2026 Community host runtime scan roots', async () => {
    const result = await locateComparisonRuntime(
      'linux',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: vi.fn(async (filePath: string) =>
          [
            '/usr/local/natinst/LabVIEW-2026-64/labview',
            '/usr/local/bin/LabVIEWCLI',
            '/usr/local/natinst/share/nilvcli/LabVIEWCLI',
            '/usr/local/bin/LVCompare'
          ].includes(filePath)
        )
      }
    );

    expect(result.provider).toBe('host-native');
    expect(result.engine).toBe('labview-cli');
    expect(result.labviewExe).toMatchObject({
      path: '/usr/local/natinst/LabVIEW-2026-64/labview',
      bitness: 'x64'
    });
    expect(result.labviewCli?.path).toBe('/usr/local/bin/LabVIEWCLI');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'provider-request-host-selected-host-native',
        detail:
          'Host provider was requested and host-native LabVIEW 2025 or newer plus LabVIEWCLI were available.'
      }
    ]);
  });

  it('rejects Linux host runtime selection when requested LabVIEW cannot create comparison reports', async () => {
    const result = await locateComparisonRuntime(
      'linux',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2024',
        bitness: 'x64'
      },
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

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('labview-version-unsupported-for-comparison-report');
    expect(result.notes).toEqual([
      'LabVIEW 2024 cannot create the VI Comparison Report used by VI History Suite.',
      'Select LabVIEW 2025, LabVIEW 2026, or a newer local LabVIEW version; those versions can open earlier LabVIEW VIs without migrating the file before generating the report.'
    ]);
  });

  it('fails closed for installed compare when multiple matching Windows LabVIEW executables satisfy the requested version and bitness', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...cleanHost
      }
    );

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('labview-exe-ambiguous');
    expect(result.notes).toEqual([
      'Installed compare found multiple supported LabVIEW 2026 x64 runtimes, so local runtime preflight could not resolve one exact executable.'
    ]);
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'provider-request-host-disallows-docker',
        detail:
          'Docker container execution was not selected because the host provider was requested.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-labview-exe-ambiguous',
        detail:
          'Host-native execution was not selected because multiple supported LabVIEW executables matched the requested version and bitness.'
      }
    ]);
  });

  it('fails closed for installed compare when no matching LabVIEWCLI surface exists for the requested bitness', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x86'
      },
      {
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...cleanHost
      }
    );

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('labview-cli-not-found-for-bitness');
    expect(result.notes).toEqual([
      'No matching LabVIEWCLI x86 surface was located for requested LabVIEW 2026 x86 execution.',
      'Install the matching LabVIEWCLI surface for the requested bitness, or adjust viHistorySuite.runtimeProvider, viHistorySuite.labviewVersion, or viHistorySuite.labviewBitness before retrying compare.'
    ]);
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'provider-request-host-disallows-docker',
        detail:
          'Docker container execution was not selected because the host provider was requested.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-labview-cli-not-found-for-bitness',
        detail:
          'A supported LabVIEW executable matched the requested version and bitness, but no matching LabVIEWCLI surface was located for that bitness.'
      }
    ]);
  });

  it('accepts the canonical installed x86 LabVIEWCLI surface for requested Windows x64 host validation when no x64 CLI is present', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...cleanHost
      }
    );

    expect(result.provider).toBe('host-native');
    expect(result.engine).toBe('labview-cli');
    expect(result.labviewExe?.path).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe'
    );
    expect(result.labviewCli?.path).toBe(
      'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
    );
    expect(result.notes).toContain(
      'Installed compare accepted the canonical x86 LabVIEWCLI surface for requested LabVIEW 2026 x64 execution because no x64 LabVIEWCLI surface was present on the host.'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'provider-request-host-disallows-docker',
        detail:
          'Docker container execution was not selected because the host provider was requested.'
      },
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'provider-request-host-selected-host-native',
        detail:
          'Host provider was requested and host-native LabVIEW 2025 or newer plus LabVIEWCLI were available.'
      }
    ]);
  });

  it('fails closed for installed compare when multiple matching LabVIEWCLI surfaces exist for the requested bitness', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64',
        labviewCliPath: 'D:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
      },
      {
        pathExists: vi.fn(async (filePath: string) =>
          [
            'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
            'D:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          ].includes(filePath)
        ),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...cleanHost
      }
    );

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('labview-cli-ambiguous-for-bitness');
    expect(result.notes).toEqual([
      'Installed compare found multiple LabVIEWCLI surfaces for requested x64 execution, so local runtime preflight could not resolve one exact CLI path.'
    ]);
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'provider-request-host-disallows-docker',
        detail:
          'Docker container execution was not selected because the host provider was requested.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-labview-cli-ambiguous-for-bitness',
        detail:
          'A supported LabVIEW executable matched the requested version and bitness, but multiple matching LabVIEWCLI surfaces were located for that bitness.'
      }
    ]);
  });

  it('honors an explicit x86 preference when both Windows bitnesses are available', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        bitness: 'x86'
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
        reason: 'auto-docker-not-installed',
        detail:
          'Docker container execution was not selected because Docker Desktop was not detected on this Windows host.'
      },
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'auto-selected-host-native-because-docker-not-installed',
        detail:
          'Auto execution selected host-native LabVIEW 2025 or newer plus LabVIEWCLI because Docker Desktop was not detected on Windows.'
      }
    ]);
  });

  it('uses the windows container provider when no compatible host-native runtime is available and the image is available', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        bitness: 'x64'
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
      'Docker Desktop is installed and governed auto execution uses the current Docker engine provider'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'selected',
        reason: 'auto-selected-windows-container-because-docker-installed',
        detail:
          'Docker daemon was reachable in windows-container mode with governed Windows container image nationalinstruments/labview:2026q1-windows present locally, so isolated execution was selected because Docker Desktop is installed and governed auto execution uses the current Docker engine provider.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'auto-docker-installed-disallows-host-native',
        detail:
          'Host-native execution was not selected because Docker Desktop is installed and governed auto execution uses the current Docker engine provider.'
      }
    ]);
  });

  it('selects the windows container provider in auto mode when Docker Desktop is installed', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        bitness: 'x64'
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
        ...cleanHost
      }
    );

    expect(result.provider).toBe('windows-container');
    expect(result.engine).toBe('labview-cli');
    expect(result.windowsContainerImage).toBe('nationalinstruments/labview:2026q1-windows');
    expect(result.hostLabviewIniPath).toBeUndefined();
    expect(result.hostLabviewTcpPort).toBeUndefined();
    expect(result.hostRuntimeConflictDetected).toBeUndefined();
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'selected',
        reason: 'auto-selected-windows-container-because-docker-installed',
        detail:
          'Docker daemon was reachable in windows-container mode with governed Windows container image nationalinstruments/labview:2026q1-windows present locally, so isolated execution was selected because Docker Desktop is installed and governed auto execution uses the current Docker engine provider.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'auto-docker-installed-disallows-host-native',
        detail:
          'Host-native execution was not selected because Docker Desktop is installed and governed auto execution uses the current Docker engine provider.'
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
        bitness: 'x64'
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
          'Docker container execution was not selected because host-only execution was requested.'
      },
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'execution-mode-host-only-selected-host-native',
        detail:
          'Host-only execution was requested and host-native LabVIEW 2025 or newer plus LabVIEWCLI were available.'
      }
    ]);
  });

  it('fails closed for docker-only mode when the windows container image is unavailable even if host-native runtime exists', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'docker-only',
        bitness: 'x64'
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
        bitness: 'x86'
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
      'Docker-only execution currently requires the governed 64-bit container provider.'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'docker-only-windows-x64-provider-required',
        detail:
          'Docker-only execution currently requires the governed 64-bit container provider.'
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

  it('derives docker-only execution from the persisted docker provider for installed compare', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'docker',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(buildWindowsContainerFacts()),
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

    expect(result.requestedProvider).toBe('docker');
    expect(result.executionMode).toBe('docker-only');
    expect(result.provider).toBe('windows-container');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'selected',
        reason: 'provider-request-docker-selected-windows-container',
        detail:
          'Docker daemon was reachable in windows-container mode with governed Windows container image nationalinstruments/labview:2026q1-windows present locally because the Docker provider was requested.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'provider-request-docker-disallows-host-native',
        detail:
          'Host-native execution was not selected because the Docker provider was requested.'
      }
    ]);
  });

  it('accepts supported non-2026 Docker requests for validation reporting and fails with not-implemented reason', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'docker',
        requireVersionAndBitness: true,
        labviewVersion: '2025',
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(buildWindowsContainerFacts()),
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(result.requestedProvider).toBe('docker');
    expect(result.executionMode).toBe('docker-only');
    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('docker-provider-labview-version-not-implemented');
    expect(result.notes).toContain(
      'Docker provider validation accepted the request for evidence capture, but LabVIEW 2025 Docker execution is not implemented in this pre-release lane. Current governed Docker image contracts remain LabVIEW 2026 x64.'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'docker-provider-labview-version-not-implemented',
        detail:
          'Docker provider execution was accepted for validation reporting, but the requested LabVIEW year does not have a governed Docker implementation in this pre-release lane.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'provider-request-docker-disallows-host-native',
        detail: 'Host-native execution was not selected because the Docker provider was requested.'
      }
    ]);
  });

  it('fails closed for the persisted docker provider when x86 Windows execution is requested', async () => {
    const result = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'docker',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x86'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(buildWindowsContainerFacts()),
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(result.requestedProvider).toBe('docker');
    expect(result.executionMode).toBe('docker-only');
    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('docker-provider-requires-windows-x64');
    expect(result.notes).toContain(
      'The Docker provider currently requires the governed 64-bit container provider.'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'docker-provider-windows-x64-required',
        detail: 'The Docker provider currently requires the governed 64-bit container provider.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'provider-request-docker-disallows-host-native',
        detail: 'Host-native execution was not selected because the Docker provider was requested.'
      }
    ]);
  });

  it('fails closed for the persisted docker provider when the governed Docker provider is unavailable', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'docker',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi
          .fn()
          .mockResolvedValue(
            buildWindowsContainerFacts({
              dockerCliAvailable: false,
              dockerDaemonReachable: false,
              windowsContainerCapabilityAvailable: false,
              imageAvailable: false
            })
          ),
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

    expect(result.requestedProvider).toBe('docker');
    expect(result.executionMode).toBe('docker-only');
    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('docker-provider-unavailable');
    expect(result.notes).toContain(
      'The Docker provider was requested, but Docker CLI was not available on the current host, so governed Windows container image nationalinstruments/labview:2026q1-windows could not be used.'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'docker-provider-unavailable',
        detail:
          'The Docker provider was requested, but Docker CLI was not available on the current host, so governed Windows container image nationalinstruments/labview:2026q1-windows could not be used.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'provider-request-docker-disallows-host-native',
        detail: 'Host-native execution was not selected because the Docker provider was requested.'
      }
    ]);
  });

  it('selects the governed linux container provider for docker-only execution on Linux hosts', async () => {
    const result = await locateComparisonRuntime(
      'linux',
      {
        executionMode: 'docker-only',
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(
          buildWindowsContainerFacts({
            image: 'nationalinstruments/labview:2026q1-linux',
            provider: 'linux-container',
            runtimePlatform: 'linux',
            hostPlatform: 'linux',
            windowsContainerHostMode: 'linux',
            imageAvailable: false
          })
        ),
        pathExists: vi.fn().mockResolvedValue(false)
      }
    );

    expect(result.executionMode).toBe('docker-only');
    expect(result.provider).toBe('linux-container');
    expect(result.containerRuntimePlatform).toBe('linux');
    expect(result.containerImage).toBe('nationalinstruments/labview:2026q1-linux');
    expect(result.containerImageAvailable).toBe(false);
    expect(result.containerAcquisitionState).toBe('required');
    expect(result.labviewExe?.path).toBe('/usr/local/natinst/LabVIEW-2026-64/labview');
    expect(result.labviewCli?.path).toBe('/usr/local/bin/LabVIEWCLI');
    expect(result.lvCompare?.path).toBe('/usr/local/bin/LVCompare');
    expect(result.notes).toContain(
      'Docker daemon was reachable in linux-container mode, and governed Linux container image nationalinstruments/labview:2026q1-linux will be acquired before launch for docker-only execution.'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'linux-container',
        outcome: 'selected',
        reason: 'execution-mode-docker-only-selected-linux-container',
        detail:
          'Docker daemon was reachable in linux-container mode, and governed Linux container image nationalinstruments/labview:2026q1-linux will be acquired before launch for docker-only execution.'
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
      'Install the requested LabVIEW version locally and set viHistorySuite.labviewVersion plus viHistorySuite.labviewBitness before retrying compare.'
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
      'Linux report generation remains best-effort; use documented LabVIEWCLI scan roots or an internal proof surface when explicit proof-admission overrides are required.'
    );
    expect(result.notes).toContain(
      'Install the matching LabVIEWCLI under the documented scan roots, or use an internal proof surface when explicit proof-admission overrides are required.'
    );
    expect(result.providerDecisions).toEqual([
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-comparison-tool-not-found',
        detail:
          'A supported LabVIEW 2025 or newer executable was located, but canonical CreateComparisonReport execution could not proceed because LabVIEWCLI was not located.'
      }
    ]);
  });

  it('prefers Linux LabVIEWCLI from the NI prebuilt container scan roots', async () => {
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
    expect(result.notes).not.toContain('falling back to LVCompare');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'host-native',
        outcome: 'selected',
        reason: 'host-native-labview-cli-selected',
        detail: 'Host-native LabVIEW 2025 or newer and LabVIEWCLI were available for comparison-report execution.'
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
      'docker',
      ['image', 'inspect', 'nationalinstruments/labview:2026q1-windows'],
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
      provider: 'windows-container',
      runtimePlatform: 'win32',
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
        bitness: 'x64'
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
        bitness: 'x64'
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
    expect(result.hostLabviewTcpPort).toBeUndefined();
    expect(result.hostRuntimeConflictDetected).toBeUndefined();
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'selected',
        reason: 'auto-selected-windows-container-because-docker-installed',
        detail:
          'Docker daemon was reachable in windows-container mode with governed Windows container image nationalinstruments/labview:2026q1-windows present locally, so isolated execution was selected because Docker Desktop is installed and governed auto execution uses the current Docker engine provider.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'auto-docker-installed-disallows-host-native',
        detail:
          'Host-native execution was not selected because Docker Desktop is installed and governed auto execution uses the current Docker engine provider.'
      }
    ]);
  });

  it('fails closed in auto mode when Docker Desktop is installed but governed Windows container execution is unavailable', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi
          .fn()
          .mockResolvedValue(
            buildWindowsContainerFacts({
              dockerCliAvailable: true,
              dockerDaemonReachable: false,
              windowsContainerCapabilityAvailable: false,
              windowsContainerHostMode: undefined,
              imageAvailable: false
            })
          ),
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

    expect(result.provider).toBe('unavailable');
    expect(result.blockedReason).toBe('auto-docker-installed-provider-unavailable');
    expect(result.providerDecisions).toEqual([
      {
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'auto-docker-installed-provider-unavailable',
        detail:
          'Docker Desktop was detected on Windows, but Docker CLI was present, but the Docker daemon was not reachable, so governed Windows container image nationalinstruments/labview:2026q1-windows could not be used.'
      },
      {
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'auto-docker-installed-disallows-host-native',
        detail:
          'Host-native execution was not selected because Docker Desktop is installed and governed auto execution uses the current Docker engine provider.'
      }
    ]);
  });

  it('fails closed in auto mode when the windows host runtime surface is contaminated and docker is unavailable', async () => {
    const conflictedHost = buildConflictedWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi
          .fn()
          .mockResolvedValue(
            buildWindowsContainerFacts({
              dockerCliAvailable: false,
              dockerDaemonReachable: false,
              windowsContainerCapabilityAvailable: false,
              windowsContainerHostMode: undefined,
              imageAvailable: false
            })
          ),
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
        reason: 'auto-docker-not-installed',
        detail:
          'Docker container execution was not selected because Docker Desktop was not detected on this Windows host.'
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

  it('fails closed in host-only mode when the windows host runtime surface is contaminated', async () => {
    const conflictedHost = buildConflictedWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'host-only',
        bitness: 'x64'
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
        detail: 'Docker container execution was not selected because host-only execution was requested.'
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

  it('uses provider-aware contamination notes when the persisted host provider is blocked', async () => {
    const conflictedHost = buildConflictedWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(buildWindowsContainerFacts()),
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

    expect(result.requestedProvider).toBe('host');
    expect(result.blockedReason).toBe('windows-host-runtime-surface-contaminated');
    expect(result.notes).toContain(
      'The requested host provider cannot proceed because the validated Windows host runtime surface is contaminated by existing LabVIEW-related activity.'
    );
  });

  it('uses the default filesystem access path when no path-exists dependency is injected', async () => {
    const cleanHost = buildCleanWindowsHostDeps();
    const result = await locateComparisonRuntime(
      'win32',
      {
        labviewExePath: __filename,
        labviewCliPath: __filename
      },
      {
        queryWindowsContainerImage: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...cleanHost
      }
    );

    expect(result.engine).toBe('labview-cli');
    expect(result.provider).toBe('host-native');
    expect(result.labviewExe?.path).toBe(__filename);
    expect(result.labviewCli?.path).toBe(__filename);
  });
});
