import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createWebviewPanelMock } = vi.hoisted(() => ({
  createWebviewPanelMock: vi.fn()
}));

function createMockUri(fsPath: string) {
  return {
    fsPath,
    toString: () => `file:${fsPath}`
  };
}

function createMockPanel(title: string) {
  return {
    title,
    webview: {
      html: '',
      asWebviewUri: (uri: { fsPath: string }) => ({
        toString: () => `webview:${uri.fsPath}`
      })
    }
  };
}

vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: createWebviewPanelMock
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
    createWebviewPanelMock.mockReset();
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
          archivedPairCount: 1,
          missingPairCount: 1,
          generatedReportCount: 1,
          failedPairCount: 0,
          blockedPairCount: 0,
          overviewImageCount: 2,
          detailItemCount: 3,
          highestEvidencePairId: 'pairid123456'
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
    expect(panelCall?.[3]?.enableScripts).toBe(false);
    expect(panelCall?.[3]?.localResourceRoots?.[0]?.fsPath).toBe('/workspace/.storage');
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
});
