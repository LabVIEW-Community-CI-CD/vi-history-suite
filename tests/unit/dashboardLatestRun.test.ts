import { describe, expect, it } from 'vitest';

import {
  attachDashboardEtaAccuracyContext,
  buildDashboardLatestRunFilePath,
  buildDashboardLatestRunRecord
} from '../../src/dashboard/dashboardLatestRun';
import { MultiReportDashboardEtaAccuracyRecord } from '../../src/dashboard/dashboardEtaAccuracy';
import {
  BuildMultiReportDashboardResult,
  MultiReportDashboardPreparationSummary
} from '../../src/dashboard/multiReportDashboard';

describe('dashboardLatestRun', () => {
  it('builds latest-run artifact path and attaches eta context', () => {
    expect(buildDashboardLatestRunFilePath('/workspace/storage')).toBe(
      '/workspace/storage/dashboards/latest-dashboard-run.json'
    );

    const etaRecord = {
      recordedAt: '2026-05-01T00:00:00.000Z',
      stage: 'pair-preparation',
      preparedPairCount: 2,
      etaEligiblePairCount: 2,
      measuredPairCount: 1,
      unmeasuredPairCount: 1,
      excludedPairCount: 0,
      samples: []
    } as MultiReportDashboardEtaAccuracyRecord;
    const withContext = attachDashboardEtaAccuracyContext(etaRecord, {
      etaAccuracyFilePath: '/workspace/storage/dashboards/dashboard-pair-eta-accuracy.json'
    });

    expect(withContext?.context?.etaAccuracyFilePath).toBe(
      '/workspace/storage/dashboards/dashboard-pair-eta-accuracy.json'
    );
    expect(attachDashboardEtaAccuracyContext(undefined, { etaAccuracyFilePath: '/unused' })).toBeUndefined();
  });

  it('records dashboard latest-run summary and artifact paths', () => {
    const dashboard = {
      jsonFilePath: '/workspace/storage/dashboards/review/dashboard.json',
      htmlFilePath: '/workspace/storage/dashboards/review/dashboard.html',
      record: {
        generatedAt: '2026-05-01T00:00:05.000Z',
        repositoryName: 'vi-history-suite',
        repositoryRoot: '/workspace/repo',
        relativePath: 'src/My.vi',
        signature: {
          repositoryRoot: '/workspace/repo',
          relativePath: 'src/My.vi',
          commitHashes: ['a', 'b', 'c']
        },
        artifactPlan: {
          dashboardDirectory: '/workspace/storage/dashboards/review'
        },
        commitWindow: {
          commitCount: 3,
          pairCount: 2,
          newestHash: 'a',
          oldestHash: 'c'
        },
        summary: {
          representedPairCount: 2,
          windowCompletenessState: 'complete',
          archivedPairCount: 2,
          missingPairCount: 0,
          missingPairIds: [],
          generatedReportCount: 2,
          reportMetadataPairCount: 2,
          failedPairCount: 0,
          failedPairIds: [],
          blockedPairCount: 0,
          blockedPairIds: [],
          overviewImageCount: 3,
          detailItemCount: 4,
          providerSummaries: [{ providerId: 'host', count: 2 }]
        }
      }
    } as unknown as BuildMultiReportDashboardResult;

    const preparationSummary: MultiReportDashboardPreparationSummary = {
      mode: 'retained-evidence-complete',
      pairsNeedingEvidenceCount: 0,
      preparedPairCount: 0,
      preparedGeneratedReportCount: 0,
      preparedBlockedPairCount: 0,
      preparedFailedPairCount: 0,
      preparedNoGeneratedReportCount: 0,
      preparedMissingRetainedArchiveCount: 0
    };

    const etaAccuracyRecord = {
      recordedAt: '2026-05-01T00:00:04.000Z',
      stage: 'pair-preparation',
      preparedPairCount: 2,
      etaEligiblePairCount: 2,
      measuredPairCount: 2,
      unmeasuredPairCount: 0,
      excludedPairCount: 0,
      samples: [],
      context: {
        etaAccuracyFilePath: '/workspace/storage/dashboards/dashboard-pair-eta-accuracy.json'
      }
    } as MultiReportDashboardEtaAccuracyRecord;

    const latestRun = buildDashboardLatestRunRecord({
      source: 'vscode-dashboard-action',
      workspaceStorageRoot: '/workspace/storage',
      dashboard,
      preparationSummary,
      etaAccuracyRecord,
      recordedAt: '2026-05-01T00:00:10.000Z'
    });

    expect(latestRun.artifactPaths).toEqual({
      dashboardsDirectory: '/workspace/storage/dashboards',
      dashboardDirectory: '/workspace/storage/dashboards/review',
      dashboardJsonFilePath: '/workspace/storage/dashboards/review/dashboard.json',
      dashboardHtmlFilePath: '/workspace/storage/dashboards/review/dashboard.html',
      etaAccuracyFilePath: '/workspace/storage/dashboards/dashboard-pair-eta-accuracy.json'
    });
    expect(latestRun.dashboard.summary).toEqual({
      representedPairCount: 2,
      windowCompletenessState: 'complete',
      archivedPairCount: 2,
      missingPairCount: 0,
      missingPairIds: [],
      generatedReportCount: 2,
      reportMetadataPairCount: 2,
      failedPairCount: 0,
      failedPairIds: [],
      blockedPairCount: 0,
      blockedPairIds: [],
      overviewImageCount: 3,
      detailItemCount: 4,
      providerSummaries: [{ providerId: 'host', count: 2 }]
    });
    expect(latestRun.preparationSummary).toEqual(preparationSummary);
  });
});
