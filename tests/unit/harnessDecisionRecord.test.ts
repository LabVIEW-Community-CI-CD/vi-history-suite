import { describe, expect, it, vi } from 'vitest';

import { runHarnessDecisionRecord } from '../../src/harness/harnessDecisionRecord';

describe('harnessDecisionRecord', () => {
  it('creates a separate decision record from canonical dashboard smoke evidence', async () => {
    const runDashboardSmoke = vi.fn(async () => ({
      report: {
        harnessId: 'HARNESS-VHS-001',
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        cloneDirectory: '/tmp/clone',
        targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        head: 'head',
        generatedAt: '2026-04-03T12:34:56.000Z',
        eligible: true,
        signature: 'LVIN',
        dashboardCommitWindow: 3,
        comparePairCount: 2,
        dashboardFilePath: '/tmp/reports/dashboard.html',
        dashboardJsonFilePath: '/tmp/reports/dashboard.json',
        dashboardWindowCompletenessState: 'complete',
        dashboardArchivedPairCount: 2,
        dashboardMissingPairCount: 0,
        dashboardGeneratedReportCount: 2,
        dashboardMetadataPairCount: 2,
        dashboardOverviewImageCount: 3,
        dashboardDetailItemCount: 4,
        dashboardProviderSummaries: [{ label: 'windows-container-x64', pairCount: 2 }],
        pairSummaries: [
          {
            selectedHash: 'aaaa',
            baseHash: 'bbbb',
            reportStatus: 'ready-for-runtime',
            runtimeExecutionState: 'succeeded',
            generatedReportExists: true,
            packetFilePath: '/tmp/a-packet.json',
            reportFilePath: '/tmp/a-report.html',
            metadataFilePath: '/tmp/a-metadata.json'
          },
          {
            selectedHash: 'cccc',
            baseHash: 'dddd',
            reportStatus: 'ready-for-runtime',
            runtimeExecutionState: 'succeeded',
            generatedReportExists: true,
            packetFilePath: '/tmp/b-packet.json',
            reportFilePath: '/tmp/b-report.html',
            metadataFilePath: '/tmp/b-metadata.json'
          }
        ]
      },
      reportJsonPath: '/tmp/reports/dashboard-smoke.json',
      reportMarkdownPath: '/tmp/reports/dashboard-smoke.md',
      reportHtmlPath: '/tmp/reports/dashboard-smoke.html'
    }));
    const readFile = vi.fn(async () =>
      JSON.stringify({
        repositoryName: 'labview-icon-editor',
        repositoryRoot: '/tmp/clone',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repo-id',
          fileId: 'file-id',
          windowId: 'window-id',
          dashboardDirectory: '/tmp/workspace-storage/dashboards/repo-id/file-id/window-id',
          jsonFilePath: '/tmp/reports/dashboard.json',
          htmlFilePath: '/tmp/reports/dashboard.html',
          assetsDirectory: '/tmp/workspace-storage/dashboards/repo-id/file-id/window-id/assets'
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
      })
    );
    const persistDecisionRecord = vi.fn(async () => ({
      artifactPlan: {
        scenarioId: 'SCENARIO-VHS-001',
        decisionId: 'decision-id',
        decisionDirectory: '/tmp/workspace-storage/decision-records/repo-id/file-id/window-id/SCENARIO-VHS-001/decision-id',
        jsonFilePath:
          '/tmp/workspace-storage/decision-records/repo-id/file-id/window-id/SCENARIO-VHS-001/decision-id/decision-record.json',
        markdownFilePath:
          '/tmp/workspace-storage/decision-records/repo-id/file-id/window-id/SCENARIO-VHS-001/decision-id/decision-record.md'
      },
      record: {
        generatedAt: '2026-04-03T12:34:56.000Z'
      }
    }));

    const result = await runHarnessDecisionRecord(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports',
        reviewer: 'Reviewer',
        reviewQuestion: 'Does this VI need more review?',
        outcome: 'needs-more-review',
        confidence: 'medium',
        decisionRationale: 'The concentrated metadata spans multiple sections.',
        issuesOrBacklogItemsCreated: ['ISSUE-0999']
      },
      {
        runDashboardSmoke,
        readFile,
        persistDecisionRecord
      }
    );

    expect(result.report.scenarioId).toBe('SCENARIO-VHS-001');
    expect(result.report.decisionRecordJsonPath).toMatch(/decision-record\.json$/);
    expect(persistDecisionRecord).toHaveBeenCalledOnce();
  });

  it('fails closed when scenario evidence does not satisfy the scenario contract', async () => {
    await expect(
      runHarnessDecisionRecord(
        'HARNESS-VHS-001',
        {
          cloneRoot: '/tmp/harnesses',
          reportRoot: '/tmp/reports',
          reviewer: 'Reviewer',
          reviewQuestion: 'Question',
          outcome: 'approved',
          confidence: 'high',
          decisionRationale: 'Rationale'
        },
        {
          runDashboardSmoke: vi.fn(async () => ({
            report: {
              harnessId: 'HARNESS-VHS-001',
              repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
              cloneDirectory: '/tmp/clone',
              targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
              head: 'head',
              generatedAt: '2026-04-03T12:34:56.000Z',
              eligible: true,
              signature: 'LVIN',
              dashboardCommitWindow: 2,
              comparePairCount: 1,
              dashboardFilePath: '/tmp/reports/dashboard.html',
              dashboardJsonFilePath: '/tmp/reports/dashboard.json',
              dashboardWindowCompletenessState: 'complete',
              dashboardArchivedPairCount: 1,
              dashboardMissingPairCount: 0,
              dashboardGeneratedReportCount: 1,
              dashboardMetadataPairCount: 1,
              dashboardOverviewImageCount: 1,
              dashboardDetailItemCount: 1,
              dashboardProviderSummaries: [],
              pairSummaries: []
            },
            reportJsonPath: '/tmp/reports/dashboard-smoke.json',
            reportMarkdownPath: '/tmp/reports/dashboard-smoke.md',
            reportHtmlPath: '/tmp/reports/dashboard-smoke.html'
          }))
        }
      )
    ).rejects.toThrow('Scenario SCENARIO-VHS-001 requires at least 3 commits, got 2.');
  });
});
