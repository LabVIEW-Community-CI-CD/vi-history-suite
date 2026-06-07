import { describe, expect, it, vi } from 'vitest';

import {
  buildDocumentedRuntimeCandidates,
  locateComparisonRuntime,
  WindowsContainerProviderFacts
} from '../../src/reporting/comparisonRuntimeLocator';

const WINDOWS_LABVIEW_2026_X64 =
  'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_LABVIEW_2026_X86 =
  'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_NONCANONICAL_LABVIEW_CLI_X64 =
  'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';
const WINDOWS_LABVIEW_CLI_X86 =
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';

function pathExistsFor(paths: string[]): (filePath: string) => Promise<boolean> {
  const normalizedPaths = new Set(paths.map((filePath) => filePath.toLowerCase()));
  return async (filePath: string) => normalizedPaths.has(filePath.toLowerCase());
}

function windowsContainerFacts(
  overrides: Partial<WindowsContainerProviderFacts> = {}
): WindowsContainerProviderFacts {
  return {
    image: 'nationalinstruments/labview:2026q1-windows',
    provider: 'windows-container',
    runtimePlatform: 'win32',
    hostPlatform: 'win32',
    dockerCliAvailable: true,
    dockerDaemonReachable: true,
    windowsContainerCapabilityAvailable: true,
    windowsContainerHostMode: 'windows',
    imageAvailable: true,
    notes: [],
    ...overrides
  };
}

function quietWindowsHostSurfaceDeps() {
  return {
    readFile: vi.fn().mockRejectedValue(new Error('no ini')) as never,
    observeWindowsProcesses: vi.fn().mockResolvedValue(undefined) as never,
    observeWindowsTcpListeners: vi.fn().mockResolvedValue([]) as never
  };
}

