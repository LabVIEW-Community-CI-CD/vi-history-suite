import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createWebviewPanelMock,
  executeCommandMock,
  showWarningMessageMock,
  workspaceState
} = vi.hoisted(() => ({
  createWebviewPanelMock: vi.fn(),
  executeCommandMock: vi.fn(),
  showWarningMessageMock: vi.fn(),
  workspaceState: {
    isTrusted: true
  }
}));

function createMockUri(fsPath: string) {
  return {
    fsPath,
    toString: () => `file:${fsPath}`
  };
}

function createMockPanel(title: string) {
  let messageListener:
    | ((message: unknown) => void | Promise<void>)
    | undefined;
  return {
    title,
    webview: {
      html: '',
      onDidReceiveMessage: (listener: (message: unknown) => void | Promise<void>) => {
        messageListener = listener;
        return {
          dispose() {
            // no-op
          }
        };
      },
      asWebviewUri: (uri: { fsPath: string }) => ({
        toString: () => `webview:${uri.fsPath}`
      })
    },
    async __dispatchMessage(message: unknown) {
      await messageListener?.(message);
    }
  };
}

vi.mock('vscode', () => ({
  version: '1.101.0',
  window: {
    createWebviewPanel: createWebviewPanelMock,
    showWarningMessage: showWarningMessageMock
  },
  workspace: {
    get isTrusted() {
      return workspaceState.isTrusted;
    }
  },
  commands: {
    executeCommand: executeCommandMock
  },
  ViewColumn: {
    Active: 1
  },
  Uri: {
    file: (fsPath: string) => createMockUri(fsPath)
  }
}));

import {
  createMultiReportDashboardAction,
  renderDashboardArtifactHtml
} from '../../src/dashboard/multiReportDashboardAction';

