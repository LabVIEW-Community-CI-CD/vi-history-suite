import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ArchivedComparisonReportSourceRecord,
  buildComparisonReportArchivePlanFromSelection
} from '../../src/dashboard/comparisonReportArchive';
import { seedRetainedDashboardEvidence } from '../../src/dashboard/retainedDashboardEvidence';
import {
  buildComparisonArtifactPlan,
  buildStagedRevisionPlan
} from '../../src/reporting/comparisonReportPlan';
import type { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';
import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';

const tempRoots: string[] = [];

afterEach(async () => {
  for (const tempRoot of tempRoots.splice(0)) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

function createModel(): ViHistoryViewModel {
  return {
    repositoryName: 'labview-icon-editor',
    repositoryRoot: '/workspace/current/labview-icon-editor',
    repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
    relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    signature: 'LVIN',
    eligible: true,
    repositorySupport: {
      tier: 'known-upstream',
      familyId: 'labview-icon-editor',
      familyDisplayName: 'NI LabVIEW Icon Editor',
      supportLabel: 'Known upstream: NI LabVIEW Icon Editor',
      supportGuidance: 'Known evidence family.',
      allowCoreReviewActions: true,
      allowDecisionRecordActions: true,
      allowBenchmarkStatus: true
    },
    commits: [
      {
        hash: 'c3',
        previousHash: 'b2',
        authorDate: '2026-05-03T00:00:00.000Z',
        authorName: 'Dev Three',
        subject: 'Selected revision'
      },
      {
        hash: 'b2',
        previousHash: 'a1',
        authorDate: '2026-05-02T00:00:00.000Z',
        authorName: 'Dev Two',
        subject: 'Middle revision'
      },
      {
        hash: 'a1',
        authorDate: '2026-05-01T00:00:00.000Z',
        authorName: 'Dev One',
        subject: 'Base revision'
      }
    ]
  };
}

function createPacketRecord(options: {
  storageRoot: string;
  repositoryRoot: string;
  relativePath: string;
  selectedHash: string;
  baseHash: string;
  reportExists: boolean;
  runtimeExecutionState?: ComparisonReportPacketRecord['runtimeExecutionState'];
  reportStatus?: ComparisonReportPacketRecord['reportStatus'];
}): ComparisonReportPacketRecord {
  const artifactPlan = buildComparisonArtifactPlan({
    storageRoot: options.storageRoot,
    repositoryRoot: options.repositoryRoot,
    relativePath: options.relativePath,
    reportType: 'diff'
  });
  const stagedRevisionPlan = buildStagedRevisionPlan({
    stagingDirectory: artifactPlan.stagingDirectory,
    fullFilename: artifactPlan.fullFilename,
    leftRevisionId: options.baseHash,
    rightRevisionId: options.selectedHash
  });
  const runtimeExecutionState = options.runtimeExecutionState ?? 'succeeded';
  return {
    generatedAt: '2026-05-04T00:00:00.000Z',
    reportTitle: 'VI Comparison Report: VIP_Pre-Install Custom Action.vi',
    reportStatus: options.reportStatus ?? 'ready-for-runtime',
    reportType: 'diff',
    selectedHash: options.selectedHash,
    baseHash: options.baseHash,
    artifactPlan,
    stagedRevisionPlan,
    preflight: {
      normalizedRelativePath: options.relativePath,
      ready: options.reportStatus !== 'blocked-preflight',
      blockedReason: options.reportStatus === 'blocked-preflight' ? 'preflight blocked' : undefined,
      left: {
        revisionId: options.baseHash,
        resolvedRelativePath: options.relativePath,
        blobSpecifier: `${options.baseHash}:${options.relativePath}`,
        signature: 'LVIN',
        isVi: true
      },
      right: {
        revisionId: options.selectedHash,
        resolvedRelativePath: options.relativePath,
        blobSpecifier: `${options.selectedHash}:${options.relativePath}`,
        signature: 'LVIN',
        isVi: true
      }
    },
    runtimeSelection: {
      platform: 'win32',
      executionMode: 'host-only',
      requestedProvider: 'host',
      requestedLabviewVersion: '2026',
      bitness: 'x64',
      provider: 'host-native',
      engine: 'labview-cli',
      providerDecisions: [],
      notes: [],
      registryQueryPlans: [],
      candidates: []
    },
    runtimeExecutionState,
    runtimeExecution: {
      state: runtimeExecutionState,
      attempted: runtimeExecutionState !== 'not-run' && runtimeExecutionState !== 'not-available',
      reportExists: options.reportExists,
      stdoutFilePath: artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: artifactPlan.runtimeStderrFilePath
    }
  };
}

async function writeLatestRunManifest(options: {
  storageRoot: string;
  repositoryName: string;
  repositoryRoot: string;
  relativePath: string;
  newestHash: string;
  oldestHash: string;
  pairCount: number;
}): Promise<void> {
  const manifestPath = path.join(options.storageRoot, 'dashboards', 'latest-dashboard-run.json');
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        recordedAt: '2026-05-04T00:00:00.000Z',
        source: 'harness-dashboard-smoke',
        workspaceStorageRoot: options.storageRoot,
        artifactPaths: {
          dashboardsDirectory: path.join(options.storageRoot, 'dashboards'),
          dashboardDirectory: path.join(options.storageRoot, 'dashboards', 'review'),
          dashboardJsonFilePath: path.join(options.storageRoot, 'dashboards', 'review', 'dashboard.json'),
          dashboardHtmlFilePath: path.join(options.storageRoot, 'dashboards', 'review', 'dashboard.html')
        },
        dashboard: {
          generatedAt: '2026-05-04T00:00:00.000Z',
          repositoryName: options.repositoryName,
          repositoryRoot: options.repositoryRoot,
          relativePath: options.relativePath,
          signature: 'LVIN',
          commitWindow: {
            commitCount: options.pairCount + 1,
            pairCount: options.pairCount,
            newestHash: options.newestHash,
            oldestHash: options.oldestHash
          },
          summary: {
            representedPairCount: options.pairCount,
            windowCompletenessState: 'complete',
            archivedPairCount: options.pairCount,
            missingPairCount: 0,
            missingPairIds: [],
            generatedReportCount: 1,
            reportMetadataPairCount: 1,
            failedPairCount: 0,
            failedPairIds: [],
            blockedPairCount: 1,
            blockedPairIds: [],
            overviewImageCount: 1,
            detailItemCount: 1,
            providerSummaries: []
          }
        }
      },
      null,
      2
    ),
    'utf8'
  );
}

