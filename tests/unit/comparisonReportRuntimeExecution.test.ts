import { describe, expect, it, vi } from 'vitest';

import { executeComparisonReport } from '../../src/reporting/comparisonReportRuntimeExecution';
import { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';

function createReadyRecord(): ComparisonReportPacketRecord {
  return {
    generatedAt: '2026-04-02T00:00:00.000Z',
    reportTitle: 'VI Comparison Report: foo.vi',
    reportStatus: 'ready-for-runtime',
    reportType: 'diff',
    selectedHash: 'abcdef1234567890',
    baseHash: '1111111122222222',
    artifactPlan: {
      repoId: 'repoid123456',
      fileId: 'fileid123456',
      reportType: 'diff',
      fullFilename: 'foo.vi',
      normalizedRelativePath: 'foo.vi',
      reportDirectory: '/workspace/.storage/reports/repoid123456/fileid123456',
      stagingDirectory: '/workspace/.storage/reports/repoid123456/fileid123456/staging',
      reportFilename: 'diff-report-foo.vi.html',
      reportFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/diff-report-foo.vi.html',
      packetFilename: 'report-packet.html',
      packetFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-packet.html',
      metadataFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/report-metadata.json',
      runtimeStdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
      runtimeStderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt',
      runtimeDiagnosticLogFilePath:
        '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt',
      runtimeProcessObservationFilePath:
        '/workspace/.storage/reports/repoid123456/fileid123456/runtime-process-observation.json',
      allowedLocalRootPaths: [
        '/workspace/.storage',
        '/workspace/.storage/reports/repoid123456'
      ]
    },
    stagedRevisionPlan: {
      leftFilename: 'left-111111112222-foo.vi',
      leftFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/staging/left-111111112222-foo.vi',
      rightFilename: 'right-abcdef123456-foo.vi',
      rightFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/staging/right-abcdef123456-foo.vi'
    },
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
      bitness: 'x86',
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
        source: 'configured',
        exists: true,
        bitness: 'x64'
      },
      notes: [],
      registryQueryPlans: [],
      candidates: []
    },
    runtimeExecutionState: 'not-run',
    runtimeExecution: {
      state: 'not-run',
      attempted: false,
      reportExists: false,
      stdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
      stderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt'
    }
  };
}

describe('comparisonReportRuntimeExecution', () => {
  it('stages each revision from its resolved historical relative path when the VI moved', async () => {
    const readRevisionBlob = vi
      .fn()
      .mockResolvedValueOnce(Buffer.from('left'))
      .mockResolvedValueOnce(Buffer.from('right'));
    const record = createReadyRecord();
    record.preflight.left.resolvedRelativePath = 'Examples/foo.vi';
    record.preflight.left.blobSpecifier = '1111111122222222:Examples/foo.vi';
    record.preflight.right.resolvedRelativePath = 'Source/Examples/foo.vi';
    record.preflight.right.blobSpecifier = 'abcdef1234567890:Source/Examples/foo.vi';
    record.preflight.normalizedRelativePath = 'Source/Examples/foo.vi';
    record.artifactPlan.normalizedRelativePath = 'Source/Examples/foo.vi';

    await executeComparisonReport(
      {
        record,
        repositoryRoot: '/workspace/repo'
      },
      {
        readRevisionBlob,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined) as never,
        pathExists: vi.fn().mockResolvedValue(true),
        runCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'command stdout',
          stderr: ''
        }),
        nowIso: vi.fn().mockReturnValueOnce('2026-04-02T01:00:00.000Z').mockReturnValueOnce('2026-04-02T01:00:03.000Z'),
        nowMs: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(4000),
        writePacketRecord: vi.fn().mockResolvedValue(undefined),
        processPlatform: 'win32'
      }
    );

    expect(readRevisionBlob).toHaveBeenNthCalledWith(
      1,
      '/workspace/repo',
      '1111111122222222',
      'Examples/foo.vi'
    );
    expect(readRevisionBlob).toHaveBeenNthCalledWith(
      2,
      '/workspace/repo',
      'abcdef1234567890',
      'Source/Examples/foo.vi'
    );
  });
});
