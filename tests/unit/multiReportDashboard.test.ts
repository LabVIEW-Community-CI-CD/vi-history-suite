import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ArchivedComparisonReportSourceRecord,
  buildComparisonReportArchivePlanFromSelection
} from '../../src/dashboard/comparisonReportArchive';
import {
  buildAndPersistMultiReportDashboard,
  renderMultiReportDashboardHtml
} from '../../src/dashboard/multiReportDashboard';
import {
  buildComparisonArtifactPlan,
  buildStagedRevisionPlan
} from '../../src/reporting/comparisonReportPlan';
import type { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';
import type { ComparisonReportPreflightResult } from '../../src/reporting/comparisonReportPreflight';
import type { ComparisonRuntimeSelection } from '../../src/reporting/comparisonRuntimeLocator';
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
    repositoryRoot: '/workspace/labview-icon-editor',
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
        hash: 'c4',
        previousHash: 'c3',
        authorDate: '2026-05-04T00:00:00.000Z',
        authorName: 'Dev Four',
        subject: 'Fourth retained change'
      },
      {
        hash: 'c3',
        previousHash: 'b2',
        authorDate: '2026-05-03T00:00:00.000Z',
        authorName: 'Dev Three',
        subject: 'Third retained change'
      },
      {
        hash: 'b2',
        previousHash: 'a1',
        authorDate: '2026-05-02T00:00:00.000Z',
        authorName: 'Dev Two',
        subject: 'Second retained change'
      },
      {
        hash: 'a1',
        authorDate: '2026-05-01T00:00:00.000Z',
        authorName: 'Dev One',
        subject: 'Initial retained change'
      }
    ]
  };
}

function createPreflight(overrides: Partial<ComparisonReportPreflightResult> = {}): ComparisonReportPreflightResult {
  return {
    normalizedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    ready: true,
    left: {
      revisionId: 'base',
      resolvedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      blobSpecifier: 'base:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      signature: 'LVIN',
      isVi: true
    },
    right: {
      revisionId: 'selected',
      resolvedRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      blobSpecifier: 'selected:Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      signature: 'LVIN',
      isVi: true
    },
    ...overrides
  };
}

function createRuntimeSelection(
  overrides: Partial<ComparisonRuntimeSelection> = {}
): ComparisonRuntimeSelection {
  return {
    platform: 'win32',
    executionMode: 'host-only',
    requestedProvider: 'host',
    requestedLabviewVersion: '2026',
    bitness: 'x64',
    provider: 'host-native',
    engine: 'labview-cli',
    labviewExe: {
      kind: 'labview-exe',
      path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      source: 'configured',
      exists: true,
      bitness: 'x64'
    },
    labviewCli: {
      kind: 'labview-cli',
      path: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      source: 'scan',
      exists: true,
      bitness: 'x86'
    },
    providerDecisions: [],
    notes: [],
    registryQueryPlans: [],
    candidates: [],
    ...overrides
  };
}