async function writeSourceRecord(options: {
  storageRoot: string;
  repositoryRoot: string;
  relativePath: string;
  selectedHash: string;
  baseHash: string;
  reportExists: boolean;
  runtimeExecutionState?: ComparisonReportPacketRecord['runtimeExecutionState'];
  reportStatus?: ComparisonReportPacketRecord['reportStatus'];
}): Promise<ArchivedComparisonReportSourceRecord> {
  const archivePlan = buildComparisonReportArchivePlanFromSelection({
    storageRoot: options.storageRoot,
    repositoryRoot: options.repositoryRoot,
    relativePath: options.relativePath,
    reportType: 'diff',
    selectedHash: options.selectedHash,
    baseHash: options.baseHash
  });
  const packetRecord = createPacketRecord(options);
  const sourceRecord: ArchivedComparisonReportSourceRecord = {
    archivedAt: '2026-05-04T00:00:00.000Z',
    archivePlan,
    packetRecord
  };

  await fs.mkdir(archivePlan.archiveDirectory, { recursive: true });
  await fs.writeFile(archivePlan.packetFilePath, '<html>packet</html>', 'utf8');
  await fs.writeFile(archivePlan.metadataFilePath, JSON.stringify(packetRecord, null, 2), 'utf8');
  if (options.reportExists) {
    await fs.writeFile(archivePlan.reportFilePath, '<html>generated report</html>', 'utf8');
  }
  await fs.writeFile(archivePlan.sourceRecordFilePath, JSON.stringify(sourceRecord, null, 2), 'utf8');
  return sourceRecord;
}

