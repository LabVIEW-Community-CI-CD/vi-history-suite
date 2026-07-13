import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  acquireWindowsContainerImage,
  buildDocumentedRuntimeCandidates,
  locateComparisonRuntime,
  parseWindowsRegistryLabviewCandidates,
  probeWindowsRegistryHostLabviewAvailable,
  queryWindowsContainerImageAvailability,
  queryWindowsContainerProviderFacts,
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

  it('blocks unsupported LabVIEW versions before scanning runtime tools (VHS-REQ-657.5)', async () => {
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

  it('retains configured path failures as checked candidate facts (VHS-REQ-633.2)', async () => {
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

  it('reports a requested LabVIEW bitness miss without switching bitness silently (VHS-REQ-155.2, VHS-REQ-155.6)', async () => {
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

  it('reports missing shared Windows LabVIEWCLI after resolving LabVIEW (VHS-REQ-155.2)', async () => {
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

  it('carries CLI-present + daemon-unreachable facts when the Docker daemon is stopped (VHS-REQ-642)', async () => {
    // Regression guard: the daemon-down shape (Docker CLI present, daemon
    // unreachable) must reach the unavailable selection with concrete docker
    // facts so the command/action layers can show the concise "start Docker
    // Desktop" toast and suppress the diagnostics report. The action and command
    // unit tests inject a runtime selection directly, so without this the real
    // locator chain for this case is otherwise unasserted.
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
            image: 'nationalinstruments/labview:2026q1patch2-windows',
            dockerCliAvailable: true,
            dockerDaemonReachable: false,
            windowsContainerCapabilityAvailable: false,
            windowsContainerHostMode: undefined,
            imageAvailable: false,
            notes: [
              'Docker CLI is present, but the Docker daemon was not reachable for Docker container validation.'
            ]
          })
        )
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'docker-provider-unavailable',
      requestedProvider: 'docker',
      dockerCliAvailable: true,
      dockerDaemonReachable: false
    });
    // Both the generic and windowsContainer* fallbacks must be populated so the
    // result-builder `?? windowsContainer*` chain never collapses to undefined.
    expect(selection.windowsContainerDockerCliAvailable).toBe(true);
    expect(selection.windowsContainerDaemonReachable).toBe(false);
  });

  it('probes Docker on Windows even when version/bitness are unset because the gate is required (VHS-REQ-657.8)', async () => {
    // Real-world production shape: readComparisonRuntimeSettings always sets
    // requireVersionAndBitness=true, and selecting Docker clears
    // labviewVersion/labviewBitness. The host-native version/bitness gate must
    // not pre-empt the Docker provider before it is probed.
    const queryFacts = vi.fn().mockResolvedValue(windowsContainerFacts());
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'docker',
        requireVersionAndBitness: true,
        containerImageVersion: '2026q1patch1-windows'
      },
      { queryWindowsContainerProviderFacts: queryFacts }
    );

    expect(queryFacts).toHaveBeenCalled();
    expect(selection.blockedReason).not.toBe('labview-runtime-selection-required');
    expect(selection).toMatchObject({
      provider: 'windows-container',
      requestedProvider: 'docker'
    });
  });

  it('still blocks the host-native lane when version/bitness are unset and the gate is required (VHS-REQ-657.8)', async () => {
    // Guard rail: bypassing the gate for Docker must not weaken it for the
    // host-native provider.
    const selection = await locateComparisonRuntime('win32', {
      requestedProvider: 'host',
      requireVersionAndBitness: true
    });

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'labview-runtime-selection-required',
      requestedProvider: 'host'
    });
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

  it('honors an existing configured LabVIEWCLI path for requested x64 LabVIEW (VHS-REQ-633.2)', async () => {
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
  it('retains all requested facts when blocking host runtime for missing LabVIEW (VHS-REQ-155.1)', async () => {
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

  it('retains all requested facts when blocking Docker runtime for missing CLI (VHS-REQ-155.1)', async () => {
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

  it('blocks host-native compare when LabVIEW x64 is running and x86 was requested (VHS-REQ-621.2)', async () => {
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

  it('blocks host-native compare even when allowExistingWindowsHostRuntime is true (bitness conflict overrides admit, VHS-REQ-621.2)', async () => {
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
    // #530: the host-native rejection reason must state the bitness conflict,
    // not the false 'LabVIEWCLI was not located' fallback (CLI was located).
    const hostNativeBitnessDecision = selection.providerDecisions?.find(
      (decision) => decision.provider === 'host-native' && decision.outcome === 'rejected'
    );
    expect(hostNativeBitnessDecision?.reason).toBe('host-native-windows-host-bitness-conflict');
    expect(hostNativeBitnessDecision?.detail).toContain(
      'a different LabVIEW bitness is already running'
    );
    expect(hostNativeBitnessDecision?.detail).not.toContain('LabVIEWCLI was not located');
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

  it('blocks host-native compare when a same-bitness, different-year LabVIEW is running (VHS-REQ-653.1, VHS-REQ-653.4)', async () => {
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
              'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe'
            )
          ) as never,
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([]) as never
      }
    );

    expect(selection.provider).toBe('unavailable');
    expect(selection.blockedReason).toBe('windows-host-version-conflict');
    expect(selection.hostObservedLabviewVersion).toBe('2025');
    expect(selection.hostObservedLabviewBitness).toBe('x64');
    expect(selection.requestedLabviewVersion).toBe('2026');
    expect(selection.notes.join('\n')).toContain('already running');
    expect(selection.notes.join('\n')).toContain('LabVIEW 2025');
    // #530: the host-native rejection reason must state the version conflict,
    // not the false 'LabVIEWCLI was not located' fallback (CLI was located).
    const hostNativeVersionDecision = selection.providerDecisions?.find(
      (decision) => decision.provider === 'host-native' && decision.outcome === 'rejected'
    );
    expect(hostNativeVersionDecision?.reason).toBe('host-native-windows-host-version-conflict');
    expect(hostNativeVersionDecision?.detail).toContain(
      'a different LabVIEW version is already running'
    );
    expect(hostNativeVersionDecision?.detail).not.toContain('LabVIEWCLI was not located');
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

  it('admits a same-bitness running LabVIEW session when the year cannot be inferred (VHS-REQ-653.2)', async () => {
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
            processObservationWithLabviewBitness('x64', 'D:\\Tools\\LabVIEW\\LabVIEW.exe')
          ) as never,
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([]) as never
      }
    );

    expect(selection.provider).toBe('host-native');
    expect(selection.blockedReason).toBeUndefined();
    expect(selection.hostObservedLabviewVersion).toBeUndefined();
  });

  it('defers to the bitness conflict before version or contaminated-surface blocks (VHS-REQ-653.3)', async () => {
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
              'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2025\\LabVIEW.exe'
            )
          ) as never,
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([
          { localAddress: '0.0.0.0', localPort: 3363, pid: 1234, processName: 'LabVIEW.exe' }
        ]) as never
      }
    );

    expect(selection.blockedReason).toBe('windows-host-bitness-conflict');
    expect(selection.blockedReason).not.toBe('windows-host-version-conflict');
    expect(selection.blockedReason).not.toBe('windows-host-runtime-surface-contaminated');
    expect(selection.hostObservedLabviewBitness).toBe('x86');
    expect(selection.hostObservedLabviewVersion).toBe('2025');
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

  it('retains a missing configured LabVIEW executable path as a checked candidate fact (VHS-REQ-633.2)', async () => {
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

  it('no longer blocks docker-only execution for a non-2026 LabVIEW version (VHS-REQ-657.5)', async () => {
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

    // VHS-REQ-657: the Docker provider is LabVIEW-agnostic; the selected image
    // governs the version, so a non-2026 requested year is no longer pinned out.
    expect(selection.blockedReason).not.toBe('docker-provider-labview-version-not-implemented');
    expect(selection.provider).toBe('windows-container');
  });

  it('drives the windows-container image from the selected container image version (VHS-REQ-650.1)', async () => {
    const query = vi
      .fn()
      .mockImplementation((windowsImage: string) =>
        Promise.resolve(windowsContainerFacts({ image: windowsImage }))
      );
    const selection = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'docker-only',
        labviewVersion: '2026',
        bitness: 'x64',
        containerImageVersion: '2026q1patch2-windows'
      },
      { queryWindowsContainerProviderFacts: query }
    );

    expect(query).toHaveBeenCalledWith(
      'nationalinstruments/labview:2026q1patch2-windows',
      expect.any(String),
      expect.any(String)
    );
    expect(selection.containerImage).toBe('nationalinstruments/labview:2026q1patch2-windows');
  });

  it('preserves the default windows-container image when no version is selected (VHS-REQ-650.2)', async () => {
    const query = vi
      .fn()
      .mockImplementation((windowsImage: string) =>
        Promise.resolve(windowsContainerFacts({ image: windowsImage }))
      );
    await locateComparisonRuntime(
      'win32',
      { executionMode: 'docker-only', labviewVersion: '2026', bitness: 'x64' },
      { queryWindowsContainerProviderFacts: query }
    );

    expect(query).toHaveBeenCalledWith(
      'nationalinstruments/labview:2026q1-windows',
      expect.any(String),
      expect.any(String)
    );
  });

  it('bypasses the version-not-implemented pin when a container image version is selected (VHS-REQ-650.3)', async () => {
    const query = vi
      .fn()
      .mockImplementation((windowsImage: string) =>
        Promise.resolve(windowsContainerFacts({ image: windowsImage }))
      );
    const selection = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'docker-only',
        labviewVersion: '2027',
        bitness: 'x64',
        containerImageVersion: '2027q1-windows'
      },
      { queryWindowsContainerProviderFacts: query }
    );

    expect(selection.blockedReason).not.toBe('docker-provider-labview-version-not-implemented');
    expect(query).toHaveBeenCalledWith(
      'nationalinstruments/labview:2027q1-windows',
      expect.any(String),
      expect.any(String)
    );
  });

  it('drives the linux-container image from the selected container image version (VHS-REQ-650.1)', async () => {
    const query = vi.fn().mockResolvedValue(
      windowsContainerFacts({
        image: 'nationalinstruments/labview:2026q1patch1-linux',
        provider: 'linux-container',
        runtimePlatform: 'linux',
        windowsContainerHostMode: 'linux'
      })
    );
    await locateComparisonRuntime(
      'win32',
      {
        labviewVersion: '2026',
        bitness: 'x64',
        containerImageVersion: '2026q1patch1-linux'
      },
      {
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        queryWindowsContainerProviderFacts: query
      }
    );

    expect(query).toHaveBeenCalledWith(
      expect.any(String),
      'nationalinstruments/labview:2026q1patch1-linux',
      expect.any(String)
    );
  });

  it('fails closed when the selected container image version platform conflicts with the Docker host mode (VHS-REQ-650.5)', async () => {
    // Linux image token selected, but the active Docker engine is in
    // windows-container mode. Previously the linux selection was silently
    // dropped and the default windows image ran; now it must fail closed.
    const query = vi.fn().mockResolvedValue(
      windowsContainerFacts({ windowsContainerHostMode: 'windows' })
    );
    const selection = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'docker-only',
        labviewVersion: '2026',
        bitness: 'x64',
        containerImageVersion: '2026q1-linux'
      },
      { queryWindowsContainerProviderFacts: query }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'container-image-platform-mismatch'
    });
    expect(selection.containerImage).toBe('nationalinstruments/labview:2026q1-linux');
    // #532: the structured conflict is retained so the concise toast can name
    // the selected image platform vs. the active engine mode without parsing
    // doctor-summary strings.
    expect(selection.containerImageVersionConflict).toMatchObject({
      selectedTag: '2026q1-linux',
      selectedPlatform: 'linux',
      activePlatform: 'windows'
    });
    expect(selection.notes.join('\n')).toContain('windows-container mode');
    expect(selection.notes.join('\n')).toContain('Switch Docker to linux containers');
    expect(selection.providerDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: 'rejected',
          reason: 'container-image-platform-mismatch'
        })
      ])
    );
  });

  it('does not flag a platform mismatch when a full image override governs the active platform (VHS-REQ-650.1, VHS-REQ-650.5)', async () => {
    // A raw windowsContainerImage override governs the windows host mode, so the
    // conflicting linux version token is moot and must not block.
    const query = vi
      .fn()
      .mockImplementation((windowsImage: string) =>
        Promise.resolve(windowsContainerFacts({ image: windowsImage }))
      );
    const selection = await locateComparisonRuntime(
      'win32',
      {
        executionMode: 'docker-only',
        labviewVersion: '2026',
        bitness: 'x64',
        containerImageVersion: '2026q1-linux',
        windowsContainerImage: 'nationalinstruments/labview:2026q1patch9-windows'
      },
      { queryWindowsContainerProviderFacts: query }
    );

    expect(selection.blockedReason).not.toBe('container-image-platform-mismatch');
    expect(selection.provider).toBe('windows-container');
    expect(selection.containerImage).toBe('nationalinstruments/labview:2026q1patch9-windows');
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

describe('probeWindowsRegistryHostLabviewAvailable (VHS-REQ-634.1)', () => {
  // A real National Instruments install records the install DIRECTORY (trailing
  // backslash) in the registry `Path` value, not the executable. The probe must
  // derive `<dir>LabVIEW.exe` and validate it on disk (issue #381).
  const REGISTRY_LABVIEW_INSTALL_DIR = 'D:\\Custom\\National Instruments\\LabVIEW 2026\\';
  const REGISTRY_LABVIEW_EXE = `${REGISTRY_LABVIEW_INSTALL_DIR}LabVIEW.exe`;

  function registryOutputFor(pathValue: string, subkey = '26.0'): string {
    return [
      `HKEY_LOCAL_MACHINE\\SOFTWARE\\National Instruments\\LabVIEW\\${subkey}`,
      `    Path    REG_SZ    ${pathValue}`,
      ''
    ].join('\r\n');
  }

  // Faithful reproduction of the stock NI registry layout from issue #381: every
  // version subkey records the install directory, not `...\LabVIEW.exe`.
  function realRegistryOutput(): string {
    const subkeys: ReadonlyArray<readonly [string, string]> = [
      ['25.0', 'C:\\Program Files\\National Instruments\\LabVIEW 2025\\'],
      ['25.3', 'C:\\Program Files\\National Instruments\\LabVIEW 2025\\'],
      ['26.0', 'D:\\Custom\\National Instruments\\LabVIEW 2026\\'],
      ['26.1', 'D:\\Custom\\National Instruments\\LabVIEW 2026\\']
    ];
    return subkeys
      .flatMap(([subkey, installDir]) => [
        `HKEY_LOCAL_MACHINE\\SOFTWARE\\National Instruments\\LabVIEW\\${subkey}`,
        `    Path    REG_SZ    ${installDir}`,
        ''
      ])
      .join('\r\n');
  }

  it('reports available when the NI install-directory Path resolves a LabVIEW.exe on disk and the shared CLI exists', async () => {
    const available = await probeWindowsRegistryHostLabviewAvailable({
      queryWindowsRegistry: async () => registryOutputFor(REGISTRY_LABVIEW_INSTALL_DIR),
      pathExists: pathExistsFor([REGISTRY_LABVIEW_EXE, WINDOWS_LABVIEW_CLI_X86])
    });

    expect(available).toBe(true);
  });

  it('resolves a real stock NI registry layout where every subkey records the install directory', async () => {
    const available = await probeWindowsRegistryHostLabviewAvailable({
      queryWindowsRegistry: async () => realRegistryOutput(),
      pathExists: pathExistsFor([
        'D:\\Custom\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
        WINDOWS_LABVIEW_CLI_X86
      ])
    });

    expect(available).toBe(true);
  });

  it('still resolves a registry Path that records LabVIEW.exe directly (forward compatibility)', async () => {
    const available = await probeWindowsRegistryHostLabviewAvailable({
      queryWindowsRegistry: async () => registryOutputFor(REGISTRY_LABVIEW_EXE),
      pathExists: pathExistsFor([REGISTRY_LABVIEW_EXE, WINDOWS_LABVIEW_CLI_X86])
    });

    expect(available).toBe(true);
  });

  it('reports unavailable when the derived LabVIEW.exe is not on disk (stale registry)', async () => {
    const available = await probeWindowsRegistryHostLabviewAvailable({
      queryWindowsRegistry: async () => registryOutputFor(REGISTRY_LABVIEW_INSTALL_DIR),
      pathExists: pathExistsFor([WINDOWS_LABVIEW_CLI_X86])
    });

    expect(available).toBe(false);
  });

  it('reports unavailable when the shared LabVIEW CLI is not on disk', async () => {
    const available = await probeWindowsRegistryHostLabviewAvailable({
      queryWindowsRegistry: async () => registryOutputFor(REGISTRY_LABVIEW_INSTALL_DIR),
      pathExists: pathExistsFor([REGISTRY_LABVIEW_EXE])
    });

    expect(available).toBe(false);
  });

  it('reports unavailable when the registry names no LabVIEW install', async () => {
    const available = await probeWindowsRegistryHostLabviewAvailable({
      queryWindowsRegistry: async () => 'HKEY_LOCAL_MACHINE\\SOFTWARE\\National Instruments\\LabVIEW\r\n',
      pathExists: pathExistsFor([WINDOWS_LABVIEW_CLI_X86])
    });

    expect(available).toBe(false);
  });

  it('never throws when the registry query fails (returns unavailable)', async () => {
    const available = await probeWindowsRegistryHostLabviewAvailable({
      queryWindowsRegistry: async () => {
        throw new Error('reg query failed');
      },
      pathExists: pathExistsFor([WINDOWS_LABVIEW_CLI_X86])
    });

    expect(available).toBe(false);
  });
});

describe('parseWindowsRegistryLabviewCandidates (VHS-REQ-634.1)', () => {
  function registryOutput(pathValue: string, subkey = '25.0'): string {
    return [
      `HKEY_LOCAL_MACHINE\\SOFTWARE\\National Instruments\\LabVIEW\\${subkey}`,
      `    Path    REG_SZ    ${pathValue}`,
      ''
    ].join('\r\n');
  }

  it('derives <dir>LabVIEW.exe from the NI install-directory Path value (issue #381)', () => {
    const candidates = parseWindowsRegistryLabviewCandidates(
      registryOutput('C:\\Program Files\\National Instruments\\LabVIEW 2025\\')
    );

    // The parser is pure: it emits a parse-time claim with exists: false; the
    // locator validates the path on disk (see the resolveWindowsRegistryCandidates
    // describe block) before trusting it.
    expect(candidates).toEqual([
      {
        kind: 'labview-exe',
        path: 'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe',
        source: 'registry',
        exists: false,
        bitness: 'x64'
      }
    ]);
  });

  it('still parses a Path value that records LabVIEW.exe directly (forward compatibility)', () => {
    const candidates = parseWindowsRegistryLabviewCandidates(
      registryOutput('C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe', '26.0')
    );

    expect(candidates).toEqual([
      {
        kind: 'labview-exe',
        path: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
        source: 'registry',
        exists: false,
        bitness: 'x86'
      }
    ]);
  });

  it('dedupes repeated install-directory subkeys to a single derived executable', () => {
    const output = [
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\National Instruments\\LabVIEW\\25.0',
      '    Path    REG_SZ    C:\\Program Files\\National Instruments\\LabVIEW 2025\\',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\National Instruments\\LabVIEW\\25.3',
      '    Path    REG_SZ    C:\\Program Files\\National Instruments\\LabVIEW 2025\\',
      ''
    ].join('\r\n');

    const candidates = parseWindowsRegistryLabviewCandidates(output);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].path).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2025\\LabVIEW.exe'
    );
  });

  it('does not treat non-LabVIEW subdirectories under the key as install candidates', () => {
    const candidates = parseWindowsRegistryLabviewCandidates(
      registryOutput('C:\\Program Files\\National Instruments\\LabVIEW 2026\\resource\\', '26.0')
    );

    expect(candidates).toEqual([]);
  });

  it('drops registry candidates below the supported minimum year, keeping 2025+ (#644)', () => {
    const output = [
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\National Instruments\\LabVIEW\\20.0',
      '    Path    REG_SZ    C:\\Program Files\\National Instruments\\LabVIEW 2020\\',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\National Instruments\\LabVIEW\\26.0',
      '    Path    REG_SZ    C:\\Program Files\\National Instruments\\LabVIEW 2026\\',
      ''
    ].join('\r\n');

    const candidates = parseWindowsRegistryLabviewCandidates(output);

    // The unsupported 2020 install is excluded; only the 2025+ install remains.
    expect(candidates.map((candidate) => candidate.path)).toEqual([
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    ]);
  });
});

