import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  executeCommandMock,
  showInputBoxMock,
  showQuickPickMock,
  workspaceState,
  globalState,
  runGitMock
} = vi.hoisted(() => {
  const reviewerState = {
    storedValue: undefined as string | undefined
  };

  return {
    executeCommandMock: vi.fn(),
    showInputBoxMock: vi.fn(),
    showQuickPickMock: vi.fn(),
    runGitMock: vi.fn(),
    workspaceState: {
      isTrusted: true
    },
    globalState: {
      get: vi.fn((key: string) =>
        key === 'viHistorySuite.lastDecisionReviewer' ? reviewerState.storedValue : undefined
      ),
      update: vi.fn(async (key: string, value: string) => {
        if (key === 'viHistorySuite.lastDecisionReviewer') {
          reviewerState.storedValue = value;
        }
      }),
      reviewerState
    }
  };
});

vi.mock('vscode', () => ({
  workspace: workspaceState,
  ExtensionMode: {
    Production: 1,
    Development: 2,
    Test: 3
  },
  window: {
    showInputBox: showInputBoxMock,
    showQuickPick: showQuickPickMock
  },
  commands: {
    executeCommand: executeCommandMock
  },
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      toString: () => `file:${fsPath}`
    })
  }
}));

vi.mock('../../src/git/gitCli', () => ({
  runGit: runGitMock,
  getRepoRemoteUrl: async (cwd: string, remoteName = 'origin') => {
    try {
      const stdout = await runGitMock(['remote', 'get-url', remoteName], cwd, 'utf8');
      const resolved = String(stdout).trim();
      return resolved.length > 0 ? resolved : undefined;
    } catch {
      return undefined;
    }
  }
}));

import { createReviewDecisionRecordAction } from '../../src/scenarios/reviewDecisionRecordAction';

function createCanonicalModel() {
  return {
    repositoryName: 'labview-icon-editor',
    repositoryRoot: '/workspace/repo',
    relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    signature: 'LVIN' as const,
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
        subject: 'Oldest revision'
      }
    ]
  };
}