describe('comparisonRuntimeLocator diagnostics', () => {
  it('documents only the canonical shared Windows LabVIEWCLI scan path', () => {
    const labviewCliCandidates = buildDocumentedRuntimeCandidates('win32').filter(
      (candidate) => candidate.kind === 'labview-cli'
    );

    expect(labviewCliCandidates).toEqual([
      expect.objectContaining({
        path: WINDOWS_LABVIEW_CLI_X86,
        source: 'scan',
        bitness: 'x86'
      })
    ]);
    expect(labviewCliCandidates).not.toContainEqual(
      expect.objectContaining({
        path: WINDOWS_NONCANONICAL_LABVIEW_CLI_X64
      })
    );
  });

  it('retains invalid provider facts and rejects both runtime providers', async () => {
    const selection = await locateComparisonRuntime('win32', {
      invalidRequestedProvider: 'cloud',
      labviewVersion: '2026',
      bitness: 'x64'
    });

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'installed-provider-invalid',
      requestedLabviewVersion: '2026',
      bitness: 'x64'
    });
    expect(selection.notes.join('\n')).toContain('viHistorySuite.runtimeProvider');
    expect(selection.providerDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'host-native',
          outcome: 'rejected',
          reason: 'invalid-installed-provider'
        }),
        expect.objectContaining({
          provider: 'windows-container',
          outcome: 'rejected',
          reason: 'invalid-installed-provider'
        })
      ])
    );
  });

  it('names missing Windows runtime selection settings before probing tools', async () => {
    const selection = await locateComparisonRuntime('win32', {
      requestedProvider: 'host',
      requireVersionAndBitness: true
    });

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'labview-runtime-selection-required',
      requestedProvider: 'host',
      bitness: 'x64'
    });
    expect(selection.notes.join('\n')).toContain('viHistorySuite.labviewVersion');
    expect(selection.notes.join('\n')).toContain('viHistorySuite.labviewBitness');
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-runtime-selection-required'
      })
    );
  });

  it('blocks unsupported LabVIEW versions before scanning runtime tools', async () => {
    const selection = await locateComparisonRuntime('win32', {
      requestedProvider: 'host',
      requireVersionAndBitness: true,
      labviewVersion: '2024',
      bitness: 'x64'
    });

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'labview-version-unsupported-for-comparison-report',
      requestedLabviewVersion: '2024',
      bitness: 'x64'
    });
    expect(selection.notes.join('\n')).toContain('LabVIEW 2024 cannot create');
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'host-native',
        reason: 'host-native-labview-version-unsupported-for-comparison-report'
      })
    );
  });

  it('retains configured path failures as checked candidate facts', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        labviewVersion: '2026',
        bitness: 'x64',
        labviewCliPath: 'C:\\missing\\LabVIEWCLI.exe'
      },
      {
        pathExists: vi.fn().mockResolvedValue(false)
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'configured-labview-cli-path-missing',
      requestedLabviewVersion: '2026'
    });
    expect(selection.candidates).toContainEqual(
      expect.objectContaining({
        kind: 'labview-cli',
        path: 'C:\\missing\\LabVIEWCLI.exe',
        source: 'configured',
        exists: false
      })
    );
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        reason: 'host-native-configured-labview-cli-path-missing',
        detail: expect.stringContaining('C:\\missing\\LabVIEWCLI.exe')
      })
    );
  });

  it('reports a requested LabVIEW bitness miss without switching bitness silently', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'labview-exe-not-found',
      requestedLabviewVersion: '2026',
      bitness: 'x64'
    });
    expect(selection.notes.join('\n')).toContain('Detected installed LabVIEW 2026 x86');
    expect(selection.notes.join('\n')).toContain('will not auto-switch');
  });

  it('selects the shared Windows LabVIEWCLI for requested x64 LabVIEW', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...quietWindowsHostSurfaceDeps()
      }
    );

    expect(selection).toMatchObject({
      provider: 'host-native',
      engine: 'labview-cli',
      requestedLabviewVersion: '2026',
      bitness: 'x64',
      labviewExe: {
        path: WINDOWS_LABVIEW_2026_X64,
        bitness: 'x64'
      },
      labviewCli: {
        path: WINDOWS_LABVIEW_CLI_X86
      }
    });
    expect(selection.blockedReason).toBeUndefined();
  });

  it('selects the shared Windows LabVIEWCLI for requested x86 LabVIEW', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x86'
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X86, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...quietWindowsHostSurfaceDeps()
      }
    );

    expect(selection).toMatchObject({
      provider: 'host-native',
      engine: 'labview-cli',
      requestedLabviewVersion: '2026',
      bitness: 'x86',
      labviewExe: {
        path: WINDOWS_LABVIEW_2026_X86,
        bitness: 'x86'
      },
      labviewCli: {
        path: WINDOWS_LABVIEW_CLI_X86
      }
    });
    expect(selection.blockedReason).toBeUndefined();
  });

  it('reports missing shared Windows LabVIEWCLI after resolving LabVIEW', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64]),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'canonical-labview-cli-not-found',
      requestedLabviewVersion: '2026',
      bitness: 'x64'
    });
    expect(selection.notes.join('\n')).toContain('No LabVIEWCLI surface was located');
    expect(selection.notes.join('\n')).toContain(WINDOWS_LABVIEW_CLI_X86);
  });

  it('retains Docker unavailable facts when Docker provider is requested', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'docker',
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(
          windowsContainerFacts({
            dockerCliAvailable: false,
            dockerDaemonReachable: false,
            windowsContainerCapabilityAvailable: false,
            imageAvailable: false,
            notes: ['Docker CLI is not available.']
          })
        )
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'docker-provider-unavailable',
      requestedProvider: 'docker',
      requestedLabviewVersion: '2026',
      bitness: 'x64',
      dockerCliAvailable: false,
      dockerDaemonReachable: false
    });
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'docker-provider-unavailable'
      })
    );
  });

  it('blocks Docker x86 requests without falling back silently', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'docker',
        labviewVersion: '2026',
        bitness: 'x86'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(windowsContainerFacts())
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'docker-provider-requires-windows-x64',
      requestedProvider: 'docker',
      requestedLabviewVersion: '2026',
      bitness: 'x86'
    });
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'provider-request-docker-disallows-host-native'
      })
    );
  });

  it('keeps missing Docker image facts on the selected container runtime', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'docker',
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(
          windowsContainerFacts({
            imageAvailable: false
          })
        )
      }
    );

    expect(selection).toMatchObject({
      provider: 'windows-container',
      requestedProvider: 'docker',
      requestedLabviewVersion: '2026',
      bitness: 'x64',
      containerImageAvailable: false,
      containerAcquisitionState: 'required'
    });
    expect(selection.notes.join('\n')).toContain('will be acquired before launch');
  });

  it('auto-selects the Linux container provider when Docker Desktop is running in Linux-container mode', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(
          windowsContainerFacts({
            image: 'nationalinstruments/labview:2026q1-linux',
            provider: 'linux-container',
            runtimePlatform: 'linux',
            windowsContainerHostMode: 'linux',
            imageAvailable: false
          })
        )
      }
    );

    expect(selection).toMatchObject({
      platform: 'win32',
      provider: 'linux-container',
      containerRuntimePlatform: 'linux',
      containerHostMode: 'linux',
      containerImage: 'nationalinstruments/labview:2026q1-linux',
      containerImageAvailable: false,
      containerAcquisitionState: 'required'
    });
    expect(selection.labviewCli?.path).toBe('/usr/local/bin/LabVIEWCLI');
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'linux-container',
        outcome: 'selected',
        reason: 'auto-selected-linux-container-because-docker-installed'
      })
    );
  });

  it('fails closed in Windows auto mode when Docker is installed but the active container provider is unusable', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(
          windowsContainerFacts({
            dockerCliAvailable: true,
            dockerDaemonReachable: true,
            windowsContainerCapabilityAvailable: false,
            windowsContainerHostMode: 'unknown',
            imageAvailable: false
          })
        ),
        ...quietWindowsHostSurfaceDeps()
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'auto-docker-installed-provider-unavailable',
      dockerCliAvailable: true,
      dockerDaemonReachable: true,
      containerCapabilityAvailable: false
    });
    expect(selection.notes.join('\n')).toContain('Docker Desktop was detected on Windows');
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'auto-docker-installed-disallows-host-native'
      })
    );
  });

  it('selects host-native only when requested host facts are available', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...quietWindowsHostSurfaceDeps()
      }
    );

    expect(selection).toMatchObject({
      provider: 'host-native',
      requestedProvider: 'host',
      requestedLabviewVersion: '2026',
      bitness: 'x64'
    });
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'host-native',
        outcome: 'selected',
        reason: 'provider-request-host-selected-host-native'
      })
    );
  });

  it('honors an existing configured LabVIEWCLI path for requested x64 LabVIEW', async () => {
    const configuredLabviewCliPath = 'C:\\custom\\LabVIEWCLI.exe';
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64',
        labviewCliPath: configuredLabviewCliPath
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64, configuredLabviewCliPath]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        ...quietWindowsHostSurfaceDeps()
      }
    );

    expect(selection).toMatchObject({
      provider: 'host-native',
      engine: 'labview-cli',
      labviewCli: {
        path: configuredLabviewCliPath,
        source: 'configured'
      }
    });
    expect(selection.blockedReason).toBeUndefined();
  });
});

