import * as vscode from 'vscode';

import { resolveBenchmarkAuthorityRepoRoot } from './benchmarkAuthorityRepo';
import { buildHostLinuxBenchmarkIndicatorView } from './benchmarkStatusIndicator';
import {
  BenchmarkStatusSnapshot,
  loadBenchmarkStatusSnapshot
} from './benchmarkStatus';
import { HostLinuxBenchmarkRunner } from './hostLinuxBenchmarkRunner';

export interface BenchmarkStatusActionResult {
  outcome: 'opened-benchmark-status';
  title: string;
  windowsLatestRunPath?: string;
  hostLaunchReceiptPath?: string;
  hostLatestSummaryPath?: string;
  hostLogPath?: string;
  hostState: BenchmarkStatusSnapshot['hostLinux']['state'];
}

export function createBenchmarkStatusAction(
  context: vscode.ExtensionContext
): (request: { authorityRepoRoot: string }) => Promise<BenchmarkStatusActionResult> {
  let panel: vscode.WebviewPanel | undefined;
  let lastAuthorityRepoRoot: string | undefined;
  const runner = new HostLinuxBenchmarkRunner();
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  context.subscriptions.push(statusBarItem);

  const syncStatusBarItem = (snapshot: BenchmarkStatusSnapshot): void => {
    const indicator = buildHostLinuxBenchmarkIndicatorView({
      state: snapshot.hostLinux.state,
      latestProgressMessage: snapshot.hostLinux.latestProgress?.message,
      latestLogLine: snapshot.hostLinux.latestLogLine,
      statusSummary: snapshot.hostLinux.statusSummary
    });

    if (!indicator.visible || !indicator.text) {
      statusBarItem.hide();
      return;
    }

    statusBarItem.text = indicator.text;
    statusBarItem.tooltip = indicator.tooltip;
    statusBarItem.show();
  };

  const openStatus = async (request: {
    authorityRepoRoot: string;
  }): Promise<BenchmarkStatusActionResult> => {
    lastAuthorityRepoRoot = await resolveBenchmarkAuthorityRepoRoot(
      request.authorityRepoRoot
    );
    const snapshot = await loadBenchmarkStatusSnapshot(
      lastAuthorityRepoRoot,
      context.storageUri?.fsPath
    );
    syncStatusBarItem(snapshot);

    if (!panel) {
      panel = vscode.window.createWebviewPanel(
        'viHistorySuite.benchmarkStatus',
        'VI History Benchmark Status',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true
        }
      );

      panel.onDidDispose(() => {
        panel = undefined;
      });

      panel.webview.onDidReceiveMessage(async (message: {
        command?: string;
        filePath?: string;
      }) => {
        if (!panel) {
          return;
        }

        const command = String(message.command ?? '');
        if (command === 'refreshBenchmarkStatus' && lastAuthorityRepoRoot) {
          const refreshedSnapshot = await loadBenchmarkStatusSnapshot(
            lastAuthorityRepoRoot,
            context.storageUri?.fsPath
          );
          syncStatusBarItem(refreshedSnapshot);
          panel.title = 'VI History Benchmark Status';
          panel.webview.html = renderBenchmarkStatusPanelHtml(
            refreshedSnapshot,
            runner.isRunning()
          );
          return;
        }

        if (command === 'startHostLinuxBenchmark' && lastAuthorityRepoRoot) {
          if (runner.isRunning()) {
            void vscode.window.showInformationMessage(
              'The host Linux benchmark is already running.'
            );
            return;
          }
          const authorityRepoRoot = lastAuthorityRepoRoot;

          void vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Running Host Linux Benchmark',
              cancellable: true
            },
            async (progress, cancellationToken) => {
              try {
                await runner.start({
                  authorityRepoRoot,
                  cancellationToken,
                  reportProgress: (update) => {
                    progress.report(update);
                    statusBarItem.text = buildHostLinuxBenchmarkIndicatorView({
                      state: 'running',
                      latestProgressMessage: update.message,
                      statusSummary: update.message
                    }).text ?? '$(sync~spin) Host Linux benchmark';
                    statusBarItem.tooltip = `Host Linux benchmark\n\n${update.message}`;
                    statusBarItem.show();
                  }
                });
                void vscode.window.showInformationMessage(
                  'Host Linux benchmark completed. Refresh or reopen the benchmark status panel to inspect the retained summary.'
                );
              } catch (error) {
                void vscode.window.showWarningMessage(
                  error instanceof Error
                    ? error.message
                    : 'The host Linux benchmark did not complete successfully.'
                );
              } finally {
                if (panel) {
                  const refreshedSnapshot = await loadBenchmarkStatusSnapshot(
                    authorityRepoRoot,
                    context.storageUri?.fsPath
                  );
                  syncStatusBarItem(refreshedSnapshot);
                  panel.webview.html = renderBenchmarkStatusPanelHtml(
                    refreshedSnapshot,
                    runner.isRunning()
                  );
                }
              }
            }
          );
          return;
        }

        if (command === 'stopHostLinuxBenchmark' && lastAuthorityRepoRoot) {
          const authorityRepoRoot = lastAuthorityRepoRoot;
          try {
            await runner.stop(authorityRepoRoot);
            void vscode.window.showInformationMessage(
              'Stopped the host Linux benchmark container.'
            );
          } catch (error) {
            void vscode.window.showWarningMessage(
              error instanceof Error
                ? error.message
                : 'Could not stop the host Linux benchmark container.'
            );
          }
          if (panel) {
            const refreshedSnapshot = await loadBenchmarkStatusSnapshot(
              authorityRepoRoot,
              context.storageUri?.fsPath
            );
            syncStatusBarItem(refreshedSnapshot);
            panel.webview.html = renderBenchmarkStatusPanelHtml(
              refreshedSnapshot,
              runner.isRunning()
            );
          }
          return;
        }

        if (command === 'openFile' && message.filePath) {
          await vscode.commands.executeCommand(
            'vscode.open',
            vscode.Uri.file(message.filePath),
            {
              preview: false
            }
          );
        }
      });
    } else {
      panel.reveal(vscode.ViewColumn.Beside, false);
    }

    panel.title = 'VI History Benchmark Status';
    panel.webview.html = renderBenchmarkStatusPanelHtml(snapshot, runner.isRunning());

    return {
      outcome: 'opened-benchmark-status',
      title: panel.title,
      windowsLatestRunPath: snapshot.windowsBaseline.latestRunPath,
      hostLaunchReceiptPath: snapshot.hostLinux.launchReceiptPath,
      hostLatestSummaryPath: snapshot.hostLinux.latestSummaryPath,
      hostLogPath: snapshot.hostLinux.logPath,
      hostState: snapshot.hostLinux.state
    };
  };

  return openStatus;
}