function createCanonicalDashboardResult(overrides?: {
  commitCount?: number;
  pairCount?: number;
}) {
  return {
    record: {
      repositoryName: 'labview-icon-editor',
      repositoryRoot: '/workspace/repo',
      relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
      signature: 'LVIN' as const,
      artifactPlan: {
        repoId: 'repo-id',
        fileId: 'file-id',
        windowId: 'window-id',
        dashboardDirectory: '/workspace/.storage/dashboards/repo-id/file-id/window-id',
        jsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json',
        htmlFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
        assetsDirectory: '/workspace/.storage/dashboards/repo-id/file-id/window-id/assets'
      },
      commitWindow: {
        commitCount: overrides?.commitCount ?? 3,
        pairCount: overrides?.pairCount ?? 2,
        newestHash: 'abcdef1234567890',
        oldestHash: '3333333344444444'
      },
      summary: {
        representedPairCount: overrides?.pairCount ?? 2,
        windowCompletenessState: 'complete' as const,
        archivedPairCount: overrides?.pairCount ?? 2,
        missingPairCount: 0,
        missingPairIds: [],
        generatedReportCount: overrides?.pairCount ?? 2,
        reportMetadataPairCount: overrides?.pairCount ?? 2,
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
        detailItemSummaries: [],
        evidenceStateSummaries: []
      },
      entries: [
        {
          pairId: 'pair-a',
          selectedHash: 'abcdef1234567890',
          baseHash: '1111111122222222',
          selectedAuthorDate: '2026-04-02T00:00:00Z',
          selectedAuthorName: 'A User',
          selectedSubject: 'Newest revision',
          baseAuthorDate: '2026-04-01T00:00:00Z',
          baseAuthorName: 'B User',
          baseSubject: 'Middle revision',
          archiveStatus: 'archived' as const,
          archivePlan: {
            repoId: 'repo-id',
            fileId: 'file-id',
            pairId: 'pair-a',
            currentDirectory: '/workspace/.storage/reports/current',
            archiveDirectory: '/workspace/.storage/reports/archive',
            packetFilePath: '/workspace/.storage/reports/current/report-packet.html',
            reportFilePath:
              '/workspace/.storage/reports/current/diff-report-VIP_Pre-Install Custom Action.vi.html',
            metadataFilePath: '/workspace/.storage/reports/current/report-metadata.json',
            sourceRecordFilePath: '/workspace/.storage/reports/archive/source-record.json',
            reportAssetsDirectoryPath:
              '/workspace/.storage/reports/current/diff-report-VIP_Pre-Install Custom Action.vi_files'
          },
          pairEvidenceState: 'archived-generated-report' as const,
          generatedReportExists: true,
          artifactLinks: [],
          dashboardImageAssets: [],
          overviewImageCount: 1,
          detailItemCount: 1,
          evidenceCount: 1,
          reportFilePath:
            '/workspace/.storage/reports/current/diff-report-VIP_Pre-Install Custom Action.vi.html'
        },
        {
          pairId: 'pair-b',
          selectedHash: '1111111122222222',
          baseHash: '3333333344444444',
          selectedAuthorDate: '2026-04-01T00:00:00Z',
          selectedAuthorName: 'B User',
          selectedSubject: 'Middle revision',
          baseAuthorDate: '2026-03-31T00:00:00Z',
          baseAuthorName: 'C User',
          baseSubject: 'Oldest revision',
          archiveStatus: 'archived' as const,
          archivePlan: {
            repoId: 'repo-id',
            fileId: 'file-id',
            pairId: 'pair-b',
            currentDirectory: '/workspace/.storage/reports/current-b',
            archiveDirectory: '/workspace/.storage/reports/archive-b',
            packetFilePath: '/workspace/.storage/reports/current-b/report-packet.html',
            reportFilePath:
              '/workspace/.storage/reports/current-b/diff-report-VIP_Pre-Install Custom Action.vi.html',
            metadataFilePath: '/workspace/.storage/reports/current-b/report-metadata.json',
            sourceRecordFilePath: '/workspace/.storage/reports/archive-b/source-record.json',
            reportAssetsDirectoryPath:
              '/workspace/.storage/reports/current-b/diff-report-VIP_Pre-Install Custom Action.vi_files'
          },
          pairEvidenceState: 'archived-generated-report' as const,
          generatedReportExists: true,
          artifactLinks: [],
          dashboardImageAssets: [],
          overviewImageCount: 1,
          detailItemCount: 1,
          evidenceCount: 1,
          reportFilePath:
            '/workspace/.storage/reports/current-b/diff-report-VIP_Pre-Install Custom Action.vi.html'
        }
      ]
    },
    jsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json',
    htmlFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html'
  };
}