describe('comparisonRuntimeLocator registry candidate disk validation (VHS-REQ-634.1, #381)', () => {
  // A non-default install drive that the documented scan never produces (it only
  // covers C:), yet whose bitness is still inferable from `\Program Files\`, so
  // these candidates can only reach selection via the registry parser/probe path.
  const REGISTRY_NONDEFAULT_INSTALL_DIR =
    'D:\\Program Files\\National Instruments\\LabVIEW 2026\\';
  const REGISTRY_NONDEFAULT_LABVIEW_EXE = `${REGISTRY_NONDEFAULT_INSTALL_DIR}LabVIEW.exe`;

  function installDirRegistryOutput(installDir: string): string {
    return [
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\National Instruments\\LabVIEW\\26.0',
      `    Path    REG_SZ    ${installDir}`,
      ''
    ].join('\r\n');
  }

  it('selects a registry-resolved non-default-path LabVIEW when the derived exe exists on disk', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: pathExistsFor([REGISTRY_NONDEFAULT_LABVIEW_EXE, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi
          .fn()
          .mockResolvedValue(installDirRegistryOutput(REGISTRY_NONDEFAULT_INSTALL_DIR)),
        ...quietWindowsHostSurfaceDeps()
      }
    );

    expect(selection).toMatchObject({
      provider: 'host-native',
      engine: 'labview-cli',
      labviewExe: {
        path: REGISTRY_NONDEFAULT_LABVIEW_EXE,
        source: 'registry',
        bitness: 'x64'
      }
    });
    expect(selection.blockedReason).toBeUndefined();
  });

  it('does not select a stale registry install-dir whose derived exe is absent on disk (#381)', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        // Stale registry subkey: the install directory is recorded but the exe
        // was removed, while the shared LabVIEWCLI is still installed. The
        // locator must report unavailable, not select the nonexistent path.
        pathExists: pathExistsFor([WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi
          .fn()
          .mockResolvedValue(installDirRegistryOutput(REGISTRY_NONDEFAULT_INSTALL_DIR)),
        ...quietWindowsHostSurfaceDeps()
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'labview-exe-not-found'
    });
    expect(selection.labviewExe).toBeUndefined();
  });
});