describe('retained dashboard evidence seeding (VHS-REQ-610)', () => {
  it('imports compatible retained proof evidence while ignoring malformed and incompatible manifests', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-dashboard-'));
    tempRoots.push(tempRoot);
    const model = createModel();
    const currentStorageRoot = path.join(tempRoot, 'current', 'workspace-storage');
    const malformedRoot = path.join(tempRoot, 'proofs', 'bad', 'workspace-storage');
    const compatibleStorageRoot = path.join(
      tempRoot,
      'proofs',
      'windows-benchmark-image-proof',
      'workspace-storage'
    );
    const incompatibleStorageRoot = path.join(tempRoot, 'proofs', 'old-proof', 'workspace-storage');
    await fs.mkdir(path.join(malformedRoot, 'dashboards'), { recursive: true });
    await fs.writeFile(
      path.join(malformedRoot, 'dashboards', 'latest-dashboard-run.json'),
      '{not-json',
      'utf8'
    );
    await writeLatestRunManifest({
      storageRoot: incompatibleStorageRoot,
      repositoryName: 'NI-LabVIEW-Icon-Editor',
      repositoryRoot: '/workspace/proof/labview-icon-editor',
      relativePath: model.relativePath,
      newestHash: 'not-current',
      oldestHash: 'a1',
      pairCount: 2
    });
    await writeLatestRunManifest({
      storageRoot: compatibleStorageRoot,
      repositoryName: 'NI-LabVIEW-Icon-Editor',
      repositoryRoot: '/workspace/proof/labview-icon-editor',
      relativePath: model.relativePath,
      newestHash: 'c3',
      oldestHash: 'a1',
      pairCount: 2
    });
    await writeSourceRecord({
      storageRoot: compatibleStorageRoot,
      repositoryRoot: '/workspace/proof/labview-icon-editor',
      relativePath: model.relativePath,
      selectedHash: 'c3',
      baseHash: 'b2',
      reportExists: true
    });
    await writeSourceRecord({
      storageRoot: compatibleStorageRoot,
      repositoryRoot: '/workspace/proof/labview-icon-editor',
      relativePath: model.relativePath,
      selectedHash: 'b2',
      baseHash: 'a1',
      reportExists: false,
      reportStatus: 'blocked-preflight',
      runtimeExecutionState: 'not-run'
    });

    const result = await seedRetainedDashboardEvidence(currentStorageRoot, model, {
      searchRoots: [path.join(tempRoot, 'proofs')],
      nowIso: () => '2026-05-04T12:00:00.000Z'
    });

    expect(result).toEqual({
      importedPairCount: 2,
      importedGeneratedPairCount: 1,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 1,
      candidateCount: 1
    });
    const generatedDestination = buildComparisonReportArchivePlanFromSelection({
      storageRoot: currentStorageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: 'diff',
      selectedHash: 'c3',
      baseHash: 'b2'
    });
    const blockedDestination = buildComparisonReportArchivePlanFromSelection({
      storageRoot: currentStorageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: 'diff',
      selectedHash: 'b2',
      baseHash: 'a1'
    });
    const generatedRecord = JSON.parse(
      await fs.readFile(generatedDestination.sourceRecordFilePath, 'utf8')
    ) as ArchivedComparisonReportSourceRecord;
    const blockedRecord = JSON.parse(
      await fs.readFile(blockedDestination.sourceRecordFilePath, 'utf8')
    ) as ArchivedComparisonReportSourceRecord;

    expect(generatedRecord.archivedAt).toBe('2026-05-04T12:00:00.000Z');
    expect(generatedRecord.packetRecord.runtimeExecution.reportExists).toBe(true);
    expect(generatedRecord.packetRecord.artifactPlan.allowedLocalRootPaths[0]).toBe(currentStorageRoot);
    await expect(fs.access(generatedDestination.reportFilePath)).resolves.toBeUndefined();
    expect(blockedRecord.packetRecord.runtimeExecution.reportExists).toBe(false);
    expect(blockedRecord.packetRecord.reportStatus).toBe('blocked-preflight');
  });

  it('does not overwrite existing retained archive records in the current storage root', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-dashboard-skip-'));
    tempRoots.push(tempRoot);
    const model = createModel();
    const currentStorageRoot = path.join(tempRoot, 'current', 'workspace-storage');
    const proofStorageRoot = path.join(tempRoot, 'proofs', 'workspace-storage');
    await writeLatestRunManifest({
      storageRoot: proofStorageRoot,
      repositoryName: 'NI-LabVIEW-Icon-Editor',
      repositoryRoot: '/workspace/proof/labview-icon-editor',
      relativePath: model.relativePath,
      newestHash: 'c3',
      oldestHash: 'b2',
      pairCount: 1
    });
    await writeSourceRecord({
      storageRoot: proofStorageRoot,
      repositoryRoot: '/workspace/proof/labview-icon-editor',
      relativePath: model.relativePath,
      selectedHash: 'c3',
      baseHash: 'b2',
      reportExists: true
    });
    const existingDestination = buildComparisonReportArchivePlanFromSelection({
      storageRoot: currentStorageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: 'diff',
      selectedHash: 'c3',
      baseHash: 'b2'
    });
    await fs.mkdir(path.dirname(existingDestination.sourceRecordFilePath), { recursive: true });
    await fs.writeFile(existingDestination.sourceRecordFilePath, '{"existing":true}', 'utf8');

    const result = await seedRetainedDashboardEvidence(currentStorageRoot, model, {
      searchRoots: [path.join(tempRoot, 'proofs')],
      nowIso: () => '2026-05-04T12:00:00.000Z'
    });

    expect(result).toEqual({
      importedPairCount: 0,
      importedGeneratedPairCount: 0,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 0,
      candidateCount: 1
    });
    await expect(fs.readFile(existingDestination.sourceRecordFilePath, 'utf8')).resolves.toBe(
      '{"existing":true}'
    );
  });
});
