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
        }
      })
    ).resolves.toEqual({
      outcome: 'workspace-untrusted'
    });

    expect(buildDashboard).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('opens a concentrated dashboard panel from a persisted dashboard record', async () => {
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
    const action = createMultiReportDashboardAction(
      {
        storageUri: createMockUri('/workspace/.storage')
      } as never,
      {
        buildDashboard
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
      },
      reportProgress: (update) => {
        progressUpdates.push(update);
      }
    });

    expect(progressUpdates).toEqual([
      {
        message: 'Concentrating retained comparison-report metadata.',
        increment: 70
      },
      {
        message: 'Opening VI Review Dashboard.',
        increment: 30
      }
    ]);
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
      filePath: '/workspace/.storage/report-history/repo/file/pairs/pair/report-packet.html',
      kind: 'packet-html',
      label: 'Open archived packet'
    });
    expect(createWebviewPanelMock.mock.calls[1]?.[0]).toBe(
      'viHistorySuite.reviewDashboardArtifact'
    );
    expect(createWebviewPanelMock.mock.calls[1]?.[1]).toBe('Open archived packet');

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