describe('acquireWindowsContainerImage live pull progress (VHS-REQ-654)', () => {
  const image = 'nationalinstruments/labview:2026q1-windows';

  it('drives the Docker Engine API stream and reports live layer-weighted progress (VHS-REQ-654.1)', async () => {
    const updates: Array<{ message: string; increment?: number }> = [];
    const streamPull = vi.fn(async (options: { onProgress?: (snap: unknown) => void | Promise<void> }) => {
      // Two 1 GB layers: one done at 50%, both done near the 99% ceiling.
      const gb = 1024 * 1024 * 1024;
      await options.onProgress?.({
        percent: 50,
        downloadedBytes: gb,
        totalBytes: 2 * gb,
        completedLayers: 1,
        totalLayers: 2
      });
      await options.onProgress?.({
        percent: 99,
        downloadedBytes: 2 * gb,
        totalBytes: 2 * gb,
        completedLayers: 2,
        totalLayers: 2
      });
      return { attempted: true, succeeded: true, statusLines: ['Pulling from nationalinstruments/labview'] };
    });

    const result = await acquireWindowsContainerImage(image, 'win32', {
      streamPull: streamPull as never,
      reportProgress: (update) => {
        updates.push(update);
      }
    });

    expect(streamPull).toHaveBeenCalledOnce();
    expect(result.acquisitionState).toBe('acquired');
    // The layer-weighted percentage, layer count, and downloaded bytes reach the toast.
    expect(updates.some((u) => /50% \(1\/2 layers, 1 GB\)/.test(u.message))).toBe(true);
    expect(updates.some((u) => /99% \(2\/2 layers, 2 GB\)/.test(u.message))).toBe(true);
    // The final "ready" update lands.
    expect(updates.at(-1)?.message).toBe(`Container image ready: ${image}`);
  });

  it('re-emits the toast when only the downloaded bytes change at the same whole percent (VHS-REQ-654.2)', async () => {
    const updates: Array<{ message: string; increment?: number }> = [];
    const streamPull = vi.fn(async (options: { onProgress?: (snap: unknown) => void | Promise<void> }) => {
      const gb = 1024 * 1024 * 1024;
      // Same rounded percent, growing bytes/layers: the old percent-only throttle
      // froze here; the message-change throttle must still update the toast.
      await options.onProgress?.({
        percent: 30,
        downloadedBytes: gb,
        totalBytes: 5 * gb,
        completedLayers: 1,
        totalLayers: 3
      });
      await options.onProgress?.({
        percent: 30,
        downloadedBytes: 2 * gb,
        totalBytes: 5 * gb,
        completedLayers: 1,
        totalLayers: 3
      });
      return { attempted: true, succeeded: true, statusLines: [] };
    });

    await acquireWindowsContainerImage(image, 'win32', {
      streamPull: streamPull as never,
      reportProgress: (update) => {
        updates.push(update);
      }
    });

    const pullMessages = updates.filter((u) => u.message.includes('Pulling container image'));
    expect(pullMessages.some((u) => /30% \(1\/3 layers, 1 GB\)/.test(u.message))).toBe(true);
    expect(pullMessages.some((u) => /30% \(1\/3 layers, 2 GB\)/.test(u.message))).toBe(true);
  });

  it('signals the extraction phase and keeps the bar advancing after download (VHS-REQ-656.2, VHS-REQ-656.3)', async () => {
    const updates: Array<{ message: string; increment?: number }> = [];
    const gb = 1024 * 1024 * 1024;
    const streamPull = vi.fn(async (options: { onProgress?: (snap: unknown) => void | Promise<void> }) => {
      // Download finishes: bar near the download ceiling.
      await options.onProgress?.({
        phase: 'downloading',
        percent: 99,
        overallPercent: 84,
        downloadedBytes: 2 * gb,
        totalBytes: 2 * gb,
        completedLayers: 0,
        totalLayers: 2
      });
      // Extraction begins, then progresses: message names the phase and the bar
      // advances past where the download left it.
      await options.onProgress?.({
        phase: 'extracting',
        percent: 99,
        overallPercent: 88,
        extractPercent: 25,
        downloadedBytes: 2 * gb,
        totalBytes: 2 * gb,
        completedLayers: 0,
        totalLayers: 2
      });
      await options.onProgress?.({
        phase: 'extracting',
        percent: 99,
        overallPercent: 92,
        extractPercent: 50,
        downloadedBytes: 2 * gb,
        totalBytes: 2 * gb,
        completedLayers: 1,
        totalLayers: 2
      });
      return { attempted: true, succeeded: true, statusLines: [] };
    });

    const result = await acquireWindowsContainerImage(image, 'win32', {
      streamPull: streamPull as never,
      reportProgress: (update) => {
        updates.push(update);
      }
    });

    expect(result.acquisitionState).toBe('acquired');
    // The download phase was shown...
    expect(updates.some((u) => /Pulling container image: .* — 99%/.test(u.message))).toBe(true);
    // ...then extraction took over with its own climbing percent (no frozen 99%).
    expect(updates.some((u) => u.message === `Extracting container image: ${image} — 25% (0/2 layers)`)).toBe(true);
    expect(updates.some((u) => u.message === `Extracting container image: ${image} — 50% (1/2 layers)`)).toBe(true);
    // The bar advanced during extraction (an increment was emitted after download).
    const extractUpdates = updates.filter((u) => u.message.startsWith('Extracting'));
    expect(extractUpdates.some((u) => (u.increment ?? 0) > 0)).toBe(true);
    expect(updates.at(-1)?.message).toBe(`Container image ready: ${image}`);
  });

  it('reports a failed acquisition when the daemon stream errors in-band', async () => {
    const streamPull = vi.fn(async () => ({
      attempted: true,
      succeeded: false,
      statusLines: ['Pulling from nationalinstruments/labview'],
      errorMessage: 'manifest unknown'
    }));

    const result = await acquireWindowsContainerImage(image, 'win32', {
      streamPull: streamPull as never
    });

    expect(result.acquisitionState).toBe('failed');
    expect(result.notes.at(-1)).toBe('manifest unknown');
  });

  it('falls back to the CLI spawn pull when the daemon socket is unreachable', async () => {
    const streamPull = vi.fn(async () => ({ attempted: false, succeeded: false, statusLines: [] }));

    const stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    const stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    const child = Object.assign(new EventEmitter(), { stdout, stderr });
    const spawnImpl = vi.fn(() => child);

    const resultPromise = acquireWindowsContainerImage(image, 'win32', {
      streamPull: streamPull as never,
      spawnImpl: spawnImpl as never
    });

    // Let the async stream attempt settle, then drive the fallback spawn to success.
    await Promise.resolve();
    await Promise.resolve();
    stdout.emit('data', 'Status: Downloaded newer image\n');
    child.emit('close', 0);

    const result = await resultPromise;
    expect(streamPull).toHaveBeenCalledOnce();
    expect(spawnImpl).toHaveBeenCalledOnce();
    expect(result.acquisitionState).toBe('acquired');
  });
});

