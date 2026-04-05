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
    dashboardEtaAccuracyFilePath:
      '/tmp/reports/HARNESS-VHS-001/workspace-storage/dashboards/repo/file/window/dashboard-pair-eta-accuracy.json',
    dashboardEtaAccuracyRecord: {
      recordedAt: '2026-04-03T00:00:00.000Z',
      stage: 'pair-preparation' as const,
      preparedPairCount: 2,
      etaEligiblePairCount: 2,
      measuredPairCount: 1,
      unmeasuredPairCount: 1,
      excludedPairCount: 0,
      meanAbsoluteErrorSeconds: 4,
      maxAbsoluteErrorSeconds: 4,
      meanSignedErrorSeconds: -4,
      meanAbsolutePercentageError: 20,
      samples: []
    },
    completionState: 'completed' as const,
    processedPairCount: 1,
    terminalPairIndex: undefined,
    terminalPairFailureReason: undefined,
    comparabilityState: 'comparable-to-windows-baseline' as const,
    pairSummaries: [
      {
        pairId: 'pair123',
        pairIndex: 1,
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        reportStatus: 'ready-for-runtime' as const,
        runtimeExecutionState: 'succeeded' as const,
        runtimeProvider: 'windows-container',
        runtimeEngine: 'lvcompare',
        runtimeFailureReason: undefined,
        runtimeDiagnosticReason: undefined,
        generatedReportExists: true,
        packetFilePath: '/tmp/report-packet.html',
        reportFilePath: '/tmp/diff-report-foo.vi.html',
        metadataFilePath: '/tmp/report-metadata.json',
        sourceRecordFilePath: '/tmp/source-record.json',
        runtimeStdoutPath: undefined,
        runtimeStderrPath: undefined,
        runtimeDiagnosticLogPath: undefined,
        runtimeProcessObservationPath: undefined,
        actualPreparationSeconds: 24,
        estimatedPreparationSeconds: 20,
        absoluteEtaErrorSeconds: 4,
        signedEtaErrorSeconds: 4
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
    expect(markdown).toContain('Dashboard ETA accuracy: measured=1/2');
    expect(markdown).toContain('windows-container / lvcompare / x64 / win32=2');
    expect(markdown).toContain('abcdef12');
    expect(markdown).toContain('metadata=yes');
    expect(markdown).toContain('actual-prep=24s');
    expect(markdown).toContain('estimated-prep=20s');
  });

  it('renders html with dashboard smoke summary facts', () => {
    const html = renderHarnessDashboardSmokeHtml(report);

    expect(html).toContain('Harness Dashboard Smoke');
    expect(html).toContain('Dashboard completeness:</strong> complete');
    expect(html).toContain('Dashboard archived pairs:</strong> 2');
    expect(html).toContain('Dashboard metadata pairs:</strong> 2');
    expect(html).toContain('Dashboard ETA accuracy:</strong> measured=1/2');
    expect(html).toContain('windows-container / lvcompare / x64 / win32=2');
    expect(html).toContain('<td>windows-container</td>');
    expect(html).toContain('<td>24s</td>');
    expect(html).toContain('<td>20s</td>');
  });
});

