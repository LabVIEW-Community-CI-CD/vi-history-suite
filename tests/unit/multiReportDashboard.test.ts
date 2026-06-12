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
      allowBenchmarkStatus: true,
      allowHumanReviewSubmission: true
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

  it('concentrates generated, blocked, and missing retained evidence into the dashboard record and HTML', async () => {
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
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Concentrating retained comparison-report metadata')
      })
    );
  });

  it('renders preparation and ETA evidence without mutating the retained dashboard record', () => {
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