type DockerExecFileRunner = (
  file: string,
  args: readonly string[],
  options: { windowsHide: boolean; maxBuffer: number }
) => Promise<{ stdout: string; stderr?: string }>;

function enoentError(message = 'spawn docker ENOENT'): Error {
  return Object.assign(new Error(message), { code: 'ENOENT' });
}

function makeFakeDockerChild() {
  const stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  const stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  const child = Object.assign(new EventEmitter(), { stdout, stderr });
  return { child, stdout, stderr };
}

describe('queryWindowsContainerImageAvailability docker command routing (VHS-REQ-642, VHS-REQ-657)', () => {
  const image = 'nationalinstruments/labview:2026q1-windows';
  const dockerOptions = expect.objectContaining({ windowsHide: true });

  it('runs `docker image inspect` directly on a win32 host and reports availability', async () => {
    const runner = vi.fn(async () => ({ stdout: '[]' }));
    const available = await queryWindowsContainerImageAvailability(image, 'win32', runner as never);

    expect(available).toBe(true);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith('docker', ['image', 'inspect', image], dockerOptions);
  });

  it('reports unavailable on a win32 host when the image inspect rejects', async () => {
    const runner = vi.fn(async () => {
      throw new Error('No such image');
    });
    const available = await queryWindowsContainerImageAvailability(image, 'win32', runner as never);

    expect(available).toBe(false);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('retries a missing-docker ENOENT through the WSL cmd.exe bridge on a linux host', async () => {
    const runner = vi.fn(async (file: string) => {
      if (file === 'docker') {
        throw enoentError('spawn docker');
      }
      return { stdout: '[]' };
    });
    const available = await queryWindowsContainerImageAvailability(image, 'linux', runner as never);

    expect(available).toBe(true);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner).toHaveBeenLastCalledWith(
      '/mnt/c/Windows/System32/cmd.exe',
      ['/c', 'docker', 'image', 'inspect', image],
      dockerOptions
    );
  });

  it('retries when the linux docker error message names a missing command (`not found`)', async () => {
    const runner = vi.fn(async (file: string) => {
      if (file === 'docker') {
        throw new Error('docker: command not found');
      }
      return { stdout: '[]' };
    });

    expect(await queryWindowsContainerImageAvailability(image, 'linux', runner as never)).toBe(true);
    expect(runner).toHaveBeenLastCalledWith(
      '/mnt/c/Windows/System32/cmd.exe',
      ['/c', 'docker', 'image', 'inspect', image],
      dockerOptions
    );
  });

  it('retries when the linux docker error message reads `spawn docker`', async () => {
    const runner = vi.fn(async (file: string) => {
      if (file === 'docker') {
        throw new Error('spawn docker');
      }
      return { stdout: '[]' };
    });

    expect(await queryWindowsContainerImageAvailability(image, 'linux', runner as never)).toBe(true);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('retries when the linux docker error message contains ENOENT without an errno code', async () => {
    const runner = vi.fn(async (file: string) => {
      if (file === 'docker') {
        throw new Error('ENOENT: no such file or directory');
      }
      return { stdout: '[]' };
    });

    expect(await queryWindowsContainerImageAvailability(image, 'linux', runner as never)).toBe(true);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('does not retry (rethrows) when the linux docker error is not a missing-docker error', async () => {
    // A reachable-but-broken daemon (not a missing binary) must be rethrown by
    // runWindowsDockerCommand rather than retried through the WSL bridge; the
    // availability probe then reports the image as unavailable.
    const runner = vi.fn(async () => {
      throw new Error('Cannot connect to the Docker daemon');
    });

    expect(await queryWindowsContainerImageAvailability(image, 'linux', runner as never)).toBe(false);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('does not retry (rethrows) when the linux docker rejection is not an object', async () => {
    const runner = vi.fn(async () => {
      const nonObjectFailure: unknown = 'catastrophic docker failure';
      throw nonObjectFailure;
    });

    expect(await queryWindowsContainerImageAvailability(image, 'linux', runner as never)).toBe(false);
    expect(runner).toHaveBeenCalledTimes(1);
  });
});

describe('queryWindowsContainerProviderFacts docker daemon probing (VHS-REQ-642, VHS-REQ-657)', () => {
  const windowsImage = 'nationalinstruments/labview:2026q1-windows';
  const linuxImage = 'nationalinstruments/labview:2026q1-linux';

  function dockerRunner(config: {
    osType?: string;
    infoError?: unknown;
    inspectError?: unknown;
    enoentFallback?: boolean;
  }): ReturnType<typeof vi.fn> {
    return vi.fn(async (file: string, args: readonly string[]) => {
      if (config.enoentFallback && file === 'docker') {
        throw enoentError();
      }
      if (args.includes('info')) {
        if (config.infoError !== undefined) {
          throw config.infoError;
        }
        return { stdout: `${config.osType ?? 'windows'}\n` };
      }
      if (config.inspectError !== undefined) {
        throw config.inspectError;
      }
      return { stdout: '[]' };
    });
  }

  it('reports a reachable Windows-container daemon with the image present locally', async () => {
    const runner = dockerRunner({ osType: 'windows' });
    const facts = await queryWindowsContainerProviderFacts(
      windowsImage,
      linuxImage,
      'win32',
      runner as never
    );

    expect(facts).toMatchObject({
      dockerCliAvailable: true,
      dockerDaemonReachable: true,
      windowsContainerHostMode: 'windows',
      windowsContainerCapabilityAvailable: true,
      provider: 'windows-container',
      runtimePlatform: 'win32',
      image: windowsImage,
      imageAvailable: true
    });
    expect(facts.notes.join('\n')).toContain('present locally');
  });

  it('resolves the linux image and provider when the daemon runs in Linux-container mode', async () => {
    const runner = dockerRunner({ osType: 'linux' });
    const facts = await queryWindowsContainerProviderFacts(
      windowsImage,
      linuxImage,
      'win32',
      runner as never
    );

    expect(facts).toMatchObject({
      windowsContainerHostMode: 'linux',
      provider: 'linux-container',
      runtimePlatform: 'linux',
      image: linuxImage,
      imageAvailable: true
    });
  });

  it('flags an unconfirmed container mode when docker info returns an unknown OSType', async () => {
    const runner = dockerRunner({ osType: 'plan9' });
    const facts = await queryWindowsContainerProviderFacts(
      windowsImage,
      linuxImage,
      'win32',
      runner as never
    );

    expect(facts).toMatchObject({
      dockerDaemonReachable: true,
      windowsContainerHostMode: 'unknown',
      windowsContainerCapabilityAvailable: false,
      imageAvailable: false
    });
    expect(facts.notes.join('\n')).toContain('could not be confirmed');
  });

  it('records the image as absent when the inspect rejects but the daemon is reachable', async () => {
    const runner = dockerRunner({ osType: 'windows', inspectError: new Error('No such image') });
    const facts = await queryWindowsContainerProviderFacts(
      windowsImage,
      linuxImage,
      'win32',
      runner as never
    );

    expect(facts).toMatchObject({
      windowsContainerCapabilityAvailable: true,
      imageAvailable: false
    });
    expect(facts.notes.join('\n')).toContain('not present locally');
  });

  it('marks the Docker CLI unavailable when docker info reports a missing command', async () => {
    const runner = dockerRunner({ infoError: enoentError() });
    const facts = await queryWindowsContainerProviderFacts(
      windowsImage,
      linuxImage,
      'win32',
      runner as never
    );

    expect(facts).toMatchObject({
      dockerCliAvailable: false,
      dockerDaemonReachable: false,
      windowsContainerCapabilityAvailable: false
    });
    expect(facts.notes.join('\n')).toContain('Docker CLI is not available');
  });

  it('marks the daemon unreachable when docker info fails with a non-missing error', async () => {
    const runner = dockerRunner({ infoError: new Error('Cannot connect to the Docker daemon') });
    const facts = await queryWindowsContainerProviderFacts(
      windowsImage,
      linuxImage,
      'win32',
      runner as never
    );

    expect(facts).toMatchObject({
      dockerCliAvailable: true,
      dockerDaemonReachable: false,
      windowsContainerCapabilityAvailable: false
    });
    expect(facts.notes.join('\n')).toContain('daemon was not reachable');
  });

  it('routes docker info + inspect through the WSL cmd.exe bridge on a linux host', async () => {
    const runner = dockerRunner({ osType: 'windows', enoentFallback: true });
    const facts = await queryWindowsContainerProviderFacts(
      windowsImage,
      linuxImage,
      'linux',
      runner as never
    );

    expect(facts.dockerCliAvailable).toBe(true);
    expect(facts.imageAvailable).toBe(true);
    expect(runner).toHaveBeenCalledWith(
      '/mnt/c/Windows/System32/cmd.exe',
      ['/c', 'docker', 'info', '--format', '{{.OSType}}'],
      expect.objectContaining({ windowsHide: true })
    );
  });

  it('supports the legacy (image, hostPlatform, runner) call signature', async () => {
    const runner = dockerRunner({ osType: 'windows' });
    const facts = await queryWindowsContainerProviderFacts(windowsImage, 'win32', runner as never);

    expect(facts).toMatchObject({
      dockerCliAvailable: true,
      windowsContainerHostMode: 'windows',
      image: windowsImage,
      imageAvailable: true
    });
  });
});

describe('acquireWindowsContainerImage CLI fallback spawn routing (VHS-REQ-654)', () => {
  const image = 'nationalinstruments/labview:2026q1-windows';

  function withWslDistro<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
    const previous = process.env.WSL_DISTRO_NAME;
    if (value === undefined) {
      delete process.env.WSL_DISTRO_NAME;
    } else {
      process.env.WSL_DISTRO_NAME = value;
    }
    return run().finally(() => {
      if (previous === undefined) {
        delete process.env.WSL_DISTRO_NAME;
      } else {
        process.env.WSL_DISTRO_NAME = previous;
      }
    });
  }

  it('spawns the pull through the WSL cmd.exe bridge when WSL_DISTRO_NAME is set on linux (VHS-REQ-654.3)', async () => {
    await withWslDistro('Ubuntu-22.04', async () => {
      const { child, stdout } = makeFakeDockerChild();
      const spawnImpl = vi.fn(() => child);

      const resultPromise = acquireWindowsContainerImage(image, 'linux', {
        spawnImpl: spawnImpl as never
      });

      await Promise.resolve();
      await Promise.resolve();
      stdout.emit('data', 'Status: Downloaded newer image\n');
      child.emit('close', 0);

      const result = await resultPromise;
      expect(result.acquisitionState).toBe('acquired');
      expect(spawnImpl).toHaveBeenCalledWith(
        '/mnt/c/Windows/System32/cmd.exe',
        ['/c', 'docker', 'pull', image],
        expect.objectContaining({ windowsHide: true })
      );
    });
  });

  it('spawns a plain docker pull on a linux host without WSL when the daemon socket is unreachable (VHS-REQ-654.3, VHS-REQ-654.4)', async () => {
    await withWslDistro(undefined, async () => {
      const streamPull = vi.fn(async () => ({ attempted: false, succeeded: false, statusLines: [] }));
      const { child, stdout } = makeFakeDockerChild();
      const spawnImpl = vi.fn(() => child);

      const resultPromise = acquireWindowsContainerImage(image, 'linux', {
        streamPull: streamPull as never,
        spawnImpl: spawnImpl as never
      });

      await Promise.resolve();
      await Promise.resolve();
      stdout.emit('data', 'Status: Image is up to date\n');
      child.emit('close', 0);

      const result = await resultPromise;
      expect(streamPull).toHaveBeenCalledOnce();
      expect(result.acquisitionState).toBe('acquired');
      expect(spawnImpl).toHaveBeenCalledWith(
        'docker',
        ['pull', image],
        expect.objectContaining({ windowsHide: true })
      );
    });
  });

  it('reports a failed acquisition with the exit code when the CLI pull exits non-zero without output (VHS-REQ-654.4)', async () => {
    const streamPull = vi.fn(async () => ({ attempted: false, succeeded: false, statusLines: [] }));
    const { child } = makeFakeDockerChild();
    const spawnImpl = vi.fn(() => child);

    const resultPromise = acquireWindowsContainerImage(image, 'win32', {
      streamPull: streamPull as never,
      spawnImpl: spawnImpl as never
    });

    await Promise.resolve();
    await Promise.resolve();
    child.emit('close', 1);

    const result = await resultPromise;
    expect(result.acquisitionState).toBe('failed');
    expect(result.notes.at(-1)).toContain('exit code 1');
  });

  it('reports a failed acquisition when the CLI pull emits a spawn error (VHS-REQ-654.4)', async () => {
    const streamPull = vi.fn(async () => ({ attempted: false, succeeded: false, statusLines: [] }));
    const { child } = makeFakeDockerChild();
    const spawnImpl = vi.fn(() => child);

    const resultPromise = acquireWindowsContainerImage(image, 'win32', {
      streamPull: streamPull as never,
      spawnImpl: spawnImpl as never
    });

    await Promise.resolve();
    await Promise.resolve();
    child.emit('error', new Error('docker binary missing'));
    child.emit('close', null);

    const result = await resultPromise;
    expect(result.acquisitionState).toBe('failed');
    expect(result.notes.at(-1)).toContain('before pull could start');
    expect(result.notes.at(-1)).toContain('docker binary missing');
  });

  it('surfaces per-line CLI pull progress from stdout and stderr on the acquisition toast (VHS-REQ-654.3)', async () => {
    const streamPull = vi.fn(async () => ({ attempted: false, succeeded: false, statusLines: [] }));
    const { child, stdout, stderr } = makeFakeDockerChild();
    const spawnImpl = vi.fn(() => child);
    const updates: Array<{ message: string; increment?: number }> = [];

    const resultPromise = acquireWindowsContainerImage(image, 'win32', {
      streamPull: streamPull as never,
      spawnImpl: spawnImpl as never,
      reportProgress: (update) => {
        updates.push(update);
      }
    });

    await Promise.resolve();
    await Promise.resolve();
    stdout.emit('data', 'latest: Pulling from nationalinstruments/labview\n');
    stderr.emit('data', 'Waiting for layer\n');
    child.emit('close', 0);

    const result = await resultPromise;
    expect(result.acquisitionState).toBe('acquired');
    expect(result.notes).toContain('latest: Pulling from nationalinstruments/labview');
    expect(result.notes).toContain('Waiting for layer');
    expect(updates.some((update) => update.message.includes('Pulling container image:'))).toBe(true);
    expect(updates.at(-1)?.message).toBe(`Container image ready: ${image}`);
  });
});

describe('comparisonRuntimeLocator auto-mode container fallback selection (VHS-REQ-621, VHS-REQ-155)', () => {
  // These fail-through container-selection lanes are only reachable when the
  // first Windows auto probe does not early-return (it treats the Docker CLI as
  // absent) yet the injected provider facts still expose a usable container
  // capability. queryWindowsContainerProviderFacts is the sanctioned dependency
  // seam for exercising that otherwise-defensive combination.
  function fallThroughContainerFacts(
    overrides: Partial<WindowsContainerProviderFacts> = {}
  ): WindowsContainerProviderFacts {
    return windowsContainerFacts({
      dockerCliAvailable: false,
      dockerDaemonReachable: false,
      windowsContainerCapabilityAvailable: true,
      windowsContainerHostMode: 'windows',
      imageAvailable: true,
      ...overrides
    });
  }

  function runningLabviewObservation(bitness: 'x86' | 'x64', executablePath: string) {
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
      labviewProcessBitness: bitness,
      labviewProcessExecutablePath: executablePath
    };
  }

  it('selects the container provider when no host-native LabVIEW runtime is located', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      { labviewVersion: '2026', bitness: 'x64' },
      {
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(fallThroughContainerFacts())
      }
    );

    expect(selection.provider).toBe('windows-container');
    expect(selection.notes.join('\n')).toContain(
      'No compatible host-native LabVIEW 2025 or newer runtime was located'
    );
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'windows-container',
        outcome: 'selected',
        reason: 'windows-container-selected-host-runtime-unavailable'
      })
    );
  });

  it('selects the container provider when the validated host runtime surface is contaminated', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      { labviewVersion: '2026', bitness: 'x64' },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(fallThroughContainerFacts()),
        readFile: vi.fn().mockRejectedValue(new Error('no ini')) as never,
        observeWindowsProcesses: vi
          .fn()
          .mockResolvedValue(runningLabviewObservation('x64', WINDOWS_LABVIEW_2026_X64)) as never,
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([]) as never
      }
    );

    expect(selection.provider).toBe('windows-container');
    expect(selection.notes.join('\n')).toContain('contaminated');
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'windows-container',
        outcome: 'selected',
        reason: 'auto-required-docker-because-host-runtime-conflict'
      })
    );
  });

  it('selects the container provider when host LabVIEW exists but no host comparison tool is located', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      { labviewVersion: '2026', bitness: 'x64' },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(fallThroughContainerFacts()),
        ...quietWindowsHostSurfaceDeps()
      }
    );

    expect(selection.provider).toBe('windows-container');
    expect(selection.notes.join('\n')).toContain('no host comparison tool');
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'windows-container',
        outcome: 'selected',
        reason: 'windows-container-selected-because-host-comparison-tool-missing'
      })
    );
  });

  it('requires clearing a contaminated x86 host surface because x86 stays host-native', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      { executionMode: 'auto', labviewVersion: '2026', bitness: 'x86' },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X86, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        // Docker reported absent so the first auto probe falls through to the
        // host-native lane, where the x86 contamination branch applies.
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(
          windowsContainerFacts({
            dockerCliAvailable: false,
            dockerDaemonReachable: false,
            windowsContainerCapabilityAvailable: false,
            windowsContainerHostMode: undefined,
            imageAvailable: false
          })
        ),
        readFile: vi.fn().mockRejectedValue(new Error('no ini')) as never,
        observeWindowsProcesses: vi
          .fn()
          .mockResolvedValue(runningLabviewObservation('x86', WINDOWS_LABVIEW_2026_X86)) as never,
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([]) as never
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'windows-host-runtime-surface-contaminated'
    });
    expect(selection.notes.join('\n')).toContain('Windows x86 execution remains host-native');
  });
});