export function renderBenchmarkStatusPanelHtml(
  snapshot: BenchmarkStatusSnapshot,
  runnerActive = false
): string {
  const windowsBaseline = snapshot.windowsBaseline;
  const hostLinux = snapshot.hostLinux;

  const windowsStateSummary =
    windowsBaseline.state === 'available'
      ? 'Completed retained Windows baseline'
      : windowsBaseline.state === 'different-target'
        ? 'Latest retained Windows dashboard run is for a different target'
        : 'No retained Windows baseline was discovered';
  const hostLinuxStateSummary =
    hostLinux.state === 'completed'
      ? 'Completed retained host Linux benchmark'
      : hostLinux.state === 'failed'
        ? 'Failed retained host Linux benchmark'
      : hostLinux.state === 'running'
        ? 'Host Linux benchmark is still running'
        : hostLinux.state === 'stalled'
          ? 'Host Linux benchmark appears stalled or silent'
          : 'No retained host Linux benchmark launch was discovered';
  const showStartButton = !runnerActive && hostLinux.state !== 'running';
  const showStopButton =
    runnerActive || hostLinux.state === 'running' || hostLinux.state === 'stalled';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VI History Benchmark Status</title>
    <style>
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 16px;
      }
      .status,
      .section,
      .log {
        margin-bottom: 16px;
        padding: 12px;
        border: 1px solid var(--vscode-panel-border);
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(260px, 1fr));
        gap: 8px 16px;
      }
      .state {
        font-weight: 700;
      }
      .state-running {
        color: var(--vscode-testing-iconQueued);
      }
      .state-stalled {
        color: var(--vscode-testing-iconFailed);
      }
      .state-completed,
      .state-available {
        color: var(--vscode-testing-iconPassed);
      }
      .state-missing,
      .state-different-target {
        color: var(--vscode-descriptionForeground);
      }
      .actions {
        margin-top: 12px;
      }
      button {
        margin-right: 8px;
        margin-bottom: 8px;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        margin: 0;
      }
      .note {
        border-left: 4px solid var(--vscode-textLink-foreground);
        padding-left: 10px;
      }
    </style>
  </head>
  <body>
    <div class="status">
      <strong>Canonical benchmark status</strong><br />
      <div>Target: <code>${escapeHtml(snapshot.targetRelativePath)}</code></div>
      <div>Harness: <code>${escapeHtml(snapshot.harnessId)}</code></div>
      <div>Recorded: <code>${escapeHtml(snapshot.recordedAt)}</code></div>
      <div class="actions">
        <button data-command="refreshBenchmarkStatus">Refresh</button>
        ${showStartButton ? '<button data-command="startHostLinuxBenchmark">Run host Linux benchmark</button>' : ''}
        ${showStopButton ? '<button data-command="stopHostLinuxBenchmark">Stop host Linux benchmark</button>' : ''}
        ${renderOpenFileButton(
          'Open retained Windows baseline manifest',
          windowsBaseline.latestRunPath
        )}
        ${renderOpenFileButton(
          'Open retained host Linux launch receipt',
          hostLinux.launchReceiptPath
        )}
        ${renderOpenFileButton(
          'Open retained host Linux summary',
          hostLinux.latestSummaryPath
        )}
        ${renderOpenFileButton(
          'Open retained host Linux progress receipt',
          hostLinux.latestProgressPath
        )}
        ${renderOpenFileButton('Open retained host Linux log', hostLinux.logPath)}
      </div>
      <div class="note">
        Use this panel, not Task Manager or background processes, as the front-facing benchmark truth surface on the canonical host.
      </div>
    </div>

    <div class="section" data-testid="benchmark-status-windows">
      <div class="state state-${escapeHtml(windowsBaseline.state)}">${escapeHtml(
        windowsStateSummary
      )}</div>
      <div class="meta">
        <div><strong>Latest target:</strong> <code>${escapeHtml(
          windowsBaseline.relativePath ?? 'not retained'
        )}</code></div>
        <div><strong>Generated at:</strong> <code>${escapeHtml(
          windowsBaseline.generatedAt ?? 'not retained'
        )}</code></div>
        <div><strong>Compare pairs:</strong> ${escapeHtml(
          formatOptionalNumber(windowsBaseline.comparePairCount)
        )}</div>
        <div><strong>Prepared pairs:</strong> ${escapeHtml(
          formatOptionalNumber(windowsBaseline.preparedPairCount)
        )}</div>
        <div><strong>Generated reports:</strong> ${escapeHtml(
          formatOptionalNumber(windowsBaseline.generatedReportCount)
        )}</div>
        <div><strong>Provider summary:</strong> ${escapeHtml(
          windowsBaseline.providerSummary ?? 'not retained'
        )}</div>
        <div><strong>Total duration:</strong> ${escapeHtml(
          formatOptionalDurationMs(windowsBaseline.totalDurationMs)
        )}</div>
        <div><strong>Evidence preparation:</strong> ${escapeHtml(
          formatOptionalDurationMs(windowsBaseline.evidencePreparationDurationMs)
        )}</div>
        <div><strong>ETA MAPE:</strong> ${escapeHtml(
          formatOptionalPercent(windowsBaseline.etaMeanAbsolutePercentageError)
        )}</div>
      </div>
    </div>

    <div class="section" data-testid="benchmark-status-linux">
      <div class="state state-${escapeHtml(hostLinux.state)}">${escapeHtml(
        hostLinuxStateSummary
      )}</div>
      <div>${escapeHtml(hostLinux.statusSummary)}</div>
      <div class="meta">
        <div><strong>Source workspace:</strong> <code>${escapeHtml(
          hostLinux.launchReceipt?.sourceAuthorityRepoPath ??
            hostLinux.benchmarkWorkspaceRoot ??
            'not resolved'
        )}</code></div>
        <div><strong>Mounted benchmark workspace:</strong> <code>${escapeHtml(
          hostLinux.launchReceipt?.repoPath ??
            hostLinux.benchmarkWorkspaceRoot ??
            'not resolved'
        )}</code></div>
        <div><strong>Started at:</strong> <code>${escapeHtml(
          hostLinux.launchReceipt?.startedAt ?? 'not retained'
        )}</code></div>
        <div><strong>Completed at:</strong> <code>${escapeHtml(
          hostLinux.latestSummary?.completedAt ?? 'not retained'
        )}</code></div>
        <div><strong>Progress phase:</strong> ${escapeHtml(
          hostLinux.latestProgress?.phase ?? 'not retained'
        )}</div>
        <div><strong>Progress update:</strong> ${escapeHtml(
          hostLinux.latestProgress?.message ?? 'not retained'
        )}</div>
        <div><strong>Benchmark image:</strong> <code>${escapeHtml(
          hostLinux.launchReceipt?.image ??
            hostLinux.latestSummary?.benchmarkImage?.reference ??
            'not retained'
        )}</code></div>
        <div><strong>Log updated:</strong> <code>${escapeHtml(
          hostLinux.logUpdatedAt ?? 'not retained'
        )}</code></div>
        <div><strong>Log quiet for:</strong> ${escapeHtml(
          formatOptionalSeconds(hostLinux.secondsSinceLogUpdate)
        )}</div>
        <div><strong>Metadata files materialized:</strong> ${escapeHtml(
          formatOptionalNumber(hostLinux.materializedMetadataCount)
        )}</div>
        <div><strong>Generated reports:</strong> ${escapeHtml(
          formatOptionalNumber(hostLinux.latestSummary?.generatedReportCount)
        )}</div>
        <div><strong>Failed pairs:</strong> ${escapeHtml(
          formatOptionalNumber(hostLinux.latestSummary?.failedPairCount)
        )}</div>
        <div><strong>Terminal diagnostic:</strong> ${escapeHtml(
          hostLinux.latestSummary?.terminalPairDiagnosticReason ?? 'not retained'
        )}</div>
        <div><strong>Blocked pairs:</strong> ${escapeHtml(
          formatOptionalNumber(hostLinux.latestSummary?.blockedPairCount)
        )}</div>
        <div><strong>Total pair preparation:</strong> ${escapeHtml(
          formatOptionalSeconds(hostLinux.latestSummary?.totalPairPreparationSeconds)
        )}</div>
        <div><strong>Mean pair preparation:</strong> ${escapeHtml(
          formatOptionalSeconds(hostLinux.latestSummary?.meanPairPreparationSeconds)
        )}</div>
      </div>
    </div>

    <div class="log" data-testid="benchmark-status-log-tail">
      <strong>Latest host Linux log lines</strong><br />
      <pre>${escapeHtml(
        hostLinux.latestLogLines.length > 0
          ? hostLinux.latestLogLines.join('\n')
          : 'No retained host Linux log lines were discovered yet.'
      )}</pre>
    </div>

    <script>
      const vscode = acquireVsCodeApi();
      document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement)) {
          return;
        }
        const command = target.dataset.command;
        if (!command) {
          return;
        }
        const payload = { command };
        if (command === 'openFile' && target.dataset.filePath) {
          payload.filePath = target.dataset.filePath;
        }
        vscode.postMessage(payload);
      });
      window.setInterval(() => {
        vscode.postMessage({ command: 'refreshBenchmarkStatus' });
      }, 5000);
    </script>
  </body>
</html>`;
}

function renderOpenFileButton(label: string, filePath: string | undefined): string {
  if (!filePath) {
    return '';
  }
  return `<button data-command="openFile" data-file-path="${escapeHtml(filePath)}">${escapeHtml(
    label
  )}</button>`;
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? 'not retained' : String(value);
}

function formatOptionalDurationMs(value: number | undefined): string {
  if (value === undefined) {
    return 'not retained';
  }
  if (value >= 3_600_000) {
    return `${round(value / 3_600_000)}h`;
  }
  if (value >= 60_000) {
    return `${round(value / 60_000)}m`;
  }
  return `${round(value / 1000)}s`;
}

function formatOptionalSeconds(value: number | undefined): string {
  if (value === undefined) {
    return 'not retained';
  }
  if (value >= 3600) {
    return `${round(value / 3600)}h`;
  }
  if (value >= 60) {
    return `${round(value / 60)}m`;
  }
  return `${round(value)}s`;
}

function formatOptionalPercent(value: number | undefined): string {
  return value === undefined ? 'not retained' : `${round(value)}%`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