describe('comparisonRuntimeLocator fact retention (VHS-REQ-155)', () => {
  it('retains all requested facts when blocking host runtime for missing LabVIEW', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    // Verify requested facts are retained
    expect(selection.requestedProvider).toBe('host');
    expect(selection.requestedLabviewVersion).toBe('2026');
    expect(selection.bitness).toBe('x64');
    expect(selection.provider).toBe('unavailable');
    expect(selection.blockedReason).toBe('labview-exe-not-found');

    // Verify provider decisions are retained
    expect(selection.providerDecisions).toBeDefined();
    expect(selection.providerDecisions?.length).toBeGreaterThan(0);
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'host-native',
        outcome: 'rejected'
      })
    );

    // Verify notes are retained
    expect(selection.notes).toBeDefined();
    expect(selection.notes.length).toBeGreaterThan(0);
  });

  it('retains all requested facts when blocking Docker runtime for missing CLI', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'docker',
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(
          windowsContainerFacts({
            dockerCliAvailable: false,
            dockerDaemonReachable: false,
            windowsContainerCapabilityAvailable: false,
            imageAvailable: false,
            notes: ['Docker CLI is not available.']
          })
        )
      }
    );

    // Verify requested facts are retained
    expect(selection.requestedProvider).toBe('docker');
    expect(selection.requestedLabviewVersion).toBe('2026');
    expect(selection.bitness).toBe('x64');
    expect(selection.provider).toBe('unavailable');
    expect(selection.blockedReason).toBe('docker-provider-unavailable');

    // Verify Docker facts are retained
    expect(selection.dockerCliAvailable).toBe(false);
    expect(selection.dockerDaemonReachable).toBe(false);

    // Verify provider decisions are retained
    expect(selection.providerDecisions).toBeDefined();
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'windows-container',
        outcome: 'rejected',
        reason: 'docker-provider-unavailable'
      })
    );
  });

  it('retains container image facts when image acquisition fails', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'docker',
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(
          windowsContainerFacts({
            dockerCliAvailable: true,
            dockerDaemonReachable: true,
            windowsContainerCapabilityAvailable: true,
            windowsContainerHostMode: 'windows',
            imageAvailable: false
          })
        )
      }
    );

    // Verify requested facts are retained
    expect(selection.requestedProvider).toBe('docker');
    expect(selection.requestedLabviewVersion).toBe('2026');
    expect(selection.bitness).toBe('x64');

    // Verify Docker facts are retained even when image is not available
    expect(selection.dockerCliAvailable).toBe(true);
    expect(selection.dockerDaemonReachable).toBe(true);
    expect(selection.containerCapabilityAvailable).toBe(true);
    expect(selection.containerHostMode).toBe('windows');
    expect(selection.containerImageAvailable).toBe(false);
    expect(selection.containerImage).toBeDefined();
  });

  it('retains checked candidate facts when tools are scanned', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64',
        labviewCliPath: 'C:\\custom\\LabVIEWCLI.exe'
      },
      {
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    // Verify candidates array contains checked tools
    expect(selection.candidates).toBeDefined();
    expect(selection.candidates).toContainEqual(
      expect.objectContaining({
        kind: 'labview-cli',
        path: 'C:\\custom\\LabVIEWCLI.exe',
        source: 'configured',
        exists: false
      })
    );
  });
});