describe('reviewDecisionRecordAction', () => {
  beforeEach(() => {
    workspaceState.isTrusted = true;
    executeCommandMock.mockReset();
    showInputBoxMock.mockReset();
    showQuickPickMock.mockReset();
    runGitMock.mockReset();
    globalState.reviewerState.storedValue = undefined;
    globalState.get.mockClear();
    globalState.update.mockClear();
  });

  it('creates a separate decision record from retained dashboard evidence', async () => {
    const buildDashboard = vi.fn().mockResolvedValue({
      record: {
        repositoryName: 'labview-icon-editor',
        repositoryRoot: '/workspace/repo',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repo-id',
          fileId: 'file-id',
          windowId: 'window-id',
          dashboardDirectory: '/workspace/.storage/dashboards/repo-id/file-id/window-id',
          jsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json',
          htmlFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
          assetsDirectory: '/workspace/.storage/dashboards/repo-id/file-id/window-id/assets'
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
          detailItemSummaries: [],
          evidenceStateSummaries: []
        },
        entries: [
          {
            pairId: 'pair-a',
            selectedHash: 'abcdef1234567890',
            baseHash: '1111111122222222',
            selectedAuthorDate: '2026-04-02T00:00:00Z',
            selectedAuthorName: 'A User',
            selectedSubject: 'Newest revision',
            baseAuthorDate: '2026-04-01T00:00:00Z',
            baseAuthorName: 'B User',
            baseSubject: 'Middle revision',
            archiveStatus: 'archived',
            archivePlan: {
              repoId: 'repo-id',
              fileId: 'file-id',
              pairId: 'pair-a',
              currentDirectory: '/workspace/.storage/reports/current',
              archiveDirectory: '/workspace/.storage/reports/archive',
              packetFilePath: '/workspace/.storage/reports/current/report-packet.html',
              reportFilePath:
                '/workspace/.storage/reports/current/diff-report-VIP_Pre-Install Custom Action.vi.html',
              metadataFilePath: '/workspace/.storage/reports/current/report-metadata.json',
              sourceRecordFilePath: '/workspace/.storage/reports/archive/source-record.json',
              reportAssetsDirectoryPath:
                '/workspace/.storage/reports/current/diff-report-VIP_Pre-Install Custom Action.vi_files'
            },
            pairEvidenceState: 'archived-generated-report',
            generatedReportExists: true,
            artifactLinks: [],
            dashboardImageAssets: [],
            overviewImageCount: 1,
            detailItemCount: 1,
            evidenceCount: 1,
            reportFilePath:
              '/workspace/.storage/reports/current/diff-report-VIP_Pre-Install Custom Action.vi.html'
          },
          {
            pairId: 'pair-b',
            selectedHash: '1111111122222222',
            baseHash: '3333333344444444',
            selectedAuthorDate: '2026-04-01T00:00:00Z',
            selectedAuthorName: 'B User',
            selectedSubject: 'Middle revision',
            baseAuthorDate: '2026-03-31T00:00:00Z',
            baseAuthorName: 'C User',
            baseSubject: 'Oldest revision',
            archiveStatus: 'archived',
            archivePlan: {
              repoId: 'repo-id',
              fileId: 'file-id',
              pairId: 'pair-b',
              currentDirectory: '/workspace/.storage/reports/current-b',
              archiveDirectory: '/workspace/.storage/reports/archive-b',
              packetFilePath: '/workspace/.storage/reports/current-b/report-packet.html',
              reportFilePath:
                '/workspace/.storage/reports/current-b/diff-report-VIP_Pre-Install Custom Action.vi.html',
              metadataFilePath: '/workspace/.storage/reports/current-b/report-metadata.json',
              sourceRecordFilePath: '/workspace/.storage/reports/archive-b/source-record.json',
              reportAssetsDirectoryPath:
                '/workspace/.storage/reports/current-b/diff-report-VIP_Pre-Install Custom Action.vi_files'
            },
            pairEvidenceState: 'archived-generated-report',
            generatedReportExists: true,
            artifactLinks: [],
            dashboardImageAssets: [],
            overviewImageCount: 1,
            detailItemCount: 1,
            evidenceCount: 1,
            reportFilePath:
              '/workspace/.storage/reports/current-b/diff-report-VIP_Pre-Install Custom Action.vi.html'
          }
        ]
      },
      jsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json',
      htmlFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html'
    });
    const persistDecisionRecord = vi.fn().mockResolvedValue({
      artifactPlan: {
        scenarioId: 'SCENARIO-VHS-001',
        decisionId: 'decision-id',
        decisionDirectory:
          '/workspace/.storage/decision-records/repo-id/file-id/window-id/SCENARIO-VHS-001/decision-id',
        jsonFilePath:
          '/workspace/.storage/decision-records/repo-id/file-id/window-id/SCENARIO-VHS-001/decision-id/decision-record.json',
        markdownFilePath:
          '/workspace/.storage/decision-records/repo-id/file-id/window-id/SCENARIO-VHS-001/decision-id/decision-record.md'
      },
      record: {
        generatedAt: '2026-04-03T16:00:00.000Z'
      }
    });
    const action = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState
      } as never,
      {
        buildDashboard,
        persistDecisionRecord,
        readRepoRemoteUrl: vi
          .fn()
          .mockResolvedValue('https://github.com/ni/labview-icon-editor.git'),
        automationInputs: {
          reviewer: 'Reviewer',
          reviewQuestion: 'Does this VI need more review?',
          outcome: 'needs-more-review',
          confidence: 'medium',
          decisionRationale: 'The retained evidence spans multiple comparison pairs.'
        }
      }
    );

    const result = await action({
      model: {
        repositoryName: 'labview-icon-editor',
        repositoryRoot: '/workspace/repo',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
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
            subject: 'Oldest revision'
          }
        ]
      }
    });

    expect(result).toEqual({
      outcome: 'created-decision-record',
      scenarioId: 'SCENARIO-VHS-001',
      dashboardFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json',
      decisionRecordJsonPath:
        '/workspace/.storage/decision-records/repo-id/file-id/window-id/SCENARIO-VHS-001/decision-id/decision-record.json',
      decisionRecordMarkdownPath:
        '/workspace/.storage/decision-records/repo-id/file-id/window-id/SCENARIO-VHS-001/decision-id/decision-record.md',
      title: 'Review Decision Record: VIP_Pre-Install Custom Action.vi'
    });
    expect(persistDecisionRecord).toHaveBeenCalledWith(
      '/workspace/.storage',
      expect.objectContaining({
        repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
        targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
        reviewer: 'Reviewer',
        outcome: 'needs-more-review',
        confidence: 'medium',
        additionalReportGenerationRequired: false,
        additionalManualLabVIEWInspectionRequired: true
      }),
      expect.anything()
    );
    expect(executeCommandMock).toHaveBeenCalledWith(
      'vscode.open',
      expect.objectContaining({
        fsPath:
          '/workspace/.storage/decision-records/repo-id/file-id/window-id/SCENARIO-VHS-001/decision-id/decision-record.md'
      }),
      {
        preview: false
      }
    );
    expect(globalState.update).toHaveBeenCalledWith(
      'viHistorySuite.lastDecisionReviewer',
      'Reviewer'
    );
  });

  it('fails closed when no active review scenario matches the repository and VI', async () => {
    const buildDashboard = vi.fn().mockResolvedValue({
      record: {
        repositoryName: 'other-repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'Other.vi',
        signature: 'LVIN',
        artifactPlan: {
          repoId: 'repo-id',
          fileId: 'file-id',
          windowId: 'window-id',
          dashboardDirectory: '/workspace/.storage/dashboards/repo-id/file-id/window-id',
          jsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json',
          htmlFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
          assetsDirectory: '/workspace/.storage/dashboards/repo-id/file-id/window-id/assets'
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
          archivedPairCount: 0,
          missingPairCount: 2,
          missingPairIds: ['a', 'b'],
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
          providerSummaries: [],
          overviewCaptionSummaries: [],
          includedAttributeSummaries: [],
          detailHeadingSummaries: [],
          detailItemSummaries: [],
          evidenceStateSummaries: []
        },
        entries: []
      },
      jsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json',
      htmlFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html'
    });
    const action = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState
      } as never,
      {
        buildDashboard,
        readRepoRemoteUrl: vi.fn().mockResolvedValue('https://github.com/example/other.git'),
        automationInputs: {
          reviewer: 'Reviewer',
          reviewQuestion: 'Question',
          outcome: 'approved',
          confidence: 'high',
          decisionRationale: 'Rationale'
        }
      }
    );

    const result = await action({
      model: {
        repositoryName: 'other-repo',
        repositoryRoot: '/workspace/repo',
        relativePath: 'Other.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'a',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: 'b'
          },
          {
            hash: 'b',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Middle revision',
            previousHash: 'c'
          },
          {
            hash: 'c',
            authorDate: '2026-03-31T00:00:00Z',
            authorName: 'C User',
            subject: 'Oldest revision'
          }
        ]
      }
    });

    expect(result).toEqual({
      outcome: 'missing-review-scenario',
      dashboardFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json'
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('fails closed on preconditions before prompting or building dashboard evidence', async () => {
    workspaceState.isTrusted = false;
    const untrustedAction = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState
      } as never
    );
    await expect(
      untrustedAction({
        model: createCanonicalModel()
      })
    ).resolves.toEqual({
      outcome: 'workspace-untrusted'
    });

    workspaceState.isTrusted = true;
    const missingStorageAction = createReviewDecisionRecordAction({ storageUri: undefined } as never);
    await expect(
      missingStorageAction({
        model: createCanonicalModel()
      })
    ).resolves.toEqual({
      outcome: 'missing-storage-uri'
    });

    const insufficientCommitAction = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState
      } as never
    );
    await expect(
      insufficientCommitAction({
        model: {
          ...createCanonicalModel(),
          commits: createCanonicalModel().commits.slice(0, 2)
        }
      })
    ).resolves.toEqual({
      outcome: 'insufficient-commits'
    });

    const cancelledBeforeInputAction = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState
      } as never
    );
    await expect(
      cancelledBeforeInputAction({
        model: createCanonicalModel(),
        cancellationToken: {
          isCancellationRequested: true
        } as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-decision-record-input'
    });
  });

  it('fails closed when repository URL is missing or the matched scenario contract is violated', async () => {
    const buildDashboard = vi.fn().mockResolvedValue(createCanonicalDashboardResult());
    const persistDecisionRecord = vi.fn();
    const missingRemoteAction = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState
      } as never,
      {
        buildDashboard,
        persistDecisionRecord,
        readRepoRemoteUrl: vi.fn().mockResolvedValue(undefined),
        automationInputs: {
          reviewer: 'Reviewer',
          reviewQuestion: 'Question',
          outcome: 'approved',
          confidence: 'high',
          decisionRationale: 'Rationale'
        }
      }
    );

    await expect(
      missingRemoteAction({
        model: createCanonicalModel()
      })
    ).resolves.toEqual({
      outcome: 'missing-repository-url',
      dashboardFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json'
    });
    expect(persistDecisionRecord).not.toHaveBeenCalled();

    const mismatchedScenarioAction = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState
      } as never,
      {
        buildDashboard: vi.fn().mockResolvedValue(
          createCanonicalDashboardResult({
            pairCount: 1
          })
        ),
        readRepoRemoteUrl: vi
          .fn()
          .mockResolvedValue('https://github.com/ni/labview-icon-editor.git'),
        automationInputs: {
          reviewer: 'Reviewer',
          reviewQuestion: 'Question',
          outcome: 'approved',
          confidence: 'high',
          decisionRationale: 'Rationale'
        }
      }
    );

    await expect(
      mismatchedScenarioAction({
        model: createCanonicalModel()
      })
    ).resolves.toEqual({
      outcome: 'scenario-contract-mismatch',
      scenarioId: 'SCENARIO-VHS-001',
      mismatchSummary: 'Scenario SCENARIO-VHS-001 requires at least 2 comparison pairs, got 1.',
      dashboardFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json'
    });
  });

  it('uses noninteractive stable inputs in extension test mode and honors cancellation before dashboard build', async () => {
    let cancellationReadCount = 0;
    const buildDashboard = vi.fn();
    const action = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState,
        extensionMode: 3
      } as never,
      {
        buildDashboard,
        readRepoRemoteUrl: vi
          .fn()
          .mockResolvedValue('https://github.com/ni/labview-icon-editor.git')
      }
    );

    await expect(
      action({
        model: createCanonicalModel(),
        cancellationToken: {
          get isCancellationRequested() {
            cancellationReadCount += 1;
            return cancellationReadCount >= 2;
          }
        } as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-dashboard-build'
    });

    expect(showInputBoxMock).not.toHaveBeenCalled();
    expect(showQuickPickMock).not.toHaveBeenCalled();
    expect(buildDashboard).not.toHaveBeenCalled();
  });

  it('retains dashboard artifact paths when cancellation is requested after dashboard build', async () => {
    let cancelled = false;
    const readRepoRemoteUrl = vi.fn();
    const action = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState,
        extensionMode: 3
      } as never,
      {
        buildDashboard: vi.fn().mockImplementation(async () => {
          cancelled = true;
          return createCanonicalDashboardResult();
        }),
        readRepoRemoteUrl
      }
    );

    await expect(
      action({
        model: createCanonicalModel(),
        cancellationToken: {
          get isCancellationRequested() {
            return cancelled;
          }
        } as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'after-dashboard-build',
      dashboardFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json',
      title: 'Review Decision Record: VIP_Pre-Install Custom Action.vi'
    });

    expect(readRepoRemoteUrl).not.toHaveBeenCalled();
  });

  it('retains dashboard artifact paths when cancellation is requested before decision-record persistence', async () => {
    let cancelled = false;
    const persistDecisionRecord = vi.fn();
    const action = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState,
        extensionMode: 3
      } as never,
      {
        buildDashboard: vi.fn().mockResolvedValue(createCanonicalDashboardResult()),
        persistDecisionRecord,
        readRepoRemoteUrl: vi.fn().mockImplementation(async () => {
          cancelled = true;
          return 'https://github.com/ni/labview-icon-editor.git';
        })
      }
    );

    await expect(
      action({
        model: createCanonicalModel(),
        cancellationToken: {
          get isCancellationRequested() {
            return cancelled;
          }
        } as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-decision-record-persist',
      scenarioId: 'SCENARIO-VHS-001',
      dashboardFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json',
      title: 'Review Decision Record: VIP_Pre-Install Custom Action.vi'
    });

    expect(persistDecisionRecord).not.toHaveBeenCalled();
  });

  it('retains dashboard and decision-record artifact paths when cancellation is requested before opening the markdown artifact', async () => {
    let cancelled = false;
    const persistDecisionRecord = vi.fn().mockImplementation(async () => {
      cancelled = true;
      return {
        artifactPlan: {
          scenarioId: 'SCENARIO-VHS-001',
          decisionId: 'decision-id',
          decisionDirectory: '/workspace/.storage/decision-records/scenario/decision-id',
          jsonFilePath: '/workspace/.storage/decision-records/scenario/decision-id/decision.json',
          markdownFilePath:
            '/workspace/.storage/decision-records/scenario/decision-id/decision.md'
        },
        record: {
          generatedAt: '2026-04-03T16:00:00.000Z'
        }
      };
    });
    const action = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState,
        extensionMode: 3
      } as never,
      {
        buildDashboard: vi.fn().mockResolvedValue(createCanonicalDashboardResult()),
        persistDecisionRecord,
        readRepoRemoteUrl: vi
          .fn()
          .mockResolvedValue('https://github.com/ni/labview-icon-editor.git')
      }
    );

    await expect(
      action({
        model: createCanonicalModel(),
        cancellationToken: {
          get isCancellationRequested() {
            return cancelled;
          }
        } as never
      })
    ).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'before-decision-record-open',
      scenarioId: 'SCENARIO-VHS-001',
      dashboardFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json',
      decisionRecordJsonPath: '/workspace/.storage/decision-records/scenario/decision-id/decision.json',
      decisionRecordMarkdownPath: '/workspace/.storage/decision-records/scenario/decision-id/decision.md',
      title: 'Review Decision Record: VIP_Pre-Install Custom Action.vi'
    });

    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('returns a stable cancellation when reviewer input is dismissed', async () => {
    showInputBoxMock.mockResolvedValueOnce(undefined);
    const buildDashboard = vi.fn();
    const action = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState
      } as never,
      {
        buildDashboard
      }
    );

    const result = await action({
      model: {
        repositoryName: 'labview-icon-editor',
        repositoryRoot: '/workspace/repo',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
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
            subject: 'Oldest revision'
          }
        ]
      }
    });

    expect(result).toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-decision-record-input'
    });
    expect(buildDashboard).not.toHaveBeenCalled();
  });

  it('reuses the last persisted reviewer name as the next default', async () => {
    globalState.reviewerState.storedValue = 'Persisted Reviewer';
    showInputBoxMock
      .mockResolvedValueOnce('Persisted Reviewer')
      .mockResolvedValueOnce('Question')
      .mockResolvedValueOnce('Rationale');
    showQuickPickMock
      .mockResolvedValueOnce({ value: 'approved' })
      .mockResolvedValueOnce({ value: 'high' });

    const action = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState
      } as never,
      {
        buildDashboard: vi.fn().mockResolvedValue(createCanonicalDashboardResult()),
        persistDecisionRecord: vi.fn().mockResolvedValue({
          artifactPlan: {
            scenarioId: 'SCENARIO-VHS-001',
            decisionId: 'decision-id',
            decisionDirectory: '/workspace/.storage/decision-records/scenario/decision-id',
            jsonFilePath: '/workspace/.storage/decision-records/scenario/decision-id/decision.json',
            markdownFilePath:
              '/workspace/.storage/decision-records/scenario/decision-id/decision.md'
          },
          record: {
            generatedAt: '2026-04-03T16:00:00.000Z'
          }
        }),
        readRepoRemoteUrl: vi
          .fn()
          .mockResolvedValue('https://github.com/ni/labview-icon-editor.git')
      }
    );

    const result = await action({
      model: createCanonicalModel()
    });

    expect(result.outcome).toBe('created-decision-record');
    expect(showInputBoxMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        value: 'Persisted Reviewer'
      })
    );
    expect(globalState.get).toHaveBeenCalledWith('viHistorySuite.lastDecisionReviewer');
    expect(globalState.update).toHaveBeenCalledWith(
      'viHistorySuite.lastDecisionReviewer',
      'Persisted Reviewer'
    );
  });

  it('reports retained dashboard preparation progress and keeps decision creation stable when reviewer persistence fails', async () => {
    const reportProgress = vi.fn();
    const buildDashboard = vi.fn().mockResolvedValue(createCanonicalDashboardResult());
    const persistDecisionRecord = vi.fn().mockResolvedValue({
      artifactPlan: {
        scenarioId: 'SCENARIO-VHS-001',
        decisionId: 'decision-id',
        decisionDirectory: '/workspace/.storage/decision-records/scenario/decision-id',
        jsonFilePath: '/workspace/.storage/decision-records/scenario/decision-id/decision.json',
        markdownFilePath: '/workspace/.storage/decision-records/scenario/decision-id/decision.md'
      },
      record: {
        generatedAt: '2026-04-03T16:00:00.000Z'
      }
    });
    globalState.update.mockRejectedValueOnce(new Error('state unavailable'));

    const action = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState
      } as never,
      {
        buildDashboard,
        persistDecisionRecord,
        readRepoRemoteUrl: vi
          .fn()
          .mockResolvedValue('https://github.com/ni/labview-icon-editor.git'),
        automationInputs: {
          reviewer: 'Reviewer',
          reviewQuestion: 'Question',
          outcome: 'approved',
          confidence: 'high',
          decisionRationale: 'Rationale'
        }
      }
    );

    await expect(
      action({
        model: createCanonicalModel(),
        reportProgress
      })
    ).resolves.toEqual({
      outcome: 'created-decision-record',
      scenarioId: 'SCENARIO-VHS-001',
      dashboardFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json',
      decisionRecordJsonPath: '/workspace/.storage/decision-records/scenario/decision-id/decision.json',
      decisionRecordMarkdownPath: '/workspace/.storage/decision-records/scenario/decision-id/decision.md',
      title: 'Review Decision Record: VIP_Pre-Install Custom Action.vi'
    });

    expect(reportProgress).toHaveBeenCalledWith({
      message: 'Preparing retained dashboard evidence for the review decision record.',
      increment: 5
    });
    expect(buildDashboard).toHaveBeenCalledWith('/workspace/.storage', createCanonicalModel(), {
      reportProgress
    });
  });

  it('uses git remote origin discovery when an explicit repository-url reader is not supplied', async () => {
    runGitMock.mockResolvedValueOnce('https://github.com/ni/labview-icon-editor.git\n');

    const action = createReviewDecisionRecordAction(
      {
        storageUri: {
          fsPath: '/workspace/.storage'
        },
        globalState,
        extensionMode: 3
      } as never,
      {
        buildDashboard: vi.fn().mockResolvedValue(createCanonicalDashboardResult()),
        persistDecisionRecord: vi.fn().mockResolvedValue({
          artifactPlan: {
            scenarioId: 'SCENARIO-VHS-001',
            decisionId: 'decision-id',
            decisionDirectory: '/workspace/.storage/decision-records/scenario/decision-id',
            jsonFilePath: '/workspace/.storage/decision-records/scenario/decision-id/decision.json',
            markdownFilePath: '/workspace/.storage/decision-records/scenario/decision-id/decision.md'
          },
          record: {
            generatedAt: '2026-04-03T16:00:00.000Z'
          }
        })
      }
    );

    await expect(
      action({
        model: createCanonicalModel()
      })
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'created-decision-record',
        scenarioId: 'SCENARIO-VHS-001'
      })
    );

    expect(runGitMock).toHaveBeenCalledWith(
      ['remote', 'get-url', 'origin'],
      '/workspace/repo',
      'utf8'
    );
  });

  it('fails closed when default git remote origin discovery returns no usable repository url', async () => {
    const createDefaultRemoteAction = () =>
      createReviewDecisionRecordAction(
        {
          storageUri: {
            fsPath: '/workspace/.storage'
          },
          globalState,
          extensionMode: 3
        } as never,
        {
          buildDashboard: vi.fn().mockResolvedValue(createCanonicalDashboardResult())
        }
      );

    runGitMock.mockResolvedValueOnce('   \n');
    await expect(
      createDefaultRemoteAction()({
        model: createCanonicalModel()
      })
    ).resolves.toEqual({
      outcome: 'missing-repository-url',
      dashboardFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json'
    });

    runGitMock.mockRejectedValueOnce(new Error('git unavailable'));
    await expect(
      createDefaultRemoteAction()({
        model: createCanonicalModel()
      })
    ).resolves.toEqual({
      outcome: 'missing-repository-url',
      dashboardFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo-id/file-id/window-id/dashboard.json'
    });
  });

  it('keeps the action cancellable across question, outcome, confidence, and rationale prompts', async () => {
    const createPromptAction = () =>
      createReviewDecisionRecordAction(
        {
          storageUri: {
            fsPath: '/workspace/.storage'
          },
          globalState
        } as never
      );

    showInputBoxMock.mockResolvedValueOnce('Reviewer').mockResolvedValueOnce(undefined);
    await expect(createPromptAction()({ model: createCanonicalModel() })).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-decision-record-input'
    });

    showInputBoxMock.mockReset();
    showQuickPickMock.mockReset();
    showInputBoxMock.mockResolvedValueOnce('Reviewer').mockResolvedValueOnce('Question');
    showQuickPickMock.mockResolvedValueOnce(undefined);
    await expect(createPromptAction()({ model: createCanonicalModel() })).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-decision-record-input'
    });

    showInputBoxMock.mockReset();
    showQuickPickMock.mockReset();
    showInputBoxMock.mockResolvedValueOnce('Reviewer').mockResolvedValueOnce('Question');
    showQuickPickMock
      .mockResolvedValueOnce({ value: 'approved' })
      .mockResolvedValueOnce(undefined);
    await expect(createPromptAction()({ model: createCanonicalModel() })).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-decision-record-input'
    });

    showInputBoxMock.mockReset();
    showQuickPickMock.mockReset();
    showInputBoxMock
      .mockResolvedValueOnce('Reviewer')
      .mockResolvedValueOnce('Question')
      .mockResolvedValueOnce(undefined);
    showQuickPickMock
      .mockResolvedValueOnce({ value: 'approved' })
      .mockResolvedValueOnce({ value: 'medium' });
    await expect(createPromptAction()({ model: createCanonicalModel() })).resolves.toEqual({
      outcome: 'cancelled',
      cancellationStage: 'during-decision-record-input'
    });
  });
});
