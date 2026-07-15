import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  archiveComparisonReportSource,
  buildComparisonReportArchivePlanFromSelection
} from '../../src/dashboard/comparisonReportArchive';
import { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';

const tempRoots: string[] = [];

afterEach(async () => {
  for (const tempRoot of tempRoots.splice(0, tempRoots.length)) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

describe('comparisonReportArchive', () => {
  it('builds deterministic archive plans from pair selection', () => {
    const plan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: '/workspace/storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'src/My.vi',
      reportType: 'diff',
      selectedHash: 'selected-hash',
      baseHash: 'base-hash',
      reportFilename: 'custom-report.html',
      repoId: 'repo-id',
      fileId: 'file-id'
    });

    expect(plan.pairId).toMatch(/^[a-f0-9]{12}$/);
    expect(plan.archiveDirectory).toBe(
      path.posix.join('/workspace/storage', 'report-history', 'repo-id', 'file-id', 'pairs', plan.pairId)
    );
    expect(plan.reportFilePath).toBe(path.posix.join(plan.archiveDirectory, 'custom-report.html'));
    expect(plan.reportAssetsDirectoryName).toBe('custom-report_files');
    expect(plan.reportAssetsDirectoryPath).toBe(
      path.posix.join(plan.archiveDirectory, 'custom-report_files')
    );
  });

  it('content-addresses the pair-ID for working-tree snapshots (VHS-REQ-641.7)', () => {
    const base = {
      storageRoot: '/workspace/storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'src/My.vi',
      reportType: 'diff' as const,
      baseHash: 'base-hash',
      repoId: 'repo-id',
      fileId: 'file-id'
    };

    // Two distinct working-tree snapshots (different staged bytes) must produce
    // distinct retained pair-IDs instead of colliding on the bare WORKTREE token.
    const first = buildComparisonReportArchivePlanFromSelection({
      ...base,
      selectedHash: 'WORKTREE',
      worktreeSnapshotId: 'aaaa000000000000'
    });
    const second = buildComparisonReportArchivePlanFromSelection({
      ...base,
      selectedHash: 'WORKTREE',
      worktreeSnapshotId: 'bbbb111111111111'
    });
    expect(first.pairId).not.toBe(second.pairId);

    // Re-running the same snapshot content resolves to the SAME pair-ID (idempotent).
    const firstAgain = buildComparisonReportArchivePlanFromSelection({
      ...base,
      selectedHash: 'WORKTREE',
      worktreeSnapshotId: 'aaaa000000000000'
    });
    expect(firstAgain.pairId).toBe(first.pairId);

    // Without a snapshot id the bare-sentinel pair-ID is preserved (legacy shape).
    const legacy = buildComparisonReportArchivePlanFromSelection({
      ...base,
      selectedHash: 'WORKTREE'
    });
    const legacyExpected = buildComparisonReportArchivePlanFromSelection({
      ...base,
      selectedHash: 'WORKTREE',
      worktreeSnapshotId: ''
    });
    expect(legacy.pairId).toBe(legacyExpected.pairId);
    expect(legacy.pairId).not.toBe(first.pairId);

    // A committed selected hash ignores the snapshot id entirely.
    const committed = buildComparisonReportArchivePlanFromSelection({
      ...base,
      selectedHash: 'selected-hash'
    });
    const committedWithId = buildComparisonReportArchivePlanFromSelection({
      ...base,
      selectedHash: 'selected-hash',
      worktreeSnapshotId: 'aaaa000000000000'
    });
    expect(committed.pairId).toBe(committedWithId.pairId);
  });

  it('archives available source artifacts and writes source-record metadata (VHS-REQ-610.5)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-archive-test-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const sourceRoot = path.join(tempRoot, 'source');
    await fs.mkdir(sourceRoot, { recursive: true });

    const packetFilePath = path.join(sourceRoot, 'report-packet.html');
    const reportFilePath = path.join(sourceRoot, 'diff-report-My.vi.html');
    const metadataFilePath = path.join(sourceRoot, 'report-metadata.json');
    const runtimeStdoutFilePath = path.join(sourceRoot, 'runtime-stdout.txt');
    const runtimeStderrFilePath = path.join(sourceRoot, 'runtime-stderr.txt');
    const runtimeDiagnosticLogFilePath = path.join(sourceRoot, 'runtime-diagnostic-log.txt');
    const runtimeProcessObservationFilePath = path.join(
      sourceRoot,
      'runtime-process-observation.json'
    );

    await fs.writeFile(packetFilePath, '<html>packet</html>', 'utf8');
    await fs.writeFile(reportFilePath, '<html>report</html>', 'utf8');
    await fs.writeFile(runtimeStdoutFilePath, 'stdout', 'utf8');

    const record = {
      reportType: 'diff',
      selectedHash: 'selected-sha',
      baseHash: 'base-sha',
      artifactPlan: {
        allowedLocalRootPaths: [storageRoot],
        repoId: 'repo-id',
        fileId: 'file-id',
        normalizedRelativePath: 'src/My.vi',
        reportFilename: 'diff-report-My.vi.html',
        packetFilename: 'report-packet.html',
        packetFilePath,
        reportFilePath,
        metadataFilePath,
        runtimeStdoutFilePath,
        runtimeStderrFilePath,
        runtimeDiagnosticLogFilePath,
        runtimeProcessObservationFilePath
      }
    } as unknown as ComparisonReportPacketRecord;

    const archived = await archiveComparisonReportSource(record, {
      now: () => '2026-05-01T00:00:00.000Z',
      pathExists: async (targetPath) => {
        try {
          await fs.access(targetPath);
          return true;
        } catch {
          return false;
        }
      }
    });

    expect(archived.archivedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(await fs.readFile(archived.archivePlan.packetFilePath, 'utf8')).toBe('<html>packet</html>');
    expect(await fs.readFile(archived.archivePlan.reportFilePath, 'utf8')).toBe('<html>report</html>');
    expect(await fs.readFile(archived.archivePlan.runtimeStdoutFilePath, 'utf8')).toBe('stdout');

    await expect(fs.access(archived.archivePlan.metadataFilePath)).rejects.toThrow();
    await expect(fs.access(archived.archivePlan.runtimeStderrFilePath)).rejects.toThrow();

    const sourceRecord = JSON.parse(
      await fs.readFile(archived.archivePlan.sourceRecordFilePath, 'utf8')
    ) as {
      archivedAt: string;
      archivePlan: Record<string, unknown>;
      packetRecord: {
        reportType: string;
        selectedHash: string;
        baseHash: string;
        artifactPlan: Record<string, unknown>;
      };
    };
    expect(Object.keys(sourceRecord)).toEqual(['archivedAt', 'archivePlan', 'packetRecord']);
    expect(Object.keys(sourceRecord.archivePlan)).toEqual([
      'storageRoot',
      'repoId',
      'fileId',
      'pairId',
      'reportType',
      'archiveDirectory',
      'packetFilePath',
      'reportFilePath',
      'metadataFilePath',
      'sourceRecordFilePath',
      'runtimeStdoutFilePath',
      'runtimeStderrFilePath',
      'runtimeDiagnosticLogFilePath',
      'runtimeProcessObservationFilePath',
      'reportAssetsDirectoryName',
      'reportAssetsDirectoryPath'
    ]);
    expect(Object.keys(sourceRecord.packetRecord)).toEqual([
      'reportType',
      'selectedHash',
      'baseHash',
      'artifactPlan'
    ]);
    expect(Object.keys(sourceRecord.packetRecord.artifactPlan)).toEqual([
      'allowedLocalRootPaths',
      'repoId',
      'fileId',
      'normalizedRelativePath',
      'reportFilename',
      'packetFilename',
      'packetFilePath',
      'reportFilePath',
      'metadataFilePath',
      'runtimeStdoutFilePath',
      'runtimeStderrFilePath',
      'runtimeDiagnosticLogFilePath',
      'runtimeProcessObservationFilePath'
    ]);
    expect(sourceRecord.archivedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(sourceRecord.packetRecord).toMatchObject({
      reportType: 'diff',
      selectedHash: 'selected-sha',
      baseHash: 'base-sha'
    });
  });

  it('appends to the working-tree snapshot index and garbage-collects evicted archives (VHS-REQ-641.7)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-archive-wt-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const sourceRoot = path.join(tempRoot, 'source');
    await fs.mkdir(sourceRoot, { recursive: true });
    const packetFilePath = path.join(sourceRoot, 'report-packet.html');
    const reportFilePath = path.join(sourceRoot, 'diff-report-My.vi.html');
    await fs.writeFile(packetFilePath, '<html>packet</html>', 'utf8');
    await fs.writeFile(reportFilePath, '<html>report</html>', 'utf8');

    const pathExists = async (targetPath: string): Promise<boolean> => {
      try {
        await fs.access(targetPath);
        return true;
      } catch {
        return false;
      }
    };

    function worktreeRecord(snapshotId: string): ComparisonReportPacketRecord {
      return {
        reportType: 'diff',
        selectedHash: 'WORKTREE',
        baseHash: 'base-sha',
        runtimeExecution: {
          state: 'succeeded',
          attempted: true,
          reportExists: true,
          worktreeSnapshotId: snapshotId
        },
        artifactPlan: {
          allowedLocalRootPaths: [storageRoot],
          repoId: 'repo-id',
          fileId: 'file-id',
          normalizedRelativePath: 'src/My.vi',
          reportFilename: 'diff-report-My.vi.html',
          packetFilename: 'report-packet.html',
          packetFilePath,
          reportFilePath,
          metadataFilePath: path.join(sourceRoot, 'report-metadata.json'),
          runtimeStdoutFilePath: path.join(sourceRoot, 'runtime-stdout.txt'),
          runtimeStderrFilePath: path.join(sourceRoot, 'runtime-stderr.txt'),
          runtimeDiagnosticLogFilePath: path.join(sourceRoot, 'runtime-diagnostic-log.txt'),
          runtimeProcessObservationFilePath: path.join(sourceRoot, 'runtime-process-observation.json')
        }
      } as unknown as ComparisonReportPacketRecord;
    }

    const indexFilePath = path.join(
      storageRoot,
      'report-history',
      'repo-id',
      'file-id',
      'worktree-snapshots.json'
    );

    // Retain three distinct snapshots with a keep-last-2 limit.
    const archivedA = await archiveComparisonReportSource(worktreeRecord('aaaa000000000000'), {
      now: () => '2026-05-01T00:00:00.000Z',
      pathExists,
      worktreeSnapshotRetentionLimit: 2
    });
    await archiveComparisonReportSource(worktreeRecord('bbbb111111111111'), {
      now: () => '2026-05-01T01:00:00.000Z',
      pathExists,
      worktreeSnapshotRetentionLimit: 2
    });
    await archiveComparisonReportSource(worktreeRecord('cccc222222222222'), {
      now: () => '2026-05-01T02:00:00.000Z',
      pathExists,
      worktreeSnapshotRetentionLimit: 2
    });

    const index = JSON.parse(await fs.readFile(indexFilePath, 'utf8')) as {
      snapshots: { snapshotId: string }[];
    };
    // Newest two retained, oldest evicted.
    expect(index.snapshots.map((snapshot) => snapshot.snapshotId)).toEqual([
      'cccc222222222222',
      'bbbb111111111111'
    ]);
    // The evicted snapshot's archive directory was garbage-collected.
    await expect(fs.access(archivedA.archivePlan.archiveDirectory)).rejects.toThrow();
  });

  it('does not write a snapshot index for a committed comparison (VHS-REQ-641.7)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-archive-committed-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const sourceRoot = path.join(tempRoot, 'source');
    await fs.mkdir(sourceRoot, { recursive: true });
    const packetFilePath = path.join(sourceRoot, 'report-packet.html');
    await fs.writeFile(packetFilePath, '<html>packet</html>', 'utf8');

    const record = {
      reportType: 'diff',
      selectedHash: 'selected-sha',
      baseHash: 'base-sha',
      runtimeExecution: { state: 'succeeded', attempted: true, reportExists: true },
      artifactPlan: {
        allowedLocalRootPaths: [storageRoot],
        repoId: 'repo-id',
        fileId: 'file-id',
        normalizedRelativePath: 'src/My.vi',
        reportFilename: 'diff-report-My.vi.html',
        packetFilename: 'report-packet.html',
        packetFilePath,
        reportFilePath: path.join(sourceRoot, 'diff-report-My.vi.html'),
        metadataFilePath: path.join(sourceRoot, 'report-metadata.json'),
        runtimeStdoutFilePath: path.join(sourceRoot, 'runtime-stdout.txt'),
        runtimeStderrFilePath: path.join(sourceRoot, 'runtime-stderr.txt'),
        runtimeDiagnosticLogFilePath: path.join(sourceRoot, 'runtime-diagnostic-log.txt'),
        runtimeProcessObservationFilePath: path.join(sourceRoot, 'runtime-process-observation.json')
      }
    } as unknown as ComparisonReportPacketRecord;

    await archiveComparisonReportSource(record, {
      now: () => '2026-05-01T00:00:00.000Z',
      pathExists: async (targetPath) => {
        try {
          await fs.access(targetPath);
          return true;
        } catch {
          return false;
        }
      }
    });

    const indexFilePath = path.join(
      storageRoot,
      'report-history',
      'repo-id',
      'file-id',
      'worktree-snapshots.json'
    );
    await expect(fs.access(indexFilePath)).rejects.toThrow();
  });

  it('archives single-file reports without creating a sibling assets directory (VHS-REQ-640)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-archive-sf-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const sourceRoot = path.join(tempRoot, 'source');
    await fs.mkdir(sourceRoot, { recursive: true });

    const packetFilePath = path.join(sourceRoot, 'report-packet.html');
    const reportFilePath = path.join(sourceRoot, 'diff-report-My.vi.html');
    // A single-file HTMLSingleFile report embeds images as data URIs and has no
    // sibling `<report>_files` directory to copy.
    await fs.writeFile(packetFilePath, '<html>packet</html>', 'utf8');
    await fs.writeFile(
      reportFilePath,
      '<html><img src="data:image/png;base64,AAAA"/></html>',
      'utf8'
    );

    const record = {
      reportType: 'diff',
      selectedHash: 'selected-sha',
      baseHash: 'base-sha',
      artifactPlan: {
        allowedLocalRootPaths: [storageRoot],
        repoId: 'repo-id',
        fileId: 'file-id',
        normalizedRelativePath: 'src/My.vi',
        reportFilename: 'diff-report-My.vi.html',
        packetFilename: 'report-packet.html',
        packetFilePath,
        reportFilePath,
        metadataFilePath: path.join(sourceRoot, 'report-metadata.json'),
        runtimeStdoutFilePath: path.join(sourceRoot, 'runtime-stdout.txt'),
        runtimeStderrFilePath: path.join(sourceRoot, 'runtime-stderr.txt'),
        runtimeDiagnosticLogFilePath: path.join(sourceRoot, 'runtime-diagnostic-log.txt'),
        runtimeProcessObservationFilePath: path.join(sourceRoot, 'runtime-process-observation.json')
      }
    } as unknown as ComparisonReportPacketRecord;

    const archived = await archiveComparisonReportSource(record, {
      now: () => '2026-05-01T00:00:00.000Z',
      pathExists: async (targetPath) => {
        try {
          await fs.access(targetPath);
          return true;
        } catch {
          return false;
        }
      }
    });

    // The single-file report HTML is archived...
    expect(await fs.readFile(archived.archivePlan.reportFilePath, 'utf8')).toContain('data:image/png');
    // ...but no sibling `_files` assets directory is created, because the
    // single-file report has none to copy.
    await expect(fs.access(archived.archivePlan.reportAssetsDirectoryPath)).rejects.toThrow();
  });
});
