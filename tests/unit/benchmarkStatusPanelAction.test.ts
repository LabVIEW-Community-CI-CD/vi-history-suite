import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createStatusBarItemMock,
  createWebviewPanelMock,
  executeCommandMock,
  loadBenchmarkStatusSnapshotMock,
  resolveBenchmarkAuthorityRepoRootMock,
  showInformationMessageMock,
  showWarningMessageMock,
  startRunnerMock,
  stopRunnerMock,
  runnerState,
  withProgressMock
} = vi.hoisted(() => ({
  createStatusBarItemMock: vi.fn(),
  createWebviewPanelMock: vi.fn(),
  executeCommandMock: vi.fn(),
  loadBenchmarkStatusSnapshotMock: vi.fn(),
  resolveBenchmarkAuthorityRepoRootMock: vi.fn(),
  showInformationMessageMock: vi.fn(),
  showWarningMessageMock: vi.fn(),
  startRunnerMock: vi.fn(),
  stopRunnerMock: vi.fn(),
  runnerState: {
    isRunning: false
  },
  withProgressMock: vi.fn()
}));

function createMockStatusBarItem() {
  return {
    text: '',
    tooltip: undefined as string | undefined,
    show: vi.fn(),
    hide: vi.fn()
  };
}

function createMockPanel(title: string) {
  let disposeListener: (() => void) | undefined;
  let messageListener:
    | ((message: { command?: string; filePath?: string }) => void | Promise<void>)
    | undefined;

  return {
    title,
    reveal: vi.fn(),
    onDidDispose: (listener: () => void) => {
      disposeListener = listener;
      return {
        dispose() {
          // no-op
        }
      };
    },
    webview: {
      html: '',
      onDidReceiveMessage: (
        listener: (message: { command?: string; filePath?: string }) => void | Promise<void>
      ) => {
        messageListener = listener;
        return {
          dispose() {
            // no-op
          }
        };
      }
    },
    async __dispatchMessage(message: { command?: string; filePath?: string }) {
      await messageListener?.(message);
    },
    __dispose() {
      disposeListener?.();
    }
  };
}

vi.mock('vscode', () => ({
  window: {
    createStatusBarItem: createStatusBarItemMock,
    createWebviewPanel: createWebviewPanelMock,
    showInformationMessage: showInformationMessageMock,
    showWarningMessage: showWarningMessageMock,
    withProgress: withProgressMock
  },
  commands: {
    executeCommand: executeCommandMock
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath })
  },
  ViewColumn: {
    Beside: 2
  },
  StatusBarAlignment: {
    Left: 1
  },
  ProgressLocation: {
    Notification: 15
  }
}));

vi.mock('../../src/benchmark/benchmarkAuthorityRepo', () => ({
  resolveBenchmarkAuthorityRepoRoot: resolveBenchmarkAuthorityRepoRootMock
}));

vi.mock('../../src/benchmark/benchmarkStatus', () => ({
  loadBenchmarkStatusSnapshot: loadBenchmarkStatusSnapshotMock
}));

vi.mock('../../src/benchmark/hostLinuxBenchmarkRunner', () => ({
  HostLinuxBenchmarkRunner: class {
    isRunning() {
      return runnerState.isRunning;
    }

    async start(...args: unknown[]) {
      return startRunnerMock(...args);
    }

    async stop(...args: unknown[]) {
      return stopRunnerMock(...args);
    }
  }
}));

import {
  createBenchmarkStatusAction,
  renderBenchmarkStatusPanelHtml
} from '../../src/benchmark/benchmarkStatusAction';

