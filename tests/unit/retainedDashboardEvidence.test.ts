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

function buildArchivePlan(options: {
  storageRoot: string;
  repositoryRoot: string;
  relativePath: string;
  selectedHash: string;
  baseHash: string;
}): ReturnType<typeof buildComparisonReportArchivePlanFromSelection> {
  return buildComparisonReportArchivePlanFromSelection({
    storageRoot: options.storageRoot,
    repositoryRoot: options.repositoryRoot,
    relativePath: options.relativePath,
    reportType: 'diff',
    selectedHash: options.selectedHash,
    baseHash: options.baseHash
  });
}

async function patchArchivedSourceRecord(
  archivePlan: ReturnType<typeof buildComparisonReportArchivePlanFromSelection>,
  mutate: (record: ArchivedComparisonReportSourceRecord) => void
): Promise<void> {
  const record = JSON.parse(
    await fs.readFile(archivePlan.sourceRecordFilePath, 'utf8')
  ) as ArchivedComparisonReportSourceRecord;
  mutate(record);
  await fs.writeFile(archivePlan.sourceRecordFilePath, JSON.stringify(record, null, 2), 'utf8');
}

async function writeUnreadableSourceRecord(options: {
  storageRoot: string;
  repositoryRoot: string;
  relativePath: string;
  selectedHash: string;
  baseHash: string;
}): Promise<void> {
  const archivePlan = buildArchivePlan(options);
  await fs.mkdir(archivePlan.archiveDirectory, { recursive: true });
  await fs.writeFile(archivePlan.sourceRecordFilePath, '{ this is : not valid json', 'utf8');
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

  it('reports zero candidates when no dashboard manifests are discovered (VHS-REQ-610)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-empty-'));
    tempRoots.push(tempRoot);
    const model = createModel();

    const result = await seedRetainedDashboardEvidence(
      path.join(tempRoot, 'current', 'workspace-storage'),
      model,
      {
        searchRoots: [path.join(tempRoot, 'does-not-exist')],
        nowIso: () => '2026-05-04T12:00:00.000Z'
      }
    );

    expect(result).toEqual({
      importedPairCount: 0,
      importedGeneratedPairCount: 0,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 0,
      candidateCount: 0
    });
  });

  it('walks retained search trees skipping noise directories and unreadable roots (VHS-REQ-610)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-walk-'));
    tempRoots.push(tempRoot);
    const model = createModel();
    const currentStorageRoot = path.join(tempRoot, 'current', 'workspace-storage');
    const proofsRoot = path.join(tempRoot, 'proofs');
    // Skip-listed directories and a stray file exercise the walk's guard branches.
    await fs.mkdir(path.join(proofsRoot, 'node_modules', 'pkg'), { recursive: true });
    await fs.mkdir(path.join(proofsRoot, 'reports'), { recursive: true });
    await fs.mkdir(path.join(proofsRoot, 'report-history'), { recursive: true });
    await fs.mkdir(path.join(proofsRoot, 'dashboards'), { recursive: true });
    await fs.writeFile(path.join(proofsRoot, 'stray-note.txt'), 'noise', 'utf8');
    const proofStorageRoot = path.join(
      proofsRoot,
      'windows-benchmark-image-proof',
      'workspace-storage'
    );
    await writeLatestRunManifest({
      storageRoot: proofStorageRoot,
      repositoryName: 'NI-LabVIEW-Icon-Editor',
      repositoryRoot: '/workspace/proof/labview-icon-editor',
      relativePath: model.relativePath,
      newestHash: 'c3',
      oldestHash: 'a1',
      pairCount: 2
    });
    await writeSourceRecord({
      storageRoot: proofStorageRoot,
      repositoryRoot: '/workspace/proof/labview-icon-editor',
      relativePath: model.relativePath,
      selectedHash: 'c3',
      baseHash: 'b2',
      reportExists: true
    });
    await writeSourceRecord({
      storageRoot: proofStorageRoot,
      repositoryRoot: '/workspace/proof/labview-icon-editor',
      relativePath: model.relativePath,
      selectedHash: 'b2',
      baseHash: 'a1',
      reportExists: false,
      runtimeExecutionState: 'failed'
    });
    const strayFileRoot = path.join(tempRoot, 'not-a-directory.txt');
    await fs.writeFile(strayFileRoot, 'file passed as a search root', 'utf8');

    const result = await seedRetainedDashboardEvidence(currentStorageRoot, model, {
      searchRoots: [proofsRoot, strayFileRoot, path.join(tempRoot, 'missing')],
      nowIso: () => '2026-05-04T12:00:00.000Z'
    });

    expect(result).toEqual({
      importedPairCount: 2,
      importedGeneratedPairCount: 1,
      importedFailedPairCount: 1,
      importedBlockedPairCount: 0,
      candidateCount: 1
    });
  });

  it('prefers the higher-priority candidate when retained evidence quality ties (VHS-REQ-610)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-tie-'));
    tempRoots.push(tempRoot);
    const model = createModel();
    const currentStorageRoot = path.join(tempRoot, 'current', 'workspace-storage');
    const proofsRoot = path.join(tempRoot, 'proofs');
    const linuxStorageRoot = path.join(
      proofsRoot,
      'host-linux-dashboard-benchmark',
      'workspace-storage'
    );
    const windowsStorageRoot = path.join(
      proofsRoot,
      'windows-benchmark-image-proof',
      'workspace-storage'
    );
    // Lower-priority linux proof covers both pairs (larger window sorts first).
    await writeLatestRunManifest({
      storageRoot: linuxStorageRoot,
      repositoryName: 'NI-LabVIEW-Icon-Editor',
      repositoryRoot: '/workspace/proof/linux',
      relativePath: model.relativePath,
      newestHash: 'c3',
      oldestHash: 'a1',
      pairCount: 2
    });
    await writeSourceRecord({
      storageRoot: linuxStorageRoot,
      repositoryRoot: '/workspace/proof/linux',
      relativePath: model.relativePath,
      selectedHash: 'c3',
      baseHash: 'b2',
      reportExists: false,
      reportStatus: 'blocked-preflight',
      runtimeExecutionState: 'not-run'
    });
    await writeSourceRecord({
      storageRoot: linuxStorageRoot,
      repositoryRoot: '/workspace/proof/linux',
      relativePath: model.relativePath,
      selectedHash: 'b2',
      baseHash: 'a1',
      reportExists: false,
      reportStatus: 'blocked-preflight',
      runtimeExecutionState: 'not-run'
    });
    // Higher-priority windows proof covers only the newest pair with equal quality.
    await writeLatestRunManifest({
      storageRoot: windowsStorageRoot,
      repositoryName: 'NI-LabVIEW-Icon-Editor',
      repositoryRoot: '/workspace/proof/windows',
      relativePath: model.relativePath,
      newestHash: 'c3',
      oldestHash: 'b2',
      pairCount: 1
    });
    const windowsSource = await writeSourceRecord({
      storageRoot: windowsStorageRoot,
      repositoryRoot: '/workspace/proof/windows',
      relativePath: model.relativePath,
      selectedHash: 'c3',
      baseHash: 'b2',
      reportExists: false,
      reportStatus: 'blocked-preflight',
      runtimeExecutionState: 'not-run'
    });
    await patchArchivedSourceRecord(windowsSource.archivePlan, (record) => {
      record.packetRecord.reportTitle = 'WINDOWS-PROOF-WINNER';
    });

    const result = await seedRetainedDashboardEvidence(currentStorageRoot, model, {
      searchRoots: [proofsRoot],
      nowIso: () => '2026-05-04T12:00:00.000Z'
    });

    expect(result).toEqual({
      importedPairCount: 2,
      importedGeneratedPairCount: 0,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 2,
      candidateCount: 2
    });
    const newestDestination = buildArchivePlan({
      storageRoot: currentStorageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      selectedHash: 'c3',
      baseHash: 'b2'
    });
    const imported = JSON.parse(
      await fs.readFile(newestDestination.sourceRecordFilePath, 'utf8')
    ) as ArchivedComparisonReportSourceRecord;
    expect(imported.packetRecord.reportTitle).toBe('WINDOWS-PROOF-WINNER');
  });

  it('imports host-workspace evidence when the candidate repository URL matches (VHS-REQ-610)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-host-'));
    tempRoots.push(tempRoot);
    const model = createModel();
    const currentStorageRoot = path.join(tempRoot, 'current', 'workspace-storage');
    const appDataRoot = path.join(
      tempRoot,
      'home',
      'AppData',
      'Roaming',
      'Code',
      'User',
      'workspaceStorage'
    );
    const hostStorageRoot = path.join(appDataRoot, 'ws-hash-1', 'vihs.extension');
    const hostRepositoryRoot = path.join(tempRoot, 'host-repo');
    await fs.mkdir(hostRepositoryRoot, { recursive: true });
    await writeLatestRunManifest({
      storageRoot: hostStorageRoot,
      repositoryName: 'labview-icon-editor',
      repositoryRoot: hostRepositoryRoot,
      relativePath: model.relativePath,
      newestHash: 'c3',
      oldestHash: 'a1',
      pairCount: 2
    });
    await writeSourceRecord({
      storageRoot: hostStorageRoot,
      repositoryRoot: hostRepositoryRoot,
      relativePath: model.relativePath,
      selectedHash: 'c3',
      baseHash: 'b2',
      reportExists: true
    });
    // Non-directory entries at each host-workspace level are ignored by the walk.
    await fs.writeFile(path.join(appDataRoot, 'stray-workspace.txt'), 'noise', 'utf8');
    await fs.writeFile(path.join(appDataRoot, 'ws-hash-1', 'stray-extension.txt'), 'noise', 'utf8');

    const result = await seedRetainedDashboardEvidence(currentStorageRoot, model, {
      searchRoots: [appDataRoot],
      getRepoRemoteUrl: async (repoRoot) =>
        repoRoot === hostRepositoryRoot ? model.repositoryUrl : undefined,
      nowIso: () => '2026-05-04T12:00:00.000Z'
    });

    expect(result).toEqual({
      importedPairCount: 1,
      importedGeneratedPairCount: 1,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 0,
      candidateCount: 1
    });
  });

  it('rejects host-workspace candidates that fail url, root, or repository checks (VHS-REQ-610)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-host-reject-'));
    tempRoots.push(tempRoot);
    const model = createModel();
    const currentStorageRoot = path.join(tempRoot, 'current', 'workspace-storage');

    async function seedHostWorkspace(options: {
      folder: string;
      candidateRepositoryRoot: string;
      modelOverride?: Partial<ViHistoryViewModel>;
      remoteUrl?: string;
    }): Promise<number> {
      const appDataRoot = path.join(
        tempRoot,
        options.folder,
        'AppData',
        'Roaming',
        'Code',
        'User',
        'workspaceStorage'
      );
      const hostStorageRoot = path.join(appDataRoot, 'ws', 'ext');
      await writeLatestRunManifest({
        storageRoot: hostStorageRoot,
        repositoryName: 'labview-icon-editor',
        repositoryRoot: options.candidateRepositoryRoot,
        relativePath: model.relativePath,
        newestHash: 'c3',
        oldestHash: 'a1',
        pairCount: 2
      });
      const result = await seedRetainedDashboardEvidence(
        currentStorageRoot,
        { ...model, ...options.modelOverride },
        {
          searchRoots: [appDataRoot],
          getRepoRemoteUrl: async () => options.remoteUrl,
          nowIso: () => '2026-05-04T12:00:00.000Z'
        }
      );
      return result.candidateCount;
    }

    const existingRepoRoot = path.join(tempRoot, 'present-repo');
    await fs.mkdir(existingRepoRoot, { recursive: true });

    // Missing current repository URL rejects host-workspace candidates.
    await expect(
      seedHostWorkspace({
        folder: 'no-url',
        candidateRepositoryRoot: existingRepoRoot,
        modelOverride: { repositoryUrl: undefined },
        remoteUrl: model.repositoryUrl
      })
    ).resolves.toBe(0);
    // Candidate repository root that does not exist is rejected.
    await expect(
      seedHostWorkspace({
        folder: 'missing-root',
        candidateRepositoryRoot: path.join(tempRoot, 'absent-repo'),
        remoteUrl: model.repositoryUrl
      })
    ).resolves.toBe(0);
    // Mismatched remote URL is rejected.
    await expect(
      seedHostWorkspace({
        folder: 'wrong-url',
        candidateRepositoryRoot: existingRepoRoot,
        remoteUrl: 'https://github.com/ni/some-other-repo.git'
      })
    ).resolves.toBe(0);
  });

  it('rejects incompatible commit windows across all guard branches (VHS-REQ-610)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-window-'));
    tempRoots.push(tempRoot);
    const model = createModel();
    const currentStorageRoot = path.join(tempRoot, 'current', 'workspace-storage');
    const proofsRoot = path.join(tempRoot, 'proofs');
    const windows: Array<{ folder: string; newestHash: string; oldestHash: string; pairCount: number }> = [
      { folder: 'zero', newestHash: 'c3', oldestHash: 'c3', pairCount: 0 },
      { folder: 'too-large', newestHash: 'c3', oldestHash: 'a1', pairCount: 3 },
      { folder: 'fractional', newestHash: 'c3', oldestHash: 'b2', pairCount: 1.5 },
      { folder: 'oldest-mismatch', newestHash: 'c3', oldestHash: 'zz', pairCount: 2 }
    ];
    for (const window of windows) {
      await writeLatestRunManifest({
        storageRoot: path.join(proofsRoot, window.folder, 'workspace-storage'),
        repositoryName: 'NI-LabVIEW-Icon-Editor',
        repositoryRoot: '/workspace/proof/labview-icon-editor',
        relativePath: model.relativePath,
        newestHash: window.newestHash,
        oldestHash: window.oldestHash,
        pairCount: window.pairCount
      });
    }

    const result = await seedRetainedDashboardEvidence(currentStorageRoot, model, {
      searchRoots: [proofsRoot],
      nowIso: () => '2026-05-04T12:00:00.000Z'
    });

    expect(result.candidateCount).toBe(0);
  });

  it('excludes self storage, relative-path mismatches, and unmatched repositories (VHS-REQ-610)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-filter-'));
    tempRoots.push(tempRoot);
    const model = createModel();
    const currentStorageRoot = path.join(tempRoot, 'proofs', 'self', 'workspace-storage');
    const proofsRoot = path.join(tempRoot, 'proofs');
    // Candidate whose storage root equals the current storage root is skipped.
    await writeLatestRunManifest({
      storageRoot: currentStorageRoot,
      repositoryName: 'NI-LabVIEW-Icon-Editor',
      repositoryRoot: '/workspace/proof/self',
      relativePath: model.relativePath,
      newestHash: 'c3',
      oldestHash: 'a1',
      pairCount: 2
    });
    // Candidate with a different relative path is skipped.
    await writeLatestRunManifest({
      storageRoot: path.join(proofsRoot, 'other-path', 'workspace-storage'),
      repositoryName: 'NI-LabVIEW-Icon-Editor',
      repositoryRoot: '/workspace/proof/other-path',
      relativePath: 'Tooling/deployment/Some Other VI.vi',
      newestHash: 'c3',
      oldestHash: 'a1',
      pairCount: 2
    });
    // Candidate whose repository does not match the family id is skipped.
    await writeLatestRunManifest({
      storageRoot: path.join(proofsRoot, 'unrelated-repo', 'workspace-storage'),
      repositoryName: 'some-unrelated-repository',
      repositoryRoot: '/workspace/proof/unrelated',
      relativePath: model.relativePath,
      newestHash: 'c3',
      oldestHash: 'a1',
      pairCount: 2
    });
    // A single valid candidate remains after all skips.
    const validStorageRoot = path.join(
      proofsRoot,
      'windows-benchmark-image-proof',
      'workspace-storage'
    );
    await writeLatestRunManifest({
      storageRoot: validStorageRoot,
      repositoryName: 'NI-LabVIEW-Icon-Editor',
      repositoryRoot: '/workspace/proof/valid',
      relativePath: model.relativePath,
      newestHash: 'c3',
      oldestHash: 'a1',
      pairCount: 2
    });

    const result = await seedRetainedDashboardEvidence(currentStorageRoot, model, {
      searchRoots: [proofsRoot],
      nowIso: () => '2026-05-04T12:00:00.000Z'
    });

    expect(result.candidateCount).toBe(1);
  });

  it('skips malformed and hash-mismatched retained source records (VHS-REQ-610)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-skip-source-'));
    tempRoots.push(tempRoot);
    const model = createModel();
    const currentStorageRoot = path.join(tempRoot, 'current', 'workspace-storage');
    const proofStorageRoot = path.join(
      tempRoot,
      'proofs',
      'windows-benchmark-image-proof',
      'workspace-storage'
    );
    const proofRepositoryRoot = '/workspace/proof/labview-icon-editor';
    await writeLatestRunManifest({
      storageRoot: proofStorageRoot,
      repositoryName: 'NI-LabVIEW-Icon-Editor',
      repositoryRoot: proofRepositoryRoot,
      relativePath: model.relativePath,
      newestHash: 'c3',
      oldestHash: 'a1',
      pairCount: 2
    });
    // Newest pair has an unreadable (invalid JSON) source record.
    await writeUnreadableSourceRecord({
      storageRoot: proofStorageRoot,
      repositoryRoot: proofRepositoryRoot,
      relativePath: model.relativePath,
      selectedHash: 'c3',
      baseHash: 'b2'
    });
    // Older pair has a source record whose stored hashes do not match the pair.
    const olderSource = await writeSourceRecord({
      storageRoot: proofStorageRoot,
      repositoryRoot: proofRepositoryRoot,
      relativePath: model.relativePath,
      selectedHash: 'b2',
      baseHash: 'a1',
      reportExists: true
    });
    await patchArchivedSourceRecord(olderSource.archivePlan, (record) => {
      record.packetRecord.selectedHash = 'mismatched-selected';
    });

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
  });

  it('copies the full retained artifact set including runtime logs and report assets (VHS-REQ-610)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-copy-'));
    tempRoots.push(tempRoot);
    const model = createModel();
    const currentStorageRoot = path.join(tempRoot, 'current', 'workspace-storage');
    const proofStorageRoot = path.join(
      tempRoot,
      'proofs',
      'windows-benchmark-image-proof',
      'workspace-storage'
    );
    const proofRepositoryRoot = '/workspace/proof/labview-icon-editor';
    await writeLatestRunManifest({
      storageRoot: proofStorageRoot,
      repositoryName: 'NI-LabVIEW-Icon-Editor',
      repositoryRoot: proofRepositoryRoot,
      relativePath: model.relativePath,
      newestHash: 'c3',
      oldestHash: 'a1',
      pairCount: 2
    });
    const source = await writeSourceRecord({
      storageRoot: proofStorageRoot,
      repositoryRoot: proofRepositoryRoot,
      relativePath: model.relativePath,
      selectedHash: 'c3',
      baseHash: 'b2',
      reportExists: true
    });
    const sourcePlan = source.archivePlan;
    await fs.writeFile(sourcePlan.runtimeStdoutFilePath, 'stdout log', 'utf8');
    await fs.writeFile(sourcePlan.runtimeStderrFilePath, 'stderr log', 'utf8');
    await fs.writeFile(sourcePlan.runtimeDiagnosticLogFilePath, 'diagnostic log', 'utf8');
    await fs.writeFile(sourcePlan.runtimeProcessObservationFilePath, 'process observation', 'utf8');
    await fs.mkdir(sourcePlan.reportAssetsDirectoryPath, { recursive: true });
    await fs.writeFile(
      path.join(sourcePlan.reportAssetsDirectoryPath, 'diff-image.png'),
      'binary-ish',
      'utf8'
    );

    const result = await seedRetainedDashboardEvidence(currentStorageRoot, model, {
      searchRoots: [path.join(tempRoot, 'proofs')],
      nowIso: () => '2026-05-04T12:00:00.000Z'
    });

    expect(result.importedGeneratedPairCount).toBe(1);
    const destination = buildArchivePlan({
      storageRoot: currentStorageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      selectedHash: 'c3',
      baseHash: 'b2'
    });
    await expect(fs.access(destination.runtimeStdoutFilePath)).resolves.toBeUndefined();
    await expect(fs.access(destination.runtimeStderrFilePath)).resolves.toBeUndefined();
    await expect(fs.access(destination.runtimeDiagnosticLogFilePath)).resolves.toBeUndefined();
    await expect(fs.access(destination.runtimeProcessObservationFilePath)).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(destination.reportAssetsDirectoryPath, 'diff-image.png'))
    ).resolves.toBeUndefined();
    const imported = JSON.parse(
      await fs.readFile(destination.sourceRecordFilePath, 'utf8')
    ) as ArchivedComparisonReportSourceRecord;
    expect(imported.packetRecord.runtimeExecution.stdoutFilePath).toBe(
      destination.runtimeStdoutFilePath
    );
    expect(imported.packetRecord.runtimeExecution.stderrFilePath).toBe(
      destination.runtimeStderrFilePath
    );
  });

  it('classifies not-available and plain retained pairs as blocked imports (VHS-REQ-610)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-quality-'));
    tempRoots.push(tempRoot);
    const model = createModel();
    const currentStorageRoot = path.join(tempRoot, 'current', 'workspace-storage');
    const proofStorageRoot = path.join(
      tempRoot,
      'proofs',
      'windows-benchmark-image-proof',
      'workspace-storage'
    );
    const proofRepositoryRoot = '/workspace/proof/labview-icon-editor';
    await writeLatestRunManifest({
      storageRoot: proofStorageRoot,
      repositoryName: 'NI-LabVIEW-Icon-Editor',
      repositoryRoot: proofRepositoryRoot,
      relativePath: model.relativePath,
      newestHash: 'c3',
      oldestHash: 'a1',
      pairCount: 2
    });
    // Quality tier 2: runtime not available (report status stays ready-for-runtime).
    await writeSourceRecord({
      storageRoot: proofStorageRoot,
      repositoryRoot: proofRepositoryRoot,
      relativePath: model.relativePath,
      selectedHash: 'c3',
      baseHash: 'b2',
      reportExists: false,
      runtimeExecutionState: 'not-available'
    });
    // Quality tier 1: nothing generated, not blocked, not failed.
    await writeSourceRecord({
      storageRoot: proofStorageRoot,
      repositoryRoot: proofRepositoryRoot,
      relativePath: model.relativePath,
      selectedHash: 'b2',
      baseHash: 'a1',
      reportExists: false,
      runtimeExecutionState: 'not-run'
    });

    // No nowIso override here so the default ISO timestamp factory is exercised.
    const result = await seedRetainedDashboardEvidence(currentStorageRoot, model, {
      searchRoots: [path.join(tempRoot, 'proofs')]
    });

    expect(result).toEqual({
      importedPairCount: 2,
      importedGeneratedPairCount: 0,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 2,
      candidateCount: 1
    });
  });

  it('discovers a manifest when a workspace-storage directory is passed directly (VHS-REQ-610)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-retained-direct-'));
    tempRoots.push(tempRoot);
    const model = createModel();
    const currentStorageRoot = path.join(tempRoot, 'current', 'workspace-storage');
    const proofStorageRoot = path.join(tempRoot, 'proof', 'workspace-storage');
    // An existing workspace-storage directory without a manifest covers the
    // direct-lookup branch's empty result.
    await fs.mkdir(path.join(tempRoot, 'empty', 'workspace-storage'), { recursive: true });
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

    const result = await seedRetainedDashboardEvidence(currentStorageRoot, model, {
      // Passing the workspace-storage directory directly and an empty one exercises
      // both sides of the direct-manifest lookup branch.
      searchRoots: [proofStorageRoot, path.join(tempRoot, 'empty', 'workspace-storage')],
      nowIso: () => '2026-05-04T12:00:00.000Z'
    });

    expect(result).toEqual({
      importedPairCount: 1,
      importedGeneratedPairCount: 1,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 0,
      candidateCount: 1
    });
  });

  it('builds default search roots from home directories when none are provided (VHS-REQ-610)', async () => {
    const model = createModel();

    const result = await seedRetainedDashboardEvidence('/storage/current', model, {
      pathExists: async () => false,
      nowIso: () => '2026-05-04T12:00:00.000Z'
    });

    expect(result).toEqual({
      importedPairCount: 0,
      importedGeneratedPairCount: 0,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 0,
      candidateCount: 0
    });
  });
});
