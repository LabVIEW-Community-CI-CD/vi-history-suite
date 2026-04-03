import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { archiveComparisonReportSource } from '../../src/dashboard/comparisonReportArchive';
import { buildAndPersistMultiReportDashboard } from '../../src/dashboard/multiReportDashboard';
import { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';

describe('buildAndPersistMultiReportDashboard', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  });

  it('builds a concentrated dashboard over archived pair reports and missing pairs', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-'));
    tempRoots.push(storageRoot);
    const repositoryRoot = '/workspace/repo';
    const relativePath = 'foo.vi';
    const repoId = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 12);
    const fileId = createHash('sha256')
      .update(`${repositoryRoot}\n${relativePath}`)
      .digest('hex')
      .slice(0, 12);
    const currentReportDirectory = path.join(storageRoot, 'reports', repoId, fileId);
    await fs.mkdir(path.join(currentReportDirectory, 'diff-report-foo.vi_files'), {
      recursive: true
    });
    await fs.writeFile(path.join(currentReportDirectory, 'report-packet.html'), '<html>packet</html>');
    await fs.writeFile(
      path.join(currentReportDirectory, 'report-metadata.json'),
      '{"status":"ok"}'
    );
    await fs.writeFile(
      path.join(currentReportDirectory, 'diff-report-foo.vi.html'),
      `<!DOCTYPE html><html><body><div class="report"><h1 class="report-title">LabVIEW VI Comparison Report</h1><p class="generation-time">4/1/2026 11:01:16 AM</p><div class="compared-VIs"><details><summary class="difference-heading"><div class="dropdown-left">First VI: C:\\compare\\Base.vi</div><div class="dropdown-right">Second VI: C:\\compare\\Head.vi</div></summary><table class="difference"><tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Front Panel Overview</td></tr><tr class="compared-images"><td class="diff-image"><img class="difference-image" src="diff-report-foo.vi_files/fp_1.png"/></td></tr></table></details></div><div class="included-attributes"><ul class="inclusion-list"><li class="checked">Front Panel</li></ul></div><h2 class="section-header">Detailed Information</h2><details open><summary class="difference-heading">1. VI Attribute - Miscellaneous</summary><ol class="detailed-description-list" type="A"><li class="diff-detail">VI Version : changed from "21.0" to "20.0"</li></ol></details></div></body></html>`
    );
    await fs.writeFile(path.join(currentReportDirectory, 'runtime-stdout.txt'), 'stdout');
    await fs.writeFile(path.join(currentReportDirectory, 'runtime-stderr.txt'), 'stderr');
    await fs.writeFile(
      path.join(currentReportDirectory, 'runtime-process-observation.json'),
      '{"observed":[]}'
    );
    await fs.writeFile(path.join(currentReportDirectory, 'diff-report-foo.vi_files', 'fp_1.png'), 'png');

    const archivedRecord: ComparisonReportPacketRecord = {
      generatedAt: '2026-04-03T00:00:00.000Z',
      reportTitle: 'VI Comparison Report: foo.vi',
      reportStatus: 'ready-for-runtime',
      reportType: 'diff',
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      artifactPlan: {
        repoId,
        fileId,
        reportType: 'diff',
        fullFilename: 'foo.vi',
        normalizedRelativePath: relativePath,
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
        allowedLocalRootPaths: [storageRoot]
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
        preferBitness: 'x86',
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

    await archiveComparisonReportSource(archivedRecord, {
      now: () => '2026-04-03T01:02:03.000Z'
    });

    const dashboard = await buildAndPersistMultiReportDashboard(storageRoot, {
      repositoryName: 'repo',
      repositoryRoot,
      relativePath,
      signature: 'LVIN',
      eligible: true,
      commits: [
        {
          hash: 'abcdef1234567890',
          authorDate: '2026-04-02T00:00:00Z',
          authorName: 'A User',
          subject: 'Newest revision',
          previousHash: '1111111122222222'
        },
        {
          hash: '1111111122222222',
          authorDate: '2026-04-01T00:00:00Z',
          authorName: 'B User',
          subject: 'Middle revision',
          previousHash: '3333333344444444'
        },
        {
          hash: '3333333344444444',
          authorDate: '2026-03-31T00:00:00Z',
          authorName: 'C User',
          subject: 'Initial revision'
        }
      ]
    }, {
      now: () => '2026-04-03T05:06:07.000Z'
    });

    expect(dashboard.record.summary.archivedPairCount).toBe(1);
    expect(dashboard.record.summary.missingPairCount).toBe(1);
    expect(dashboard.record.summary.generatedReportCount).toBe(1);
    expect(dashboard.record.summary.overviewImageCount).toBe(1);
    expect(dashboard.record.summary.detailItemCount).toBe(1);
    await expect(fs.readFile(dashboard.jsonFilePath, 'utf8')).resolves.toContain('"relativePath": "foo.vi"');
    await expect(fs.readFile(dashboard.htmlFilePath, 'utf8')).resolves.toContain('VI Review Dashboard');
    await expect(
      fs.readFile(
        path.join(
          dashboard.record.artifactPlan.dashboardDirectory,
          'assets',
          dashboard.record.entries[0].pairId,
          'diff-report-foo.vi_files',
          'fp_1.png'
        ),
        'utf8'
      )
    ).resolves.toBe('png');
  });
});
