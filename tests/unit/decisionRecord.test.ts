import { describe, expect, it, vi } from 'vitest';

import {
  buildReviewDecisionRecordArtifactPlan,
  persistReviewDecisionRecord
} from '../../src/scenarios/decisionRecord';
import { getReviewScenarioDefinition } from '../../src/scenarios/reviewScenarioRegistry';

describe('decisionRecord', () => {
  it('builds a separate decision-record artifact plan from the dashboard packet', () => {
    const artifactPlan = buildReviewDecisionRecordArtifactPlan(
      '/tmp/storage',
      {
        repositoryName: 'labview-icon-editor',
        repositoryRoot: '/repo',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repo-id',
          fileId: 'file-id',
          windowId: 'window-id',
          dashboardDirectory: '/tmp/storage/dashboards/repo-id/file-id/window-id',
          jsonFilePath: '/tmp/storage/dashboards/repo-id/file-id/window-id/dashboard.json',
          htmlFilePath: '/tmp/storage/dashboards/repo-id/file-id/window-id/dashboard.html',
          assetsDirectory: '/tmp/storage/dashboards/repo-id/file-id/window-id/assets'
        },
        commitWindow: {
          commitCount: 3,
          pairCount: 2,
          newestHash: 'newest',
          oldestHash: 'oldest'
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
          overviewSectionCount: 1,
          overviewImageCount: 2,
          includedAttributeCount: 1,
          detailSectionCount: 1,
          detailItemCount: 2,
          pairWithOverviewImageCount: 1,
          pairWithDetailCount: 1,
          providerSummaries: [],
          overviewCaptionSummaries: [],
          includedAttributeSummaries: [],
          detailHeadingSummaries: [],
          evidenceStateSummaries: []
        },
        entries: []
      },
      'SCENARIO-VHS-001',
      'Reviewer',
      '2026-04-03T12:34:56.000Z'
    );

    expect(artifactPlan.decisionDirectory).toContain(
      '/tmp/storage/decision-records/repo-id/file-id/window-id/SCENARIO-VHS-001/'
    );
    expect(artifactPlan.jsonFilePath).toMatch(/decision-record\.json$/);
    expect(artifactPlan.markdownFilePath).toMatch(/decision-record\.md$/);
  });

  it('persists a decision record separately from the dashboard packet', async () => {
    const mkdir = vi.fn(async () => undefined);
    const writeFile = vi.fn(async () => undefined);
    const scenario = getReviewScenarioDefinition('SCENARIO-VHS-001');

    const persisted = await persistReviewDecisionRecord(
      '/tmp/storage',
      {
        scenario,
        harnessId: 'HARNESS-VHS-001',
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        dashboardRecord: {
          repositoryName: 'labview-icon-editor',
          repositoryRoot: '/repo',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          signature: 'LVIN',
          artifactPlan: {
            repoId: 'repo-id',
            fileId: 'file-id',
            windowId: 'window-id',
            dashboardDirectory: '/tmp/storage/dashboards/repo-id/file-id/window-id',
            jsonFilePath: '/tmp/storage/dashboards/repo-id/file-id/window-id/dashboard.json',
            htmlFilePath: '/tmp/storage/dashboards/repo-id/file-id/window-id/dashboard.html',
            assetsDirectory: '/tmp/storage/dashboards/repo-id/file-id/window-id/assets'
          },
          commitWindow: {
            commitCount: 3,
            pairCount: 2,
            newestHash: 'newest',
            oldestHash: 'oldest'
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
            overviewSectionCount: 1,
            overviewImageCount: 2,
            includedAttributeCount: 1,
            detailSectionCount: 1,
            detailItemCount: 2,
            pairWithOverviewImageCount: 1,
            pairWithDetailCount: 1,
            providerSummaries: [],
            overviewCaptionSummaries: [],
            includedAttributeSummaries: [],
            detailHeadingSummaries: [],
            evidenceStateSummaries: []
          },
          entries: []
        },
        dashboardHtmlPath: '/tmp/storage/dashboards/repo-id/file-id/window-id/dashboard.html',
        dashboardJsonPath: '/tmp/storage/dashboards/repo-id/file-id/window-id/dashboard.json',
        reviewer: 'Reviewer',
        reviewQuestion: 'Does the VI need more manual review?',
        outcome: 'needs-more-review',
        confidence: 'medium',
        decisionRationale: 'The concentrated metadata still shows multiple affected areas.',
        pairwiseReportPaths: ['/tmp/report-a.html', '/tmp/report-b.html'],
        missingOrBlockedFacts: ['Blocked pair evidence: pair-a'],
        additionalReportGenerationRequired: true,
        additionalManualLabVIEWInspectionRequired: true,
        issuesOrBacklogItemsCreated: ['ISSUE-0999']
      },
      {
        now: () => '2026-04-03T12:34:56.000Z',
        mkdir,
        writeFile
      }
    );

    expect(persisted.record.reviewerOutcome).toEqual({
      outcome: 'needs-more-review',
      confidence: 'medium',
      decisionRationale: 'The concentrated metadata still shows multiple affected areas.'
    });
    expect(persisted.record.evidenceUsed.underlyingPairwiseReportPaths).toEqual([
      '/tmp/report-a.html',
      '/tmp/report-b.html'
    ]);
    expect(persisted.record.followUp).toEqual({
      additionalReportGenerationRequired: true,
      additionalManualLabVIEWInspectionRequired: true,
      issuesOrBacklogItemsCreated: ['ISSUE-0999']
    });
    expect(mkdir).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledTimes(2);
  });
});
