import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import { createMultiReportDashboardAction } from '../../src/dashboard/multiReportDashboardAction';
import type { BuildMultiReportDashboardResult } from '../../src/dashboard/multiReportDashboard';
import type { ComparisonReportActionResult } from '../../src/reporting/comparisonReportAction';
import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';
import { defaultVsCodeTestHarness as harness } from './vscodeTestHarness';

function createModel(overrides: Partial<ViHistoryViewModel> = {}): ViHistoryViewModel {
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
    ],
    ...overrides
  };
}

function createDashboardResult(model = createModel()): BuildMultiReportDashboardResult {
  return {
    jsonFilePath: '/workspace/storage/dashboards/review/dashboard.json',
    htmlFilePath: '/workspace/storage/dashboards/review/dashboard.html',
    record: {
      generatedAt: '2026-05-04T12:00:00.000Z',
      repositoryName: model.repositoryName,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      signature: model.signature,
      artifactPlan: {
        repoId: 'repo',
        fileId: 'file',
        windowId: 'window',
        dashboardDirectory: '/workspace/storage/dashboards/review',
        jsonFilePath: '/workspace/storage/dashboards/review/dashboard.json',
        htmlFilePath: '/workspace/storage/dashboards/review/dashboard.html',
        assetsDirectory: '/workspace/storage/dashboards/review/assets'
      },
      commitWindow: {
        commitCount: model.commits.length,
        pairCount: Math.max(0, model.commits.length - 1),
        newestHash: model.commits[0]?.hash,
        oldestHash: model.commits.at(-1)?.hash
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
    }
  };
}

describe('multi-report dashboard action routing (VHS-REQ-610)', () => {
  beforeEach(() => {
    harness.reset();
  });

  it('returns explicit guard outcomes before dashboard preparation', async () => {
    const context = harness.createContext();
    const action = createMultiReportDashboardAction(context as never);
    harness.setWorkspaceTrusted(false);

    await expect(action({ model: createModel() })).resolves.toEqual({
      outcome: 'workspace-untrusted'
    });

    harness.setWorkspaceTrusted(true);
    const missingStorageAction = createMultiReportDashboardAction(
      harness.createContext({ storageUri: undefined }) as never
    );
    await expect(missingStorageAction({ model: createModel() })).resolves.toEqual({
      outcome: 'missing-storage-uri'
    });

    await expect(action({ model: createModel({ commits: createModel().commits.slice(0, 2) }) })).resolves.toEqual({
      outcome: 'insufficient-commits'
    });
  });

  it('backfills missing pair evidence, opens the dashboard, and routes retained artifact messages', async () => {
    const context = harness.createContext();
    const model = createModel();
    const buildDashboard = vi.fn().mockResolvedValue(createDashboardResult(model));
    const readArchivedComparisonReportSourceRecord = vi.fn().mockResolvedValue(undefined);
    const seedRetainedDashboardEvidence = vi.fn().mockResolvedValue({
      importedPairCount: 0,
      importedGeneratedPairCount: 0,
      importedFailedPairCount: 0,
      importedBlockedPairCount: 0,
      candidateCount: 0
    });
    const ensureComparisonReportEvidence = vi
      .fn<[(typeof model)['commits'][number]], Promise<ComparisonReportActionResult>>()
      .mockResolvedValueOnce({
        outcome: 'opened-comparison-report',
        generatedReportExists: true,
        retainedArchiveAvailable: true
      } as ComparisonReportActionResult)
      .mockResolvedValueOnce({
        outcome: 'opened-comparison-report',
        generatedReportExists: false,
        reportStatus: 'blocked-preflight',
        blockedReason: 'preflight blocked',
        retainedArchiveAvailable: true
      } as ComparisonReportActionResult);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const readFile = vi.fn().mockResolvedValue(
      '<html><head></head><body>generated report' +
        '<img class="difference-image" src="diff-report-Sample.vi_files/0_0_1.png" alt="diff-report-Sample.vi_files/0_0_1.png">' +
        '</body></html>'
    );
    const reportProgress = vi.fn();
    let clock = Date.parse('2026-05-04T12:00:00.000Z');
    const action = createMultiReportDashboardAction(context as never, {
      buildDashboard,
      readArchivedComparisonReportSourceRecord,
      seedRetainedDashboardEvidence,
      ensureComparisonReportEvidence: ensureComparisonReportEvidence as never,
      pathExists: async (targetPath) => targetPath === '/workspace/storage/dashboards/review',
      writeFile,
      readFile,
      now: () => {
        clock += 50;
        return clock;
      },
      getHistoryServiceSettings: () => ({
        strictRsrcHeader: true,
        historyWindowMode: 'auto',
        maxHistoryEntries: 100,
        historyLimit: 1000
      }),
      getRuntimeSettings: () => ({
        requestedProvider: 'host',
        requireVersionAndBitness: true,
        bitness: 'x64',
        labviewVersion: '2026'
      })
    });

    const result = await action({ model, reportProgress });

    expect(result).toEqual({
      outcome: 'opened-review-dashboard',
      dashboardFilePath: '/workspace/storage/dashboards/review/dashboard.html',
      dashboardJsonFilePath: '/workspace/storage/dashboards/review/dashboard.json',
      dashboardPairCount: 2,
      dashboardArchivedPairCount: 2,
      dashboardMissingPairCount: 0,
      title: 'VI Review Dashboard: VIP_Pre-Install Custom Action.vi'
    });
    expect(seedRetainedDashboardEvidence).toHaveBeenCalledWith('/workspace/storage', model);
    expect(readArchivedComparisonReportSourceRecord).toHaveBeenCalledTimes(2);
    expect(ensureComparisonReportEvidence).toHaveBeenCalledTimes(2);
    for (const call of ensureComparisonReportEvidence.mock.calls) {
      expect(call[0]).toMatchObject({
        model,
        headlessRequested: true
      });
    }
    expect(buildDashboard).toHaveBeenCalledWith(
      '/workspace/storage',
      model,
      expect.objectContaining({
        pairConcentrationIncrementTotal: 30,
        assetIncrementTotal: 10
      })
    );
    expect(writeFile).toHaveBeenCalledWith(
      '/workspace/storage/dashboards/latest-dashboard-run.json',
      expect.stringContaining('"source": "vscode-dashboard-action"'),
      'utf8'
    );
    expect(harness.panels[0].webview.html).toContain('data-testid="dashboard-preparation-summary"');
    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Preparing 2 dashboard pair')
      })
    );

    await harness.panels[0].dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/storage/dashboards/review/diff-report-Sample.vi.html',
      kind: 'report-html',
      label: 'Generated report'
    });
    expect(harness.panels[1].viewType).toBe('viHistorySuite.reviewDashboardArtifact');
    expect(harness.panels[1].webview.html).toContain('generated report');
    // Report images load lazily so large reports do not exhaust the webview
    // resource loader and fall back to alt text.
    expect(harness.panels[1].webview.html).toContain(
      '<img loading="lazy" class="difference-image" src="diff-report-Sample.vi_files/0_0_1.png"'
    );

    await harness.panels[0].dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/storage/dashboards/review/diff-report-Sample.vi.html',
      kind: 'metadata-json',
      label: 'Bad metadata link'
    });
    expect(harness.vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'VI Review Dashboard ignored an artifact path that did not match the retained artifact contract.'
    );

    await harness.panels[0].dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/tmp/outside/report-metadata.json',
      kind: 'metadata-json',
      label: 'Outside storage'
    });
    expect(harness.vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'VI Review Dashboard ignored an artifact path outside workspace-scoped extension storage.'
    );
  });
});
