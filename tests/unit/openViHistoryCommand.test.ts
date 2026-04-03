import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  showWarningMessageMock,
  showInformationMessageMock,
  clipboardWriteTextMock,
  executeCommandMock,
  createWebviewPanelMock,
  withProgressMock,
  workspaceState,
  windowState
} = vi.hoisted(() => ({
  showWarningMessageMock: vi.fn(),
  showInformationMessageMock: vi.fn(),
  clipboardWriteTextMock: vi.fn(),
  executeCommandMock: vi.fn(),
  createWebviewPanelMock: vi.fn(),
  withProgressMock: vi.fn(),
  workspaceState: {
    isTrusted: true
  },
  windowState: {
    activeTextEditor: undefined as { document: { uri: MockUri } } | undefined
  }
}));

interface MockUri {
  fsPath: string;
  toString(): string;
}

interface MockPanel {
  title: string;
  webview: {
    html: string;
    onDidReceiveMessage: (listener: (message: unknown) => Promise<void>) => { dispose(): void };
  };
}

function createMockUri(fsPath: string, scheme = 'file'): MockUri {
  return {
    fsPath,
    toString: () => `${scheme}:${fsPath}`
  };
}

function createMockPanel(title: string): MockPanel {
  return {
    title,
    webview: {
      html: '',
      onDidReceiveMessage: () => ({
        dispose() {
          // no-op
        }
      })
    }
  };
}

vi.mock('vscode', () => ({
  window: {
    get activeTextEditor() {
      return windowState.activeTextEditor;
    },
    showWarningMessage: showWarningMessageMock,
    showInformationMessage: showInformationMessageMock,
    createWebviewPanel: createWebviewPanelMock,
    withProgress: withProgressMock
  },
  workspace: workspaceState,
  env: {
    clipboard: {
      writeText: clipboardWriteTextMock
    }
  },
  commands: {
    executeCommand: executeCommandMock
  },
  ViewColumn: {
    Active: 1
  },
  ProgressLocation: {
    Notification: 15
  }
}));

import { createOpenViHistoryCommand } from '../../src/commands/openViHistoryCommand';
import { HistoryPanelTracker } from '../../src/ui/historyPanelTracker';

