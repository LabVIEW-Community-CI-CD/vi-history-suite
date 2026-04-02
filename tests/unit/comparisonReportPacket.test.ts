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
