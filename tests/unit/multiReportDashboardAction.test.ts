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

import { createMultiReportDashboardAction } from '../../src/dashboard/multiReportDashboardAction';

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
          message: 'Executing NI comparison-report runtime.',
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
    expect(ensureComparisonReportEvidence.mock.calls[1]?.[0]?.selectedHash).toBe(
      '1111111122222222'
    );
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
            'Preparing dashboard pair 1/2: Executing NI comparison-report runtime.',
          increment: 20
        },
        {
          message:
            'Preparing dashboard pair 2/2; est. 0m 4s left: Executing NI comparison-report runtime.',
          increment: 20
        },
        {
          message: 'Opening VI Review Dashboard.',
          increment: 15
        }
      ])
    );
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
    expect(openedPanel.webview.html).toContain('data-testid="dashboard-eta-accuracy-summary"');
    expect(openedPanel.webview.html).toContain('measured=1/2 prepared pair(s)');
    expect(openedPanel.webview.html).toContain('mean-abs-error=0m 1s');
    expect(openedPanel.webview.html).toContain('mean-bias=+0m 1s');
    expect(openedPanel.webview.html).toContain('current-session prepared pairs only');
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
      measuredPairCount: 1,
      unmeasuredPairCount: 1,
      meanAbsoluteErrorSeconds: 1,
      maxAbsoluteErrorSeconds: 1,
      meanSignedErrorSeconds: 1
    });
    expect(etaAccuracyRecord.meanAbsolutePercentageError).toBeCloseTo(22.222, 3);
    expect(etaAccuracyRecord.samples).toEqual([
      expect.objectContaining({
        pairOrdinal: 2,
        pairCount: 2,
        estimatedPairSeconds: 3.5,
        actualPairSeconds: 4.5,
        absoluteErrorSeconds: 1,
        signedErrorSeconds: 1
      })
    ]);
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
