import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildComparisonReportArchivePlanFromSelection
} from '../../src/dashboard/comparisonReportArchive';
import {
  MultiReportDashboardLatestRunRecord
} from '../../src/dashboard/dashboardLatestRun';
import {
  seedRetainedDashboardEvidence
} from '../../src/dashboard/retainedDashboardEvidence';
import {
  buildComparisonArtifactPlan,
  buildStagedRevisionPlan
} from '../../src/reporting/comparisonReportPlan';
import {
  ComparisonReportPacketRecord
} from '../../src/reporting/comparisonReportPacket';
import {
  ViHistoryViewModel
} from '../../src/services/viHistoryModel';

describe('retainedDashboardEvidence', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.map(async (root) => {
        await fs.rm(root, { recursive: true, force: true });
      })
    );
    tempRoots.length = 0;
  });

  it('imports governed retained pair evidence from a matching proof manifest into the active workspace archive contract', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-dashboard-'));
    tempRoots.push(tempRoot);

    const destinationStorageRoot = path.join(tempRoot, 'workspace-storage');
    const searchRoot = path.join(tempRoot, 'search-root');
    const sourceStorageRoot = path.join(
      searchRoot,
      'host-linux-dashboard-benchmark',
      'workspace-stage',
      'current',
      '.cache',
      'harness-reports',
      'HARNESS-VHS-002',
      'workspace-storage'
    );
    const sourceRepositoryRoot = '/workspace/.cache/harnesses/ni-labview-icon-editor';
    const destinationRepositoryRoot = 'C:\\dev\\ni-labview-icon-editor';
    const relativePath = 'resource/plugins/lv_icon.vi';
    const selectedHash = '8741bb08026c104100720c0ef48621e4ab7762fd';
    const baseHash = 'c188cdec606aac3b17d8b17274baa19eef3e4017';

    await fs.mkdir(destinationStorageRoot, { recursive: true });
    await fs.mkdir(sourceStorageRoot, { recursive: true });

    const sourceArchivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: sourceStorageRoot,
      repositoryRoot: sourceRepositoryRoot,
      relativePath,
      reportType: 'diff',
      selectedHash,
      baseHash
    });
    const sourceArtifactPlan = buildComparisonArtifactPlan({
      storageRoot: sourceStorageRoot,
      repositoryRoot: sourceRepositoryRoot,
      relativePath,
      reportType: 'diff'
    });
    const sourceStagedRevisionPlan = buildStagedRevisionPlan({
      stagingDirectory: sourceArtifactPlan.stagingDirectory,
      fullFilename: sourceArtifactPlan.fullFilename,
      leftRevisionId: baseHash,
      rightRevisionId: selectedHash
    });

    const sourcePacketRecord: ComparisonReportPacketRecord = {
      generatedAt: '2026-04-06T04:00:00.000Z',
      reportTitle: 'VI Comparison Report: lv_icon.vi',
      reportStatus: 'ready-for-runtime',
      reportType: 'diff',
      selectedHash,
      baseHash,
      artifactPlan: sourceArtifactPlan,
      stagedRevisionPlan: sourceStagedRevisionPlan,
      preflight: {
        normalizedRelativePath: relativePath,
        ready: true,
        left: {
          revisionId: baseHash,
          blobSpecifier: `${baseHash}:${relativePath}`,
          signature: 'LVIN',
          isVi: true
        },
        right: {
          revisionId: selectedHash,
          blobSpecifier: `${selectedHash}:${relativePath}`,
          signature: 'LVIN',
          isVi: true
        }
      },
      runtimeSelection: {
        platform: 'linux',
        executionMode: 'auto',
        bitness: 'x64',
        provider: 'host-native',
        engine: 'labview-cli',
        notes: [],
        registryQueryPlans: [],
        candidates: []
      },
      runtimeExecutionState: 'succeeded',
      runtimeExecution: {
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        stdoutFilePath: sourceArtifactPlan.runtimeStdoutFilePath,
        stderrFilePath: sourceArtifactPlan.runtimeStderrFilePath,
        diagnosticLogArtifactPath: sourceArtifactPlan.runtimeDiagnosticLogFilePath,
        processObservationArtifactPath: sourceArtifactPlan.runtimeProcessObservationFilePath
      }
    };

    await fs.mkdir(sourceArchivePlan.archiveDirectory, { recursive: true });
    await fs.writeFile(sourceArchivePlan.packetFilePath, '<html>packet</html>', 'utf8');
    await fs.writeFile(sourceArchivePlan.reportFilePath, '<html>report</html>', 'utf8');
    await fs.writeFile(sourceArchivePlan.metadataFilePath, JSON.stringify(sourcePacketRecord), 'utf8');
    await fs.writeFile(sourceArchivePlan.runtimeStdoutFilePath, 'stdout', 'utf8');
    await fs.writeFile(sourceArchivePlan.runtimeStderrFilePath, 'stderr', 'utf8');
    await fs.writeFile(sourceArchivePlan.runtimeDiagnosticLogFilePath, 'diagnostic', 'utf8');
    await fs.writeFile(
      sourceArchivePlan.runtimeProcessObservationFilePath,
      JSON.stringify({ observed: true }),
      'utf8'
    );
    await fs.writeFile(
      sourceArchivePlan.sourceRecordFilePath,
      JSON.stringify(
        {
          archivedAt: '2026-04-06T04:01:00.000Z',
          archivePlan: sourceArchivePlan,
          packetRecord: sourcePacketRecord
        },
        null,
        2
      ),
      'utf8'
    );

    const latestRunManifestPath = path.join(
      sourceStorageRoot,
      'dashboards',
      'latest-dashboard-run.json'
    );
    await fs.mkdir(path.dirname(latestRunManifestPath), { recursive: true });
    const latestRunRecord: MultiReportDashboardLatestRunRecord = {
      recordedAt: '2026-04-06T04:02:00.000Z',
      source: 'harness-dashboard-smoke',
      workspaceStorageRoot: sourceStorageRoot,
      artifactPaths: {
        dashboardsDirectory: path.join(sourceStorageRoot, 'dashboards'),
        dashboardDirectory: path.join(sourceStorageRoot, 'dashboards', 'window'),
        dashboardJsonFilePath: path.join(sourceStorageRoot, 'dashboards', 'window', 'dashboard.json'),
        dashboardHtmlFilePath: path.join(sourceStorageRoot, 'dashboards', 'window', 'dashboard.html')
      },
      dashboard: {
        generatedAt: '2026-04-06T04:02:00.000Z',
        repositoryName: 'ni-labview-icon-editor',
        repositoryRoot: sourceRepositoryRoot,
        relativePath,
        signature: 'LVIN',
        commitWindow: {
          commitCount: 2,
          pairCount: 1,
          newestHash: selectedHash,
          oldestHash: baseHash
        },
        summary: {
          representedPairCount: 1,
          windowCompletenessState: 'complete',
          archivedPairCount: 1,
          missingPairCount: 0,
          missingPairIds: [],
          generatedReportCount: 1,
          reportMetadataPairCount: 1,
          failedPairCount: 0,
          failedPairIds: [],
          blockedPairCount: 0,
          blockedPairIds: [],
          overviewImageCount: 0,
          detailItemCount: 0,
          providerSummaries: [
            {
              label: 'host-native / labview-cli / auto / linux',
              pairCount: 1
            }
          ]
        }
      }
    };
    await fs.writeFile(latestRunManifestPath, JSON.stringify(latestRunRecord, null, 2), 'utf8');

    const model: ViHistoryViewModel = {
      repositoryName: 'ni-labview-icon-editor',
      repositoryRoot: destinationRepositoryRoot,
      repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
      relativePath,
      signature: 'LVIN',
      eligible: true,
      commits: [
        {
          hash: selectedHash,
          authorDate: '2026-04-06T00:00:00.000Z',
          authorName: 'A User',
          subject: 'Newest revision',
          previousHash: baseHash
        },
        {
          hash: baseHash,
          authorDate: '2026-04-05T00:00:00.000Z',
          authorName: 'B User',
          subject: 'Base revision'
        }
      ],
      repositorySupport: {
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        normalizedRepositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        tier: 'governed-upstream',
        familyId: 'labview-icon-editor',
        familyDisplayName: 'NI LabVIEW Icon Editor',
        supportLabel: 'Governed upstream: NI LabVIEW Icon Editor',
        supportGuidance: 'Guided.',
        allowCoreReviewActions: true,
        allowDecisionRecordActions: true,
        allowBenchmarkStatus: true,
        allowHumanReviewSubmission: true
      }
    };

    const result = await seedRetainedDashboardEvidence(destinationStorageRoot, model, {
      searchRoots: [searchRoot]
    });

    expect(result).toEqual({
      importedPairCount: 1,
      importedGeneratedPairCount: 1,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 0,
      candidateCount: 1
    });

    const destinationArchivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot: destinationStorageRoot,
      repositoryRoot: destinationRepositoryRoot,
      relativePath,
      reportType: 'diff',
      selectedHash,
      baseHash
    });
    const destinationSourceRecord = JSON.parse(
      await fs.readFile(destinationArchivePlan.sourceRecordFilePath, 'utf8')
    ) as {
      archivePlan: typeof destinationArchivePlan;
      packetRecord: ComparisonReportPacketRecord;
    };

    expect(destinationSourceRecord.archivePlan.sourceRecordFilePath).toBe(
      destinationArchivePlan.sourceRecordFilePath
    );
    expect(destinationSourceRecord.packetRecord.artifactPlan.reportDirectory).toContain(
      path.join(destinationStorageRoot, 'reports')
    );
    expect(destinationSourceRecord.packetRecord.runtimeExecution.stdoutFilePath).toBe(
      destinationArchivePlan.runtimeStdoutFilePath
    );
    await expect(fs.access(destinationArchivePlan.reportFilePath)).resolves.toBeUndefined();
    await expect(fs.access(destinationArchivePlan.packetFilePath)).resolves.toBeUndefined();
  });
});