describe('comparisonRuntimeLocator legacy queryWindowsContainerImage probe (VHS-REQ-642)', () => {
  it('derives available Windows container facts from the legacy image-inspect probe', async () => {
    const queryImage = vi.fn().mockResolvedValue(true);
    const selection = await locateComparisonRuntime(
      'win32',
      { executionMode: 'docker-only', labviewVersion: '2026', bitness: 'x64' },
      { hostPlatform: 'win32', queryWindowsContainerImage: queryImage }
    );

    expect(queryImage).toHaveBeenCalledWith('nationalinstruments/labview:2026q1-windows', 'win32');
    expect(selection).toMatchObject({
      provider: 'windows-container',
      dockerCliAvailable: true,
      containerImageAvailable: true
    });
  });

  it('derives unavailable Windows container facts when the legacy probe misses the image', async () => {
    const queryImage = vi.fn().mockResolvedValue(false);
    const selection = await locateComparisonRuntime(
      'win32',
      { executionMode: 'docker-only', labviewVersion: '2026', bitness: 'x64' },
      { hostPlatform: 'win32', queryWindowsContainerImage: queryImage }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'docker-only-provider-unavailable',
      dockerCliAvailable: false
    });
  });
});

describe('comparisonRuntimeLocator ambiguous host LabVIEW resolution (VHS-REQ-634.1)', () => {
  it('blocks when the registry and documented scan resolve two matching LabVIEW executables', async () => {
    const registryInstallDir = 'D:\\Program Files\\National Instruments\\LabVIEW 2026\\';
    const registryExe = `${registryInstallDir}LabVIEW.exe`;
    const selection = await locateComparisonRuntime(
      'win32',
      {
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        labviewVersion: '2026',
        bitness: 'x64'
      },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64, registryExe, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(
          [
            'HKEY_LOCAL_MACHINE\\SOFTWARE\\National Instruments\\LabVIEW\\26.0',
            `    Path    REG_SZ    ${registryInstallDir}`,
            ''
          ].join('\r\n')
        ),
        ...quietWindowsHostSurfaceDeps()
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'labview-exe-ambiguous'
    });
    expect(selection.notes.join('\n')).toContain('multiple supported LabVIEW 2026 x64');
    const hostDecision = selection.providerDecisions?.find(
      (decision) => decision.provider === 'host-native' && decision.outcome === 'rejected'
    );
    expect(hostDecision?.reason).toBe('host-native-labview-exe-ambiguous');
    expect(hostDecision?.detail).toContain('multiple supported LabVIEW executables');
  });
});