function createPacketRecord(options: {
  storageRoot: string;
  model: ViHistoryViewModel;
  selectedHash: string;
  baseHash: string;
  reportStatus?: ComparisonReportPacketRecord['reportStatus'];
  runtimeExecutionState?: ComparisonReportPacketRecord['runtimeExecutionState'];
  reportExists?: boolean;
  blockedReason?: string;
  failureReason?: string;
}): ComparisonReportPacketRecord {
  const artifactPlan = buildComparisonArtifactPlan({
    storageRoot: options.storageRoot,
    repositoryRoot: options.model.repositoryRoot,
    relativePath: options.model.relativePath,
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
    preflight: createPreflight({
      ready: options.reportStatus !== 'blocked-preflight',
      blockedReason: options.reportStatus === 'blocked-preflight' ? options.blockedReason : undefined
    }),
    runtimeSelection: createRuntimeSelection({
      blockedReason: options.reportStatus === 'blocked-runtime' ? options.blockedReason : undefined
    }),
    runtimeExecutionState,
    runtimeExecution: {
      state: runtimeExecutionState,
      attempted: runtimeExecutionState !== 'not-run' && runtimeExecutionState !== 'not-available',
      reportExists: options.reportExists ?? true,
      failureReason: options.failureReason,
      diagnosticReason: options.blockedReason,
      stdoutFilePath: artifactPlan.runtimeStdoutFilePath,
      stderrFilePath: artifactPlan.runtimeStderrFilePath
    }
  };
}

async function writeArchiveSourceRecord(options: {
  storageRoot: string;
  model: ViHistoryViewModel;
  selectedHash: string;
  baseHash: string;
  reportStatus?: ComparisonReportPacketRecord['reportStatus'];
  runtimeExecutionState?: ComparisonReportPacketRecord['runtimeExecutionState'];
  reportExists?: boolean;
  reportHtml?: string;
  blockedReason?: string;
  failureReason?: string;
  singleFileReport?: boolean;
}): Promise<ArchivedComparisonReportSourceRecord> {
  const archivePlan = buildComparisonReportArchivePlanFromSelection({
    storageRoot: options.storageRoot,
    repositoryRoot: options.model.repositoryRoot,
    relativePath: options.model.relativePath,
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
  if (options.reportHtml) {
    await fs.writeFile(archivePlan.reportFilePath, options.reportHtml, 'utf8');
    // VHS-REQ-640: single-file reports embed images as data URIs and have no
    // sibling `_files` assets directory; legacy multi-file reports write PNGs.
    if (!options.singleFileReport) {
      await fs.mkdir(archivePlan.reportAssetsDirectoryPath, { recursive: true });
      await fs.writeFile(path.join(archivePlan.reportAssetsDirectoryPath, 'front.png'), 'front', 'utf8');
      await fs.writeFile(path.join(archivePlan.reportAssetsDirectoryPath, 'block.png'), 'block', 'utf8');
    }
  }
  await fs.writeFile(archivePlan.sourceRecordFilePath, JSON.stringify(sourceRecord, null, 2), 'utf8');
  return sourceRecord;
}

function createNiReportHtml(assetDirectoryName: string): string {
  return `<!DOCTYPE html>
  <html>
    <body>
      <h1 class="report-title">LabVIEW VI Comparison Report</h1>
      <p class="generation-time">5/4/2026 11:01:16 AM</p>
      <details>
        <summary class="difference-heading">
          <div class="dropdown-left">First VI: C:\\repo\\VIP_Pre-Install Custom Action.vi</div>
          <div class="dropdown-right">Second VI: C:\\repo\\VIP_Pre-Install Custom Action.vi</div>
        </summary>
        <table class="difference">
          <tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Block Diagram Overview</td></tr>
          <tr class="compared-images"><td><img class="difference-image" src="${assetDirectoryName}/block.png"/></td></tr>
          <tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Front Panel Overview</td></tr>
          <tr class="compared-images"><td><img class="difference-image" src="${assetDirectoryName}/front.png"/></td></tr>
        </table>
      </details>
      <ul class="inclusion-list">
        <li class="checked">Front Panel</li>
        <li class="unchecked">VI Attribute</li>
      </ul>
      <h2 class="section-header">Detailed Information</h2>
      <details open>
        <summary class="difference-heading">1. VI Attribute - Miscellaneous</summary>
        <ol>
          <li class="diff-detail">VI Version : changed from "21.0" to "20.0"</li>
          <li class="diff-detail">Connector pane changed</li>
        </ol>
      </details>
    </body>
  </html>`;
}

// VHS-REQ-640: a single-file report embeds overview images as data URIs and has
// no sibling `_files` assets directory.
const SINGLE_FILE_PNG_DATA_URI =
  'data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAYAAAH/zM2EAAAAASUVORK5CYII=';

function createSingleFileNiReportHtml(): string {
  return `<!DOCTYPE html>
  <html>
    <body>
      <h1 class="report-title">LabVIEW VI Comparison Report</h1>
      <p class="generation-time">5/4/2026 11:01:16 AM</p>
      <details>
        <summary class="difference-heading">
          <div class="dropdown-left">First VI: C:\\repo\\VIP_Pre-Install Custom Action.vi</div>
          <div class="dropdown-right">Second VI: C:\\repo\\VIP_Pre-Install Custom Action.vi</div>
        </summary>
        <table class="difference">
          <tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Block Diagram Overview</td></tr>
          <tr class="compared-images"><td><img class="difference-image" src="${SINGLE_FILE_PNG_DATA_URI}"/></td></tr>
          <tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Front Panel Overview</td></tr>
          <tr class="compared-images"><td><img class="difference-image" src="${SINGLE_FILE_PNG_DATA_URI}"/></td></tr>
        </table>
      </details>
    </body>
  </html>`;
}

describe('multi-report dashboard evidence concentration (VHS-REQ-610)', () => {
  it('decodes single-file report data-URI overview images into dashboard PNG assets (VHS-REQ-640)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-sf-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const model = createModel();
    await writeArchiveSourceRecord({
      storageRoot,
      model,
      selectedHash: 'c4',
      baseHash: 'c3',
      reportExists: true,
      singleFileReport: true,
      reportHtml: createSingleFileNiReportHtml()
    });

    const dashboard = await buildAndPersistMultiReportDashboard(storageRoot, model, {
      now: () => '2026-05-04T12:00:00.000Z'
    });

    const generatedEntry = dashboard.record.entries.find((entry) => entry.selectedHash === 'c4');
    expect(generatedEntry?.dashboardImageAssets).toHaveLength(2);
    for (const asset of generatedEntry?.dashboardImageAssets ?? []) {
      // The asset path is a real file written into the dashboard assets dir,
      // not a data URI, so the dashboard render path is unchanged.
      expect(asset.dashboardRelativePath).not.toContain('data:');
      const assetPath = path.join(
        dashboard.record.artifactPlan.dashboardDirectory,
        asset.dashboardRelativePath
      );
      await expect(fs.access(assetPath)).resolves.toBeUndefined();
      const bytes = await fs.readFile(assetPath);
      // Valid PNG magic header proves the data URI was decoded.
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
    // VHS-REQ-640: the summary surfaces how many parsed overview images were
    // actually concentrated into dashboard assets, so single-file
    // materialization is observable rather than assumed.
    expect(dashboard.record.summary.overviewImageCount).toBe(2);
    expect(dashboard.record.summary.materializedOverviewImageCount).toBe(2);
  });

  it('discovers retained working-tree snapshots from the per-VI index and flags them non-reproducible (VHS-REQ-641.7)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-wt-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const model = createModel();

    // Retain a working-tree snapshot: write its content-addressed source-record
    // and the per-VI index that points at it.
    const snapshotId = 'aaaa000000000000';
    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: 'diff',
      selectedHash: 'WORKTREE',
      baseHash: 'c4',
      worktreeSnapshotId: snapshotId
    });
    const packetRecord = createPacketRecord({
      storageRoot,
      model,
      selectedHash: 'WORKTREE',
      baseHash: 'c4',
      reportExists: true
    });
    const sourceRecord: ArchivedComparisonReportSourceRecord = {
      archivedAt: '2026-05-04T00:00:00.000Z',
      archivePlan,
      packetRecord
    };
    await fs.mkdir(archivePlan.archiveDirectory, { recursive: true });
    await fs.writeFile(archivePlan.packetFilePath, '<html>packet</html>', 'utf8');
    await fs.writeFile(
      archivePlan.sourceRecordFilePath,
      JSON.stringify(sourceRecord, null, 2),
      'utf8'
    );
    const indexDir = path.join(
      storageRoot,
      'report-history',
      archivePlan.repoId,
      archivePlan.fileId
    );
    await fs.mkdir(indexDir, { recursive: true });
    await fs.writeFile(
      path.join(indexDir, 'worktree-snapshots.json'),
      JSON.stringify(
        {
          schema: 'vi-history-suite/worktree-snapshot-index@v1',
          snapshots: [
            {
              snapshotId,
              pairId: archivePlan.pairId,
              baseHash: 'c4',
              reportType: 'diff',
              retainedAt: '2026-05-04T00:00:00.000Z',
              relativePath: model.relativePath
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    );

    const dashboard = await buildAndPersistMultiReportDashboard(storageRoot, model, {
      now: () => '2026-05-04T12:00:00.000Z'
    });

    const worktreeEntry = dashboard.record.entries.find(
      (entry) => entry.worktreeSnapshotId === snapshotId
    );
    expect(worktreeEntry).toBeDefined();
    expect(worktreeEntry?.selectedHash).toBe('WORKTREE');
    expect(worktreeEntry?.baseHash).toBe('c4');
    expect(worktreeEntry?.reproducible).toBe(false);
    expect(worktreeEntry?.archiveStatus).toBe('archived');
    // The dashboard HTML surfaces the snapshot with a non-reproducible badge.
    const html = renderMultiReportDashboardHtml(dashboard.record);
    expect(html).toContain('dashboard-entry-worktree-snapshot');
    expect(html).toContain(snapshotId);
  });

  it('ignores a missing working-tree snapshot index without error (VHS-REQ-641.7)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-wt-none-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const model = createModel();

    const dashboard = await buildAndPersistMultiReportDashboard(storageRoot, model, {
      now: () => '2026-05-04T12:00:00.000Z'
    });
    expect(dashboard.record.entries.some((entry) => entry.worktreeSnapshotId)).toBe(false);
  });

  it('parses the report and lists multiple retained working-tree snapshots (VHS-REQ-641.7)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-wt-multi-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const model = createModel();

    async function writeWorktreeSnapshot(
      snapshotId: string,
      baseHash: string,
      withReport: boolean
    ): Promise<string> {
      const archivePlan = buildComparisonReportArchivePlanFromSelection({
        storageRoot,
        repositoryRoot: model.repositoryRoot,
        relativePath: model.relativePath,
        reportType: 'diff',
        selectedHash: 'WORKTREE',
        baseHash,
        worktreeSnapshotId: snapshotId
      });
      const packetRecord = createPacketRecord({
        storageRoot,
        model,
        selectedHash: 'WORKTREE',
        baseHash,
        reportExists: withReport
      });
      const sourceRecord: ArchivedComparisonReportSourceRecord = {
        archivedAt: '2026-05-04T00:00:00.000Z',
        archivePlan,
        packetRecord
      };
      await fs.mkdir(archivePlan.archiveDirectory, { recursive: true });
      await fs.writeFile(archivePlan.packetFilePath, '<html>packet</html>', 'utf8');
      if (withReport) {
        await fs.writeFile(
          archivePlan.reportFilePath,
          createNiReportHtml(archivePlan.reportAssetsDirectoryName),
          'utf8'
        );
      }
      await fs.writeFile(
        archivePlan.sourceRecordFilePath,
        JSON.stringify(sourceRecord, null, 2),
        'utf8'
      );
      return archivePlan.pairId;
    }

    // Derive the per-VI index directory from the archive plan (repoId/fileId are
    // content-derived from the repo root + relative path, not literals).
    const referencePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: 'diff',
      selectedHash: 'WORKTREE',
      baseHash: 'WORKTREE'
    });
    const indexDir = path.join(
      storageRoot,
      'report-history',
      referencePlan.repoId,
      referencePlan.fileId
    );
    await fs.mkdir(indexDir, { recursive: true });

    // Two retained snapshots: one with a generated report (parsed), one without.
    const withReportPairId = await writeWorktreeSnapshot('aaaa000000000000', 'c4', true);
    const noReportPairId = await writeWorktreeSnapshot('bbbb111111111111', 'c3', false);
    // A third index entry whose source-record was never written -> skipped.
    const missingPairId = 'ffff999999999999';

    await fs.writeFile(
      path.join(indexDir, 'worktree-snapshots.json'),
      JSON.stringify(
        {
          schema: 'vi-history-suite/worktree-snapshot-index@v1',
          snapshots: [
            {
              snapshotId: 'aaaa000000000000',
              pairId: withReportPairId,
              baseHash: 'c4',
              reportType: 'diff',
              retainedAt: '2026-05-04T02:00:00.000Z',
              relativePath: model.relativePath
            },
            {
              snapshotId: 'bbbb111111111111',
              pairId: noReportPairId,
              baseHash: 'c3',
              reportType: 'diff',
              retainedAt: '2026-05-04T01:00:00.000Z',
              relativePath: model.relativePath
            },
            {
              snapshotId: missingPairId,
              pairId: 'deadbeefdead',
              baseHash: 'c2',
              reportType: 'diff',
              retainedAt: '2026-05-04T00:30:00.000Z',
              relativePath: model.relativePath
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    );

    const dashboard = await buildAndPersistMultiReportDashboard(storageRoot, model, {
      now: () => '2026-05-04T12:00:00.000Z'
    });

    const worktreeEntries = dashboard.record.entries.filter((entry) => entry.worktreeSnapshotId);
    // Two snapshots have source-records; the third (missing source-record) is skipped.
    expect(worktreeEntries.map((entry) => entry.worktreeSnapshotId).sort()).toEqual([
      'aaaa000000000000',
      'bbbb111111111111'
    ]);
    expect(worktreeEntries.every((entry) => entry.reproducible === false)).toBe(true);

    const withReportEntry = worktreeEntries.find(
      (entry) => entry.worktreeSnapshotId === 'aaaa000000000000'
    );
    // The generated report was parsed into overview/detail evidence.
    expect(withReportEntry?.generatedReportExists).toBe(true);
    expect((withReportEntry?.overviewImageCount ?? 0) + (withReportEntry?.detailItemCount ?? 0)).toBeGreaterThan(0);

    const noReportEntry = worktreeEntries.find(
      (entry) => entry.worktreeSnapshotId === 'bbbb111111111111'
    );
    // No report file on disk -> no parsed evidence, but the entry is still surfaced.
    expect(noReportEntry?.generatedReportExists).toBe(false);
    expect(noReportEntry?.evidenceCount).toBe(0);
  });

  it('surfaces overview images that cannot be materialized for single-file reports (VHS-REQ-640)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-unresolved-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const model = createModel();
    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: 'diff',
      selectedHash: 'c4',
      baseHash: 'c3'
    });
    // A report that references `_files` PNGs that were never written: the image
    // sources are neither data URIs nor on-disk files. Previously these images
    // were silently dropped; now the summary records the materialization
    // shortfall so single-file decode gaps do not disappear without a trace.
    await writeArchiveSourceRecord({
      storageRoot,
      model,
      selectedHash: 'c4',
      baseHash: 'c3',
      reportExists: true,
      singleFileReport: true,
      reportHtml: createNiReportHtml(archivePlan.reportAssetsDirectoryName)
    });

    const dashboard = await buildAndPersistMultiReportDashboard(storageRoot, model, {
      now: () => '2026-05-04T12:00:00.000Z'
    });

    const generatedEntry = dashboard.record.entries.find((entry) => entry.selectedHash === 'c4');
    expect(generatedEntry?.dashboardImageAssets).toHaveLength(0);
    expect(dashboard.record.summary.overviewImageCount).toBe(2);
    expect(dashboard.record.summary.materializedOverviewImageCount).toBe(0);
  });

  it('concentrates generated, blocked, and missing retained evidence into the dashboard record and HTML (VHS-REQ-610.1, VHS-REQ-610.2, VHS-REQ-610.3, VHS-REQ-610.5)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const model = createModel();
    const generatedArchivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: 'diff',
      selectedHash: 'c4',
      baseHash: 'c3'
    });
    await writeArchiveSourceRecord({
      storageRoot,
      model,
      selectedHash: 'c4',
      baseHash: 'c3',
      reportExists: true,
      reportHtml: createNiReportHtml(generatedArchivePlan.reportAssetsDirectoryName)
    });
    await writeArchiveSourceRecord({
      storageRoot,
      model,
      selectedHash: 'c3',
      baseHash: 'b2',
      reportStatus: 'blocked-preflight',
      runtimeExecutionState: 'not-run',
      reportExists: false,
      blockedReason: 'left revision is not a LabVIEW VI'
    });
    const reportProgress = vi.fn();

    const dashboard = await buildAndPersistMultiReportDashboard(storageRoot, model, {
      now: () => '2026-05-04T12:00:00.000Z',
      reportProgress
    });

    expect(dashboard.record.commitWindow).toMatchObject({
      commitCount: 4,
      pairCount: 3,
      newestHash: 'c4',
      oldestHash: 'a1'
    });
    expect(dashboard.record.summary).toMatchObject({
      representedPairCount: 3,
      windowCompletenessState: 'incomplete-missing-archives',
      archivedPairCount: 2,
      missingPairCount: 1,
      generatedReportCount: 1,
      reportMetadataPairCount: 1,
      blockedPairCount: 1,
      failedPairCount: 0,
      overviewSectionCount: 2,
      overviewImageCount: 2,
      includedAttributeCount: 2,
      detailSectionCount: 1,
      detailItemCount: 2
    });
    expect(dashboard.record.entries.map((entry) => entry.pairEvidenceState)).toEqual([
      'archived-generated-report',
      'archived-blocked',
      'missing-archive'
    ]);
    expect(dashboard.record.summary.overviewCaptionSummaries.map((summary) => summary.caption)).toEqual([
      'Block Diagram Overview',
      'Front Panel Overview'
    ]);
    expect(dashboard.record.summary.includedAttributeSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Front Panel', includedPairCount: 1 }),
        expect.objectContaining({ label: 'VI Attribute', excludedPairCount: 1 })
      ])
    );
    expect(dashboard.record.summary.detailHeadingSummaries).toEqual([
      expect.objectContaining({
        heading: '1. VI Attribute - Miscellaneous',
        pairCount: 1,
        itemCount: 2
      })
    ]);
    expect(dashboard.record.entries[0].dashboardImageAssets).toHaveLength(2);
    for (const asset of dashboard.record.entries[0].dashboardImageAssets) {
      await expect(
        fs.access(path.join(dashboard.record.artifactPlan.dashboardDirectory, asset.dashboardRelativePath))
      ).resolves.toBeUndefined();
    }
    await expect(fs.access(dashboard.jsonFilePath)).resolves.toBeUndefined();
    const html = await fs.readFile(dashboard.htmlFilePath, 'utf8');
    expect(html).toContain('data-testid="dashboard-pair-ledger"');
    expect(html).toContain('Block Diagram Overview');
    expect(html).toContain('VI Version : changed from &quot;21.0&quot; to &quot;20.0&quot;');
    expect(html).toContain('archived-blocked');
    // VHS-REQ-610: each pair with a parsed report leads with a concise semantic
    // "what changed" narrative derived from the shared VI semantic model. This
    // pair's only itemized change is a VI attribute, so the narrative leads with
    // the detailed-change count (the overview captions alone do not imply a
    // front-panel or block-diagram change).
    expect(html).toContain('data-testid="dashboard-entry-change-summary"');
    expect(html).toContain('What changed:');
    expect(html).toContain('2 detailed changes across 1 section');
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Concentrating retained comparison-report metadata')
      })
    );
  });

  it('degrades a single malformed retained source-record without aborting the whole dashboard (#2111)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-'));
    tempRoots.push(tempRoot);
    const storageRoot = path.join(tempRoot, 'workspace-storage');
    const model = createModel();
    const generatedArchivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: 'diff',
      selectedHash: 'c4',
      baseHash: 'c3'
    });
    // Pair c4/c3: a healthy generated report.
    await writeArchiveSourceRecord({
      storageRoot,
      model,
      selectedHash: 'c4',
      baseHash: 'c3',
      reportExists: true,
      reportHtml: createNiReportHtml(generatedArchivePlan.reportAssetsDirectoryName)
    });
    // Pair c3/b2: write a valid record, then corrupt its source-record file so
    // JSON.parse throws when the dashboard reads it.
    await writeArchiveSourceRecord({
      storageRoot,
      model,
      selectedHash: 'c3',
      baseHash: 'b2',
      reportExists: false
    });
    const corruptPlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: 'diff',
      selectedHash: 'c3',
      baseHash: 'b2'
    });
    await fs.writeFile(corruptPlan.sourceRecordFilePath, '{ this is not valid json', 'utf8');

    // The build completes instead of throwing, and only the corrupt pair degrades.
    const dashboard = await buildAndPersistMultiReportDashboard(storageRoot, model, {
      now: () => '2026-05-04T12:00:00.000Z'
    });

    const byPair = new Map(
      dashboard.record.entries.map((entry) => [`${entry.selectedHash}/${entry.baseHash}`, entry])
    );
    expect(byPair.get('c4/c3')?.pairEvidenceState).toBe('archived-generated-report');
    // The corrupt c3/b2 record degrades exactly like a missing archive.
    expect(byPair.get('c3/b2')?.pairEvidenceState).toBe('missing-archive');
    expect(byPair.get('c3/b2')?.archiveStatus).toBe('missing');
    // b2/a1 has no record at all -> also missing, and the whole window still built.
    expect(byPair.get('b2/a1')?.pairEvidenceState).toBe('missing-archive');
    expect(dashboard.record.commitWindow.pairCount).toBe(3);
    await expect(fs.access(dashboard.jsonFilePath)).resolves.toBeUndefined();
  });

  it('renders preparation and ETA evidence without mutating the retained dashboard record (VHS-REQ-610.4)', () => {
    const html = renderMultiReportDashboardHtml(
      {
        generatedAt: '2026-05-04T12:00:00.000Z',
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'Source/Sample.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repo',
          fileId: 'file',
          windowId: 'window',
          dashboardDirectory: '/workspace/storage/dashboards/repo/file/window',
          jsonFilePath: '/workspace/storage/dashboards/repo/file/window/dashboard.json',
          htmlFilePath: '/workspace/storage/dashboards/repo/file/window/dashboard.html',
          assetsDirectory: '/workspace/storage/dashboards/repo/file/window/assets'
        },
        commitWindow: {
          commitCount: 3,
          pairCount: 2,
          newestHash: 'c3',
          oldestHash: 'a1'
        },
        summary: {
          representedPairCount: 2,
          windowCompletenessState: 'complete',
          archivedPairCount: 2,
          missingPairCount: 0,
          missingPairIds: [],
          generatedReportCount: 1,
          reportMetadataPairCount: 1,
          failedPairCount: 0,
          failedPairIds: [],
          blockedPairCount: 1,
          blockedPairIds: ['blocked-pair'],
          overviewSectionCount: 0,
          overviewImageCount: 0,
          includedAttributeCount: 0,
          detailSectionCount: 0,
          detailItemCount: 0,
          pairWithOverviewImageCount: 0,
          pairWithDetailCount: 0,
          providerSummaries: [],
          overviewCaptionSummaries: [],
          includedAttributeSummaries: [],
          detailHeadingSummaries: [],
          evidenceStateSummaries: []
        },
        entries: []
      },
      {
        preparationSummary: {
          mode: 'backfilled-before-build',
          pairsNeedingEvidenceCount: 2,
          preparedPairCount: 2,
          preparedGeneratedReportCount: 1,
          preparedBlockedPairCount: 1,
          preparedFailedPairCount: 0,
          preparedNoGeneratedReportCount: 0,
          preparedMissingRetainedArchiveCount: 0
        },
        etaAccuracyRecord: {
          recordedAt: '2026-05-04T12:00:00.000Z',
          stage: 'pair-preparation',
          preparedPairCount: 2,
          etaEligiblePairCount: 1,
          measuredPairCount: 1,
          unmeasuredPairCount: 0,
          excludedPairCount: 1,
          samples: [],
          meanAbsoluteErrorSeconds: 8,
          maxAbsoluteErrorSeconds: 12,
          meanSignedErrorSeconds: -3
        }
      }
    );

    expect(html).toContain('data-testid="dashboard-preparation-summary"');
    expect(html).toContain('1 generated report');
    expect(html).toContain('1 blocked pair');
    expect(html).toContain('data-testid="dashboard-eta-accuracy-summary"');
    expect(html).toContain('mean-abs-error=0m 8s');
    expect(html).toContain('mean-bias=-0m 3s');
  });
});

