import { describe, expect, it, vi } from 'vitest';

import {
  locateComparisonRuntime,
  WindowsContainerProviderFacts
} from '../../src/reporting/comparisonRuntimeLocator';

const WINDOWS_LABVIEW_2026_X64 =
  'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_LABVIEW_2026_X86 =
  'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_LABVIEW_CLI_X64 =
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

describe('comparisonRuntimeLocator diagnostics', () => {
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

  it('reports a matching LabVIEWCLI bitness miss after resolving LabVIEW', async () => {
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
        queryWindowsRegistry: vi.fn().mockResolvedValue('')
      }
    );

    expect(selection).toMatchObject({
      provider: 'unavailable',
      blockedReason: 'labview-cli-not-found-for-bitness',
      requestedLabviewVersion: '2026',
      bitness: 'x64'
    });
    expect(selection.labviewExe?.path).toBeUndefined();
    expect(selection.notes.join('\n')).toContain('No matching LabVIEWCLI x64');
    expect(selection.notes.join('\n')).toContain('Detected installed LabVIEWCLI x86');
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
        pathExists: pathExistsFor([WINDOWS_LABVIEW_2026_X64, WINDOWS_LABVIEW_CLI_X64]),
        queryWindowsRegistry: vi.fn().mockResolvedValue(''),
        readFile: vi.fn().mockRejectedValue(new Error('no ini')) as never
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