describe('comparisonRuntimeLocator platform-specific runtime resolution (VHS-REQ-632, VHS-REQ-657)', () => {
  it('produces no documented runtime candidates on macOS', () => {
    expect(buildDocumentedRuntimeCandidates('darwin')).toEqual([]);
  });

  it('rejects the linux container provider when the requested provider is invalid on linux', async () => {
    const selection = await locateComparisonRuntime('linux', {
      invalidRequestedProvider: 'cloud',
      labviewVersion: '2026',
      bitness: 'x64'
    });

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'installed-provider-invalid'
    });
    expect(selection.providerDecisions).toContainEqual(
      expect.objectContaining({
        provider: 'linux-container',
        outcome: 'rejected',
        reason: 'invalid-installed-provider'
      })
    );
  });

  it('reports docker-only execution as unsupported on an out-of-contract platform', async () => {
    const selection = await locateComparisonRuntime(
      'freebsd' as never,
      { executionMode: 'docker-only', labviewVersion: '2026', bitness: 'x64' },
      {
        hostPlatform: 'linux',
        queryWindowsContainerProviderFacts: vi
          .fn()
          .mockResolvedValue(windowsContainerFacts({ hostPlatform: 'linux' }))
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'docker-only-provider-not-supported-on-platform'
    });
    expect(selection.notes.join('\n')).toContain('Windows hosts and Linux hosts');
  });

  it('selects host-native LabVIEWCLI on linux when a documented CLI and LabVIEW are present (VHS-REQ-632.3)', async () => {
    const linuxCandidates = buildDocumentedRuntimeCandidates('linux');
    const linuxExe = linuxCandidates.find((candidate) => candidate.kind === 'labview-exe')!.path;
    const linuxCli = linuxCandidates.find((candidate) => candidate.kind === 'labview-cli')!.path;
    const selection = await locateComparisonRuntime(
      'linux',
      { requestedProvider: 'host' },
      { hostPlatform: 'linux', pathExists: pathExistsFor([linuxExe, linuxCli]) }
    );

    expect(selection).toMatchObject({
      provider: 'host-native',
      engine: 'labview-cli'
    });
    expect(selection.labviewExe?.path).toBe(linuxExe);
    expect(selection.labviewCli?.path).toBe(linuxCli);
  });

  it('blocks linux host compare with only LVCompare present because LabVIEWCLI is canonical', async () => {
    const linuxCandidates = buildDocumentedRuntimeCandidates('linux');
    const linuxExe = linuxCandidates.find((candidate) => candidate.kind === 'labview-exe')!.path;
    const linuxLvCompare = linuxCandidates.find((candidate) => candidate.kind === 'lvcompare')!.path;
    const selection = await locateComparisonRuntime(
      'linux',
      { requestedProvider: 'host' },
      { hostPlatform: 'linux', pathExists: pathExistsFor([linuxExe, linuxLvCompare]) }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'canonical-labview-cli-not-found'
    });
    expect(selection.notes.join('\n')).toContain('LVCompare remains an internal parity-only surface');
  });

  it('reports the best-effort linux guidance when only LabVIEW (no comparison tool) is present', async () => {
    const linuxCandidates = buildDocumentedRuntimeCandidates('linux');
    const linuxExe = linuxCandidates.find((candidate) => candidate.kind === 'labview-exe')!.path;
    const selection = await locateComparisonRuntime(
      'linux',
      { requestedProvider: 'host' },
      { hostPlatform: 'linux', pathExists: pathExistsFor([linuxExe]) }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'comparison-tool-not-found'
    });
    expect(selection.notes.join('\n')).toContain('Linux report generation remains best-effort');
    expect(selection.notes.join('\n')).toContain('Install LabVIEWCLI');
  });

  it('reports no located LabVIEW executable on linux when nothing is on disk', async () => {
    const selection = await locateComparisonRuntime(
      'linux',
      { requestedProvider: 'host' },
      { hostPlatform: 'linux', pathExists: vi.fn().mockResolvedValue(false) }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'labview-exe-not-found'
    });
  });
});