describe('benchmarkStatus panel action', () => {
  beforeEach(() => {
    createStatusBarItemMock.mockReset();
    createWebviewPanelMock.mockReset();
    executeCommandMock.mockReset();
    loadBenchmarkStatusSnapshotMock.mockReset();
    resolveBenchmarkAuthorityRepoRootMock.mockReset();
    showInformationMessageMock.mockReset();
    showWarningMessageMock.mockReset();
    startRunnerMock.mockReset();
    stopRunnerMock.mockReset();
    withProgressMock.mockReset();
    runnerState.isRunning = false;

    createStatusBarItemMock.mockImplementation(() => createMockStatusBarItem());
    createWebviewPanelMock.mockImplementation((_viewType: string, title: string) =>
      createMockPanel(title)
    );
    withProgressMock.mockImplementation(
      async (
        _options: unknown,
        task: (
          progress: { report(update: { message?: string; increment?: number }): void },
          token: { isCancellationRequested: boolean }
        ) => Promise<void>
      ) => {
        await task(
          {
            report() {
              // no-op
            }
          },
          {
            isCancellationRequested: false
          }
        );
      }
    );
    resolveBenchmarkAuthorityRepoRootMock.mockResolvedValue('/authority/repo');
  });

  it('renders escaped retained benchmark details and the correct action buttons', () => {
    const html = renderBenchmarkStatusPanelHtml(
      buildSnapshot({
        windowsBaseline: {
          state: 'different-target',
          relativePath: '<different>.vi',
          providerSummary: 'windows-container',
          comparePairCount: 15,
          preparedPairCount: 15,
          generatedReportCount: 14,
          totalDurationMs: 120000,
          evidencePreparationDurationMs: 65000,
          etaMeanAbsolutePercentageError: 12.345
        },
        hostLinux: {
          state: 'stalled',
          launchReceiptPath: '/tmp/<launch>.json',
          latestSummaryPath: '/tmp/summary.json',
          latestProgressPath: '/tmp/progress.json',
          logPath: "/tmp/it's.log",
          statusSummary: 'Still running <stalled>',
          latestLogLines: ['line 1', 'line <2>'],
          secondsSinceLogUpdate: 3661,
          materializedMetadataCount: 7,
          latestProgress: {
            phase: 'prepare-pairs',
            message: 'Preparing'
          },
          latestSummary: {
            completedAt: '2026-04-07T20:30:00.000Z',
            benchmarkImage: {
              reference: 'ghcr.io/example/image:main'
            },
            generatedReportCount: 11,
            failedPairCount: 2,
            terminalPairDiagnosticReason: 'diag',
            blockedPairCount: 3,
            totalPairPreparationSeconds: 125,
            meanPairPreparationSeconds: 6.5
          },
          launchReceipt: {
            startedAt: '2026-04-07T20:00:00.000Z',
            sourceAuthorityRepoPath: '/source/<repo>',
            repoPath: '/mounted/workspace',
            image: 'ghcr.io/example/image:main'
          }
        }
      }),
      false
    );

    expect(html).toContain('&lt;different&gt;.vi');
    expect(html).toContain('Latest retained Windows dashboard run is for a different target');
    expect(html).toContain('Host Linux benchmark appears stalled or silent');
    expect(html).toContain('Run host Linux benchmark');
    expect(html).toContain('Stop host Linux benchmark');
    expect(html).toContain('/tmp/&lt;launch&gt;.json');
    expect(html).toContain('1.017h');
    expect(html).toContain('2m');
    expect(html).toContain('12.345%');
    expect(html).toContain('line &lt;2&gt;');
    expect(html).toContain('/tmp/it&#39;s.log');
  });

  it('renders not-retained placeholders and hides open-file buttons when retained paths are absent', () => {
    const html = renderBenchmarkStatusPanelHtml(
      buildSnapshot({
        windowsBaseline: {
          totalDurationMs: 4_500_000,
          evidencePreparationDurationMs: undefined,
          etaMeanAbsolutePercentageError: undefined
        },
        hostLinux: {
          state: 'missing',
          launchReceiptPath: undefined,
          latestSummaryPath: undefined,
          latestProgressPath: undefined,
          logPath: undefined,
          secondsSinceLogUpdate: undefined,
          latestSummary: undefined,
          latestProgress: undefined
        }
      }),
      true
    );

    expect(html).toContain('1.25h');
    expect(html).toContain('<strong>Evidence preparation:</strong> not retained');
    expect(html).toContain('<strong>ETA MAPE:</strong> not retained');
    expect(html).toContain('<strong>Log quiet for:</strong> not retained');
    expect(html).not.toContain('Open retained host Linux launch receipt');
    expect(html).not.toContain('Run host Linux benchmark');
    expect(html).toContain('Stop host Linux benchmark');
  });

  it('opens and reuses the retained benchmark status panel while syncing the status bar', async () => {
    loadBenchmarkStatusSnapshotMock.mockResolvedValue(
      buildSnapshot({
        hostLinux: {
          state: 'running',
          statusSummary: 'Running benchmark',
          latestProgress: {
            phase: 'run',
            message: 'Preparing pair 1/3'
          }
        }
      })
    );

    const action = createBenchmarkStatusAction({
      subscriptions: [],
      storageUri: { fsPath: '/workspace/storage' }
    } as never);

    await expect(
      action({
        authorityRepoRoot: '/workspace/request'
      })
    ).resolves.toEqual({
      outcome: 'opened-benchmark-status',
      title: 'VI History Benchmark Status',
      windowsLatestRunPath: '/workspace/storage/dashboards/latest-dashboard-run.json',
      hostLaunchReceiptPath: '/authority/repo/.cache/host-linux-dashboard-benchmark/latest-launch.json',
      hostLatestSummaryPath:
        '/authority/repo/.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-002/latest-summary.json',
      hostLogPath: '/authority/repo/.cache/host-linux-dashboard-benchmark/run.log',
      hostState: 'running'
    });

    const panel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    const statusBar = createStatusBarItemMock.mock.results[0]?.value as ReturnType<
      typeof createMockStatusBarItem
    >;
    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
    expect(statusBar.show).toHaveBeenCalled();
    expect(statusBar.text).toContain('Host Linux benchmark');
    expect(panel.webview.html).toContain('Running benchmark');

    await action({
      authorityRepoRoot: '/workspace/request'
    });

    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
    expect(panel.reveal).toHaveBeenCalledWith(2, false);
  });

  it('refreshes the panel and routes openFile messages', async () => {
    loadBenchmarkStatusSnapshotMock
      .mockResolvedValueOnce(
        buildSnapshot({
          hostLinux: {
            state: 'missing',
            statusSummary: 'Before refresh',
            latestLogLines: []
          }
        })
      )
      .mockResolvedValueOnce(
        buildSnapshot({
          hostLinux: {
            state: 'completed',
            statusSummary: 'After refresh',
            latestLogLines: ['done']
          }
        })
      );

    const action = createBenchmarkStatusAction({
      subscriptions: [],
      storageUri: { fsPath: '/workspace/storage' }
    } as never);
    await action({
      authorityRepoRoot: '/workspace/request'
    });

    const panel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    await panel.__dispatchMessage({
      command: 'refreshBenchmarkStatus'
    });
    await panel.__dispatchMessage({
      command: 'openFile',
      filePath: '/tmp/report.html'
    });

    expect(panel.webview.html).toContain('After refresh');
    expect(executeCommandMock).toHaveBeenCalledWith(
      'vscode.open',
      { fsPath: '/tmp/report.html' },
      { preview: false }
    );
  });

  it('handles running, successful, failing, and stopped benchmark commands through the panel messages', async () => {
    loadBenchmarkStatusSnapshotMock.mockResolvedValue(buildSnapshot());
    const action = createBenchmarkStatusAction({
      subscriptions: [],
      storageUri: { fsPath: '/workspace/storage' }
    } as never);
    await action({
      authorityRepoRoot: '/workspace/request'
    });
    const panel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    const statusBar = createStatusBarItemMock.mock.results[0]?.value as ReturnType<
      typeof createMockStatusBarItem
    >;

    runnerState.isRunning = true;
    await panel.__dispatchMessage({
      command: 'startHostLinuxBenchmark'
    });
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The host Linux benchmark is already running.'
    );

    runnerState.isRunning = false;
    startRunnerMock.mockImplementationOnce(async ({ reportProgress }) => {
      await reportProgress({
        message: 'Preparing dashboard pair 1/3'
      });
    });
    await panel.__dispatchMessage({
      command: 'startHostLinuxBenchmark'
    });
    await flushAsyncWork();
    expect(withProgressMock).toHaveBeenCalled();
    expect(statusBar.text).toContain('Host Linux benchmark');
    expect(showInformationMessageMock).toHaveBeenLastCalledWith(
      'Host Linux benchmark completed. Refresh or reopen the benchmark status panel to inspect the retained summary.'
    );

    startRunnerMock.mockRejectedValueOnce(new Error('runner failed'));
    await panel.__dispatchMessage({
      command: 'startHostLinuxBenchmark'
    });
    await flushAsyncWork();
    expect(showWarningMessageMock).toHaveBeenLastCalledWith('runner failed');

    stopRunnerMock.mockResolvedValueOnce(undefined);
    await panel.__dispatchMessage({
      command: 'stopHostLinuxBenchmark'
    });
    expect(stopRunnerMock).toHaveBeenCalledWith('/authority/repo');
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'Stopped the host Linux benchmark container.'
    );

    stopRunnerMock.mockRejectedValueOnce(new Error('stop failed'));
    await panel.__dispatchMessage({
      command: 'stopHostLinuxBenchmark'
    });
    expect(showWarningMessageMock).toHaveBeenLastCalledWith('stop failed');
  });

  it('creates a fresh panel after the retained one is disposed', async () => {
    loadBenchmarkStatusSnapshotMock.mockResolvedValue(buildSnapshot());
    const action = createBenchmarkStatusAction({
      subscriptions: [],
      storageUri: { fsPath: '/workspace/storage' }
    } as never);

    await action({
      authorityRepoRoot: '/workspace/request'
    });
    const firstPanel = createWebviewPanelMock.mock.results[0]?.value as ReturnType<
      typeof createMockPanel
    >;
    firstPanel.__dispose();
    await firstPanel.__dispatchMessage({
      command: 'refreshBenchmarkStatus'
    });

    await action({
      authorityRepoRoot: '/workspace/request'
    });

    expect(createWebviewPanelMock).toHaveBeenCalledTimes(2);
  });
});