describe('comparisonRuntimeLocator concurrent LabVIEW bitness conflict (VHS-REQ-621)', () => {
  function processObservationWithLabviewBitness(
    labviewProcessBitness: 'x86' | 'x64' | 'unknown',
    executablePath: string | undefined
  ) {
    return {
      capturedAt: '2026-05-31T00:00:00.000Z',
      hostPlatform: 'win32' as const,
      runtimePlatform: 'win32',
      trigger: 'preflight' as const,
      observedProcesses: [
        {
          imageName: 'LabVIEW.exe',
          pid: 1234
        }
      ],
      observedProcessNames: ['LabVIEW.exe'],
      labviewProcessObserved: true,
      labviewCliProcessObserved: false,
      lvcompareProcessObserved: false,
      labviewProcessBitness,
      labviewProcessExecutablePath: executablePath
    };
  }

  it('blocks host-native compare when LabVIEW x64 is running and x86 was requested', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x86',
        allowExistingWindowsHostRuntime: true
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X86, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        readFile: vi.fn().mockRejectedValue(new Error('no ini')) as never,
        observeWindowsProcesses: vi
          .fn()
          .mockResolvedValue(
            processObservationWithLabviewBitness(
              'x64',
              'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
            )
          ) as never,
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([]) as never
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'windows-host-bitness-conflict',
      bitness: 'x86',
      hostObservedLabviewBitness: 'x64',
      hostObservedLabviewExecutablePath:
        'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    });
    expect(selection.notes.join('\n')).toContain('LabVIEW x64 already running');
    expect(selection.notes.join('\n')).toContain('comparison-report execution requested LabVIEW x86');
  });

  it('blocks host-native compare even when allowExistingWindowsHostRuntime is true (bitness conflict overrides admit)', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64',
        allowExistingWindowsHostRuntime: true
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        readFile: vi.fn().mockRejectedValue(new Error('no ini')) as never,
        observeWindowsProcesses: vi
          .fn()
          .mockResolvedValue(
            processObservationWithLabviewBitness(
              'x86',
              'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
            )
          ) as never,
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([]) as never
      }
    );

    expect(selection.blockedReason).toBe('windows-host-bitness-conflict');
    expect(selection.hostObservedLabviewBitness).toBe('x86');
  });

  it('admits a matching-bitness running LabVIEW session under allowExistingWindowsHostRuntime', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64',
        allowExistingWindowsHostRuntime: true
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        readFile: vi.fn().mockRejectedValue(new Error('no ini')) as never,
        observeWindowsProcesses: vi
          .fn()
          .mockResolvedValue(
            processObservationWithLabviewBitness(
              'x64',
              'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
            )
          ) as never,
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([]) as never
      }
    );

    expect(selection.provider).toBe('host-native');
    expect(selection.blockedReason).toBeUndefined();
  });

  it('treats an unknown-bitness running LabVIEW session as advisory only (no block)', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64',
        allowExistingWindowsHostRuntime: true
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        readFile: vi.fn().mockRejectedValue(new Error('no ini')) as never,
        observeWindowsProcesses: vi
          .fn()
          .mockResolvedValue(
            processObservationWithLabviewBitness('unknown', undefined)
          ) as never,
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([]) as never
      }
    );

    expect(selection.provider).toBe('host-native');
    expect(selection.blockedReason).toBeUndefined();
  });
});