describe('createOpenViHistoryCommand', () => {
  beforeEach(() => {
    workspaceState.isTrusted = true;
    windowState.activeTextEditor = undefined;
    showWarningMessageMock.mockReset();
    showInformationMessageMock.mockReset();
    clipboardWriteTextMock.mockReset();
    executeCommandMock.mockReset();
    createWebviewPanelMock.mockReset();
    withProgressMock.mockReset();
    createWebviewPanelMock.mockImplementation((_viewType: string, title: string) =>
      createMockPanel(title)
    );
    withProgressMock.mockImplementation(
      async (
        _options: unknown,
        task: (
          progress: { report(update: { message?: string; increment?: number }): void },
          token: { isCancellationRequested: boolean; onCancellationRequested: () => { dispose(): void } }
        ) => Promise<unknown>
      ) =>
        task({
          report() {
            // no-op
          }
        }, {
          isCancellationRequested: false,
          onCancellationRequested() {
            return {
              dispose() {
                // no-op
              }
            };
          }
        })
    );
  });

  it('shows an informational message when invoked without a selected resource', async () => {
    const historyService = {
      load: vi.fn()
    };
    const eligibilityIndexer = {
      isEligible: vi.fn()
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined
    );

    await command();

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'Select a tracked LabVIEW VI to open VI History.'
    );
    expect(historyService.load).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('shows a warning and stops when the workspace is untrusted', async () => {
    workspaceState.isTrusted = false;
    const targetUri = createMockUri('/workspace/example.vi');
    const historyService = {
      load: vi.fn()
    };
    const eligibilityIndexer = {
      isEligible: vi.fn()
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined
    );

    await command(targetUri as never);

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI History is disabled in untrusted workspaces.'
    );
    expect(eligibilityIndexer.isEligible).not.toHaveBeenCalled();
    expect(historyService.load).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('shows an informational message when the selected file is not eligible', async () => {
    const targetUri = createMockUri('/workspace/ineligible.vi');
    const historyService = {
      load: vi.fn()
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(false)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined
    );

    await command(targetUri as never);

    expect(eligibilityIndexer.isEligible).toHaveBeenCalledWith(targetUri);
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The selected file is not currently eligible for VI History.'
    );
    expect(historyService.load).not.toHaveBeenCalled();
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('shows warnings when Git-backed revision URIs cannot be resolved', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };
    const gitApi = {
      toGitUri: vi.fn().mockReturnValue(undefined)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      gitApi as never,
      tracker
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'openCommit',
      hash: 'abcdef1234567890'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI History could not resolve the selected Git revision.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openCommit',
      hash: 'abcdef1234567890',
      outcome: 'missing-git-uri'
    });

    await tracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'abcdef1234567890'
    });

    expect(showWarningMessageMock).toHaveBeenCalledTimes(2);
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'diffPrevious',
      hash: 'abcdef1234567890',
      outcome: 'missing-git-uri'
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('loads history from the active editor, opens a panel, and retains the opened-panel summary', async () => {
    const tracker = new HistoryPanelTracker();
    const targetUri = createMockUri('/workspace/eligible.vi');
    windowState.activeTextEditor = {
      document: {
        uri: targetUri
      }
    };
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker
    );

    await command();

    expect(eligibilityIndexer.isEligible).toHaveBeenCalledWith(targetUri);
    expect(historyService.load).toHaveBeenCalledWith(targetUri);
    expect(createWebviewPanelMock).toHaveBeenCalledWith(
      'viHistorySuite.history',
      'VI History: eligible.vi',
      1,
      {
        enableScripts: true
      }
    );
    expect(tracker.getOpenCount()).toBe(1);
    expect(tracker.getLastOpenedPanel()).toMatchObject({
      title: 'VI History: eligible.vi',
      targetFsPath: '/workspace/eligible.vi',
      relativePath: 'eligible.vi',
      commitCount: 1,
      eligible: true
    });
    expect(tracker.getLastOpenedPanel()?.renderedHtml).toContain('VI History');
  });

  it('handles successful copy-review, copy-hash, open-commit, and diff-previous actions', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Initial revision'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };
    const gitApi = {
      toGitUri: vi.fn().mockImplementation((_uri: MockUri, ref: string) =>
        createMockUri(`/git/${ref}`, 'git')
      )
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      gitApi as never,
      tracker
    );

    await command(targetUri as never);

    await tracker.dispatchLastPanelMessage({
      command: 'copyReviewPacket'
    });
    expect(clipboardWriteTextMock).toHaveBeenCalledTimes(1);
    expect(clipboardWriteTextMock.mock.calls[0]?.[0]).toContain('VI History Review Packet');
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'copyReviewPacket',
      outcome: 'copied-review-packet',
      copiedTextLength: clipboardWriteTextMock.mock.calls[0]?.[0].length
    });

    await tracker.dispatchLastPanelMessage({
      command: 'copyHash',
      hash: 'abcdef1234567890'
    });
    expect(clipboardWriteTextMock).toHaveBeenNthCalledWith(2, 'abcdef1234567890');
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'copyHash',
      hash: 'abcdef1234567890',
      outcome: 'copied-hash',
      copiedHash: 'abcdef1234567890'
    });

    await tracker.dispatchLastPanelMessage({
      command: 'openCommit',
      hash: 'abcdef1234567890'
    });
    expect(executeCommandMock).toHaveBeenCalledTimes(1);
    expect(executeCommandMock.mock.calls[0]?.[0]).toBe('vscode.open');
    expect(executeCommandMock.mock.calls[0]?.[1]?.toString()).toBe(
      'git:/git/abcdef1234567890'
    );
    expect(executeCommandMock.mock.calls[0]?.[2]).toEqual({ preview: false });
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openCommit',
      hash: 'abcdef1234567890',
      outcome: 'opened-commit',
      openedUri: 'git:/git/abcdef1234567890'
    });

    await tracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'abcdef1234567890'
    });
    expect(executeCommandMock).toHaveBeenCalledTimes(2);
    expect(executeCommandMock.mock.calls[1]?.[0]).toBe('vscode.diff');
    expect(executeCommandMock.mock.calls[1]?.[1]?.toString()).toBe(
      'git:/git/1111111122222222'
    );
    expect(executeCommandMock.mock.calls[1]?.[2]?.toString()).toBe(
      'git:/git/abcdef1234567890'
    );
    expect(executeCommandMock.mock.calls[1]?.[3]).toBe(
      'eligible.vi (11111111..abcdef12)'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'diffPrevious',
      hash: 'abcdef1234567890',
      outcome: 'diffed-previous',
      leftUri: 'git:/git/1111111122222222',
      rightUri: 'git:/git/abcdef1234567890',
      title: 'eligible.vi (11111111..abcdef12)'
    });
  });

  it('handles successful comparison-report panel actions', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'blocked-preflight',
      blockedReason: 'right-blob-not-vi',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: 'webview:/report',
      title: 'VI Comparison Report: eligible.vi'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890'
    });

    expect(comparisonReportAction).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({
          relativePath: 'eligible.vi'
        }),
        selectedHash: 'abcdef1234567890',
        reportProgress: expect.any(Function)
      })
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890',
      outcome: 'opened-comparison-report',
      reportStatus: 'blocked-preflight',
      blockedReason: 'right-blob-not-vi',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: 'webview:/report',
      title: 'VI Comparison Report: eligible.vi'
    });
    expect(showWarningMessageMock).not.toHaveBeenCalled();
    expect(showInformationMessageMock).not.toHaveBeenCalled();
  });

  it('routes diffPrevious through retained comparison-report opening for content-detected VIs when retained report support is available', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: 'webview:/report',
      generatedReportExists: true,
      title: 'VI Comparison Report: eligible.vi'
    });
    const openRetainedComparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: 'webview:/report',
      generatedReportExists: true,
      title: 'VI Comparison Report: eligible.vi'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction,
      undefined,
      openRetainedComparisonReportAction
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'abcdef1234567890'
    });

    expect(openRetainedComparisonReportAction).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedHash: 'abcdef1234567890',
        reportProgress: expect.any(Function)
      })
    );
    expect(comparisonReportAction).not.toHaveBeenCalled();
    expect(executeCommandMock).not.toHaveBeenCalledWith(
      'vscode.diff',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'diffPrevious',
      hash: 'abcdef1234567890',
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: 'webview:/report',
      generatedReportExists: true,
      title: 'VI Comparison Report: eligible.vi'
    });
  });

  it('surfaces a stable informational message when diffPrevious has no retained comparison report yet', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const openRetainedComparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'missing-retained-comparison-report'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      undefined,
      undefined,
      openRetainedComparisonReportAction
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'abcdef1234567890'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'No retained VI Comparison Report exists for this pair yet. Use Generate compare to create retained evidence for it.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'diffPrevious',
      hash: 'abcdef1234567890',
      outcome: 'missing-retained-comparison-report',
      reportStatus: undefined,
      runtimeExecutionState: undefined,
      blockedReason: undefined,
      runtimeFailureReason: undefined,
      cancellationStage: undefined,
      packetFilePath: undefined,
      reportFilePath: undefined,
      metadataFilePath: undefined,
      reportWebviewUri: undefined,
      generatedReportExists: undefined,
      title: undefined
    });
  });

  it('opens a multi-report dashboard when the retained window has at least three commits', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const dashboardAction = vi.fn().mockResolvedValue({
      outcome: 'opened-review-dashboard',
      dashboardFilePath: '/workspace/.storage/dashboards/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/dashboard.json',
      dashboardPairCount: 2,
      dashboardArchivedPairCount: 1,
      dashboardMissingPairCount: 1,
      title: 'VI Review Dashboard: eligible.vi'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
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
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      undefined,
      dashboardAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'openDashboard'
    });

    expect(dashboardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({
          relativePath: 'eligible.vi'
        }),
        reportProgress: expect.any(Function)
      })
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openDashboard',
      outcome: 'opened-review-dashboard',
      dashboardFilePath: '/workspace/.storage/dashboards/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/dashboard.json',
      dashboardPairCount: 2,
      dashboardArchivedPairCount: 1,
      dashboardMissingPairCount: 1,
      title: 'VI Review Dashboard: eligible.vi'
    });
  });

  it('retains runtime diagnostics from comparison-report generation results', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'failed',
      runtimeFailureReason: 'command-exited-nonzero',
      runtimeDiagnosticReason: 'labview-path-ignored-last-used-default',
      runtimeDiagnosticNotes: [
        'LabVIEW CLI ignored the explicit -LabVIEWPath selection and used the last-used LabVIEW instead: C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe.'
      ],
      runtimeDiagnosticLogSourcePath:
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log',
      runtimeDiagnosticLogArtifactPath:
        '/workspace/.storage/reports/repo/file/runtime-diagnostic-log.txt',
      runtimeExecutable: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      runtimeArgs: ['-OperationName', 'CreateComparisonReport', '-LabVIEWPath', 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'],
      runtimeProcessObservationArtifactPath:
        '/workspace/.storage/reports/repo/file/runtime-process-observation.json',
      runtimeProcessObservationCapturedAt: '2026-04-03T00:00:01.000Z',
      runtimeProcessObservationTrigger: 'cli-log-banner',
      runtimeObservedProcessNames: ['LabVIEWCLI.exe'],
      runtimeLabviewProcessObserved: false,
      runtimeLabviewCliProcessObserved: true,
      runtimeLvcompareProcessObserved: false,
      runtimeExitProcessObservationCapturedAt: '2026-04-03T00:00:02.000Z',
      runtimeExitProcessObservationTrigger: 'process-exit',
      runtimeExitObservedProcessNames: ['LabVIEWCLI.exe'],
      runtimeLabviewProcessObservedAtExit: false,
      runtimeLabviewCliProcessObservedAtExit: false,
      runtimeLvcompareProcessObservedAtExit: false,
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: 'webview:/report',
      title: 'VI Comparison Report: eligible.vi'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890'
    });

    expect(tracker.getLastActionSummary()).toEqual({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890',
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'failed',
      blockedReason: undefined,
      runtimeFailureReason: 'command-exited-nonzero',
      runtimeDiagnosticReason: 'labview-path-ignored-last-used-default',
      runtimeDiagnosticNotes: [
        'LabVIEW CLI ignored the explicit -LabVIEWPath selection and used the last-used LabVIEW instead: C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe.'
      ],
      runtimeDiagnosticLogSourcePath:
        'C:\\Users\\sveld\\AppData\\Local\\Temp\\lvtemporary_123.log',
      runtimeDiagnosticLogArtifactPath:
        '/workspace/.storage/reports/repo/file/runtime-diagnostic-log.txt',
      runtimeExecutable: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
      runtimeArgs: ['-OperationName', 'CreateComparisonReport', '-LabVIEWPath', 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'],
      runtimeProcessObservationArtifactPath:
        '/workspace/.storage/reports/repo/file/runtime-process-observation.json',
      runtimeProcessObservationCapturedAt: '2026-04-03T00:00:01.000Z',
      runtimeProcessObservationTrigger: 'cli-log-banner',
      runtimeObservedProcessNames: ['LabVIEWCLI.exe'],
      runtimeLabviewProcessObserved: false,
      runtimeLabviewCliProcessObserved: true,
      runtimeLvcompareProcessObserved: false,
      runtimeExitProcessObservationCapturedAt: '2026-04-03T00:00:02.000Z',
      runtimeExitProcessObservationTrigger: 'process-exit',
      runtimeExitObservedProcessNames: ['LabVIEWCLI.exe'],
      runtimeLabviewProcessObservedAtExit: false,
      runtimeLabviewCliProcessObservedAtExit: false,
      runtimeLvcompareProcessObservedAtExit: false,
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: 'webview:/report',
      title: 'VI Comparison Report: eligible.vi'
    });
  });

  it('surfaces stable warnings when panel actions are blocked by workspace trust after the panel is already open', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'workspace-untrusted'
    });
    const dashboardAction = vi.fn().mockResolvedValue({
      outcome: 'workspace-untrusted'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
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
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction,
      dashboardAction as never
    );

    await command(targetUri as never);

    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890'
    });
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI History comparison reports are disabled in untrusted workspaces.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890',
      outcome: 'workspace-untrusted',
      reportStatus: undefined,
      blockedReason: undefined,
      reportFilePath: undefined,
      metadataFilePath: undefined,
      reportWebviewUri: undefined,
      title: undefined
    });

    await tracker.dispatchLastPanelMessage({
      command: 'openDashboard'
    });
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI Review Dashboard is disabled in untrusted workspaces.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openDashboard',
      outcome: 'workspace-untrusted',
      dashboardFilePath: undefined,
      dashboardJsonFilePath: undefined,
      dashboardPairCount: undefined,
      dashboardArchivedPairCount: undefined,
      dashboardMissingPairCount: undefined,
      title: undefined
    });
  });

  it('wraps dashboard and comparison-report actions in bounded progress notifications', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockImplementation(async ({ reportProgress }) => {
      reportProgress?.({
        message: 'Executing NI comparison-report runtime.',
        increment: 20
      });
      return {
        outcome: 'opened-comparison-report',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'succeeded'
      };
    });
    const dashboardAction = vi.fn().mockImplementation(async ({ reportProgress }) => {
      reportProgress?.({
        message: 'Concentrating retained comparison-report metadata.',
        increment: 70
      });
      return {
        outcome: 'opened-review-dashboard',
        dashboardPairCount: 2,
        dashboardArchivedPairCount: 2,
        dashboardMissingPairCount: 0
      };
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
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
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction,
      dashboardAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890'
    });
    await tracker.dispatchLastPanelMessage({
      command: 'openDashboard'
    });

    expect(withProgressMock).toHaveBeenCalledTimes(2);
    expect(withProgressMock.mock.calls[0]?.[0]).toMatchObject({
      title: 'Generating VI Comparison Report',
      cancellable: true
    });
    expect(withProgressMock.mock.calls[1]?.[0]).toMatchObject({
      title: 'Building VI Review Dashboard',
      cancellable: true
    });
  });

  it('updates the live history panel from generate to refresh state after retained comparison evidence is created', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
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
            subject: 'Older revision'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };
    const retainedAvailability = vi.fn().mockResolvedValue(false);

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction,
      undefined,
      undefined,
      retainedAvailability as never
    );

    await command(targetUri as never);

    const panel = createWebviewPanelMock.mock.results[0]?.value as MockPanel | undefined;
    expect(panel?.webview.html).toContain('Generate compare');
    expect(panel?.webview.html).toContain('data-testid="history-action-diff" disabled');

    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890'
    });

    expect(panel?.webview.html).toContain('Refresh compare');
    expect(panel?.webview.html).toContain('data-command="diffPrevious"');
  });

  it('surfaces stable informational outcomes when report or dashboard generation is cancelled after retaining partial evidence', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'cancelled',
      cancellationStage: 'after-packet-persist',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'not-run',
      packetFilePath: '/workspace/.storage/reports/repo/file/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      generatedReportExists: false
    });
    const dashboardAction = vi.fn().mockResolvedValue({
      outcome: 'cancelled',
      cancellationStage: 'after-dashboard-build',
      dashboardFilePath: '/workspace/.storage/dashboards/repo/file/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo/file/dashboard.json',
      dashboardPairCount: 2,
      dashboardArchivedPairCount: 2,
      dashboardMissingPairCount: 0
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
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
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction,
      dashboardAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890'
    });
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI History comparison report generation was cancelled. Retained comparison-report artifacts, if any, were preserved.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890',
      outcome: 'cancelled',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'not-run',
      blockedReason: undefined,
      runtimeFailureReason: undefined,
      cancellationStage: 'after-packet-persist',
      packetFilePath: '/workspace/.storage/reports/repo/file/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: undefined,
      generatedReportExists: false,
      title: undefined
    });

    await tracker.dispatchLastPanelMessage({
      command: 'openDashboard'
    });
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI Review Dashboard refresh was cancelled. Retained dashboard artifacts, if any, were preserved.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openDashboard',
      outcome: 'cancelled',
      dashboardFilePath: '/workspace/.storage/dashboards/repo/file/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/repo/file/dashboard.json',
      dashboardPairCount: 2,
      dashboardArchivedPairCount: 2,
      dashboardMissingPairCount: 0,
      cancellationStage: 'after-dashboard-build',
      title: undefined
    });
  });

  it('surfaces a stable warning when dashboard generation cannot persist artifacts under workspace storage', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
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
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };
    const dashboardAction = vi.fn().mockResolvedValue({
      outcome: 'missing-storage-uri'
    });

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      undefined,
      dashboardAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'openDashboard'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI Review Dashboard requires an open workspace so concentrated dashboard artifacts can be stored under workspace-scoped extension storage.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openDashboard',
      outcome: 'missing-dashboard-storage',
      dashboardFilePath: undefined,
      dashboardJsonFilePath: undefined,
      dashboardPairCount: undefined,
      dashboardArchivedPairCount: undefined,
      dashboardMissingPairCount: undefined,
      cancellationStage: undefined,
      title: undefined
    });
  });

  it('surfaces a stable informational message when dashboard generation requires more retained commits', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
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
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };
    const dashboardAction = vi.fn().mockResolvedValue({
      outcome: 'insufficient-commits'
    });

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      undefined,
      dashboardAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'openDashboard'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI Review Dashboard requires at least three retained commits for the selected VI.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openDashboard',
      outcome: 'insufficient-dashboard-commits',
      dashboardFilePath: undefined,
      dashboardJsonFilePath: undefined,
      dashboardPairCount: undefined,
      dashboardArchivedPairCount: undefined,
      dashboardMissingPairCount: undefined,
      cancellationStage: undefined,
      title: undefined
    });
  });

  it('retains explicit outcomes for missing previous revisions and malformed panel messages', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Oldest retained revision'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };
    const gitApi = {
      toGitUri: vi.fn().mockImplementation((_uri: MockUri, ref: string) =>
        createMockUri(`/git/${ref}`, 'git')
      )
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      gitApi as never,
      tracker
    );

    await command(targetUri as never);

    await tracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'abcdef1234567890'
    });
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI History has no previous retained revision for this entry.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'diffPrevious',
      hash: 'abcdef1234567890',
      outcome: 'missing-previous-hash'
    });

    await tracker.dispatchLastPanelMessage({
      command: 'copyHash'
    });
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'copyHash',
      outcome: 'ignored-missing-hash'
    });

    await tracker.dispatchLastPanelMessage({
      command: 'unsupported-command',
      hash: 'abcdef1234567890'
    });
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'unsupported-command',
      hash: 'abcdef1234567890',
      outcome: 'unsupported-command'
    });

    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('surfaces a stable warning when comparison-report storage is unavailable', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'missing-storage-uri'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI History comparison reports require an open workspace so reports can be stored under workspace-scoped extension storage.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890',
      outcome: 'missing-storage-uri',
      reportStatus: undefined,
      blockedReason: undefined,
      reportFilePath: undefined,
      metadataFilePath: undefined,
      reportWebviewUri: undefined,
      title: undefined
    });
  });

  it('surfaces stable informational outcomes when report generation cannot resolve the retained pair', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'missing-selected-commit'
      })
      .mockResolvedValueOnce({
        outcome: 'missing-previous-hash'
      });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI History could not resolve the selected retained revision for report generation.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890',
      outcome: 'missing-selected-commit',
      reportStatus: undefined,
      blockedReason: undefined,
      reportFilePath: undefined,
      metadataFilePath: undefined,
      reportWebviewUri: undefined,
      title: undefined
    });

    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI History has no previous retained revision for this entry.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890',
      outcome: 'missing-previous-hash',
      reportStatus: undefined,
      blockedReason: undefined,
      reportFilePath: undefined,
      metadataFilePath: undefined,
      reportWebviewUri: undefined,
      title: undefined
    });
  });

  it('fails closed when the panel requests report generation but no report action is wired', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890'
    });

    expect(tracker.getLastActionSummary()).toEqual({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890',
      outcome: 'unsupported-command'
    });
    expect(showInformationMessageMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).not.toHaveBeenCalled();
  });

  it('fails closed when the panel requests dashboard generation but no dashboard action is wired', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
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
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'openDashboard'
    });

    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openDashboard',
      outcome: 'unsupported-command'
    });
    expect(showInformationMessageMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).not.toHaveBeenCalled();
  });

  it('retains missing-git-uri when the selected revision resolves but the previous revision does not', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Update VI',
            previousHash: '1111111122222222'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };
    const gitApi = {
      toGitUri: vi.fn().mockImplementation((_uri: MockUri, ref: string) => {
        if (ref === 'abcdef1234567890') {
          return createMockUri(`/git/${ref}`, 'git');
        }
        return undefined;
      })
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      gitApi as never,
      tracker
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'abcdef1234567890'
    });

    expect(tracker.getLastActionSummary()).toEqual({
      command: 'diffPrevious',
      hash: 'abcdef1234567890',
      outcome: 'missing-git-uri'
    });
    expect(showWarningMessageMock).not.toHaveBeenCalled();
    expect(executeCommandMock).not.toHaveBeenCalled();
  });
});