function buildSnapshot(
  overrides?: Partial<ReturnType<typeof buildSnapshotBase>>
) {
  return {
    ...buildSnapshotBase(),
    ...overrides,
    windowsBaseline: {
      ...buildSnapshotBase().windowsBaseline,
      ...overrides?.windowsBaseline
    },
    hostLinux: {
      ...buildSnapshotBase().hostLinux,
      ...overrides?.hostLinux,
      launchReceipt: {
        ...buildSnapshotBase().hostLinux.launchReceipt,
        ...overrides?.hostLinux?.launchReceipt
      },
      latestSummary: {
        ...buildSnapshotBase().hostLinux.latestSummary,
        ...overrides?.hostLinux?.latestSummary
      },
      latestProgress: overrides?.hostLinux?.latestProgress
        ? {
            ...buildSnapshotBase().hostLinux.latestProgress,
            ...overrides.hostLinux.latestProgress
          }
        : overrides?.hostLinux?.latestProgress
    }
  };
}

function buildSnapshotBase() {
  return {
    recordedAt: '2026-04-07T20:40:00.000Z',
    harnessId: 'HARNESS-VHS-002',
    targetRelativePath: 'resource/plugins/lv_icon.vi',
    windowsBaseline: {
      state: 'available' as const,
      latestRunPath: '/workspace/storage/dashboards/latest-dashboard-run.json',
      relativePath: 'resource/plugins/lv_icon.vi',
      generatedAt: '2026-04-07T20:30:00.000Z',
      comparePairCount: 5,
      preparedPairCount: 5,
      generatedReportCount: 5,
      providerSummary: 'windows-container / labview-cli / x64 / win32 (5)',
      totalDurationMs: 90000,
      evidencePreparationDurationMs: 30000,
      etaMeanAbsolutePercentageError: 4.321
    },
    hostLinux: {
      state: 'running' as const,
      benchmarkWorkspaceRoot: '/authority/repo',
      launchReceiptPath: '/authority/repo/.cache/host-linux-dashboard-benchmark/latest-launch.json',
      latestSummaryPath:
        '/authority/repo/.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-002/latest-summary.json',
      latestProgressPath:
        '/authority/repo/.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-002/latest-progress.json',
      reportRoot:
        '/authority/repo/.cache/harness-reports/HARNESS-VHS-002/workspace-storage/reports',
      logPath: '/authority/repo/.cache/host-linux-dashboard-benchmark/run.log',
      logUpdatedAt: '2026-04-07T20:39:00.000Z',
      secondsSinceLogUpdate: 30,
      latestLogLines: ['running'],
      latestLogLine: 'running',
      materializedMetadataCount: 5,
      statusSummary: 'running',
      launchReceipt: {
        startedAt: '2026-04-07T20:00:00.000Z',
        sourceAuthorityRepoPath: '/authority/repo',
        repoPath: '/authority/repo',
        image: 'ghcr.io/example/image:main'
      },
      latestSummary: {
        completedAt: '2026-04-07T20:30:00.000Z',
        benchmarkImage: {
          reference: 'ghcr.io/example/image:main'
        },
        generatedReportCount: 5,
        failedPairCount: 0,
        terminalPairDiagnosticReason: undefined,
        blockedPairCount: 0,
        totalPairPreparationSeconds: 25,
        meanPairPreparationSeconds: 5
      },
      latestProgress: {
        phase: 'run',
        message: 'Preparing dashboard pair 1/3'
      }
    }
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