describe('renderMultiReportDashboardHtml missing commit-window hashes (VHS-REQ-610.4)', () => {
  it("renders 'none' for an absent newest/oldest retained hash", () => {
    // A commit window with no newest/oldest hash (both optional) exercises the
    // `?? 'none'` fallbacks in the dashboard header.
    const html = renderMultiReportDashboardHtml({
      generatedAt: '2026-05-04T12:00:00.000Z',
      repositoryName: 'repo',
      repositoryRoot: '/workspace/repo',
      relativePath: 'Source/Sample.vi',
      signature: 'LVIN',
      artifactPlan: {
        repoId: 'repo',
        fileId: 'file',
        windowId: 'window',
        dashboardDirectory: '/workspace/storage/dashboards/repo/file/window',
        jsonFilePath: '/workspace/storage/dashboards/repo/file/window/dashboard.json',
        htmlFilePath: '/workspace/storage/dashboards/repo/file/window/dashboard.html',
        assetsDirectory: '/workspace/storage/dashboards/repo/file/window/assets'
      },
      commitWindow: { commitCount: 0, pairCount: 0 },
      summary: {
        representedPairCount: 0,
        windowCompletenessState: 'complete',
        archivedPairCount: 0,
        missingPairCount: 0,
        missingPairIds: [],
        generatedReportCount: 0,
        reportMetadataPairCount: 0,
        failedPairCount: 0,
        failedPairIds: [],
        blockedPairCount: 0,
        blockedPairIds: [],
        overviewSectionCount: 0,
        overviewImageCount: 0,
        includedAttributeCount: 0,
        detailSectionCount: 0,
        detailItemCount: 0,
        pairWithOverviewImageCount: 0,
        pairWithDetailCount: 0,
        providerSummaries: [],
        overviewCaptionSummaries: [],
        includedAttributeSummaries: [],
        detailHeadingSummaries: [],
        evidenceStateSummaries: []
      },
      entries: []
    });
    expect(html).toContain('<strong>Newest retained hash:</strong> none');
    expect(html).toContain('<strong>Oldest retained hash:</strong> none');
  });
});