describe('comparisonRuntimeLocator linux container image override suppresses version conflict (VHS-REQ-650)', () => {
  it('does not flag a platform mismatch when a linux image override governs a linux-container host mode (VHS-REQ-650.1, VHS-REQ-650.5)', async () => {
    // The linux-side of the active-platform override branch: a linux image
    // override plus a linux-container host mode makes the conflicting windows
    // version token moot, so the selection proceeds instead of failing closed.
    const query = vi.fn().mockResolvedValue(
      windowsContainerFacts({
        image: 'nationalinstruments/labview:2026q1patch4-linux',
        provider: 'linux-container',
        runtimePlatform: 'linux',
        windowsContainerHostMode: 'linux'
      })
    );
    const selection = await locateComparisonRuntime(
      'win32',
      {
        labviewVersion: '2026',
        bitness: 'x64',
        containerImageVersion: '2026q1-windows',
        linuxContainerImage: 'nationalinstruments/labview:2026q1patch4-linux'
      },
      {
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        queryWindowsContainerProviderFacts: query
      }
    );

    expect(selection.blockedReason).not.toBe('container-image-platform-mismatch');
    expect(selection.provider).toBe('linux-container');
  });
});

describe('comparisonRuntimeLocator Docker-unavailable fallback notes (VHS-REQ-621, VHS-REQ-642)', () => {
  function dockerAbsentFacts(): WindowsContainerProviderFacts {
    return windowsContainerFacts({
      dockerCliAvailable: false,
      dockerDaemonReachable: false,
      windowsContainerCapabilityAvailable: false,
      windowsContainerHostMode: undefined,
      imageAvailable: false
    });
  }

  function runningLabviewObservation(bitness: 'x86' | 'x64', executablePath: string) {
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
      labviewProcessBitness: bitness,
      labviewProcessExecutablePath: executablePath
    };
  }

  it('notes the unavailable Docker provider when neither a host runtime nor a container is available', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      { labviewVersion: '2026', bitness: 'x64' },
      {
        pathExists: vi.fn().mockResolvedValue(false),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(dockerAbsentFacts())
      }
    );

    // The `labview-exe-not-found` return builds its own guidance notes, so the
    // interim "container unavailable" note (which this case exercises) is not
    // itself surfaced; the assertion pins the returned guidance instead.
    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'labview-exe-not-found'
    });
    expect(selection.notes.join('\n')).toContain(
      'No supported LabVIEW 2026 runtime was located for report generation'
    );
  });

  it('notes the unavailable Docker provider when the host surface is contaminated with no container', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      { labviewVersion: '2026', bitness: 'x64' },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64, WINDOWS_LABVIEW_CLI_X86]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(dockerAbsentFacts()),
        readFile: vi.fn().mockRejectedValue(new Error('no ini')) as never,
        observeWindowsProcesses: vi
          .fn()
          .mockResolvedValue(runningLabviewObservation('x64', WINDOWS_LABVIEW_2026_X64)) as never,
        observeWindowsTcpListeners: vi.fn().mockResolvedValue([]) as never
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'windows-host-runtime-surface-contaminated'
    });
    expect(selection.notes.join('\n')).toContain(
      'Validated Windows host runtime surface required Docker, but'
    );
  });

  it('notes the unavailable Docker provider when host LabVIEW exists but no comparison tool or container is available', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      { labviewVersion: '2026', bitness: 'x64' },
      {
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(dockerAbsentFacts()),
        ...quietWindowsHostSurfaceDeps()
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'comparison-tool-not-found'
    });
    expect(selection.notes.join('\n')).toContain('The Docker provider was not available because');
  });

  it('names the daemon-unreachable reason for docker-only when the CLI is present but the daemon is down', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      { executionMode: 'docker-only', labviewVersion: '2026', bitness: 'x64' },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(
          windowsContainerFacts({
            dockerCliAvailable: true,
            dockerDaemonReachable: false,
            windowsContainerCapabilityAvailable: false,
            windowsContainerHostMode: undefined,
            imageAvailable: false
          })
        )
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'docker-only-provider-unavailable'
    });
    expect(selection.notes.join('\n')).toContain('the Docker daemon was not reachable');
  });

  it('names the unconfirmed-engine reason for docker-only when the container mode is unknown', async () => {
    const selection = await locateComparisonRuntime(
      'win32',
      { executionMode: 'docker-only', labviewVersion: '2026', bitness: 'x64' },
      {
        queryWindowsContainerProviderFacts: vi.fn().mockResolvedValue(
          windowsContainerFacts({
            dockerCliAvailable: true,
            dockerDaemonReachable: true,
            windowsContainerCapabilityAvailable: false,
            windowsContainerHostMode: 'unknown',
            imageAvailable: false
          })
        )
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'docker-only-provider-unavailable'
    });
    expect(selection.notes.join('\n')).toContain('could not be confirmed');
  });
});

