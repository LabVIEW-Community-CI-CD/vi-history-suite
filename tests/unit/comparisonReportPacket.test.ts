import { afterEach, describe, expect, it, vi } from 'vitest';

import { persistComparisonReportPacket } from '../../src/reporting/comparisonReportPacket';

describe('comparisonReportPacket', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists a blocked-preflight report packet with metadata, staging plan, and truthful HTML status', async () => {
    const writes = new Map<string, string>();
    const mkdir = vi.fn().mockResolvedValue(undefined);

    const result = await persistComparisonReportPacket(
      {
        storageRoot: '/workspace/.storage',
        repositoryRoot: '/workspace/repo',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        reportType: 'diff',
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        preflight: {
          normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          ready: false,
          blockedReason: 'right-blob-not-vi',
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            isVi: false,
            blockedReason: 'blob-not-vi'
          }
        },
        runtimeSelection: {
          platform: 'win32',
          preferBitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          labviewExe: {
            kind: 'labview-exe',
            path: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            source: 'configured',
            exists: true,
            bitness: 'x86'
          },
          labviewCli: {
            kind: 'labview-cli',
            path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
            source: 'scan',
            exists: true,
            bitness: 'x64'
          },
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }
      },
      {
        now: () => '2026-04-02T00:00:00.000Z',
        mkdir,
        writeFile: vi.fn(async (filePath: string, contents: string) => {
          writes.set(filePath, contents);
        }) as never
      }
    );

    expect(mkdir).toHaveBeenCalledWith(result.record.artifactPlan.reportDirectory, {
      recursive: true
    });
    expect(mkdir).toHaveBeenCalledWith(result.record.artifactPlan.stagingDirectory, {
      recursive: true
    });
    expect(result.record.reportStatus).toBe('blocked-preflight');
    expect(result.record.runtimeExecutionState).toBe('not-run');
    expect(result.record.stagedRevisionPlan.leftFilename).toBe(
      'left-111111112222-VIP_Pre-Install Custom Action.vi'
    );
    expect(result.record.stagedRevisionPlan.rightFilename).toBe(
      'right-abcdef123456-VIP_Pre-Install Custom Action.vi'
    );
    expect(writes.get(result.metadataFilePath)).toContain('"reportStatus": "blocked-preflight"');
    expect(writes.get(result.reportFilePath)).toContain('No NI-generated comparison report has been executed yet.');
    expect(writes.get(result.reportFilePath)).toContain('right-blob-not-vi');
    expect(writes.get(result.reportFilePath)).toContain('data-testid="comparison-report-runtime-selection"');
  });

  it('persists a ready-for-runtime report packet when preflight clears both revision blobs', async () => {
    const writes = new Map<string, string>();

    const result = await persistComparisonReportPacket(
      {
        storageRoot: '/workspace/.storage',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        reportType: 'diff',
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        preflight: {
          normalizedRelativePath: 'foo.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:foo.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:foo.vi',
            signature: 'LVCC',
            isVi: true
          }
        },
        runtimeSelection: {
          platform: 'win32',
          preferBitness: 'x64',
          provider: 'host-native',
          engine: 'labview-cli',
          labviewExe: {
            kind: 'labview-exe',
            path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
            source: 'scan',
            exists: true,
            bitness: 'x64'
          },
          labviewCli: {
            kind: 'labview-cli',
            path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
            source: 'scan',
            exists: true,
            bitness: 'x64'
          },
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }
      },
      {
        now: () => '2026-04-03T00:00:00.000Z',
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn(async (filePath: string, contents: string) => {
          writes.set(filePath, contents);
        }) as never
      }
    );

    expect(result.record.reportStatus).toBe('ready-for-runtime');
    expect(writes.get(result.metadataFilePath)).toContain('"reportStatus": "ready-for-runtime"');
    expect(writes.get(result.reportFilePath)).toContain('Ready for runtime:</strong> yes');
  });

  it('persists a blocked-runtime packet when preflight clears but no runtime provider is available', async () => {
    const writes = new Map<string, string>();

    const result = await persistComparisonReportPacket(
      {
        storageRoot: '/workspace/.storage',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        reportType: 'diff',
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        preflight: {
          normalizedRelativePath: 'foo.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:foo.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:foo.vi',
            signature: 'LVCC',
            isVi: true
          }
        },
        runtimeSelection: {
          platform: 'linux',
          preferBitness: 'auto',
          provider: 'unavailable',
          blockedReason: 'comparison-tool-not-found',
          notes: ['Linux report generation remains best-effort.'],
          registryQueryPlans: [],
          candidates: []
        }
      },
      {
        now: () => '2026-04-03T00:00:00.000Z',
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn(async (filePath: string, contents: string) => {
          writes.set(filePath, contents);
        }) as never
      }
    );

    expect(result.record.reportStatus).toBe('blocked-runtime');
    expect(result.record.runtimeExecutionState).toBe('not-available');
    expect(writes.get(result.metadataFilePath)).toContain('"reportStatus": "blocked-runtime"');
    expect(writes.get(result.reportFilePath)).toContain('comparison-tool-not-found');
    expect(writes.get(result.reportFilePath)).toContain('Provider:</strong> unavailable');
    expect(writes.get(result.reportFilePath)).toContain('Runtime execution:</strong> not-available');
  });

  it('uses the default clock when no explicit timestamp provider is injected', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T05:06:07.000Z'));

    const result = await persistComparisonReportPacket(
      {
        storageRoot: '/workspace/.storage',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        reportType: 'diff',
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        preflight: {
          normalizedRelativePath: 'foo.vi',
          ready: true,
          left: {
            revisionId: '1111111122222222',
            blobSpecifier: '1111111122222222:foo.vi',
            signature: 'LVIN',
            isVi: true
          },
          right: {
            revisionId: 'abcdef1234567890',
            blobSpecifier: 'abcdef1234567890:foo.vi',
            signature: 'LVCC',
            isVi: true
          }
        },
        runtimeSelection: {
          platform: 'linux',
          preferBitness: 'auto',
          provider: 'host-native',
          engine: 'lvcompare',
          lvCompare: {
            kind: 'lvcompare',
            path: '/usr/local/bin/LVCompare',
            source: 'scan',
            exists: true
          },
          notes: [],
          registryQueryPlans: [],
          candidates: []
        }
      },
      {
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never
      }
    );

    expect(result.record.generatedAt).toBe('2026-04-04T05:06:07.000Z');
  });
});