describe('runHarnessDashboardSmoke', () => {
  it('retains a factual dashboard smoke artifact set for the canonical harness', async () => {
    const writes = new Map<string, string>();

    let currentNowMs = Date.parse('2026-04-03T00:00:00.000Z');
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
          .mockImplementationOnce(async () => {
            currentNowMs += 12_000;
            return {
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
            };
          })
          .mockImplementationOnce(async () => {
            currentNowMs += 18_000;
            return {
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
            };
          }) as never,
        buildDashboard: vi.fn().mockResolvedValue({
          record: {
            generatedAt: '2026-04-03T00:00:00.000Z',
            repositoryName: 'ni-labview-icon-editor',
            repositoryRoot: '/tmp/harnesses/ni-labview-icon-editor',
            relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
            signature: 'LVIN',
            artifactPlan: {
              dashboardDirectory:
                '/tmp/reports/HARNESS-VHS-001/workspace-storage/dashboards/repo/file/window'
            },
            commitWindow: {
              commitCount: 3,
              pairCount: 2,
              newestHash: '3333333344444444',
              oldestHash: 'aaaaaaaa55555555'
            },
            summary: {
              representedPairCount: 2,
              windowCompletenessState: 'complete',
              archivedPairCount: 2,
              missingPairCount: 0,
              missingPairIds: [],
              generatedReportCount: 1,
              reportMetadataPairCount: 1,
              failedPairCount: 1,
              failedPairIds: ['pair-b'],
              blockedPairCount: 0,
              blockedPairIds: [],
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
        now: () => '2026-04-03T00:00:00.000Z',
        nowMs: () => currentNowMs
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
    expect(result.report.dashboardEtaAccuracyFilePath).toBe(
      '/tmp/reports/HARNESS-VHS-001/workspace-storage/dashboards/repo/file/window/dashboard-pair-eta-accuracy.json'
    );
    expect(result.report.dashboardEtaAccuracyRecord).toMatchObject({
      preparedPairCount: 2,
      etaEligiblePairCount: 1,
      measuredPairCount: 0,
      unmeasuredPairCount: 1,
      excludedPairCount: 1,
      meanAbsoluteErrorSeconds: undefined,
      maxAbsoluteErrorSeconds: undefined,
      meanSignedErrorSeconds: undefined,
      meanAbsolutePercentageError: undefined
    });
    expect(result.report.dashboardEtaAccuracyRecord?.context).toMatchObject({
      source: 'harness-dashboard-smoke',
      workspaceStorageRoot: '/tmp/reports/HARNESS-VHS-001/workspace-storage',
      repositoryName: 'ni-labview-icon-editor',
      relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi'
    });
    expect(result.report.pairSummaries).toHaveLength(2);
    expect(result.report.completionState).toBe('failed');
    expect(result.report.processedPairCount).toBe(2);
    expect(result.report.terminalPairIndex).toBe(2);
    expect(result.report.terminalPairFailureReason).toBe('runtime-execution-failed');
    expect(result.report.comparabilityState).toBe('characterization-only');
    expect(result.report.pairSummaries[0]).toMatchObject({
      pairIndex: 1,
      selectedHash: '3333333344444444',
      baseHash: '1111111122222222',
      generatedReportExists: true,
      actualPreparationSeconds: 12,
      estimatedPreparationSeconds: undefined
    });
    expect(result.report.pairSummaries[1]).toMatchObject({
      pairIndex: 2,
      runtimeFailureReason: undefined,
      actualPreparationSeconds: 18,
      estimatedPreparationSeconds: 12,
      absoluteEtaErrorSeconds: 6,
      signedEtaErrorSeconds: 6
    });
    expect(result.reportJsonPath).toBe('/tmp/reports/HARNESS-VHS-001/dashboard-smoke.json');
    expect(result.reportMarkdownPath).toBe('/tmp/reports/HARNESS-VHS-001/dashboard-smoke.md');
    expect(result.reportHtmlPath).toBe('/tmp/reports/HARNESS-VHS-001/dashboard-smoke.html');
    expect(writes.get(result.reportJsonPath)).toContain('"dashboardArchivedPairCount": 2');
    expect(writes.get(result.reportJsonPath)).toContain('"dashboardEtaAccuracyFilePath"');
    expect(
      writes.get('/tmp/reports/HARNESS-VHS-001/workspace-storage/dashboards/latest-dashboard-run.json')
    ).toContain('"source": "harness-dashboard-smoke"');
    expect(writes.get(result.reportMarkdownPath)).toContain('Harness Dashboard Smoke');
    expect(writes.get(result.reportMarkdownPath)).toContain(
      'Dashboard ETA accuracy: not-yet-measurable (1 eta-eligible pair(s), 1 excluded)'
    );
    expect(writes.get(result.reportHtmlPath)).toContain('Harness Dashboard Smoke');
    expect(writes.get(result.reportHtmlPath)).toContain(
      'Dashboard ETA accuracy:</strong> not-yet-measurable (1 eta-eligible pair(s), 1 excluded)'
    );
  });

  it('stamps dashboard smoke output with the default ISO clock when no now override is supplied', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T00:00:00.000Z'));

    try {
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
            .mockResolvedValue({
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
            }) as never,
          buildDashboard: vi.fn().mockResolvedValue({
            record: {
              artifactPlan: {
                dashboardDirectory:
                  '/tmp/reports/HARNESS-VHS-001/workspace-storage/dashboards/repo/file/window'
              },
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
          writeFile: vi.fn().mockResolvedValue(undefined) as never
        }
      );

      expect(result.report.generatedAt).toBe('2026-04-03T00:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });
});