describe('acquireWindowsContainerImage stream progress gating (VHS-REQ-654)', () => {
  const image = 'nationalinstruments/labview:2026q1-windows';

  it('skips a progress emit while the pull snapshot has no computable percentage yet (VHS-REQ-654.2)', async () => {
    const updates: Array<{ message: string; increment?: number }> = [];
    const streamPull = vi.fn(async (options: { onProgress?: (snap: unknown) => void | Promise<void> }) => {
      // A percent-less snapshot (no download/overall percent) must not emit a toast.
      await options.onProgress?.({
        downloadedBytes: 0,
        totalBytes: 0,
        completedLayers: 0,
        totalLayers: 2
      });
      await options.onProgress?.({
        percent: 40,
        downloadedBytes: 1,
        totalBytes: 2,
        completedLayers: 1,
        totalLayers: 2
      });
      return { attempted: true, succeeded: true, statusLines: [] };
    });

    const result = await acquireWindowsContainerImage(image, 'win32', {
      streamPull: streamPull as never,
      reportProgress: (update) => {
        updates.push(update);
      }
    });

    expect(result.acquisitionState).toBe('acquired');
    // Only the second (percentaged) snapshot produced a pull toast before "ready".
    const pullUpdates = updates.filter((update) => update.message.includes('Pulling container image'));
    expect(pullUpdates).toHaveLength(1);
    expect(pullUpdates[0].message).toContain('40%');
  });
});
