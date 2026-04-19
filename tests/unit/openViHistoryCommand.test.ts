import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  showErrorMessageMock,
  showWarningMessageMock,
  showInformationMessageMock,
  clipboardWriteTextMock,
  executeCommandMock,
  createWebviewPanelMock,
  withProgressMock,
  workspaceState,
  windowState
} = vi.hoisted(() => ({
  showErrorMessageMock: vi.fn(),
  showWarningMessageMock: vi.fn(),
  showInformationMessageMock: vi.fn(),
  clipboardWriteTextMock: vi.fn(),
  executeCommandMock: vi.fn(),
  createWebviewPanelMock: vi.fn(),
  withProgressMock: vi.fn(),
  workspaceState: {
    isTrusted: true,
    getConfiguration: vi.fn()
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
  onDidDispose: (listener: () => void) => { dispose(): void };
  webview: {
    html: string;
    postMessage: ReturnType<typeof vi.fn>;
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
    onDidDispose: () => ({
      dispose() {
        // no-op
      }
    }),
    webview: {
      html: '',
      postMessage: vi.fn().mockResolvedValue(true),
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
    showErrorMessage: showErrorMessageMock,
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
    workspaceState.getConfiguration.mockReset();
    workspaceState.getConfiguration.mockReturnValue({
      get: <T>(key: string, defaultValue: T) => {
        const values: Record<string, unknown> = {
          runtimeProvider: 'host',
          labviewVersion: '2026',
          labviewBitness: 'x64'
        };
        return (values[key] as T | undefined) ?? defaultValue;
      }
    });
    windowState.activeTextEditor = undefined;
    showErrorMessageMock.mockReset();
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

  it('loads the selected file directly and then reports ineligible results', async () => {
    const targetUri = createMockUri('/workspace/ineligible.vi');
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'ineligible.vi',
        signature: 'unknown',
        eligible: false,
        commits: []
      })
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

    expect(eligibilityIndexer.isEligible).not.toHaveBeenCalled();
    expect(historyService.load).toHaveBeenCalledWith(targetUri);
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The selected file is not currently eligible for VI History.'
    );
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
        signature: 'BINX',
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

  it('routes deterministic host-review submission payloads through the retained history-panel message path', async () => {
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
            subject: 'Older VI'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };
    const submitHumanReviewAction = vi.fn().mockResolvedValue({
      outcome: 'submitted-human-review',
      submissionFilePath: '/workspace/.storage/human-reviews/review-1/human-review-submission.json',
      latestSubmissionFilePath: '/workspace/.storage/human-reviews/latest-human-review-submission.json',
      canonicalHostMachineFilePath: '/workspace/.storage/human-reviews/canonical-host-machine.json',
      machineFingerprintId: 'fingerprint-1'
    });

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      submitHumanReviewAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'submitHumanReview',
      reviewOutcome: 'passed-human-review',
      reviewConfidence: 'high',
      reviewNote: 'The manual right-click flow behaved as expected.'
    });
    const panel = createWebviewPanelMock.mock.results[0]?.value as MockPanel | undefined;

    expect(submitHumanReviewAction).toHaveBeenCalledWith({
      model: expect.objectContaining({
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi'
      }),
      source: 'history-panel',
      draftOutcome: 'passed-human-review',
      draftConfidence: 'high',
      draftNote: 'The manual right-click flow behaved as expected.'
    });
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'Host-machine review submitted and retained. Future sessions can consume the retained latest-review manifest automatically.'
    );
    expect(panel?.webview.postMessage).toHaveBeenCalledWith({
      type: 'humanReviewSubmissionResult',
      status: 'success',
      message: 'Host review submitted and retained in latest-human-review-submission.json.'
    });
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'submitHumanReview',
      outcome: 'submitted-human-review',
      humanReviewSubmissionFilePath:
        '/workspace/.storage/human-reviews/review-1/human-review-submission.json',
      humanReviewLatestManifestPath:
        '/workspace/.storage/human-reviews/latest-human-review-submission.json',
      humanReviewCanonicalMachineFilePath:
        '/workspace/.storage/human-reviews/canonical-host-machine.json',
      humanReviewMachineFingerprintId: 'fingerprint-1',
      humanReviewCanonicalMachineFingerprintId: undefined,
      humanReviewValidationMessage: undefined
    });
  });

  it('blocks host-review submission when the review surface is OneDrive-backed', async () => {
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
            subject: 'Older VI'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };
    const submitHumanReviewAction = vi.fn().mockResolvedValue({
      outcome: 'nondeterministic-review-surface',
      validationMessage:
        'Blocked: host-machine review submission requires the deterministic local fixture workspace, not a OneDrive-backed repository-root (C:\\Users\\sveld\\OneDrive\\fixtures\\labview-icon-editor).',
      blockedSurface: 'repository-root',
      blockedPath: 'C:\\Users\\sveld\\OneDrive\\fixtures\\labview-icon-editor'
    });

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      submitHumanReviewAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'submitHumanReview',
      reviewOutcome: 'passed-human-review',
      reviewConfidence: 'high',
      reviewNote: 'The manual right-click flow behaved as expected.'
    });
    const panel = createWebviewPanelMock.mock.results[0]?.value as MockPanel | undefined;

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'Blocked: host-machine review submission requires the deterministic local fixture workspace, not a OneDrive-backed repository-root (C:\\Users\\sveld\\OneDrive\\fixtures\\labview-icon-editor).'
    );
    expect(panel?.webview.postMessage).toHaveBeenCalledWith({
      type: 'humanReviewSubmissionResult',
      status: 'blocked',
      message:
        'Blocked: host-machine review submission requires the deterministic local fixture workspace, not a OneDrive-backed repository-root (C:\\Users\\sveld\\OneDrive\\fixtures\\labview-icon-editor).'
    });
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'submitHumanReview',
      outcome: 'nondeterministic-human-review-surface',
      humanReviewSubmissionFilePath: undefined,
      humanReviewLatestManifestPath: undefined,
      humanReviewCanonicalMachineFilePath: undefined,
      humanReviewMachineFingerprintId: undefined,
      humanReviewCanonicalMachineFingerprintId: undefined,
      humanReviewValidationMessage:
        'Blocked: host-machine review submission requires the deterministic local fixture workspace, not a OneDrive-backed repository-root (C:\\Users\\sveld\\OneDrive\\fixtures\\labview-icon-editor).'
    });
  });

  it('fails closed when host-review submission throws before a retained artifact is written', async () => {
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
            subject: 'Older VI'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };
    const submitHumanReviewAction = vi
      .fn()
      .mockRejectedValue(new Error('ENOENT: no such file or directory'));

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      submitHumanReviewAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'submitHumanReview',
      reviewOutcome: 'needs-more-review',
      reviewConfidence: 'medium',
      reviewNote: 'This is a test of the Host-machine review submission.'
    });
    const panel = createWebviewPanelMock.mock.results[0]?.value as MockPanel | undefined;

    expect(showErrorMessageMock).toHaveBeenCalledWith(
      'Host review submission failed before the retained artifact could be written. Retry after confirming the workspace is local and deterministic.'
    );
    expect(panel?.webview.postMessage).toHaveBeenCalledWith({
      type: 'humanReviewSubmissionResult',
      status: 'blocked',
      message:
        'Host review submission failed before the retained artifact could be written. Retry after confirming the workspace is local and deterministic.'
    });
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'submitHumanReview',
      outcome: 'failed-human-review-submission'
    });
  });

  it('routes benchmark-status requests through the retained history-panel message path', async () => {
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
            subject: 'Older VI'
          }
        ]
      })
    };
    const eligibilityIndexer = {
      isEligible: vi.fn().mockReturnValue(true)
    };
    const openBenchmarkStatusAction = vi.fn().mockResolvedValue({
      outcome: 'opened-benchmark-status',
      title: 'VI History Benchmark Status',
      windowsLatestRunPath: '/workspace/.storage/dashboards/latest-dashboard-run.json',
      hostLaunchReceiptPath:
        '/workspace/.cache/host-linux-dashboard-benchmark/latest-launch.json',
      hostLatestSummaryPath:
        '/workspace/.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-002/latest-summary.json',
      hostLogPath:
        '/workspace/.cache/host-linux-dashboard-benchmark/run-20260404-170000.log',
      hostState: 'running'
    });

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      openBenchmarkStatusAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'openBenchmarkStatus'
    });

    expect(openBenchmarkStatusAction).toHaveBeenCalledWith({
      authorityRepoRoot: '/workspace'
    });
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openBenchmarkStatus',
      outcome: 'opened-benchmark-status',
      title: 'VI History Benchmark Status',
      benchmarkWindowsLatestRunPath:
        '/workspace/.storage/dashboards/latest-dashboard-run.json',
      benchmarkHostLaunchReceiptPath:
        '/workspace/.cache/host-linux-dashboard-benchmark/latest-launch.json',
      benchmarkHostLatestSummaryPath:
        '/workspace/.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-002/latest-summary.json',
      benchmarkHostLogPath:
        '/workspace/.cache/host-linux-dashboard-benchmark/run-20260404-170000.log',
      benchmarkHostState: 'running'
    });
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
        signature: 'BINX',
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
        signature: 'BINX',
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
        signature: 'BINX',
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

  it('opens bundled documentation from the history panel and records the selected page facts', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const openDocumentationAction = vi.fn().mockResolvedValue({
      outcome: 'opened-documentation',
      pageId: 'user-workflow',
      pageTitle: 'User Workflow',
      title: 'VI History Docs: User Workflow',
      manifestFilePath: '/workspace/resources/bundled-docs/manifest.json',
      pageFilePath: '/workspace/resources/bundled-docs/pages/user-workflow.html'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'BINX',
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
      undefined,
      undefined,
      undefined,
      openDocumentationAction
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'openDocumentation',
      pageId: 'user-workflow'
    });

    expect(openDocumentationAction).toHaveBeenCalledWith({
      pageId: 'user-workflow'
    });
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openDocumentation',
      outcome: 'opened-documentation',
      documentationPageId: 'user-workflow',
      documentationPageTitle: 'User Workflow',
      documentationManifestPath: '/workspace/resources/bundled-docs/manifest.json',
      documentationPageFilePath: '/workspace/resources/bundled-docs/pages/user-workflow.html',
      requestedDocumentationPageId: 'user-workflow',
      title: 'VI History Docs: User Workflow'
    });
    expect(showWarningMessageMock).not.toHaveBeenCalled();
    expect(showInformationMessageMock).not.toHaveBeenCalled();
  });

  it('routes two-checkbox commit selection through canonical selected/base compare generation order', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: 'webview:/report',
      title: 'VI Comparison Report: eligible.vi'
    });
    const comparePreflightResolver = vi.fn().mockResolvedValue({
      status: 'ready',
      provider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64',
      nextAction:
        'Next action: select two retained revisions, review the explicit selected/base pair, then choose Compare.',
      cliHint:
        'Provider is read-only here. Use the generated settings CLI to update provider, LabVIEW version, or LabVIEW bitness when correction is required. If you just used the generated settings CLI while VS Code was already open, reload or restart the window before trusting compare preflight.'
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
            subject: 'Oldest revision'
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
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      comparePreflightResolver
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReportFromSelection',
      selectedHashes: ['1111111122222222', 'abcdef1234567890']
    });

    expect(comparisonReportAction).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        reportProgress: expect.any(Function)
      })
    );
    expect(tracker.getLastActionSummary()).toEqual(
      expect.objectContaining({
        command: 'generateComparisonReportFromSelection',
        hash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        outcome: 'opened-comparison-report',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'succeeded'
      })
    );
  });

  it('blocks explicit compare generation when compare preflight is not ready', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn();
    const comparePreflightResolver = vi.fn().mockResolvedValue({
      status: 'blocked',
      provider: 'docker',
      labviewVersion: '2026',
      labviewBitness: 'x86',
      nextAction:
        'Next action: use Docker with viHistorySuite.labviewBitness=x64 or switch viHistorySuite.runtimeProvider to host, then review compare preflight before choosing Compare.',
      cliHint:
        'Provider is read-only here. Use the generated settings CLI to update provider, LabVIEW version, or LabVIEW bitness when correction is required.',
      warningMessage:
        'Compare preflight is blocked. Use Docker with viHistorySuite.labviewBitness=x64 or switch viHistorySuite.runtimeProvider to host, then review compare preflight before choosing Compare.'
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

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      comparePreflightResolver
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReportFromSelection',
      selectedHashes: ['abcdef1234567890', '1111111122222222']
    });

    expect(comparePreflightResolver).toHaveBeenCalled();
    expect(comparisonReportAction).not.toHaveBeenCalled();
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'Compare preflight is blocked. Use Docker with viHistorySuite.labviewBitness=x64 or switch viHistorySuite.runtimeProvider to host, then review compare preflight before choosing Compare.'
    );
  });

  it('derives supported win32 compare preflight blocking from runtime-backed resolution instead of settings alone', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn();
    const runtimeLocator = vi.fn().mockResolvedValue({
      platform: 'win32',
      executionMode: 'host-only',
      requestedProvider: 'host',
      bitness: 'x64',
      provider: 'unavailable',
      blockedReason: 'labview-exe-not-found',
      notes: [
        'No supported LabVIEW 2026 executable was located for host-native comparison-report execution.'
      ],
      registryQueryPlans: [],
      candidates: []
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

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'win32',
      runtimeLocator as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReportFromSelection',
      selectedHashes: ['abcdef1234567890', '1111111122222222']
    });

    expect(runtimeLocator).toHaveBeenCalledWith(
      'win32',
      expect.objectContaining({
        requestedProvider: 'host',
        labviewVersion: '2026',
        bitness: 'x64'
      })
    );
    expect(comparisonReportAction).not.toHaveBeenCalled();
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'Compare preflight is blocked. Provider: unavailable. Provider request: host. Blocked reason: labview-exe-not-found. If you just used the generated settings CLI while VS Code was already open, reload or restart the window before trusting compare preflight. Next action: make the selected host-native runtime available, resolve host conflicts, or switch to a Docker-backed compare path, then rerun comparison report generation.'
    );
  });

  it('admits supported win32 compare preflight only after runtime-backed resolution confirms the bundle', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: 'webview:/report',
      title: 'VI Comparison Report: eligible.vi'
    });
    const runtimeLocator = vi.fn().mockResolvedValue({
      platform: 'win32',
      executionMode: 'host-only',
      requestedProvider: 'host',
      bitness: 'x64',
      provider: 'host-native',
      engine: 'labview-cli',
      notes: [],
      registryQueryPlans: [],
      candidates: []
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

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'win32',
      runtimeLocator as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReportFromSelection',
      selectedHashes: ['abcdef1234567890', '1111111122222222']
    });

    expect(runtimeLocator).toHaveBeenCalledWith(
      'win32',
      expect.objectContaining({
        requestedProvider: 'host',
        labviewVersion: '2026',
        bitness: 'x64'
      })
    );
    expect(comparisonReportAction).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedHash: 'abcdef1234567890',
        baseHash: '1111111122222222',
        reportProgress: expect.any(Function)
      })
    );
  });

  it('falls back to the bundled overview page when a stale documentation page id is requested', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const openDocumentationAction = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'unknown-documentation-page',
        pageId: 'stale-page'
      })
      .mockResolvedValueOnce({
        outcome: 'opened-documentation',
        pageId: 'overview',
        pageTitle: 'Overview',
        title: 'VI History Docs: Overview',
        manifestFilePath: '/workspace/resources/bundled-docs/manifest.json',
        pageFilePath: '/workspace/resources/bundled-docs/pages/overview.html'
      });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'BINX',
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
      undefined,
      undefined,
      undefined,
      openDocumentationAction
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'openDocumentation',
      pageId: 'stale-page'
    });

    expect(openDocumentationAction).toHaveBeenNthCalledWith(1, {
      pageId: 'stale-page'
    });
    expect(openDocumentationAction).toHaveBeenNthCalledWith(2);
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI History could not resolve the requested bundled documentation page. Opened the bundled overview page instead.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openDocumentation',
      outcome: 'opened-documentation',
      documentationPageId: 'overview',
      documentationPageTitle: 'Overview',
      documentationManifestPath: '/workspace/resources/bundled-docs/manifest.json',
      documentationPageFilePath: '/workspace/resources/bundled-docs/pages/overview.html',
      requestedDocumentationPageId: 'stale-page',
      documentationFallbackUsed: true,
      title: 'VI History Docs: Overview'
    });
    expect(showWarningMessageMock).not.toHaveBeenCalled();
  });

  it('surfaces a stable warning when bundled documentation assets are missing', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const openDocumentationAction = vi.fn().mockResolvedValue({
      outcome: 'missing-bundled-documentation'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'BINX',
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
      undefined,
      undefined,
      undefined,
      openDocumentationAction
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'openDocumentation',
      pageId: 'user-workflow'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'Bundled VI History documentation is not available in this extension build.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openDocumentation',
      outcome: 'missing-bundled-documentation',
      requestedDocumentationPageId: 'user-workflow',
      documentationPageId: undefined,
      documentationPageTitle: undefined,
      documentationManifestPath: undefined,
      documentationPageFilePath: undefined,
      title: undefined
    });
  });

  it('renders capability-truthful disabled actions when optional panel surfaces are not wired', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'eligible.vi',
        signature: 'BINX',
        eligible: true,
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Newest revision',
            previousHash: '1111111122222222',
            retainedComparisonEvidenceAvailable: true
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

    const panel = createWebviewPanelMock.mock.results[0]?.value as MockPanel | undefined;
    expect(panel?.webview.html).toContain('data-testid="history-action-documentation" disabled');
    expect(panel?.webview.html).not.toContain('data-testid="history-action-dashboard"');
    expect(panel?.webview.html).not.toContain('data-testid="history-action-decision-record"');
    expect(panel?.webview.html).not.toContain('data-testid="history-action-diff"');
    expect(panel?.webview.html).not.toContain('data-testid="history-action-report"');
    expect(panel?.webview.html).toContain('Documentation:</strong> Unavailable in this build');
  });

  it('keeps review surfaces available when the loaded repo is outside the canonical governed family', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'other-repo',
        repositoryRoot: '/workspace/other-repo',
        repositoryUrl: 'https://github.com/example/other-repo.git',
        relativePath: 'eligible.vi',
        signature: 'LVIN',
        eligible: true,
        repositorySupport: {
          repositoryUrl: 'https://github.com/example/other-repo.git',
          normalizedRepositoryUrl: 'https://github.com/example/other-repo.git',
          tier: 'generic-repository',
          supportLabel: 'Repo-agnostic support',
          supportGuidance:
            'VI History is available for this repository. Canonical benchmark, scenario, and maintainer host-review evidence remain separately governed and may be narrower than the current repo.',
          allowCoreReviewActions: true,
          allowDecisionRecordActions: true,
          allowBenchmarkStatus: true,
          allowHumanReviewSubmission: true
        },
        commits: [
          {
            hash: 'abcdef1234567890',
            authorDate: '2026-04-02T00:00:00Z',
            authorName: 'A User',
            subject: 'Unsupported repo newest',
            previousHash: '1111111122222222'
          },
          {
            hash: '1111111122222222',
            authorDate: '2026-04-01T00:00:00Z',
            authorName: 'B User',
            subject: 'Unsupported repo oldest'
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
      undefined
    );

    await command(targetUri as never);

    expect(showWarningMessageMock).not.toHaveBeenCalled();
    const panel = createWebviewPanelMock.mock.results[0]?.value as MockPanel | undefined;
    expect(panel?.webview.html).toContain('Repo-agnostic support');
    expect(panel?.webview.html).toContain(
      'Pair selection:</strong> Unavailable in this build'
    );
    expect(panel?.webview.html).not.toContain('data-testid="history-action-dashboard"');
    expect(panel?.webview.html).not.toContain('data-testid="history-action-decision-record"');
  });

  it('fails closed with build-capability guidance when stale panel commands target unsupported optional surfaces', async () => {
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
    expect(showInformationMessageMock).toHaveBeenLastCalledWith(
      'VI Comparison Report generation is not available in this extension build.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890',
      outcome: 'unsupported-command'
    });

    await tracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'abcdef1234567890'
    });
    expect(showInformationMessageMock).toHaveBeenLastCalledWith(
      'Diff prev for LabVIEW VIs requires VI Comparison Report support in this extension build.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'diffPrevious',
      hash: 'abcdef1234567890',
      outcome: 'unsupported-command'
    });

    await tracker.dispatchLastPanelMessage({
      command: 'openDashboard'
    });
    expect(showInformationMessageMock).toHaveBeenLastCalledWith(
      'VI Review Dashboard is not available in this extension build.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openDashboard',
      outcome: 'unsupported-command'
    });

    await tracker.dispatchLastPanelMessage({
      command: 'createDecisionRecord'
    });
    expect(showInformationMessageMock).toHaveBeenLastCalledWith(
      'VI review decision records are not available in this extension build.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'createDecisionRecord',
      outcome: 'unsupported-command'
    });

    await tracker.dispatchLastPanelMessage({
      command: 'openDocumentation',
      pageId: 'user-workflow'
    });
    expect(showInformationMessageMock).toHaveBeenLastCalledWith(
      'Bundled VI History documentation is not available in this extension build.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'openDocumentation',
      outcome: 'unsupported-command'
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
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
      'No retained VI Comparison Report exists for this pair yet. Use the compare preflight section to generate retained evidence for it.'
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

  it('surfaces a stable informational message when diffPrevious retained comparison evidence is stale or invalid', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const openRetainedComparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'invalid-retained-comparison-report'
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
      'Retained VI Comparison evidence for this pair is stale or invalid. Use the compare preflight section to rebuild retained evidence for it.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'diffPrevious',
      hash: 'abcdef1234567890',
      outcome: 'invalid-retained-comparison-report',
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

  it('uses retained-compare-specific cancellation messaging when diffPrevious opening is cancelled', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const openRetainedComparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'cancelled',
      cancellationStage: 'before-retained-comparison-open'
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
      'Opening retained VI Comparison Report was cancelled before the retained comparison view opened.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'diffPrevious',
      hash: 'abcdef1234567890',
      outcome: 'cancelled',
      reportStatus: undefined,
      runtimeExecutionState: undefined,
      blockedReason: undefined,
      runtimeFailureReason: undefined,
      cancellationStage: 'before-retained-comparison-open',
      packetFilePath: undefined,
      reportFilePath: undefined,
      metadataFilePath: undefined,
      reportWebviewUri: undefined,
      generatedReportExists: undefined,
      title: undefined
    });
  });

  it('routes diffPrevious through comparison-report generation when retained reopen support is unavailable', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      packetFilePath: '/workspace/.storage/reports/repo/file/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: 'webview:/report',
      generatedReportExists: false,
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
      comparisonReportAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'abcdef1234567890'
    });

    expect(comparisonReportAction).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedHash: 'abcdef1234567890',
        reportProgress: expect.any(Function)
      })
    );
    expect(showInformationMessageMock).not.toHaveBeenCalled();
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'diffPrevious',
      hash: 'abcdef1234567890',
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      blockedReason: undefined,
      runtimeFailureReason: undefined,
      cancellationStage: undefined,
      packetFilePath: '/workspace/.storage/reports/repo/file/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: 'webview:/report',
      generatedReportExists: false,
      title: 'VI Comparison Report: eligible.vi'
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

  it('creates a review decision record from retained dashboard evidence', async () => {
    const targetUri = createMockUri('/workspace/Tooling/deployment/VIP_Pre-Install Custom Action.vi');
    const tracker = new HistoryPanelTracker();
    const reviewDecisionRecordAction = vi.fn().mockResolvedValue({
      outcome: 'created-decision-record',
      scenarioId: 'SCENARIO-VHS-001',
      dashboardFilePath: '/workspace/.storage/dashboards/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/dashboard.json',
      decisionRecordJsonPath: '/workspace/.storage/decision-records/decision-record.json',
      decisionRecordMarkdownPath: '/workspace/.storage/decision-records/decision-record.md',
      title: 'Review Decision Record: VIP_Pre-Install Custom Action.vi'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'labview-icon-editor',
        repositoryRoot: '/workspace',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
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
      undefined,
      undefined,
      undefined,
      reviewDecisionRecordAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'createDecisionRecord'
    });

    expect(reviewDecisionRecordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({
          relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi'
        }),
        reportProgress: expect.any(Function)
      })
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'createDecisionRecord',
      outcome: 'created-decision-record',
      scenarioId: 'SCENARIO-VHS-001',
      dashboardFilePath: '/workspace/.storage/dashboards/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/dashboard.json',
      decisionRecordJsonPath: '/workspace/.storage/decision-records/decision-record.json',
      decisionRecordMarkdownPath: '/workspace/.storage/decision-records/decision-record.md',
      mismatchSummary: undefined,
      cancellationStage: undefined,
      title: 'Review Decision Record: VIP_Pre-Install Custom Action.vi'
    });
  });

  it('surfaces missing review-scenario failures from decision-record creation', async () => {
    const targetUri = createMockUri('/workspace/Tooling/deployment/VIP_Pre-Install Custom Action.vi');
    const tracker = new HistoryPanelTracker();
    const reviewDecisionRecordAction = vi.fn().mockResolvedValue({
      outcome: 'missing-review-scenario',
      dashboardFilePath: '/workspace/.storage/dashboards/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/dashboard.json'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
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
      undefined,
      undefined,
      undefined,
      reviewDecisionRecordAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'createDecisionRecord'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'No active VI review scenario matches this repository and VI yet.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'createDecisionRecord',
      outcome: 'missing-review-scenario',
      dashboardFilePath: '/workspace/.storage/dashboards/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/dashboard.json',
      decisionRecordJsonPath: undefined,
      decisionRecordMarkdownPath: undefined,
      scenarioId: undefined,
      mismatchSummary: undefined,
      cancellationStage: undefined,
      title: undefined
    });
  });

  it('surfaces missing decision-storage failures from decision-record creation', async () => {
    const targetUri = createMockUri('/workspace/Tooling/deployment/VIP_Pre-Install Custom Action.vi');
    const tracker = new HistoryPanelTracker();
    const reviewDecisionRecordAction = vi.fn().mockResolvedValue({
      outcome: 'missing-storage-uri'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
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
      undefined,
      undefined,
      undefined,
      reviewDecisionRecordAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'createDecisionRecord'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI review decision records require an open workspace so decision artifacts can be stored under workspace-scoped extension storage.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'createDecisionRecord',
      outcome: 'missing-decision-storage',
      dashboardFilePath: undefined,
      dashboardJsonFilePath: undefined,
      decisionRecordJsonPath: undefined,
      decisionRecordMarkdownPath: undefined,
      scenarioId: undefined,
      mismatchSummary: undefined,
      cancellationStage: undefined,
      title: undefined
    });
  });

  it('surfaces insufficient retained-commit failures from decision-record creation', async () => {
    const targetUri = createMockUri('/workspace/Tooling/deployment/VIP_Pre-Install Custom Action.vi');
    const tracker = new HistoryPanelTracker();
    const reviewDecisionRecordAction = vi.fn().mockResolvedValue({
      outcome: 'insufficient-commits'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
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

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      undefined,
      undefined,
      undefined,
      undefined,
      reviewDecisionRecordAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'createDecisionRecord'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI review decision records require at least three retained commits for the selected VI.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'createDecisionRecord',
      outcome: 'insufficient-decision-commits',
      dashboardFilePath: undefined,
      dashboardJsonFilePath: undefined,
      decisionRecordJsonPath: undefined,
      decisionRecordMarkdownPath: undefined,
      scenarioId: undefined,
      mismatchSummary: undefined,
      cancellationStage: undefined,
      title: undefined
    });
  });

  it('surfaces missing repository-url failures from decision-record creation', async () => {
    const targetUri = createMockUri('/workspace/Tooling/deployment/VIP_Pre-Install Custom Action.vi');
    const tracker = new HistoryPanelTracker();
    const reviewDecisionRecordAction = vi.fn().mockResolvedValue({
      outcome: 'missing-repository-url',
      dashboardFilePath: '/workspace/.storage/dashboards/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/dashboard.json'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
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
      undefined,
      undefined,
      undefined,
      reviewDecisionRecordAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'createDecisionRecord'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI review decision records require a Git origin remote URL so the active review scenario can be matched truthfully.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'createDecisionRecord',
      outcome: 'missing-repository-url',
      dashboardFilePath: '/workspace/.storage/dashboards/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/dashboard.json',
      decisionRecordJsonPath: undefined,
      decisionRecordMarkdownPath: undefined,
      scenarioId: undefined,
      mismatchSummary: undefined,
      cancellationStage: undefined,
      title: undefined
    });
  });

  it('surfaces scenario contract mismatches from decision-record creation', async () => {
    const targetUri = createMockUri('/workspace/Tooling/deployment/VIP_Pre-Install Custom Action.vi');
    const tracker = new HistoryPanelTracker();
    const reviewDecisionRecordAction = vi.fn().mockResolvedValue({
      outcome: 'scenario-contract-mismatch',
      mismatchSummary:
        'The retained dashboard evidence did not satisfy the selected review scenario contract.',
      dashboardFilePath: '/workspace/.storage/dashboards/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/dashboard.json'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
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
      undefined,
      undefined,
      undefined,
      reviewDecisionRecordAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'createDecisionRecord'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The retained dashboard evidence did not satisfy the selected review scenario contract.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'createDecisionRecord',
      outcome: 'scenario-contract-mismatch',
      dashboardFilePath: '/workspace/.storage/dashboards/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/dashboard.json',
      decisionRecordJsonPath: undefined,
      decisionRecordMarkdownPath: undefined,
      scenarioId: undefined,
      mismatchSummary:
        'The retained dashboard evidence did not satisfy the selected review scenario contract.',
      cancellationStage: undefined,
      title: undefined
    });
  });

  it('retains preserved decision-record artifacts when creation is cancelled after persistence', async () => {
    const targetUri = createMockUri('/workspace/Tooling/deployment/VIP_Pre-Install Custom Action.vi');
    const tracker = new HistoryPanelTracker();
    const reviewDecisionRecordAction = vi.fn().mockResolvedValue({
      outcome: 'cancelled',
      cancellationStage: 'before-decision-record-open',
      scenarioId: 'SCENARIO-VHS-001',
      dashboardFilePath: '/workspace/.storage/dashboards/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/dashboard.json',
      decisionRecordJsonPath: '/workspace/.storage/decision-records/decision-record.json',
      decisionRecordMarkdownPath: '/workspace/.storage/decision-records/decision-record.md',
      title: 'Review Decision Record: VIP_Pre-Install Custom Action.vi'
    });
    const historyService = {
      load: vi.fn().mockResolvedValue({
        repositoryName: 'repo',
        repositoryRoot: '/workspace',
        relativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
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
      undefined,
      undefined,
      undefined,
      reviewDecisionRecordAction as never
    );

    await command(targetUri as never);
    await tracker.dispatchLastPanelMessage({
      command: 'createDecisionRecord'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI review decision record creation was cancelled. Retained dashboard and decision-record artifacts, if any, were preserved.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'createDecisionRecord',
      outcome: 'cancelled',
      dashboardFilePath: '/workspace/.storage/dashboards/dashboard.html',
      dashboardJsonFilePath: '/workspace/.storage/dashboards/dashboard.json',
      decisionRecordJsonPath: '/workspace/.storage/decision-records/decision-record.json',
      decisionRecordMarkdownPath: '/workspace/.storage/decision-records/decision-record.md',
      scenarioId: 'SCENARIO-VHS-001',
      mismatchSummary: undefined,
      cancellationStage: 'before-decision-record-open',
      title: 'Review Decision Record: VIP_Pre-Install Custom Action.vi'
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
      runtimeDoctorSummaryLines: [
        'Selected provider=host-native; engine=labview-cli; platform=win32; bitness=x86.',
        'Provider request=auto.',
        'Next action: close the conflicting LabVIEW 2026 session or correct the selected host LabVIEW path before rerunning comparison report generation.'
      ],
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

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'Generate compare runtime failed. Provider: host-native. Provider request: auto. Failure reason: command-exited-nonzero. Diagnostic reason: labview-path-ignored-last-used-default. Next action: close the conflicting LabVIEW 2026 session or correct the selected host LabVIEW path before rerunning comparison report generation.'
    );
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890',
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'failed',
      blockedReason: undefined,
      runtimeFailureReason: 'command-exited-nonzero',
      comparisonRuntimePanelStatus: 'failed',
      comparisonRuntimePanelSummary:
        'Generate compare for abcdef12 vs 11111111. Provider: host-native. Provider request: auto. Report status: ready-for-runtime. Runtime state: failed. Failure reason: command-exited-nonzero. Diagnostic reason: labview-path-ignored-last-used-default.',
      comparisonRuntimePanelNextAction:
        'Next action: close the conflicting LabVIEW 2026 session or correct the selected host LabVIEW path before rerunning comparison report generation.',
      comparisonRuntimePanelDetails: [
        { label: 'Provider', value: 'host-native' },
        { label: 'Provider request', value: 'auto' },
        { label: 'Report status', value: 'ready-for-runtime' },
        { label: 'Runtime state', value: 'failed' },
        { label: 'Failure reason', value: 'command-exited-nonzero' },
        {
          label: 'Diagnostic reason',
          value: 'labview-path-ignored-last-used-default'
        }
      ],
      cancellationStage: undefined,
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
      packetFilePath: undefined,
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
      reportWebviewUri: 'webview:/report',
      generatedReportExists: undefined,
      title: 'VI Comparison Report: eligible.vi'
    });
  });

  it('posts the latest compare provider and acquisition summary back into the history panel', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'retained-comparison-report-evidence',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'windows-container-image-acquisition-failed',
      runtimeDoctorSummaryLines: [
        'Selected provider=windows-container; engine=labview-cli; platform=win32; bitness=x64.',
        'Provider request=auto.',
        'Provider decision: rejected host-native because existing LabVIEW-related processes or a listener on governed VI Server port 3364 already exist.',
        'Tool facts: WindowsContainerCapability=available; ContainerAcquisitionState=failed',
        'Next action: repair Docker connectivity or image registry access, then pull the governed Windows container image and rerun comparison report generation.'
      ],
      packetFilePath: '/workspace/.storage/reports/repo/file/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
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

    const panel = createWebviewPanelMock.mock.results[0]?.value as MockPanel | undefined;
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'Generate compare blocked. Provider: windows-container. Provider request: auto. Container image acquisition: failed. Rejected providers: host-native because existing LabVIEW-related processes or a listener on governed VI Server port 3364 already exist. Blocked reason: windows-container-image-acquisition-failed. Next action: repair Docker connectivity or image registry access, then pull the governed Windows container image and rerun comparison report generation.'
    );
    expect(panel?.webview.postMessage).toHaveBeenCalledWith({
      type: 'comparisonRuntimeResult',
      status: 'blocked',
      summary:
        'Generate compare for abcdef12 vs 11111111. Provider: windows-container. Provider request: auto. Report status: blocked-runtime. Runtime state: not-available. Container image acquisition: failed. Rejected providers: host-native because existing LabVIEW-related processes or a listener on governed VI Server port 3364 already exist. Blocked reason: windows-container-image-acquisition-failed.',
      nextAction:
        'Next action: repair Docker connectivity or image registry access, then pull the governed Windows container image and rerun comparison report generation.',
      details: [
        {
          label: 'Provider',
          value: 'windows-container'
        },
        {
          label: 'Provider request',
          value: 'auto'
        },
        {
          label: 'Report status',
          value: 'blocked-runtime'
        },
        {
          label: 'Runtime state',
          value: 'not-available'
        },
        {
          label: 'Container image acquisition',
          value: 'failed'
        },
        {
          label: 'Rejected providers',
          value:
            'host-native because existing LabVIEW-related processes or a listener on governed VI Server port 3364 already exist'
        },
        {
          label: 'Blocked reason',
          value: 'windows-container-image-acquisition-failed'
        }
      ]
    });
  });

  it('keeps legacy execution-mode-only doctor summaries readable as provider-request evidence', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'retained-comparison-report-evidence',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'docker-provider-unavailable',
      runtimeDoctorSummaryLines: [
        'Selected provider=windows-container; engine=labview-cli; platform=win32; bitness=x64.',
        'Selected execution mode=docker-only.',
        'Provider decision: rejected host-native because Host-native execution was not selected because docker-only execution was requested.',
        'Tool facts: WindowsContainerCapability=available; ContainerAcquisitionState=failed',
        'Next action: repair Docker connectivity or image registry access, then pull the governed Windows container image and rerun comparison report generation.'
      ],
      packetFilePath: '/workspace/.storage/reports/repo/file/report-packet.html',
      reportFilePath: '/workspace/.storage/reports/repo/file/diff-report-eligible.vi.html',
      metadataFilePath: '/workspace/.storage/reports/repo/file/report-metadata.json',
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

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'Generate compare blocked. Provider: windows-container. Provider request: docker. Container image acquisition: failed. Rejected providers: host-native because Host-native execution was not selected because docker-only execution was requested. Blocked reason: docker-provider-unavailable. Next action: repair Docker connectivity or image registry access, then pull the governed Windows container image and rerun comparison report generation.'
    );
    expect(tracker.getLastActionSummary()).toMatchObject({
      comparisonRuntimePanelSummary:
        'Generate compare for abcdef12 vs 11111111. Provider: windows-container. Provider request: docker. Report status: blocked-runtime. Runtime state: not-available. Container image acquisition: failed. Rejected providers: host-native because Host-native execution was not selected because docker-only execution was requested. Blocked reason: docker-provider-unavailable.',
      comparisonRuntimePanelDetails: [
        { label: 'Provider', value: 'windows-container' },
        { label: 'Provider request', value: 'docker' },
        { label: 'Report status', value: 'blocked-runtime' },
        { label: 'Runtime state', value: 'not-available' },
        { label: 'Container image acquisition', value: 'failed' },
        {
          label: 'Rejected providers',
          value:
            'host-native because Host-native execution was not selected because docker-only execution was requested'
        },
        { label: 'Blocked reason', value: 'docker-provider-unavailable' }
      ]
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
        message: 'Executing LabVIEW comparison-report runtime.',
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

  it('keeps compare row buttons off the history panel even after dashboard completion', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    let dashboardPrepared = false;
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
    const dashboardAction = vi.fn().mockImplementation(async () => {
      dashboardPrepared = true;
      return {
        outcome: 'opened-review-dashboard',
        dashboardFilePath: '/workspace/.storage/dashboards/repo/file/dashboard.html',
        dashboardJsonFilePath: '/workspace/.storage/dashboards/repo/file/dashboard.json',
        dashboardPairCount: 2,
        dashboardArchivedPairCount: 2,
        dashboardMissingPairCount: 0
      };
    });
    const retainedAvailability = vi.fn().mockImplementation(async () => dashboardPrepared);
    const openRetainedComparisonReportAction = vi.fn();

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      undefined,
      dashboardAction as never,
      openRetainedComparisonReportAction as never,
      retainedAvailability as never
    );

    await command(targetUri as never);

    const panel = createWebviewPanelMock.mock.results[0]?.value as MockPanel | undefined;
    expect(panel?.webview.html).not.toContain('data-command="diffPrevious"');
    expect(panel?.webview.html).not.toContain('data-testid="history-action-diff"');
    expect(panel?.webview.html).not.toContain('data-testid="history-action-report"');

    await tracker.dispatchLastPanelMessage({
      command: 'openDashboard'
    });

    expect(retainedAvailability).toHaveBeenCalledTimes(4);
    expect(panel?.webview.html).not.toContain('data-command="diffPrevious"');
    expect(panel?.webview.html).not.toContain('data-testid="history-action-diff"');
    expect(panel?.webview.html).not.toContain('data-testid="history-action-report"');
  });

  it('posts live compare-runtime progress into the history panel while comparison generation is running', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockImplementation(async ({ reportProgress }) => {
      reportProgress?.({
        message: 'Selecting comparison-report runtime.',
        increment: 20
      });
      reportProgress?.({
        message: 'Acquiring governed container image ghcr.io/example/windows-dashboard-benchmark:main.',
        increment: 10
      });
      reportProgress?.({
        message: 'Pulling governed container image: layer 1/4',
        increment: 1
      });
      reportProgress?.({
        message: 'Executing LabVIEW comparison-report runtime.',
        increment: 20
      });
      return {
        outcome: 'opened-comparison-report',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'succeeded'
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

    const panel = createWebviewPanelMock.mock.results[0]?.value as MockPanel | undefined;
    expect(panel?.webview.postMessage).toHaveBeenNthCalledWith(1, {
      type: 'comparisonRuntimeProgress',
      status: 'running',
      summary:
        'Generate compare for abcdef12 vs 11111111 in progress. Selecting comparison-report runtime.',
      nextAction:
        'Next action: wait for comparison report generation to finish or cancel from the VS Code progress notification if you need to stop this run.',
      details: []
    });
    expect(panel?.webview.postMessage).toHaveBeenNthCalledWith(2, {
      type: 'comparisonRuntimeProgress',
      status: 'acquiring',
      summary:
        'Generate compare for abcdef12 vs 11111111 in progress. Acquiring governed container image ghcr.io/example/windows-dashboard-benchmark:main.',
      nextAction:
        'Next action: wait for comparison report generation to finish or cancel from the VS Code progress notification if you need to stop this run.',
      details: []
    });
    expect(panel?.webview.postMessage).toHaveBeenNthCalledWith(3, {
      type: 'comparisonRuntimeProgress',
      status: 'acquiring',
      summary:
        'Generate compare for abcdef12 vs 11111111 in progress. Pulling governed container image: layer 1/4.',
      nextAction:
        'Next action: wait for comparison report generation to finish or cancel from the VS Code progress notification if you need to stop this run.',
      details: []
    });
    expect(panel?.webview.postMessage).toHaveBeenNthCalledWith(4, {
      type: 'comparisonRuntimeProgress',
      status: 'running',
      summary:
        'Generate compare for abcdef12 vs 11111111 in progress. Executing LabVIEW comparison-report runtime.',
      nextAction:
        'Next action: wait for comparison report generation to finish or cancel from the VS Code progress notification if you need to stop this run.',
      details: []
    });
    expect(panel?.webview.postMessage).toHaveBeenNthCalledWith(5, {
      type: 'comparisonRuntimeResult',
      status: 'succeeded',
      summary:
        'Generate compare for abcdef12 vs 11111111. Provider: none. Provider request: auto. Report status: ready-for-runtime. Runtime state: succeeded.',
      nextAction:
        'Next action: open the retained comparison packet for the full governed runtime summary.',
      details: [
        {
          label: 'Provider',
          value: 'none'
        },
        {
          label: 'Provider request',
          value: 'auto'
        },
        {
          label: 'Report status',
          value: 'ready-for-runtime'
        },
        {
          label: 'Runtime state',
          value: 'succeeded'
        }
      ]
    });
  });

  it('ignores disposed-panel progress posting failures during comparison generation', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockImplementation(async ({ reportProgress }) => {
      await reportProgress?.({
        message: 'Selecting comparison-report runtime.',
        increment: 20
      });
      return {
        outcome: 'opened-comparison-report',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'succeeded'
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

    const panel = createWebviewPanelMock.mock.results[0]?.value as MockPanel | undefined;
    panel?.webview.postMessage.mockImplementation(() => {
      throw new Error('Webview is disposed');
    });

    await expect(
      tracker.dispatchLastPanelMessage({
        command: 'generateComparisonReport',
        hash: 'abcdef1234567890'
      })
    ).resolves.toBeUndefined();

    expect(comparisonReportAction).toHaveBeenCalledTimes(1);
    expect(showErrorMessageMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).not.toHaveBeenCalledWith(
      expect.stringContaining('Webview is disposed')
    );
  });

  it('surfaces one concise success message from retained compare runtime truth', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      runtimeDoctorSummaryLines: [
        'Selected provider=windows-container; engine=labview-cli; platform=win32; bitness=x64.',
        'Provider request=auto.',
        'Provider decision: rejected host-native because existing LabVIEW-related processes or a listener on governed VI Server port 3364 already exist.',
        'Tool facts: WindowsContainerCapability=available; ContainerAcquisitionState=acquired',
        'Next action: open the retained comparison packet for the full governed runtime summary.'
      ]
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
      'Generate compare completed. Provider: windows-container. Provider request: auto. Container image acquisition: acquired. Rejected providers: host-native because existing LabVIEW-related processes or a listener on governed VI Server port 3364 already exist.'
    );
  });

  it('reopens the history panel with the last retained compare runtime truth already visible', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      runtimeDoctorSummaryLines: [
        'Selected provider=windows-container; engine=labview-cli; platform=win32; bitness=x64.',
        'Provider request=auto.',
        'Tool facts: WindowsContainerCapability=available; ContainerAcquisitionState=acquired',
        'Next action: open the retained comparison packet for the full governed runtime summary.'
      ]
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
    await command(targetUri as never);

    const reopenedPanel = createWebviewPanelMock.mock.results[1]?.value as MockPanel | undefined;
    expect(reopenedPanel?.webview.html).toContain('data-state="succeeded"');
    expect(reopenedPanel?.webview.html).toContain(
      'Generate compare for abcdef12 vs 11111111. Provider: windows-container. Provider request: auto. Report status: ready-for-runtime. Runtime state: succeeded. Container image acquisition: acquired.'
    );
    expect(reopenedPanel?.webview.html).toContain(
      'Next action: open the retained comparison packet for the full governed runtime summary.'
    );
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
    const openRetainedComparisonReportAction = vi.fn();

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction,
      undefined,
      openRetainedComparisonReportAction,
      retainedAvailability as never
    );

    await command(targetUri as never);

    const panel = createWebviewPanelMock.mock.results[0]?.value as MockPanel | undefined;
    expect(panel?.webview.html).not.toContain('data-testid="history-action-diff"');
    expect(panel?.webview.html).not.toContain('data-testid="history-action-report"');

    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890'
    });

    expect(panel?.webview.html).not.toContain('data-testid="history-action-diff"');
    expect(panel?.webview.html).not.toContain('data-testid="history-action-report"');
  });

  it('keeps the live history panel in generate state when compare opens without retained archive evidence', async () => {
    const targetUri = createMockUri('/workspace/eligible.vi');
    const tracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      generatedReportExists: true,
      retainedArchiveAvailable: false,
      archiveFailureReason: 'retained-archive-write-failed'
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
    const openRetainedComparisonReportAction = vi.fn();

    const command = createOpenViHistoryCommand(
      historyService as never,
      eligibilityIndexer as never,
      undefined,
      tracker,
      comparisonReportAction,
      undefined,
      openRetainedComparisonReportAction,
      retainedAvailability as never
    );

    await command(targetUri as never);

    const panel = createWebviewPanelMock.mock.results[0]?.value as MockPanel | undefined;
    expect(panel?.webview.html).not.toContain('data-testid="history-action-report"');

    await tracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI Comparison Report opened, but retained pair evidence was not archived for later reuse. Use the compare preflight section to rebuild retained evidence for this pair if it is not yet reviewable.'
    );
    expect(panel?.webview.html).not.toContain('data-testid="history-action-report"');
    expect(panel?.webview.html).not.toContain('data-testid="history-action-diff"');
    expect(tracker.getLastActionSummary()).toEqual({
      command: 'generateComparisonReport',
      hash: 'abcdef1234567890',
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      blockedReason: undefined,
      runtimeFailureReason: undefined,
      cancellationStage: undefined,
      packetFilePath: undefined,
      reportFilePath: undefined,
      metadataFilePath: undefined,
      reportWebviewUri: undefined,
      generatedReportExists: true,
      retainedArchiveAvailable: false,
      archiveFailureReason: 'retained-archive-write-failed',
      title: undefined
    });
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
        signature: 'BINX',
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
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI Comparison Report generation is not available in this extension build.'
    );
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
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI Review Dashboard is not available in this extension build.'
    );
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
        signature: 'BINX',
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
