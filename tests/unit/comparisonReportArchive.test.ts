import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  archiveComparisonReportSource,
  buildComparisonReportArchivePlan,
  buildComparisonReportArchivePlanFromSelection,
  buildReportAssetsDirectoryName,
  buildWorktreeSnapshotIndexFilePath,
  readArchivedComparisonReportSourceRecordFromSelection
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

  it('maps report filenames to their assets directory name (VHS-REQ-610.5)', () => {
    expect(buildReportAssetsDirectoryName('diff-report-My.vi.html')).toBe('diff-report-My.vi_files');
    // The trailing .html match is case-insensitive.
    expect(buildReportAssetsDirectoryName('REPORT.HTML')).toBe('REPORT_files');
    // A non-.html name is not stripped; _files is appended verbatim.
    expect(buildReportAssetsDirectoryName('report.txt')).toBe('report.txt_files');
  });

  it('builds a record-based archive plan content-addressed by the worktree snapshot id (VHS-REQ-641.7)', () => {
    const baseArtifactPlan = {
      allowedLocalRootPaths: ['/workspace/storage'],
      repoId: 'repo-id',
      fileId: 'file-id',
      normalizedRelativePath: 'src/My.vi',
      reportFilename: 'diff-report-My.vi.html',
      packetFilename: 'report-packet.html',
      metadataFilePath: '/source/report-metadata.json',
      runtimeStdoutFilePath: '/source/runtime-stdout.txt',
      runtimeStderrFilePath: '/source/runtime-stderr.txt',
      runtimeDiagnosticLogFilePath: '/source/runtime-diagnostic-log.txt',
      runtimeProcessObservationFilePath: '/source/runtime-process-observation.json'
    };
    const worktreeRecord = {
      reportType: 'diff',
      selectedHash: 'WORKTREE',
      baseHash: 'base-sha',
      runtimeExecution: { worktreeSnapshotId: 'aaaa000000000000' },
      artifactPlan: baseArtifactPlan
    } as unknown as ComparisonReportPacketRecord;

    const plan = buildComparisonReportArchivePlan(worktreeRecord);
    expect(plan.repoId).toBe('repo-id');
    expect(plan.fileId).toBe('file-id');
    expect(plan.pairId).toMatch(/^[a-f0-9]{12}$/);
    expect(plan.archiveDirectory).toBe(
      path.posix.join('/workspace/storage', 'report-history', 'repo-id', 'file-id', 'pairs', plan.pairId)
    );

    // The same snapshot content resolves to the same pair (idempotent); a
    // different snapshot id yields a distinct pair.
    expect(buildComparisonReportArchivePlan(worktreeRecord).pairId).toBe(plan.pairId);
    const otherSnapshot = buildComparisonReportArchivePlan({
      ...worktreeRecord,
      runtimeExecution: { worktreeSnapshotId: 'bbbb111111111111' }
    } as unknown as ComparisonReportPacketRecord);
    expect(otherSnapshot.pairId).not.toBe(plan.pairId);
  });

  it('throws when a record carries no storage root (VHS-REQ-610.5)', () => {
    const record = {
      reportType: 'diff',
      selectedHash: 'selected-sha',
      baseHash: 'base-sha',
      artifactPlan: {
        allowedLocalRootPaths: [],
        repoId: 'repo-id',
        fileId: 'file-id',
        normalizedRelativePath: 'src/My.vi',
        reportFilename: 'diff-report-My.vi.html',
        packetFilename: 'report-packet.html',
        metadataFilePath: '/source/report-metadata.json',
        runtimeStdoutFilePath: '/source/runtime-stdout.txt',
        runtimeStderrFilePath: '/source/runtime-stderr.txt',
        runtimeDiagnosticLogFilePath: '/source/runtime-diagnostic-log.txt',
        runtimeProcessObservationFilePath: '/source/runtime-process-observation.json'
      }
    } as unknown as ComparisonReportPacketRecord;
    expect(() => buildComparisonReportArchivePlan(record)).toThrow(/storageRoot must be non-empty/);
  });

  it('locates the worktree snapshot index for POSIX and Windows-style storage roots (VHS-REQ-641.7)', () => {
    const posixPlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: '/workspace/storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'src/My.vi',
      reportType: 'diff',
      selectedHash: 'WORKTREE',
      baseHash: 'base-hash',
      repoId: 'repo-id',
      fileId: 'file-id'
    });
    expect(buildWorktreeSnapshotIndexFilePath(posixPlan)).toBe(
      path.posix.join(
        '/workspace/storage',
        'report-history',
        'repo-id',
        'file-id',
        'worktree-snapshots.json'
      )
    );

    // A non-POSIX (Windows-style) root takes the platform path.join branch.
    const windowsPlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: 'C:\\workspace\\storage',
      repositoryRoot: 'C:\\workspace\\repo',
      relativePath: 'src/My.vi',
      reportType: 'diff',
      selectedHash: 'WORKTREE',
      baseHash: 'base-hash',
      repoId: 'repo-id',
      fileId: 'file-id'
    });
    expect(buildWorktreeSnapshotIndexFilePath(windowsPlan)).toBe(
      path.join(
        'C:\\workspace\\storage',
        'report-history',
        'repo-id',
        'file-id',
        'worktree-snapshots.json'
      )
    );
  });

  it('reads an archived source record, returning undefined when none is retained (VHS-REQ-610.5)', async () => {
    const selection = {
      storageRoot: '/workspace/storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'src/My.vi',
      reportType: 'diff' as const,
      selectedHash: 'selected-hash',
      baseHash: 'base-hash'
    };
    // Missing retained record -> undefined (readFile must not be reached).
    expect(
      await readArchivedComparisonReportSourceRecordFromSelection(selection, {
        pathExists: async () => false,
        readFile: (async () => {
          throw new Error('readFile should not be called when the record is absent');
        }) as unknown as typeof fs.readFile
      })
    ).toBeUndefined();

    // Present retained record -> parsed JSON.
    const stored = {
      archivedAt: '2026-05-01T00:00:00.000Z',
      archivePlan: { pairId: 'p' },
      packetRecord: { reportType: 'diff' }
    };
    const result = await readArchivedComparisonReportSourceRecordFromSelection(selection, {
      pathExists: async () => true,
      readFile: (async () => JSON.stringify(stored)) as unknown as typeof fs.readFile
    });
    expect(result).toEqual(stored);
  });

  it('self-evicts and garbage-collects the just-written snapshot when retention is disabled (VHS-REQ-641.7)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-archive-zero-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const sourceRoot = path.join(tempRoot, 'source');
    await fs.mkdir(sourceRoot, { recursive: true });
    const packetFilePath = path.join(sourceRoot, 'report-packet.html');
    await fs.writeFile(packetFilePath, '<html>packet</html>', 'utf8');
    const record = {
      reportType: 'diff',
      selectedHash: 'WORKTREE',
      baseHash: 'base-sha',
      runtimeExecution: { worktreeSnapshotId: 'aaaa000000000000' },
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

    const archived = await archiveComparisonReportSource(record, {
      now: () => '2026-05-01T00:00:00.000Z',
      worktreeSnapshotRetentionLimit: 0
    });

    const indexFilePath = buildWorktreeSnapshotIndexFilePath(archived.archivePlan);
    const index = JSON.parse(await fs.readFile(indexFilePath, 'utf8')) as { snapshots: unknown[] };
    // Retention disabled (limit 0): the index is written but empty, and the
    // just-written pair directory is garbage-collected.
    expect(index.snapshots).toEqual([]);
    await expect(fs.access(archived.archivePlan.archiveDirectory)).rejects.toThrow();
  });

  it('recovers from a corrupt worktree snapshot index by starting fresh (VHS-REQ-641.7)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-archive-corrupt-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const sourceRoot = path.join(tempRoot, 'source');
    await fs.mkdir(sourceRoot, { recursive: true });
    const packetFilePath = path.join(sourceRoot, 'report-packet.html');
    await fs.writeFile(packetFilePath, '<html>packet</html>', 'utf8');
    const record = {
      reportType: 'diff',
      selectedHash: 'WORKTREE',
      baseHash: 'base-sha',
      runtimeExecution: { worktreeSnapshotId: 'aaaa000000000000' },
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

    const indexFilePath = buildWorktreeSnapshotIndexFilePath(buildComparisonReportArchivePlan(record));
    await fs.mkdir(path.dirname(indexFilePath), { recursive: true });
    await fs.writeFile(indexFilePath, '{ this is not valid json', 'utf8');

    await archiveComparisonReportSource(record, {
      now: () => '2026-05-01T00:00:00.000Z',
      worktreeSnapshotRetentionLimit: 5
    });

    const index = JSON.parse(await fs.readFile(indexFilePath, 'utf8')) as {
      snapshots: { snapshotId: string }[];
    };
    // The corrupt index was discarded (fail-soft) and rebuilt with just the new snapshot.
    expect(index.snapshots.map((snapshot) => snapshot.snapshotId)).toEqual(['aaaa000000000000']);
  });
});
