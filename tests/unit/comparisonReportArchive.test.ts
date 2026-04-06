import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  archiveComparisonReportSource,
  buildComparisonReportArchivePlan,
  buildComparisonReportArchivePlanFromSelection
} from '../../src/dashboard/comparisonReportArchive';
import { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';

describe('archiveComparisonReportSource', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  });

  it('copies packet, metadata, report assets, and writes a pair-scoped source record', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-archive-'));
    tempRoots.push(tempRoot);
    const currentReportDirectory = path.join(tempRoot, 'reports', 'repoid123456', 'fileid123456');
    await fs.mkdir(path.join(currentReportDirectory, 'diff-report-foo.vi_files'), {
      recursive: true
    });
    await fs.writeFile(path.join(currentReportDirectory, 'report-packet.html'), '<html>packet</html>');
    await fs.writeFile(
      path.join(currentReportDirectory, 'report-metadata.json'),
      '{"status":"ok"}'
    );
    await fs.writeFile(path.join(currentReportDirectory, 'diff-report-foo.vi.html'), '<html>report</html>');
    await fs.writeFile(path.join(currentReportDirectory, 'runtime-stdout.txt'), 'stdout');
    await fs.writeFile(path.join(currentReportDirectory, 'runtime-stderr.txt'), 'stderr');
    await fs.writeFile(path.join(currentReportDirectory, 'runtime-diagnostic-log.txt'), 'diag');
    await fs.writeFile(
      path.join(currentReportDirectory, 'runtime-process-observation.json'),
      '{"observed":[]}'
    );
    await fs.writeFile(
      path.join(currentReportDirectory, 'diff-report-foo.vi_files', 'fp_1.png'),
      'png'
    );

    const record: ComparisonReportPacketRecord = {
      generatedAt: '2026-04-03T00:00:00.000Z',
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
        reportDirectory: currentReportDirectory,
        stagingDirectory: path.join(currentReportDirectory, 'staging'),
        reportFilename: 'diff-report-foo.vi.html',
        reportFilePath: path.join(currentReportDirectory, 'diff-report-foo.vi.html'),
        packetFilename: 'report-packet.html',
        packetFilePath: path.join(currentReportDirectory, 'report-packet.html'),
        metadataFilePath: path.join(currentReportDirectory, 'report-metadata.json'),
        runtimeStdoutFilePath: path.join(currentReportDirectory, 'runtime-stdout.txt'),
        runtimeStderrFilePath: path.join(currentReportDirectory, 'runtime-stderr.txt'),
        runtimeDiagnosticLogFilePath: path.join(currentReportDirectory, 'runtime-diagnostic-log.txt'),
        runtimeProcessObservationFilePath: path.join(
          currentReportDirectory,
          'runtime-process-observation.json'
        ),
        allowedLocalRootPaths: [tempRoot]
      },
      stagedRevisionPlan: {
        leftFilename: 'left.vi',
        leftFilePath: path.join(currentReportDirectory, 'staging', 'left.vi'),
        rightFilename: 'right.vi',
        rightFilePath: path.join(currentReportDirectory, 'staging', 'right.vi')
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
          signature: 'LVIN',
          isVi: true
        }
      },
      runtimeSelection: {
        provider: 'host-native',
        platform: 'win32',
        bitness: 'x86',
        engine: 'labview-cli',
        notes: []
      },
      runtimeExecutionState: 'succeeded',
      runtimeExecution: {
        state: 'succeeded',
        attempted: true,
        reportExists: true
      }
    };

    const archived = await archiveComparisonReportSource(record, {
      now: () => '2026-04-03T01:02:03.000Z'
    });
    const archivePlan = buildComparisonReportArchivePlan(record);

    expect(archived.archivedAt).toBe('2026-04-03T01:02:03.000Z');
    await expect(fs.readFile(archivePlan.packetFilePath, 'utf8')).resolves.toContain('packet');
    await expect(fs.readFile(archivePlan.reportFilePath, 'utf8')).resolves.toContain('report');
    await expect(fs.readFile(archivePlan.metadataFilePath, 'utf8')).resolves.toContain('status');
    await expect(fs.readFile(archivePlan.runtimeStdoutFilePath, 'utf8')).resolves.toBe('stdout');
    await expect(
      fs.readFile(path.join(archivePlan.reportAssetsDirectoryPath, 'fp_1.png'), 'utf8')
    ).resolves.toBe('png');
    const sourceRecord = JSON.parse(
      await fs.readFile(archivePlan.sourceRecordFilePath, 'utf8')
    ) as { packetRecord: { selectedHash: string }; archivePlan: { pairId: string } };
    expect(sourceRecord.packetRecord.selectedHash).toBe('abcdef1234567890');
    expect(sourceRecord.archivePlan.pairId).toBe(archivePlan.pairId);
  });

  it('uses a governed default timestamp when no archive clock override is provided', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-archive-'));
    tempRoots.push(tempRoot);
    const currentReportDirectory = path.join(tempRoot, 'reports', 'repoid123456', 'fileid123456');
    await fs.mkdir(currentReportDirectory, { recursive: true });
    await fs.writeFile(path.join(currentReportDirectory, 'report-packet.html'), '<html>packet</html>');
    await fs.writeFile(
      path.join(currentReportDirectory, 'report-metadata.json'),
      '{"status":"ok"}'
    );
    await fs.writeFile(path.join(currentReportDirectory, 'diff-report-foo.vi.html'), '<html>report</html>');
    await fs.writeFile(path.join(currentReportDirectory, 'runtime-stdout.txt'), 'stdout');
    await fs.writeFile(path.join(currentReportDirectory, 'runtime-stderr.txt'), 'stderr');
    await fs.writeFile(path.join(currentReportDirectory, 'runtime-diagnostic-log.txt'), 'diag');
    await fs.writeFile(
      path.join(currentReportDirectory, 'runtime-process-observation.json'),
      '{"observed":[]}'
    );

    const record: ComparisonReportPacketRecord = {
      generatedAt: '2026-04-03T00:00:00.000Z',
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
        reportDirectory: currentReportDirectory,
        stagingDirectory: path.join(currentReportDirectory, 'staging'),
        reportFilename: 'diff-report-foo.vi.html',
        reportFilePath: path.join(currentReportDirectory, 'diff-report-foo.vi.html'),
        packetFilename: 'report-packet.html',
        packetFilePath: path.join(currentReportDirectory, 'report-packet.html'),
        metadataFilePath: path.join(currentReportDirectory, 'report-metadata.json'),
        runtimeStdoutFilePath: path.join(currentReportDirectory, 'runtime-stdout.txt'),
        runtimeStderrFilePath: path.join(currentReportDirectory, 'runtime-stderr.txt'),
        runtimeDiagnosticLogFilePath: path.join(currentReportDirectory, 'runtime-diagnostic-log.txt'),
        runtimeProcessObservationFilePath: path.join(
          currentReportDirectory,
          'runtime-process-observation.json'
        ),
        allowedLocalRootPaths: [tempRoot]
      },
      stagedRevisionPlan: {
        leftFilename: 'left.vi',
        leftFilePath: path.join(currentReportDirectory, 'staging', 'left.vi'),
        rightFilename: 'right.vi',
        rightFilePath: path.join(currentReportDirectory, 'staging', 'right.vi')
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
          signature: 'LVIN',
          isVi: true
        }
      },
      runtimeSelection: {
        provider: 'host-native',
        platform: 'win32',
        bitness: 'x86',
        engine: 'labview-cli',
        notes: []
      },
      runtimeExecutionState: 'succeeded',
      runtimeExecution: {
        state: 'succeeded',
        attempted: true,
        reportExists: true
      }
    };

    const archived = await archiveComparisonReportSource(record);

    expect(Date.parse(archived.archivedAt)).not.toBeNaN();
    expect(archived.archivedAt).toContain('T');
    expect(archived.archivedAt).toContain('Z');
  });

  it('fails closed when the retained archive storage root is blank', () => {
    expect(() =>
      buildComparisonReportArchivePlan({
        generatedAt: '2026-04-03T00:00:00.000Z',
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
          runtimeStdoutFilePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
          runtimeStderrFilePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt',
          runtimeDiagnosticLogFilePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/runtime-diagnostic-log.txt',
          runtimeProcessObservationFilePath:
            '/workspace/.storage/reports/repoid123456/fileid123456/runtime-process-observation.json',
          allowedLocalRootPaths: ['   ']
        },
        stagedRevisionPlan: {
          leftFilename: 'left.vi',
          leftFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/staging/left.vi',
          rightFilename: 'right.vi',
          rightFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/staging/right.vi'
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
            signature: 'LVIN',
            isVi: true
          }
        },
        runtimeSelection: {
          provider: 'host-native',
          platform: 'win32',
          bitness: 'x86',
          engine: 'labview-cli',
          notes: []
        },
        runtimeExecutionState: 'succeeded',
        runtimeExecution: {
          state: 'succeeded',
          attempted: true,
          reportExists: true
        }
      })
    ).toThrowError('storageRoot must be non-empty');
  });

  it('defaults runtime diagnostic and process-observation archive filenames from the governed artifact plan', () => {
    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: '/workspace/.storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'folder/foo.vi',
      reportType: 'diff',
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222'
    });

    expect(path.basename(archivePlan.runtimeDiagnosticLogFilePath)).toBe('runtime-diagnostic-log.txt');
    expect(path.basename(archivePlan.runtimeProcessObservationFilePath)).toBe(
      'runtime-process-observation.json'
    );
  });

  it('skips copying missing runtime artifacts while still writing the pair-scoped source record', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-archive-'));
    tempRoots.push(tempRoot);
    const currentReportDirectory = path.join(tempRoot, 'reports', 'repoid123456', 'fileid123456');
    await fs.mkdir(currentReportDirectory, { recursive: true });
    await fs.writeFile(path.join(currentReportDirectory, 'report-packet.html'), '<html>packet</html>');
    await fs.writeFile(
      path.join(currentReportDirectory, 'report-metadata.json'),
      '{"status":"ok"}'
    );
    await fs.writeFile(path.join(currentReportDirectory, 'diff-report-foo.vi.html'), '<html>report</html>');

    const record: ComparisonReportPacketRecord = {
      generatedAt: '2026-04-03T00:00:00.000Z',
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
        reportDirectory: currentReportDirectory,
        stagingDirectory: path.join(currentReportDirectory, 'staging'),
        reportFilename: 'diff-report-foo.vi.html',
        reportFilePath: path.join(currentReportDirectory, 'diff-report-foo.vi.html'),
        packetFilename: 'report-packet.html',
        packetFilePath: path.join(currentReportDirectory, 'report-packet.html'),
        metadataFilePath: path.join(currentReportDirectory, 'report-metadata.json'),
        runtimeStdoutFilePath: path.join(currentReportDirectory, 'runtime-stdout.txt'),
        runtimeStderrFilePath: path.join(currentReportDirectory, 'runtime-stderr.txt'),
        runtimeDiagnosticLogFilePath: path.join(currentReportDirectory, 'runtime-diagnostic-log.txt'),
        runtimeProcessObservationFilePath: path.join(
          currentReportDirectory,
          'runtime-process-observation.json'
        ),
        allowedLocalRootPaths: [tempRoot]
      },
      stagedRevisionPlan: {
        leftFilename: 'left.vi',
        leftFilePath: path.join(currentReportDirectory, 'staging', 'left.vi'),
        rightFilename: 'right.vi',
        rightFilePath: path.join(currentReportDirectory, 'staging', 'right.vi')
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
          signature: 'LVIN',
          isVi: true
        }
      },
      runtimeSelection: {
        provider: 'host-native',
        platform: 'win32',
        bitness: 'x86',
        engine: 'labview-cli',
        notes: []
      },
      runtimeExecutionState: 'failed',
      runtimeExecution: {
        state: 'failed',
        attempted: true,
        reportExists: false
      }
    };

    const archived = await archiveComparisonReportSource(record, {
      now: () => '2026-04-03T01:02:03.000Z'
    });

    await expect(fs.readFile(archived.archivePlan.packetFilePath, 'utf8')).resolves.toContain('packet');
    await expect(fs.readFile(archived.archivePlan.sourceRecordFilePath, 'utf8')).resolves.toContain(
      '"archivedAt": "2026-04-03T01:02:03.000Z"'
    );
    await expect(fs.access(archived.archivePlan.runtimeDiagnosticLogFilePath)).rejects.toThrow();
    await expect(
      fs.access(archived.archivePlan.runtimeProcessObservationFilePath)
    ).rejects.toThrow();
  });
});
