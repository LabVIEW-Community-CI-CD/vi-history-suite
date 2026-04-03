import { describe, expect, it, vi } from 'vitest';

import {
  renderHarnessDashboardSmokeHtml,
  renderHarnessDashboardSmokeMarkdown,
  runHarnessDashboardSmoke
} from '../../src/harness/harnessDashboardSmoke';

describe('harness dashboard smoke renderers', () => {
  const report = {
    harnessId: 'HARNESS-VHS-001',
    repositoryUrl: 'https://github.com/ni/labview-icon-editor',
    cloneDirectory: '/tmp/harnesses/ni-labview-icon-editor',
    targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    head: 'abcdef1234567890',
    generatedAt: '2026-04-03T00:00:00.000Z',
    eligible: true,
    signature: 'LVIN' as const,
    dashboardCommitWindow: 3,
    comparePairCount: 2,
    dashboardFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/dashboards/repo/file/window/dashboard.html',
    dashboardJsonFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/dashboards/repo/file/window/dashboard.json',
    dashboardWindowCompletenessState: 'complete' as const,
    dashboardArchivedPairCount: 2,
    dashboardMissingPairCount: 0,
    dashboardGeneratedReportCount: 2,
    dashboardMetadataPairCount: 2,
    dashboardOverviewImageCount: 4,
    dashboardDetailItemCount: 6,
    dashboardProviderSummaries: [{ label: 'windows-container / lvcompare / x64 / win32', pairCount: 2 }],
    pairSummaries: [
      {
        pairId: 'pair123',
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        reportStatus: 'ready-for-runtime' as const,
        runtimeExecutionState: 'succeeded' as const,
        runtimeProvider: 'windows-container',
        runtimeEngine: 'lvcompare',
        generatedReportExists: true,
        packetFilePath: '/tmp/report-packet.html',
        reportFilePath: '/tmp/diff-report-foo.vi.html',
        metadataFilePath: '/tmp/report-metadata.json',
        sourceRecordFilePath: '/tmp/source-record.json'
      }
    ]
  };

  it('renders markdown with dashboard smoke summary facts', () => {
    const markdown = renderHarnessDashboardSmokeMarkdown(report);

    expect(markdown).toContain('Harness Dashboard Smoke');
    expect(markdown).toContain('Dashboard commit window: 3');
    expect(markdown).toContain('Dashboard completeness: complete');
    expect(markdown).toContain('Dashboard archived pairs: 2');
    expect(markdown).toContain('Dashboard metadata pairs: 2');
    expect(markdown).toContain('windows-container / lvcompare / x64 / win32=2');
    expect(markdown).toContain('abcdef12');
    expect(markdown).toContain('metadata=yes');
  });

  it('renders html with dashboard smoke summary facts', () => {
    const html = renderHarnessDashboardSmokeHtml(report);

    expect(html).toContain('Harness Dashboard Smoke');
    expect(html).toContain('Dashboard completeness:</strong> complete');
    expect(html).toContain('Dashboard archived pairs:</strong> 2');
    expect(html).toContain('Dashboard metadata pairs:</strong> 2');
    expect(html).toContain('windows-container / lvcompare / x64 / win32=2');
    expect(html).toContain('<td>windows-container</td>');
  });
});