describe('comparisonRuntimeLocator fail-closed branch coverage (VHS-REQ-155, VHS-REQ-621)', () => {
  function contaminatedHostProcessObservation() {
    return {
      capturedAt: '2026-05-31T00:00:00.000Z',
      hostPlatform: 'win32' as const,
      runtimePlatform: 'win32',
      trigger: 'preflight' as const,
      observedProcesses: [{ imageName: 'LabVIEW.exe', pid: 4321 }],
      observedProcessNames: ['LabVIEW.exe'],
      labviewProcessObserved: true,
      labviewCliProcessObserved: false,
      lvcompareProcessObserved: false,
      labviewProcessBitness: 'x64',
      labviewProcessExecutablePath: WINDOWS_LABVIEW_2026_X64
    };
  }

  it('names a missing LabVIEW version alone before probing runtime tools', async () => {
    const selection = await locateComparisonRuntime('win32', {
      requestedProvider: 'host',
      requireVersionAndBitness: true,
      bitness: 'x64'
    });

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'labview-version-required',
      bitness: 'x64'
    });
    expect(selection.notes.join('\n')).toContain('viHistorySuite.labviewVersion');
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-labview-version-required'
      })
    );
  });

  it('names a missing LabVIEW bitness alone before probing runtime tools', async () => {
    const selection = await locateComparisonRuntime('win32', {
      requestedProvider: 'host',
      requireVersionAndBitness: true,
      labviewVersion: '2026'
    });

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'labview-bitness-required',
      requestedLabviewVersion: '2026'
    });
    expect(selection.notes.join('\n')).toContain('viHistorySuite.labviewBitness');
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'host-native',
        outcome: 'rejected',
        reason: 'host-native-labview-bitness-required'
      })
    );
  });

  it('blocks macOS hosts as unsupported for LabVIEW 2026 Q1 comparison reports', async () => {
    const selection = await locateComparisonRuntime('darwin', {
      requestedProvider: 'host',
      labviewVersion: '2026',
      bitness: 'x64'
    });

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'labview-2026q1-unsupported-on-macos'
    });
    expect(selection.notes.join('\n')).toContain('macOS');
  });

  it('retains a missing configured LabVIEW executable path as a checked candidate fact', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        labviewVersion: '2026',
        bitness: 'x64',
        labviewExePath: 'C:\\missing\\LabVIEW.exe'
      },
      {
        pathExists: vi.fn().mockResolvedValue(false)
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'configured-labview-exe-path-missing',
      requestedLabviewVersion: '2026'
    });
    expect(selection.candidates).toContainEqual(
      expect.objectContaining({
        kind: 'labview-exe',
        path: 'C:\\missing\\LabVIEW.exe',
        source: 'configured',
        exists: false
      })
    );
  });

  it('blocks docker-only execution for a not-yet-implemented LabVIEW version', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'docker-only',
        labviewVersion: '2025',
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(windowsContainerFacts())
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'docker-provider-labview-version-not-implemented',
      requestedLabviewVersion: '2025'
    });
    expect(selection.notes.join('\n')).toContain('not implemented yet');
  });

  it('blocks docker-only execution that requests x86 instead of the supported x64 container', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'docker-only',
        labviewVersion: '2026',
        bitness: 'x86'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(windowsContainerFacts())
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'docker-only-requires-windows-x64-provider',
      bitness: 'x86'
    });
    expect(selection.notes.join('\n')).toContain('64-bit container provider');
  });

  it('blocks docker-only execution when the container provider is unavailable', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'docker-only',
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(
          windowsContainerFacts({
            dockerCliAvailable: false,
            dockerDaemonReachable: false,
            windowsContainerCapabilityAvailable: false,
            imageAvailable: false,
            notes: ['Docker CLI is not available.']
          })
        )
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'docker-only-provider-unavailable',
      requestedLabviewVersion: '2026',
      bitness: 'x64'
    });
  });

  it('blocks host-native compare when the Windows host runtime surface is contaminated', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        readFile: vi.fn().mockRejectedValue(new Error('no ini')) as never,
        observeWindowsProcesses: vi
          .fn()
          .mockResolvedValue(contaminatedHostProcessObservation()) as never,
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([]) as never
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'windows-host-runtime-surface-contaminated'
    });
    expect(selection.notes.join('\n')).toContain('contaminated');
  });
});
