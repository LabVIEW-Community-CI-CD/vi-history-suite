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