describe('runHarnessDashboardSmoke', () => {
  it('retains a factual dashboard smoke artifact set for the canonical harness', async () => {
    const writes = new Map<string, string>();

    const result = await runHarnessDashboardSmoke(
      'HARNESS-VHS-001',
      {
        cloneRoot: '/tmp/harnesses',
        reportRoot: '/tmp/reports',
        runtimePlatform: 'win32',
        dashboardCommitWindow: 3
      },
      {
        ensureHarnessClone: vi.fn().mockResolvedValue('/tmp/harnesses/ni-labview-icon-editor') as never,
        getRepoHead: vi.fn().mockResolvedValue('abcdef1234567890') as never,
        loadViHistoryViewModelFromFsPath: vi.fn().mockResolvedValue({
          repositoryName: 'ni-labview-icon-editor',
          repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: '3333333344444444',
              authorDate: '2026-04-03T00:00:00Z',
              authorName: 'A User',
              subject: 'Newest',
              previousHash: '1111111122222222'
            },
            {
              hash: '1111111122222222',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'B User',
              subject: 'Middle',
              previousHash: 'aaaaaaaa55555555'
            },
            {
              hash: 'aaaaaaaa55555555',
              authorDate: '2026-04-01T00:00:00Z',
              authorName: 'C User',
              subject: 'Oldest'
            }
          ]
        }) as never,
        evaluateViEligibilityForFsPath: vi.fn().mockResolvedValue({
          eligible: true,
          signature: 'LVIN'
        }) as never,
        executeHarnessComparisonReportForCommit: vi
          .fn()
          .mockResolvedValueOnce({
            record: {
              selectedHash: '3333333344444444',
              baseHash: '1111111122222222',
              reportStatus: 'ready-for-runtime',
              runtimeExecutionState: 'succeeded',
              runtimeSelection: {
                provider: 'windows-container',
                engine: 'lvcompare'
              },
              runtimeExecution: {
                reportExists: true
              }
            },
            packetFilePath: '/tmp/report-packet-a.html',
            reportFilePath: '/tmp/diff-report-a.html',
            metadataFilePath: '/tmp/report-metadata-a.json',
            archivedSourceRecord: {
              archivePlan: {
                sourceRecordFilePath: '/tmp/source-record-a.json'
              }
            }
          })
          .mockResolvedValueOnce({
            record: {
              selectedHash: '1111111122222222',
              baseHash: 'aaaaaaaa55555555',
              reportStatus: 'ready-for-runtime',
              runtimeExecutionState: 'failed',
              runtimeSelection: {
                provider: 'windows-container',
                engine: 'lvcompare'
              },
              runtimeExecution: {
                reportExists: false
              }
            },
            packetFilePath: '/tmp/report-packet-b.html',
            reportFilePath: '/tmp/diff-report-b.html',
            metadataFilePath: '/tmp/report-metadata-b.json',
            archivedSourceRecord: {
              archivePlan: {
                sourceRecordFilePath: '/tmp/source-record-b.json'
              }
            }
          }) as never,
        buildDashboard: vi.fn().mockResolvedValue({
          record: {
            summary: {
              windowCompletenessState: 'complete',
              archivedPairCount: 2,
              missingPairCount: 0,
              generatedReportCount: 1,
              reportMetadataPairCount: 1,
              overviewImageCount: 2,
              detailItemCount: 5,
              providerSummaries: [{ label: 'windows-container / lvcompare / x64 / win32', pairCount: 2 }]
            }
          },
          jsonFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/dashboards/repo/file/window/dashboard.json',
          htmlFilePath: '/tmp/reports/HARNESS-VHS-001/workspace-storage/dashboards/repo/file/window/dashboard.html'
        }) as never,
        mkdir: vi.fn().mockResolvedValue(undefined) as never,
        writeFile: vi.fn(async (filePath: string, contents: string) => {
          writes.set(filePath, contents);
        }) as never,
        now: () => '2026-04-03T00:00:00.000Z'
      }
    );

    expect(result.report.dashboardCommitWindow).toBe(3);
    expect(result.report.comparePairCount).toBe(2);
    expect(result.report.dashboardArchivedPairCount).toBe(2);
    expect(result.report.dashboardMissingPairCount).toBe(0);
    expect(result.report.dashboardGeneratedReportCount).toBe(1);
    expect(result.report.dashboardMetadataPairCount).toBe(1);
    expect(result.report.dashboardOverviewImageCount).toBe(2);
    expect(result.report.dashboardDetailItemCount).toBe(5);
    expect(result.report.pairSummaries).toHaveLength(2);
    expect(result.report.pairSummaries[0]).toMatchObject({
      selectedHash: '3333333344444444',
      baseHash: '1111111122222222',
      generatedReportExists: true
    });
    expect(result.reportJsonPath).toBe('/tmp/reports/HARNESS-VHS-001/dashboard-smoke.json');
    expect(result.reportMarkdownPath).toBe('/tmp/reports/HARNESS-VHS-001/dashboard-smoke.md');
    expect(result.reportHtmlPath).toBe('/tmp/reports/HARNESS-VHS-001/dashboard-smoke.html');
    expect(writes.get(result.reportJsonPath)).toContain('"dashboardArchivedPairCount": 2');
    expect(writes.get(result.reportMarkdownPath)).toContain('Harness Dashboard Smoke');
    expect(writes.get(result.reportHtmlPath)).toContain('Harness Dashboard Smoke');
  });
});