describe('multiReportDashboardAction', () => {
  beforeEach(() => {
    workspaceState.isTrusted = true;
    createWebviewPanelMock.mockReset();
    executeCommandMock.mockReset();
    showWarningMessageMock.mockReset();
    createWebviewPanelMock.mockImplementation((_viewType: string, title: string) =>
      createMockPanel(title)
    );
  });

  it('fails closed when workspace storage is unavailable or the commit window is too small', async () => {
    const actionWithoutStorage = createMultiReportDashboardAction({ storageUri: undefined } as never);
    await expect(
      actionWithoutStorage({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: []
        }
      })
    ).resolves.toEqual({
      outcome: 'missing-storage-uri'
    });

    const action = createMultiReportDashboardAction({
      storageUri: createMockUri('/workspace/.storage')
    } as never);
    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Newest revision',
              previousHash: '1111111122222222'
            },
            {
              hash: '1111111122222222',
              authorDate: '2026-04-01T00:00:00Z',
              authorName: 'B User',
              subject: 'Initial revision'
            }
          ]
        }
      })
    ).resolves.toEqual({
      outcome: 'insufficient-commits'
    });
  });

  it('concentrates seeded retained evidence without launching local pair refresh', async () => {
    const ensureComparisonReportEvidence = vi.fn();
    const buildDashboard = vi.fn().mockResolvedValue({
      record: {
        generatedAt: '2026-04-06T04:20:00.000Z',
        repositoryName: 'ni-labview-icon-editor',
        repositoryRoot: 'C:\\dev\\ni-labview-icon-editor',
        relativePath: 'resource/plugins/lv_icon.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          windowId: 'windowid12345',
          dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
          jsonFilePath:
            '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
          htmlFilePath:
            '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
          assetsDirectory:
            '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
        },
        commitWindow: {
          commitCount: 139,
          pairCount: 138,
          newestHash: 'abcdef1234567890',
          oldestHash: '3333333344444444'
        },
        summary: {
          representedPairCount: 138,
          windowCompletenessState: 'incomplete-missing-archives',
          archivedPairCount: 135,
          missingPairCount: 3,
          missingPairIds: ['pair-136', 'pair-137', 'pair-138'],
          generatedReportCount: 134,
          reportMetadataPairCount: 134,
          failedPairCount: 1,
          failedPairIds: ['pair-135'],
          blockedPairCount: 0,
          blockedPairIds: [],
          overviewSectionCount: 0,
          overviewImageCount: 536,
          includedAttributeCount: 0,
          detailSectionCount: 0,
          detailItemCount: 2142,
          pairWithOverviewImageCount: 0,
          pairWithDetailCount: 0,
          providerSummaries: [
            {
              label: 'host-native / labview-cli / auto / linux',
              pairCount: 135
            }
          ],
          overviewCaptionSummaries: [],
          includedAttributeSummaries: [],
          detailHeadingSummaries: [],
          evidenceStateSummaries: []
        },
        entries: []
      },
      jsonFilePath:
        '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
      htmlFilePath:
        '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
    });
    const seedRetainedEvidence = vi.fn().mockResolvedValue({
      importedPairCount: 135,
      importedGeneratedPairCount: 134,
      importedFailedPairCount: 1,
      importedBlockedPairCount: 0,
      candidateCount: 1
    });
    const pathExists = vi.fn(async (targetPath: string) =>
      targetPath.endsWith('dashboard.json') ||
      targetPath.endsWith('dashboard.html') ||
      targetPath.endsWith('report-history/repo/file/pairs/pair-1/source-record.json')
    );
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const progressUpdates: Array<{ message: string; increment?: number }> = [];
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        seedRetainedDashboardEvidence: seedRetainedEvidence,
        ensureComparisonReportEvidence,
        buildDashboard,
        pathExists,
        writeFile
      }
    );

    await expect(
      action({
        model: {
          repositoryName: 'ni-labview-icon-editor',
          repositoryRoot: 'C:\\dev\\ni-labview-icon-editor',
          repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
          relativePath: 'resource/plugins/lv_icon.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-06T00:00:00Z',
              authorName: 'A User',
              subject: 'Newest revision',
              previousHash: '1111111122222222'
            },
            {
              hash: '1111111122222222',
              authorDate: '2026-04-05T00:00:00Z',
              authorName: 'B User',
              subject: 'Middle revision',
              previousHash: '3333333344444444'
            },
            {
              hash: '3333333344444444',
              authorDate: '2026-04-04T00:00:00Z',
              authorName: 'C User',
              subject: 'Initial revision'
            }
          ],
          repositorySupport: {
            repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
            normalizedRepositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
            tier: 'governed-upstream',
            familyId: 'labview-icon-editor',
            familyDisplayName: 'NI LabVIEW Icon Editor',
            supportLabel: 'Governed upstream: NI LabVIEW Icon Editor',
            supportGuidance: 'Guided.',
            allowCoreReviewActions: true,
            allowDecisionRecordActions: true,
            allowBenchmarkStatus: true,
            allowHumanReviewSubmission: true
          }
        },
        reportProgress: async (update) => {
          progressUpdates.push(update);
        }
      })
    ).resolves.toMatchObject({
      outcome: 'opened-review-dashboard',
      dashboardArchivedPairCount: 135,
      dashboardMissingPairCount: 3
    });

    expect(seedRetainedEvidence).toHaveBeenCalledWith(
      '/workspace/.storage',
      expect.objectContaining({
        repositoryRoot: 'C:\\dev\\ni-labview-icon-editor',
        relativePath: 'resource/plugins/lv_icon.vi'
      })
    );
    expect(ensureComparisonReportEvidence).not.toHaveBeenCalled();
    expect(progressUpdates.some((update) => update.message.includes('Seeded 135 dashboard pair(s)'))).toBe(true);
    expect(
      progressUpdates.some((update) =>
        update.message.includes('Concentrating governed retained dashboard evidence only')
      )
    ).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      '/workspace/.storage/dashboards/latest-dashboard-run.json',
      expect.stringContaining('"mode": "seeded-retained-before-build"'),
      'utf8'
    );
  });

  it('fails closed when dashboard generation is requested from an untrusted workspace', async () => {
    workspaceState.isTrusted = false;
    const buildDashboard = vi.fn();
    const readFile = vi.fn().mockResolvedValue(
      '<!DOCTYPE html><html><head><title>Artifact</title></head><body><div>Retained artifact body</div></body></html>'
    );
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard,
        readFile
      }
    );

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Newest revision',
              previousHash: '1111111122222222'
            },
            {
              hash: '1111111122222222',
              authorDate: '2026-04-01T00:00:00Z',
              authorName: 'B User',
              subject: 'Middle revision',
              previousHash: '3333333344444444'
            },
            {
              hash: '3333333344444444',
              authorDate: '2026-03-31T00:00:00Z',
              authorName: 'C User',
              subject: 'Initial revision'
            }
          ]
        }
      })
    ).resolves.toEqual({
      outcome: 'workspace-untrusted'
    });

    expect(buildDashboard).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('returns a stable before-dashboard-build cancellation without opening a panel or building the dashboard', async () => {
    const buildDashboard = vi.fn();
    const readFile = vi.fn().mockResolvedValue(
      '<!DOCTYPE html><html><head><title>Artifact</title></head><body><div>Retained artifact body</div></body></html>'
    );
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard,
        readFile
      }
    );

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Newest revision',
              previousHash: '1111111122222222'
            },
            {
              hash: '1111111122222222',
              authorDate: '2026-04-01T00:00:00Z',
              authorName: 'B User',
              subject: 'Middle revision',
              previousHash: '3333333344444444'
            },
            {
              hash: '3333333344444444',
              authorDate: '2026-03-31T00:00:00Z',
              authorName: 'C User',
              subject: 'Initial revision'
            }
          ]
        },
        cancellationToken: {
          isCancellationRequested: true
        } as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-dashboard-build'
    });

    expect(buildDashboard).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('opens a concentrated dashboard panel from a persisted dashboard record', async () => {
    const buildDashboard = vi.fn().mockImplementation(async (_storageRoot, _model, options) => {
      await options?.reportProgress?.({
        message:
          'Concentrating retained comparison-report metadata for pair 1/2: abcdef12 vs 11111111.',
        increment: 35
      });
      await options?.reportProgress?.({
        message:
          'Concentrating retained comparison-report metadata for pair 2/2: 11111111 vs 33333333.',
        increment: 35
      });
      await options?.reportProgress?.({
        message: 'Finalizing concentrated dashboard assets.',
        increment: 10
      });
      return {
      record: {
        generatedAt: '2026-04-03T00:00:00.000Z',
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          windowId: 'windowid12345',
          dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
          jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
          htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
          assetsDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
        },
        commitWindow: {
          commitCount: 3,
          pairCount: 2,
          newestHash: 'abcdef1234567890',
          oldestHash: '3333333344444444'
        },
        summary: {
          representedPairCount: 2,
          windowCompletenessState: 'incomplete-missing-archives',
          archivedPairCount: 1,
          missingPairCount: 1,
          missingPairIds: ['pairid999999'],
          generatedReportCount: 1,
          reportMetadataPairCount: 1,
          failedPairCount: 0,
          failedPairIds: [],
          blockedPairCount: 0,
          blockedPairIds: [],
          overviewSectionCount: 2,
          overviewImageCount: 2,
          includedAttributeCount: 5,
          detailSectionCount: 1,
          detailItemCount: 3,
          pairWithOverviewImageCount: 1,
          pairWithDetailCount: 1,
          overviewCaptionSummaries: [
            {
              caption: 'Front Panel Overview',
              pairCount: 1,
              imageCount: 2,
              pairOrdinals: [1]
            }
          ],
          includedAttributeSummaries: [
            {
              label: 'Front Panel',
              includedPairCount: 1,
              excludedPairCount: 0,
              includedPairOrdinals: [1],
              excludedPairOrdinals: []
            }
          ],
          detailHeadingSummaries: [
            {
              heading: '1. VI Attribute - Miscellaneous',
              pairCount: 1,
              itemCount: 3,
              pairOrdinals: [1]
            }
          ],
          evidenceStateSummaries: [
            {
              state: 'archived-generated-report',
              pairCount: 1
            },
            {
              state: 'missing-archive',
              pairCount: 1
            }
          ],
          providerSummaries: [
            {
              label: 'host-native / labview-cli / x86 / win32',
              pairCount: 1
            }
          ]
        },
        entries: []
      },
      jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
      htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
      };
    });
    const readFile = vi.fn().mockResolvedValue(
      '<!DOCTYPE html><html><head><title>Artifact</title></head><body><div>Retained artifact body</div></body></html>'
    );
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard,
        readFile
      }
    );

    const result = await action({
      model: {
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Middle revision',
            previousHash: '3333333344444444'
          },
          {
            hash: '3333333344444444',
            authorDate: '2026-03-31T00:00:00Z',
            authorName: 'C User',
            subject: 'Initial revision'
          }
        ]
      }
    });

    expect(buildDashboard).toHaveBeenCalled();
    const panelCall = createWebviewPanelMock.mock.calls[0];
    expect(panelCall?.[0]).toBe('viHistorySuite.reviewDashboard');
    expect(panelCall?.[1]).toBe('VI Review Dashboard: foo.vi');
    expect(panelCall?.[2]).toBe(1);
    expect(panelCall?.[3]?.enableScripts).toBe(true);
    expect(panelCall?.[3]?.localResourceRoots?.[0]?.fsPath).toBe('/workspace/.storage');
    const openedPanel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-chronology-order"');
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-metadata-summary"');
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-metadata-fields"');
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-review-lens"');
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-pair-ledger-summary"');
    expect(openedPanel.webview.html).toContain(
      'No retained pair metadata is currently available for this dashboard window.'
    );
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-overview-caption-concentration"');
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-attribute-concentration"');
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-detail-heading-concentration"');
    expect(result).toEqual({
      outcome: 'opened-review-dashboard',
      dashboardFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
      dashboardPairCount: 2,
      dashboardArchivedPairCount: 1,
      dashboardMissingPairCount: 1,
      title: 'VI Review Dashboard: foo.vi'
    });
  });

  it('reports bounded progress stages while building the dashboard', async () => {
    const progressUpdates: Array<{ message: string; increment?: number }> = [];
    const readArchivedComparisonReportSourceRecord = vi.fn().mockResolvedValue({
      archivePlan: {
        reportFilePath:
          '/workspace/.storage/report-history/repo/file/pairs/pair-1/diff-report-foo.vi.html'
      },
      packetRecord: {
        runtimeExecution: {
          reportExists: true
        }
      }
    });
    const pathExists = vi.fn(async (targetPath: string) =>
      targetPath.endsWith('diff-report-foo.vi.html')
    );
    const buildDashboard = vi.fn().mockImplementation(async (_storageRoot, _model, options) => {
      await options?.reportProgress?.({
        message:
          'Concentrating retained comparison-report metadata for pair 1/2: abcdef12 vs 11111111.',
        increment: 35
      });
      await options?.reportProgress?.({
        message:
          'Concentrating retained comparison-report metadata for pair 2/2: 11111111 vs 33333333.',
        increment: 35
      });
      await options?.reportProgress?.({
        message: 'Finalizing concentrated dashboard assets.',
        increment: 10
      });
      return {
        record: {
          generatedAt: '2026-04-03T00:00:00.000Z',
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          artifactPlan: {
            repoId: 'repoid123456',
            fileId: 'fileid123456',
            windowId: 'windowid12345',
            dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
            jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
            htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
            assetsDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
          },
          commitWindow: {
            commitCount: 3,
            pairCount: 2,
            newestHash: 'abcdef1234567890',
            oldestHash: '3333333344444444'
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
            overviewSectionCount: 2,
            overviewImageCount: 2,
            includedAttributeCount: 5,
            detailSectionCount: 1,
            detailItemCount: 3,
            pairWithOverviewImageCount: 2,
            pairWithDetailCount: 2,
            evidenceStateSummaries: [],
            providerSummaries: []
          },
          entries: []
        },
        jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
        htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
      };
    });
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard,
        readArchivedComparisonReportSourceRecord,
        pathExists
      }
    );

    await action({
      model: {
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Middle revision',
            previousHash: '3333333344444444'
          },
          {
            hash: '3333333344444444',
            authorDate: '2026-03-31T00:00:00Z',
            authorName: 'C User',
            subject: 'Initial revision'
          }
        ]
      },
      reportProgress: (update) => {
        progressUpdates.push(update);
      }
    });

    expect(progressUpdates).toEqual([
      {
        message: 'Preparing VI Review Dashboard commit window.',
        increment: 5
      },
      {
        message:
          'All adjacent retained pairs already have retained comparison evidence. Concentrating retained dashboard metadata only.'
      },
      {
        message:
          'Concentrating retained comparison-report metadata for pair 1/2: abcdef12 vs 11111111.',
        increment: 35
      },
      {
        message:
          'Concentrating retained comparison-report metadata for pair 2/2: 11111111 vs 33333333.',
        increment: 35
      },
      {
        message: 'Finalizing concentrated dashboard assets.',
        increment: 10
      },
      {
        message: 'Opening VI Review Dashboard.',
        increment: 15
      }
    ]);
    const openedPanel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-preparation-summary"');
    expect(openedPanel.webview.html).toContain(
      'All adjacent retained pairs already had retained comparison evidence before dashboard concentration began.'
    );
  });

  it('backfills missing or stale pair evidence before concentrating the dashboard', async () => {
    const progressUpdates: Array<{ message: string; increment?: number }> = [];
    const nowValues = [1_000, 4_500, 5_000, 9_500, 9_500, 9_500];
    const now = vi.fn(() => nowValues.shift() ?? 9_500);
    const pathExists = vi.fn().mockResolvedValue(true);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const readArchivedComparisonReportSourceRecord = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        archivePlan: {
          reportFilePath:
            '/workspace/.storage/report-history/repo/file/pairs/pair-2/diff-report-foo.vi.html'
        },
        packetRecord: {
          runtimeExecution: {
            reportExists: false
          }
        }
      });
    const ensureComparisonReportEvidence = vi
      .fn()
      .mockImplementation(async ({ reportProgress }) => {
        await reportProgress?.({
          message: 'Executing LabVIEW comparison-report runtime.',
          increment: 95
        });
        return {
          outcome: 'retained-comparison-report-evidence',
          generatedReportExists: true
        };
      });
    const buildDashboard = vi.fn().mockResolvedValue({
      record: {
        generatedAt: '2026-04-03T00:00:00.000Z',
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          windowId: 'windowid12345',
          dashboardDirectory:
            '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
          jsonFilePath:
            '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
          htmlFilePath:
            '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
          assetsDirectory:
            '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
        },
        commitWindow: {
          commitCount: 3,
          pairCount: 2,
          newestHash: 'abcdef1234567890',
          oldestHash: '3333333344444444'
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
          overviewSectionCount: 2,
          overviewImageCount: 2,
          includedAttributeCount: 5,
          detailSectionCount: 1,
          detailItemCount: 3,
          pairWithOverviewImageCount: 2,
          pairWithDetailCount: 2,
          overviewCaptionSummaries: [],
          includedAttributeSummaries: [],
          detailHeadingSummaries: [],
          evidenceStateSummaries: [],
          providerSummaries: []
        },
        entries: []
      },
      jsonFilePath:
        '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
      htmlFilePath:
        '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
    });
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard,
        ensureComparisonReportEvidence,
        readArchivedComparisonReportSourceRecord,
        pathExists,
        writeFile,
        now,
        getFileHistoryCount: vi.fn().mockResolvedValue(240)
      }
    );

    await action({
      model: {
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Middle revision',
            previousHash: '3333333344444444'
          },
          {
            hash: '3333333344444444',
            authorDate: '2026-03-31T00:00:00Z',
            authorName: 'C User',
            subject: 'Initial revision'
          }
        ]
      },
      reportProgress: (update) => {
        progressUpdates.push(update);
      }
    });

    expect(readArchivedComparisonReportSourceRecord).toHaveBeenCalledTimes(2);
    expect(ensureComparisonReportEvidence).toHaveBeenCalledTimes(2);
    expect(ensureComparisonReportEvidence.mock.calls[0]?.[0]?.selectedHash).toBe(
      'abcdef1234567890'
    );
    expect(ensureComparisonReportEvidence.mock.calls[0]?.[0]?.headlessRequested).toBe(true);
    expect(ensureComparisonReportEvidence.mock.calls[1]?.[0]?.selectedHash).toBe(
      '1111111122222222'
    );
    expect(ensureComparisonReportEvidence.mock.calls[1]?.[0]?.headlessRequested).toBe(true);
    expect(buildDashboard).toHaveBeenCalledWith(
      '/workspace/.storage',
      expect.any(Object),
      expect.objectContaining({
        reportProgress: expect.any(Function),
        pairConcentrationIncrementTotal: 30,
        assetIncrementTotal: 10
      })
    );
    expect(progressUpdates).toEqual(
      expect.arrayContaining([
        {
          message: 'Preparing VI Review Dashboard commit window.',
          increment: 5
        },
        {
          message:
            'Preparing dashboard pair 1/2: Executing LabVIEW comparison-report runtime.',
          increment: 20
        },
        {
          message: 'Opening VI Review Dashboard.',
          increment: 15
        }
      ])
    );
    expect(
      progressUpdates.some(
        (update) =>
          update.increment === 20 &&
          update.message.startsWith('Preparing dashboard pair 2/2; est. ') &&
          update.message.endsWith('Executing LabVIEW comparison-report runtime.')
      )
    ).toBe(true);
    expect(
      progressUpdates.some((update) =>
        update.message.includes(
          'Preparing 2 dashboard pair(s) that still need retained comparison evidence.'
        )
      )
    ).toBe(true);
    expect(
      progressUpdates.some((update) =>
        update.message.includes(
          'Prepared dashboard pair 1/2: abcdef12 vs 11111111 (missing archive); retained generated comparison metadata is ready.'
        )
      )
    ).toBe(true);
    expect(
      progressUpdates.some((update) =>
        update.message.includes(
          'Prepared dashboard pair 2/2: 11111111 vs 33333333 (missing generated report); retained generated comparison metadata is ready.'
        )
      )
    ).toBe(true);
    const openedPanel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-preparation-summary"');
    expect(openedPanel.webview.html).toContain(
      '2 adjacent pair(s) were refreshed for retained comparison evidence before this dashboard was concentrated.'
    );
    expect(openedPanel.webview.html).toContain(
      'Refresh outcomes: 2 generated reports.'
    );
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-eta-accuracy-summary"');
    expect(openedPanel.webview.html).toContain('measured=1/2 eta-eligible pair(s)');
    expect(openedPanel.webview.html).toContain('prepared=2 pair(s)');
    expect(openedPanel.webview.html).toContain('mean-abs-error=0m 0s');
    expect(openedPanel.webview.html).toContain('mean-bias=+0m 0s');
    expect(openedPanel.webview.html).toContain('current-session generated-report pairs only');
    const etaAccuracyWriteCall = writeFile.mock.calls.find(
      ([filePath]) =>
        filePath ===
        '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard-pair-eta-accuracy.json'
    );
    expect(etaAccuracyWriteCall).toBeTruthy();
    const etaAccuracyRecord = JSON.parse(String(etaAccuracyWriteCall?.[1]));
    expect(etaAccuracyRecord).toMatchObject({
      stage: 'pair-preparation',
      preparedPairCount: 2,
      etaEligiblePairCount: 2,
      measuredPairCount: 1,
      unmeasuredPairCount: 1,
      excludedPairCount: 0,
      meanAbsoluteErrorSeconds: 0,
      maxAbsoluteErrorSeconds: 0,
      meanSignedErrorSeconds: 0
    });
    expect(etaAccuracyRecord.context).toMatchObject({
      source: 'vscode-dashboard-action',
      workspaceStorageRoot: '/workspace/.storage',
      repositoryName: 'repo',
      relativePath: 'foo.vi',
      dashboardJsonFilePath:
        '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json'
    });
    expect(etaAccuracyRecord.meanAbsolutePercentageError).toBeUndefined();
    expect(etaAccuracyRecord.samples).toEqual([
      expect.objectContaining({
        pairOrdinal: 2,
        pairCount: 2,
        estimatedPairSeconds: 0,
        actualPairSeconds: 0,
        absoluteErrorSeconds: 0,
        signedErrorSeconds: 0
      })
    ]);
    const latestRunWriteCall = writeFile.mock.calls
      .filter(([filePath]) => filePath === '/workspace/.storage/dashboards/latest-dashboard-run.json')
      .at(-1);
    expect(latestRunWriteCall).toBeTruthy();
    const latestRunRecord = JSON.parse(String(latestRunWriteCall?.[1]));
    expect(latestRunRecord).toMatchObject({
      source: 'vscode-dashboard-action',
      workspaceStorageRoot: '/workspace/.storage',
      artifactPaths: {
        dashboardJsonFilePath:
          '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
        etaAccuracyFilePath:
          '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard-pair-eta-accuracy.json'
      },
      dashboard: {
        repositoryName: 'repo',
        relativePath: 'foo.vi'
      },
      experiment: {
        configuration: {
          strictRsrcHeader: false,
          historyWindowMode: 'auto',
          maxHistoryEntries: 100,
          effectiveHistoryEntryCeiling: 1000,
          preferBitness: 'auto',
          windowsContainerImage: 'nationalinstruments/labview:2026q1-windows',
          labviewCliPathConfigured: false,
          labviewExePathConfigured: false,
          lvComparePathConfigured: false
        },
        historyWindow: {
          loadedCommitCount: 3,
          loadedPairCount: 2,
          configuredMaxHistoryEntries: 100,
          effectiveHistoryEntryCeiling: 1000,
          totalCommitCount: 240,
          historyTruncated: true,
          loadedFractionOfTotal: 0.013
        },
        timings: {
          totalDurationMs: expect.any(Number),
          pairsNeedingEvidenceScanDurationMs: expect.any(Number),
          evidencePreparationDurationMs: expect.any(Number),
          dashboardBuildDurationMs: expect.any(Number),
          dashboardOpenDurationMs: expect.any(Number)
        }
      }
    });
    expect(latestRunRecord.experiment.progress.eventCount).toBeGreaterThanOrEqual(6);
  });

  it('surfaces blocked, failed, no-generated, and missing-archive refresh outcomes during dashboard pair preparation', async () => {
    const progressUpdates: Array<{ message: string; increment?: number }> = [];
    const nowValues = [
      1_000,
      11_000,
      12_000,
      13_000,
      14_000,
      14_100,
      15_000,
      15_100,
      16_000,
      26_000,
      26_000,
      26_000
    ];
    const now = vi.fn(() => nowValues.shift() ?? 26_000);
    const pathExists = vi.fn().mockResolvedValue(true);
    const readArchivedComparisonReportSourceRecord = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const ensureComparisonReportEvidence = vi
      .fn()
      .mockImplementationOnce(async ({ reportProgress }) => {
        await reportProgress?.({
          message: 'Executing LabVIEW comparison-report runtime.',
          increment: 95
        });
        return {
          outcome: 'retained-comparison-report-evidence',
          reportStatus: 'ready-for-runtime',
          runtimeExecutionState: 'succeeded',
          generatedReportExists: true
        };
      })
      .mockImplementationOnce(async ({ reportProgress }) => {
        await reportProgress?.({
          message: 'Executing LabVIEW comparison-report runtime.',
          increment: 95
        });
        return {
          outcome: 'retained-comparison-report-evidence',
          reportStatus: 'blocked-runtime',
          runtimeExecutionState: 'not-available',
          blockedReason: 'runtime-provider-unavailable',
          runtimeDiagnosticReason: 'runtime-provider-unavailable',
          generatedReportExists: false
        };
      })
      .mockImplementationOnce(async ({ reportProgress }) => {
        await reportProgress?.({
          message: 'Executing LabVIEW comparison-report runtime.',
          increment: 95
        });
        return {
          outcome: 'retained-comparison-report-evidence',
          reportStatus: 'ready-for-runtime',
          runtimeExecutionState: 'failed',
          runtimeFailureReason: 'command-exited-nonzero',
          runtimeDiagnosticReason: 'command-exited-nonzero',
          generatedReportExists: false
        };
      })
      .mockImplementationOnce(async ({ reportProgress }) => {
        await reportProgress?.({
          message: 'Executing LabVIEW comparison-report runtime.',
          increment: 95
        });
        return {
          outcome: 'retained-comparison-report-evidence',
          reportStatus: 'ready-for-runtime',
          runtimeExecutionState: 'not-run',
          generatedReportExists: false
        };
      })
      .mockImplementationOnce(async ({ reportProgress }) => {
        await reportProgress?.({
          message: 'Executing LabVIEW comparison-report runtime.',
          increment: 95
        });
        return {
          outcome: 'retained-comparison-report-evidence',
          reportStatus: 'ready-for-runtime',
          runtimeExecutionState: 'succeeded',
          generatedReportExists: true,
          retainedArchiveAvailable: false,
          archiveFailureReason: 'retained-archive-write-failed'
        };
      });
    const buildDashboard = vi.fn().mockResolvedValue({
      record: {
        generatedAt: '2026-04-03T00:00:00.000Z',
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          windowId: 'windowid12345',
          dashboardDirectory:
            '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
          jsonFilePath:
            '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
          htmlFilePath:
            '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
          assetsDirectory:
            '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
        },
        commitWindow: {
          commitCount: 6,
          pairCount: 5,
          newestHash: 'aaaaaaaabbbbbbbb',
          oldestHash: '7777777766666666'
        },
        summary: {
          representedPairCount: 5,
          windowCompletenessState: 'complete',
          archivedPairCount: 4,
          missingPairCount: 1,
          missingPairIds: ['pair-5'],
          generatedReportCount: 1,
          reportMetadataPairCount: 1,
          failedPairCount: 1,
          failedPairIds: ['pair-3'],
          blockedPairCount: 1,
          blockedPairIds: ['pair-2'],
          overviewSectionCount: 0,
          overviewImageCount: 0,
          includedAttributeCount: 0,
          detailSectionCount: 0,
          detailItemCount: 0,
          pairWithOverviewImageCount: 0,
          pairWithDetailCount: 0,
          overviewCaptionSummaries: [],
          includedAttributeSummaries: [],
          detailHeadingSummaries: [],
          evidenceStateSummaries: [],
          providerSummaries: []
        },
        entries: []
      },
      jsonFilePath:
        '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
      htmlFilePath:
        '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
    });
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard,
        ensureComparisonReportEvidence,
        readArchivedComparisonReportSourceRecord,
        pathExists,
        writeFile,
        now
      }
    );

    await action({
      model: {
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'aaaaaaaabbbbbbbb',
            authorDate: '2026-04-05T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: 'ccccccccdddddddd'
          },
          {
            hash: 'ccccccccdddddddd',
            authorDate: '2026-04-04T00:00:00Z',
            authorName: 'B User',
            subject: 'Revision 2',
            previousHash: 'eeeeeeeeffffffff'
          },
          {
            hash: 'eeeeeeeeffffffff',
            authorDate: '2026-04-03T00:00:00Z',
            authorName: 'C User',
            subject: 'Revision 3',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'D User',
            subject: 'Revision 4',
            previousHash: '9999999900000000'
          },
          {
            hash: '9999999900000000',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'E User',
            subject: 'Revision 5',
            previousHash: '7777777766666666'
          },
          {
            hash: '7777777766666666',
            authorDate: '2026-03-31T00:00:00Z',
            authorName: 'F User',
            subject: 'Initial revision'
          }
        ]
      },
      reportProgress: (update) => {
        progressUpdates.push(update);
      }
    });

    expect(readArchivedComparisonReportSourceRecord).toHaveBeenCalledTimes(5);
    expect(ensureComparisonReportEvidence).toHaveBeenCalledTimes(5);
    expect(
      progressUpdates.some((update) =>
        update.message.startsWith('Preparing dashboard pair 3/5; est. ') &&
        update.message.endsWith('Executing LabVIEW comparison-report runtime.')
      )
    ).toBe(true);
    expect(
      progressUpdates.some((update) =>
        update.message.includes(
          'Prepared dashboard pair 1/5: aaaaaaaa vs cccccccc (missing archive); retained generated comparison metadata is ready.'
        )
      )
    ).toBe(true);
    expect(
      progressUpdates.some((update) =>
        update.message.includes(
          'Prepared dashboard pair 2/5: cccccccc vs eeeeeeee (missing archive); retained pair evidence is blocked (runtime-provider-unavailable).'
        )
      )
    ).toBe(true);
    expect(
      progressUpdates.some((update) =>
        update.message.includes(
          'Prepared dashboard pair 3/5: eeeeeeee vs 11111111 (missing archive); retained pair evidence reflects a failed runtime (command-exited-nonzero).'
        )
      )
    ).toBe(true);
    expect(
      progressUpdates.some((update) =>
        update.message.includes(
          'Prepared dashboard pair 4/5: 11111111 vs 99999999 (missing archive); retained pair evidence was refreshed without a generated comparison report.'
        )
      )
    ).toBe(true);
    expect(
      progressUpdates.some((update) =>
        update.message.includes(
          'Prepared dashboard pair 5/5: 99999999 vs 77777777 (missing archive); comparison view opened, but retained archive evidence is unavailable (archive write failed).'
        )
      )
    ).toBe(true);

    const openedPanel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-preparation-summary"');
    expect(openedPanel.webview.html).toContain(
      'Refresh outcomes: 1 generated report, 1 blocked pair, 1 failed pair, 1 pair without a generated report, 1 pair without retained archive evidence.'
    );
    expect(openedPanel.webview.html).toContain('measured=1/2 eta-eligible pair(s)');
    expect(openedPanel.webview.html).toContain('excluded=3 blocked/failed/no-generated pair(s)');
    expect(openedPanel.webview.html).toContain(
      'Review the pair ledger or Open compare for runtime doctor details.'
    );
    const etaAccuracyWriteCall = writeFile.mock.calls.find(
      ([filePath]) =>
        filePath ===
        '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard-pair-eta-accuracy.json'
    );
    expect(etaAccuracyWriteCall).toBeTruthy();
    const etaAccuracyRecord = JSON.parse(String(etaAccuracyWriteCall?.[1]));
    expect(etaAccuracyRecord).toMatchObject({
      preparedPairCount: 5,
      etaEligiblePairCount: 2,
      measuredPairCount: 1,
      unmeasuredPairCount: 1,
      excludedPairCount: 3,
      meanAbsoluteErrorSeconds: 1,
      maxAbsoluteErrorSeconds: 1,
      meanSignedErrorSeconds: -1
    });
  });

  it('surfaces explicit progress and dashboard guidance when pair refresh is unavailable in this build', async () => {
    const progressUpdates: Array<{ message: string; increment?: number }> = [];
    const readArchivedComparisonReportSourceRecord = vi.fn().mockResolvedValue(undefined);
    const buildDashboard = vi.fn().mockImplementation(async (_storageRoot, _model, options) => {
      await options?.reportProgress?.({
        message:
          'Concentrating retained comparison-report metadata for pair 1/2: abcdef12 vs 11111111.',
        increment: 35
      });
      await options?.reportProgress?.({
        message:
          'Concentrating retained comparison-report metadata for pair 2/2: 11111111 vs 33333333.',
        increment: 35
      });
      await options?.reportProgress?.({
        message: 'Finalizing concentrated dashboard assets.',
        increment: 10
      });
      return {
        record: {
          generatedAt: '2026-04-03T00:00:00.000Z',
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          artifactPlan: {
            repoId: 'repoid123456',
            fileId: 'fileid123456',
            windowId: 'windowid12345',
            dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
            jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
            htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
            assetsDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
          },
          commitWindow: {
            commitCount: 3,
            pairCount: 2,
            newestHash: 'abcdef1234567890',
            oldestHash: '3333333344444444'
          },
          summary: {
            representedPairCount: 2,
            windowCompletenessState: 'incomplete-missing-archives',
            archivedPairCount: 0,
            missingPairCount: 2,
            missingPairIds: ['pair-1', 'pair-2'],
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
            overviewCaptionSummaries: [],
            includedAttributeSummaries: [],
            detailHeadingSummaries: [],
            evidenceStateSummaries: [],
            providerSummaries: []
          },
          entries: []
        },
        jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
        htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
      };
    });
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard,
        readArchivedComparisonReportSourceRecord
      }
    );

    await action({
      model: {
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Middle revision',
            previousHash: '3333333344444444'
          },
          {
            hash: '3333333344444444',
            authorDate: '2026-03-31T00:00:00Z',
            authorName: 'C User',
            subject: 'Initial revision'
          }
        ]
      },
      reportProgress: (update) => {
        progressUpdates.push(update);
      }
    });

    expect(progressUpdates).toEqual(
      expect.arrayContaining([
        {
          message: 'Preparing VI Review Dashboard commit window.',
          increment: 5
        },
        {
          message:
            'This build cannot refresh 2 dashboard pair(s) from Open dashboard. Concentrating the currently retained archive set only.'
        },
        {
          message: 'Opening VI Review Dashboard.',
          increment: 15
        }
      ])
    );
    const openedPanel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-preparation-summary"');
    expect(openedPanel.webview.html).toContain(
      '2 adjacent pair(s) still lacked retained comparison evidence, and this build could not refresh them from Open dashboard. This dashboard concentrates the currently retained archive set only.'
    );
  });

  it('fails closed when dashboard pair evidence generation is cancelled before concentration', async () => {
    const readArchivedComparisonReportSourceRecord = vi.fn().mockResolvedValue(undefined);
    const ensureComparisonReportEvidence = vi.fn().mockResolvedValue({
      outcome: 'cancelled',
      cancellationStage: 'after-preflight'
    });
    const buildDashboard = vi.fn();
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard,
        ensureComparisonReportEvidence,
        readArchivedComparisonReportSourceRecord
      }
    );

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Newest revision',
              previousHash: '1111111122222222'
            },
            {
              hash: '1111111122222222',
              authorDate: '2026-04-01T00:00:00Z',
              authorName: 'B User',
              subject: 'Middle revision',
              previousHash: '3333333344444444'
            },
            {
              hash: '3333333344444444',
              authorDate: '2026-03-31T00:00:00Z',
              authorName: 'C User',
              subject: 'Initial revision'
            }
          ]
        }
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-dashboard-pair-generation:after-preflight'
    });

    expect(buildDashboard).not.toHaveBeenCalled();
  });

  it('renders retained concentrated overview images through webview-safe asset URIs', async () => {
    const buildDashboard = vi.fn().mockResolvedValue({
      record: {
        generatedAt: '2026-04-03T00:00:00.000Z',
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          windowId: 'windowid12345',
          dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
          jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
          htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
          assetsDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
        },
        commitWindow: {
          commitCount: 3,
          pairCount: 2,
          newestHash: 'abcdef1234567890',
          oldestHash: '3333333344444444'
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
          overviewImageCount: 1,
          includedAttributeCount: 2,
          detailSectionCount: 1,
          detailItemCount: 1,
          pairWithOverviewImageCount: 1,
          pairWithDetailCount: 1,
          evidenceStateSummaries: [],
          providerSummaries: []
        },
        entries: [
          {
            pairId: 'pairid123456',
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            selectedSubject: 'Newest revision',
            selectedAuthorName: 'A User',
            selectedAuthorDate: '2026-04-02T00:00:00Z',
            baseSubject: 'Middle revision',
            archiveStatus: 'archived',
            pairEvidenceState: 'archived-generated-report',
            generatedReportExists: true,
            parsedReport: {
              reportTitle: 'VI Comparison Report: foo.vi',
              generationTime: '2026-04-03T00:00:00Z',
              firstViPath: 'foo.vi',
              secondViPath: 'foo.vi',
              overviewSections: [
                {
                  caption: 'Front Panel',
                  images: [
                    {
                      position: 0,
                      sourceRelativePath: 'foo_files/front-panel.png',
                      sourceFilePath: '/workspace/source/front-panel.png'
                    }
                  ]
                }
              ],
              includedAttributes: [{ label: 'Connector pane', included: true }],
              detailSections: [{ heading: 'Front Panel', items: ['Changed'] }],
              overviewImageCount: 1,
              detailItemCount: 1
            },
            dashboardImageAssets: [
              {
                caption: 'Front Panel',
                position: 0,
                sourceFilePath: '/workspace/source/front-panel.png',
                dashboardRelativePath: 'assets/pairid123456/foo_files/front-panel.png'
              }
            ],
            artifactLinks: [],
            overviewImageCount: 1,
            detailItemCount: 1,
            evidenceCount: 2,
            runtimeProvider: 'windows-container',
            runtimeEngine: 'labview-cli',
            runtimePlatform: 'win32',
            runtimePreferBitness: 'x64',
            runtimeProviderLabel: 'windows-container / labview-cli / x64 / win32'
          }
        ]
      },
      jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
      htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
    });
    const readFile = vi.fn().mockResolvedValue(
      '<!DOCTYPE html><html><head><title>Artifact</title></head><body><div>Retained artifact body</div></body></html>'
    );
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard,
        readFile
      }
    );

    await action({
      model: {
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Middle revision',
            previousHash: '3333333344444444'
          },
          {
            hash: '3333333344444444',
            authorDate: '2026-03-31T00:00:00Z',
            authorName: 'C User',
            subject: 'Initial revision'
          }
        ]
      }
    });

    const openedPanel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    expect(openedPanel.webview.html).toContain(
      'data-testid="dashboard-entry-overview-images"'
    );
    expect(openedPanel.webview.html).toContain(
      'webview:/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets/pairid123456/foo_files/front-panel.png'
    );
  });

  it('retains partial dashboard evidence when cancellation is requested after dashboard build', async () => {
    const token = {
      isCancellationRequested: false
    };
    const buildDashboard = vi.fn().mockImplementation(async () => {
      token.isCancellationRequested = true;
      return {
        record: {
          generatedAt: '2026-04-03T00:00:00.000Z',
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          artifactPlan: {
            repoId: 'repoid123456',
            fileId: 'fileid123456',
            windowId: 'windowid12345',
            dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
            jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
            htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
            assetsDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
          },
          commitWindow: {
            commitCount: 3,
            pairCount: 2,
            newestHash: 'abcdef1234567890',
            oldestHash: '3333333344444444'
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
            overviewSectionCount: 2,
            overviewImageCount: 2,
            includedAttributeCount: 5,
            detailSectionCount: 1,
            detailItemCount: 3,
            pairWithOverviewImageCount: 2,
            pairWithDetailCount: 2,
            evidenceStateSummaries: [],
            providerSummaries: []
          },
          entries: []
        },
        jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
        htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
      };
    });
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard
      }
    );

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Newest revision',
              previousHash: '1111111122222222'
            },
            {
              hash: '1111111122222222',
              authorDate: '2026-04-01T00:00:00Z',
              authorName: 'B User',
              subject: 'Middle revision',
              previousHash: '3333333344444444'
            },
            {
              hash: '3333333344444444',
              authorDate: '2026-03-31T00:00:00Z',
              authorName: 'C User',
              subject: 'Initial revision'
            }
          ]
        },
        cancellationToken: token as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'after-dashboard-build',
      dashboardFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
      dashboardPairCount: 2,
      dashboardArchivedPairCount: 2,
      dashboardMissingPairCount: 0
    });

    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('retains built dashboard evidence when cancellation is requested before the dashboard panel opens', async () => {
    const token = {
      isCancellationRequested: false
    };
    const buildDashboard = vi.fn().mockResolvedValue({
      record: {
        generatedAt: '2026-04-03T00:00:00.000Z',
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          windowId: 'windowid12345',
          dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
          jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
          htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
          assetsDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
        },
        commitWindow: {
          commitCount: 3,
          pairCount: 2,
          newestHash: 'abcdef1234567890',
          oldestHash: '3333333344444444'
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
          overviewSectionCount: 2,
          overviewImageCount: 2,
          includedAttributeCount: 5,
          detailSectionCount: 1,
          detailItemCount: 3,
          pairWithOverviewImageCount: 2,
          pairWithDetailCount: 2,
          evidenceStateSummaries: [],
          providerSummaries: []
        },
        entries: []
      },
      jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
      htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
    });
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard
      }
    );

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Newest revision',
              previousHash: '1111111122222222'
            },
            {
              hash: '1111111122222222',
              authorDate: '2026-04-01T00:00:00Z',
              authorName: 'B User',
              subject: 'Middle revision',
              previousHash: '3333333344444444'
            },
            {
              hash: '3333333344444444',
              authorDate: '2026-03-31T00:00:00Z',
              authorName: 'C User',
              subject: 'Initial revision'
            }
          ]
        },
        cancellationToken: token as never,
        reportProgress: (update) => {
          if (update.message === 'Opening VI Review Dashboard.') {
            token.isCancellationRequested = true;
          }
        }
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-dashboard-open',
      dashboardFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
      dashboardPairCount: 2,
      dashboardArchivedPairCount: 2,
      dashboardMissingPairCount: 0
    });

    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('opens archived HTML artifacts in dedicated panels and JSON artifacts in the editor', async () => {
    const buildDashboard = vi.fn().mockResolvedValue({
      record: {
        generatedAt: '2026-04-03T00:00:00.000Z',
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          windowId: 'windowid12345',
          dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
          jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
          htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
          assetsDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
        },
        commitWindow: {
          commitCount: 3,
          pairCount: 2,
          newestHash: 'abcdef1234567890',
          oldestHash: '3333333344444444'
        },
        summary: {
          representedPairCount: 2,
          windowCompletenessState: 'incomplete-missing-archives',
          archivedPairCount: 1,
          missingPairCount: 1,
          missingPairIds: ['pairid999999'],
          generatedReportCount: 1,
          reportMetadataPairCount: 1,
          failedPairCount: 0,
          failedPairIds: [],
          blockedPairCount: 0,
          blockedPairIds: [],
          overviewSectionCount: 2,
          overviewImageCount: 2,
          includedAttributeCount: 5,
          detailSectionCount: 1,
          detailItemCount: 3,
          pairWithOverviewImageCount: 1,
          pairWithDetailCount: 1,
          evidenceStateSummaries: [
            {
              state: 'archived-generated-report',
              pairCount: 1
            },
            {
              state: 'missing-archive',
              pairCount: 1
            }
          ],
          providerSummaries: [
            {
              label: 'host-native / labview-cli / x86 / win32',
              pairCount: 1
            }
          ]
        },
        entries: []
      },
      jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
      htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
    });
    const readFile = vi.fn().mockResolvedValue(
      '<!DOCTYPE html><html><head><title>Artifact</title></head><body><div>Retained artifact body</div></body></html>'
    );
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard,
        readFile
      }
    );

    await action({
      model: {
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Middle revision',
            previousHash: '3333333344444444'
          },
          {
            hash: '3333333344444444',
            authorDate: '2026-03-31T00:00:00Z',
            authorName: 'C User',
            subject: 'Initial revision'
          }
        ]
      }
    });

    const dashboardPanel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    await dashboardPanel.__dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair/report-packet.html',
      kind: 'packet-html',
      label: 'Open archived packet'
    });
    expect(createWebviewPanelMock.mock.calls[1]?.[0]).toBe(
      'viHistorySuite.reviewDashboardArtifact'
    );
    expect(createWebviewPanelMock.mock.calls[1]?.[1]).toBe('Open archived packet');
    const artifactPanel = createWebviewPanelMock.mock.results[1]?.value as ReturnType<
      typeof createMockPanel
    >;
    expect(readFile).toHaveBeenCalledWith(
      '/workspace/.storage/report-history/repo/file/pairs/pair/report-packet.html',
      'utf8'
    );
    expect(artifactPanel.webview.html).toContain('Retained artifact body');
    expect(artifactPanel.webview.html).toContain('vihs-dashboard-artifact-header');
    expect(artifactPanel.webview.html).toContain(
      '<base href="webview:/workspace/.storage/report-history/repo/file/pairs/pair/" />'
    );
    expect(artifactPanel.webview.html).not.toContain('<iframe src=');

    await dashboardPanel.__dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair/source-record.json',
      kind: 'source-record-json',
      label: 'Open archive source record'
    });
    expect(executeCommandMock).toHaveBeenCalledWith(
      'vscode.open',
      expect.objectContaining({
        fsPath: '/workspace/.storage/report-history/repo/file/pairs/pair/source-record.json'
      }),
      {
        preview: false
      }
    );

    await dashboardPanel.__dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/outside.json',
      kind: 'metadata-json',
      label: 'Outside'
    });
    expect(executeCommandMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to an iframe wrapper when a retained dashboard HTML artifact cannot be read inline', async () => {
    await expect(
      renderDashboardArtifactHtml({
        title: 'Open archived LabVIEW report',
        artifactFilePath: '/workspace/.storage/report-history/repo/file/pairs/pair/diff-report-foo.vi.html',
        artifactDirectoryWebviewUri:
          'webview:/workspace/.storage/report-history/repo/file/pairs/pair/',
        cspSource: 'vscode-webview-resource',
        readFile: vi.fn().mockRejectedValue(new Error('artifact unavailable')) as never
      })
    ).resolves.toContain('<iframe src="');

    await expect(
      renderDashboardArtifactHtml({
        title: 'Open archived LabVIEW report',
        artifactFilePath: '/workspace/.storage/report-history/repo/file/pairs/pair/diff-report-foo.vi.html',
        artifactDirectoryWebviewUri:
          'webview:/workspace/.storage/report-history/repo/file/pairs/pair/',
        cspSource: 'vscode-webview-resource',
        readFile: vi.fn().mockRejectedValue(new Error('artifact unavailable')) as never
      })
    ).resolves.toContain(
      'webview:/workspace/.storage/report-history/repo/file/pairs/pair/diff-report-foo.vi.html'
    );
  });

  it('uses the default filesystem existence probe to keep already-retained dashboard pairs out of backfill', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-dashboard-existing-report-'));
    const reportFilePath = path.join(
      storageRoot,
      'report-history',
      'repoid123456',
      'fileid123456',
      'pairid123456',
      'diff-report-foo.vi.html'
    );
    await fs.mkdir(path.dirname(reportFilePath), { recursive: true });
    await fs.writeFile(reportFilePath, '<html><body>retained report</body></html>', 'utf8');

    const buildDashboard = vi.fn().mockResolvedValue({
      record: {
        generatedAt: '2026-04-03T00:00:00.000Z',
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          windowId: 'windowid12345',
          dashboardDirectory: path.join(storageRoot, 'dashboards', 'repoid123456', 'fileid123456', 'windowid12345'),
          jsonFilePath: path.join(
            storageRoot,
            'dashboards',
            'repoid123456',
            'fileid123456',
            'windowid12345',
            'dashboard.json'
          ),
          htmlFilePath: path.join(
            storageRoot,
            'dashboards',
            'repoid123456',
            'fileid123456',
            'windowid12345',
            'dashboard.html'
          ),
          assetsDirectory: path.join(
            storageRoot,
            'dashboards',
            'repoid123456',
            'fileid123456',
            'windowid12345',
            'assets'
          )
        },
        commitWindow: {
          commitCount: 3,
          pairCount: 2,
          newestHash: 'abcdef1234567890',
          oldestHash: '3333333344444444'
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
          overviewSectionCount: 0,
          overviewImageCount: 0,
          includedAttributeCount: 0,
          detailSectionCount: 0,
          detailItemCount: 0,
          pairWithOverviewImageCount: 0,
          pairWithDetailCount: 0,
          evidenceStateSummaries: [],
          providerSummaries: []
        },
        entries: []
      },
      jsonFilePath: path.join(
        storageRoot,
        'dashboards',
        'repoid123456',
        'fileid123456',
        'windowid12345',
        'dashboard.json'
      ),
      htmlFilePath: path.join(
        storageRoot,
        'dashboards',
        'repoid123456',
        'fileid123456',
        'windowid12345',
        'dashboard.html'
      )
    });
    const readArchivedComparisonReportSourceRecord = vi.fn().mockResolvedValue({
      archivePlan: {
        reportFilePath
      },
      packetRecord: {
        runtimeExecution: {
          reportExists: true
        }
      }
    });
    const reportProgress = vi.fn();
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri(storageRoot)
      } as never,
      {
        buildDashboard,
        readArchivedComparisonReportSourceRecord
      }
    );

    await expect(
      action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Newest revision',
              previousHash: '1111111122222222'
            },
            {
              hash: '1111111122222222',
              authorDate: '2026-04-01T00:00:00Z',
              authorName: 'B User',
              subject: 'Middle revision',
              previousHash: '3333333344444444'
            },
            {
              hash: '3333333344444444',
              authorDate: '2026-03-31T00:00:00Z',
              authorName: 'C User',
              subject: 'Initial revision'
            }
          ]
        },
        reportProgress
      })
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'opened-review-dashboard',
        dashboardMissingPairCount: 0
      })
    );

    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'All adjacent retained pairs already have retained comparison evidence. Concentrating retained dashboard metadata only.'
      })
    );
  });

  it('emits keepalive progress while a dashboard pair refresh remains in flight', async () => {
    vi.useFakeTimers();
    try {
      const progressUpdates: Array<{ message: string; increment?: number }> = [];
      const buildDashboard = vi.fn().mockResolvedValue({
        record: {
          generatedAt: '2026-04-03T00:00:00.000Z',
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          artifactPlan: {
            repoId: 'repoid123456',
            fileId: 'fileid123456',
            windowId: 'windowid12345',
            dashboardDirectory:
              '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
            jsonFilePath:
              '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
            htmlFilePath:
              '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
            assetsDirectory:
              '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
          },
          commitWindow: {
            commitCount: 3,
            pairCount: 2,
            newestHash: 'abcdef1234567890',
            oldestHash: '3333333344444444'
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
            overviewSectionCount: 0,
            overviewImageCount: 0,
            includedAttributeCount: 0,
            detailSectionCount: 0,
            detailItemCount: 0,
            pairWithOverviewImageCount: 0,
            pairWithDetailCount: 0,
            evidenceStateSummaries: [],
            providerSummaries: []
          },
          entries: []
        },
        jsonFilePath:
          '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
        htmlFilePath:
          '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
      });
      const ensureComparisonReportEvidence = vi
        .fn()
        .mockImplementation(async ({ reportProgress }) => {
          await reportProgress?.({
            message: 'Executing LabVIEW comparison-report runtime.',
            increment: 20
          });
          await new Promise((resolve) => setTimeout(resolve, 30001));
          return {
            outcome: 'retained-comparison-report-evidence',
            generatedReportExists: true,
            retainedArchiveAvailable: true,
            reportStatus: 'ready-for-runtime',
            runtimeExecutionState: 'succeeded'
          };
        });
      const action = createMultiReportDashboardAction(
        {
          storageUri: createMockUri('/workspace/.storage')
        } as never,
        {
          buildDashboard,
          ensureComparisonReportEvidence,
          readArchivedComparisonReportSourceRecord: vi.fn().mockResolvedValue(undefined)
        }
      );

      const actionPromise = action({
        model: {
          repositoryName: 'repo',
          repositoryRoot: '/workspace/repo',
          relativePath: 'foo.vi',
          signature: 'LVIN',
          eligible: true,
          commits: [
            {
              hash: 'abcdef1234567890',
              authorDate: '2026-04-02T00:00:00Z',
              authorName: 'A User',
              subject: 'Newest revision',
              previousHash: '1111111122222222'
            },
            {
              hash: '1111111122222222',
              authorDate: '2026-04-01T00:00:00Z',
              authorName: 'B User',
              subject: 'Middle revision',
              previousHash: '3333333344444444'
            },
            {
              hash: '3333333344444444',
              authorDate: '2026-03-31T00:00:00Z',
              authorName: 'C User',
              subject: 'Initial revision'
            }
          ]
        },
        reportProgress: (update) => {
          progressUpdates.push(update);
        }
      });

      await vi.advanceTimersByTimeAsync(15001);

      expect(
        progressUpdates.some(
          (update) =>
            update.message.includes('Preparing dashboard pair 1/2: Still working;') &&
            update.message.includes('first pair calibrates ETA;') &&
            update.message.includes('Last step: Executing LabVIEW comparison-report runtime')
        )
      ).toBe(true);

      await vi.runAllTimersAsync();
      await expect(actionPromise).resolves.toEqual(
        expect.objectContaining({
          outcome: 'opened-review-dashboard',
          dashboardMissingPairCount: 0
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores malformed dashboard artifact messages without opening artifacts', async () => {
    const buildDashboard = vi.fn().mockResolvedValue({
      record: {
        generatedAt: '2026-04-03T00:00:00.000Z',
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          windowId: 'windowid12345',
          dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
          jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
          htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
          assetsDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
        },
        commitWindow: {
          commitCount: 3,
          pairCount: 2,
          newestHash: 'abcdef1234567890',
          oldestHash: '3333333344444444'
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
          overviewSectionCount: 2,
          overviewImageCount: 2,
          includedAttributeCount: 5,
          detailSectionCount: 1,
          detailItemCount: 3,
          pairWithOverviewImageCount: 2,
          pairWithDetailCount: 2,
          evidenceStateSummaries: [],
          providerSummaries: []
        },
        entries: []
      },
      jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
      htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
    });
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard
      }
    );

    await action({
      model: {
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Middle revision',
            previousHash: '3333333344444444'
          },
          {
            hash: '3333333344444444',
            authorDate: '2026-03-31T00:00:00Z',
            authorName: 'C User',
            subject: 'Initial revision'
          }
        ]
      }
    });

    const dashboardPanel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    await dashboardPanel.__dispatchMessage(null);
    await dashboardPanel.__dispatchMessage({
      command: 'ignoreMe',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair/report-packet.html',
      kind: 'packet-html',
      label: 'Ignored'
    });
    await dashboardPanel.__dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair/report-packet.html',
      kind: 'runtime-log',
      label: 'Ignored'
    });
    await dashboardPanel.__dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair/report-packet.html',
      kind: 'packet-html',
      label: '   '
    });

    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
    expect(executeCommandMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).not.toHaveBeenCalled();
  });

  it('rejects storage-root and kind-mismatched dashboard artifacts even when they are inside storage', async () => {
    const buildDashboard = vi.fn().mockResolvedValue({
      record: {
        generatedAt: '2026-04-03T00:00:00.000Z',
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repoid123456',
          fileId: 'fileid123456',
          windowId: 'windowid12345',
          dashboardDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345',
          jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
          htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html',
          assetsDirectory: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/assets'
        },
        commitWindow: {
          commitCount: 3,
          pairCount: 2,
          newestHash: 'abcdef1234567890',
          oldestHash: '3333333344444444'
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
          overviewSectionCount: 2,
          overviewImageCount: 2,
          includedAttributeCount: 5,
          detailSectionCount: 1,
          detailItemCount: 3,
          pairWithOverviewImageCount: 2,
          pairWithDetailCount: 2,
          evidenceStateSummaries: [],
          providerSummaries: []
        },
        entries: []
      },
      jsonFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.json',
      htmlFilePath: '/workspace/.storage/dashboards/repoid123456/fileid123456/windowid12345/dashboard.html'
    });
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard
      }
    );

    await action({
      model: {
        repositoryName: 'repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'foo.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Middle revision',
            previousHash: '3333333344444444'
          },
          {
            hash: '3333333344444444',
            authorDate: '2026-03-31T00:00:00Z',
            authorName: 'C User',
            subject: 'Initial revision'
          }
        ]
      }
    });

    const dashboardPanel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    await dashboardPanel.__dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/.storage',
      kind: 'packet-html',
      label: 'Storage root'
    });
    await dashboardPanel.__dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair/source-record.json',
      kind: 'packet-html',
      label: 'Wrong kind'
    });
    await dashboardPanel.__dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair/report-packet.html',
      kind: 'metadata-json',
      label: 'Wrong kind again'
    });
    await dashboardPanel.__dispatchMessage({
      command: 'openDashboardArtifact',
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair/dashboard.html',
      kind: 'report-html',
      label: 'Not a governed NI report'
    });

    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
    expect(executeCommandMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).toHaveBeenCalledTimes(4);
    expect(showWarningMessageMock).toHaveBeenNthCalledWith(
      1,
      'VI Review Dashboard ignored an artifact path outside workspace-scoped extension storage.'
    );
    expect(showWarningMessageMock).toHaveBeenNthCalledWith(
      2,
      'VI Review Dashboard ignored an artifact path that did not match the governed retained artifact contract.'
    );
    expect(showWarningMessageMock).toHaveBeenNthCalledWith(
      3,
      'VI Review Dashboard ignored an artifact path that did not match the governed retained artifact contract.'
    );
    expect(showWarningMessageMock).toHaveBeenNthCalledWith(
      4,
      'VI Review Dashboard ignored an artifact path that did not match the governed retained artifact contract.'
    );
  });
});
