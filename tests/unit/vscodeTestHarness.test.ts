import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import { createMultiReportDashboardAction } from '../../src/dashboard/multiReportDashboardAction';
import { createOpenViHistoryCommand } from '../../src/commands/openViHistoryCommand';
import { createComparisonReportAction } from '../../src/reporting/comparisonReportAction';
import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';
import {
  admitLocalRuntimeSettingsCliToTerminalPath,
  runLocalRuntimeSettingsCli
} from '../../src/tooling/localRuntimeSettingsCli';
import { defaultVsCodeTestHarness as harness } from './vscodeTestHarness';

function createModel(): ViHistoryViewModel {
  return {
    repositoryName: 'repo',
    repositoryRoot: '/workspace/repo',
    relativePath: 'Sample.vi',
    signature: 'LVIN',
    eligible: true,
    commits: [
      {
        hash: 'c3',
        previousHash: 'b2',
        authorDate: '2026-01-03',
        authorName: 'Dev',
        subject: 'Third'
      },
      {
        hash: 'b2',
        previousHash: 'a1',
        authorDate: '2026-01-02',
        authorName: 'Dev',
        subject: 'Second'
      },
      {
        hash: 'a1',
        authorDate: '2026-01-01',
        authorName: 'Dev',
        subject: 'First'
      }
    ]
  };
}

describe('VS Code unit test harness (VHS-REQ-614)', () => {
  beforeEach(() => {
    harness.reset();
  });

  it('provides reusable fakes for commands, webviews, storage, fs, clipboard, progress, and output', async () => {
    const context = harness.createContext();
    await context.workspaceState.update('cache-key', { restored: true });

    harness.vscode.commands.registerCommand('vihs.test', (value: string) => `handled:${value}`);
    const commandResult = await harness.vscode.commands.executeCommand('vihs.test', 'payload');

    const panel = harness.vscode.window.createWebviewPanel(
      'vihs.panel',
      'Harness Panel',
      harness.vscode.ViewColumn.Active,
      {}
    );
    const receivedMessages: unknown[] = [];
    panel.webview.onDidReceiveMessage((message: unknown) => {
      receivedMessages.push(message);
    });
    await panel.dispatchMessage({ command: 'ping' });
    await panel.webview.postMessage({ command: 'pong' });

    const uri = harness.createUri('/workspace/repo/file.vi');
    await harness.vscode.workspace.fs.writeFile(uri, new TextEncoder().encode('LVIN'));
    await harness.vscode.env.clipboard.writeText('review packet');
    await harness.vscode.window.withProgress({ title: 'Indexing' }, async (progress: never) => {
      (progress as { report(update: unknown): void }).report({ message: 'Halfway', increment: 50 });
    });
    const output = harness.vscode.window.createOutputChannel('VI History');
    output.appendLine('ready');

    expect(commandResult).toBe('handled:payload');
    expect(context.workspaceState.get('cache-key')).toEqual({ restored: true });
    expect(new TextDecoder().decode(await harness.vscode.workspace.fs.readFile(uri))).toBe('LVIN');
    expect(receivedMessages).toEqual([{ command: 'ping' }]);
    expect(panel.webview.postedMessages).toEqual([{ command: 'pong' }]);
    expect(harness.clipboardWrites).toEqual(['review packet']);
    expect(harness.progressReports).toEqual([
      { options: { title: 'Indexing' }, update: { message: 'Halfway', increment: 50 } }
    ]);
    expect(output.text()).toContain('ready');
  });

  it('supports open command coverage with workspace trust and user message fakes', async () => {
    harness.setWorkspaceTrusted(false);
    const historyService = { load: vi.fn() };
    const command = createOpenViHistoryCommand(
      historyService as never,
      {} as never,
      undefined
    );

    await command(harness.createUri('/workspace/repo/Sample.vi') as never);

    expect(historyService.load).not.toHaveBeenCalled();
    expect(harness.vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'VI History indexing and comparison are disabled in untrusted workspaces to prevent external process execution. Documentation and local runtime settings CLI preparation remain available.'
    );
  });

  it('supports comparison and dashboard action coverage with context and progress seams', async () => {
    harness.setWorkspaceTrusted(false);
    const context = harness.createContext();
    const comparisonAction = createComparisonReportAction(context as never);
    const dashboardAction = createMultiReportDashboardAction(context as never);

    await expect(
      comparisonAction({
        model: createModel(),
        selectedHash: 'c3',
        reportProgress: vi.fn()
      })
    ).resolves.toEqual({ outcome: 'workspace-untrusted' });
    await expect(
      dashboardAction({
        model: createModel(),
        reportProgress: vi.fn()
      })
    ).resolves.toEqual({ outcome: 'workspace-untrusted' });
  });

  it('supports installed runtime settings CLI coverage with context, fs, env, and stream fakes', async () => {
    const context = harness.createContext();
    const fakeFs = harness.createNodeFs();
    harness.writeNodeFile(
      '/workspace/vi-history-suite/out/tooling/localRuntimeSettingsCli.js',
      'module.exports = {};'
    );

    const materialized = await admitLocalRuntimeSettingsCliToTerminalPath(
      context.globalStorageUri.fsPath,
      context.extensionPath,
      context.environmentVariableCollection,
      {
        fs: fakeFs,
        platform: 'linux',
        env: {},
        homedir: () => '/home/test'
      }
    );
    const stdout = harness.createWritableStream();
    const result = await runLocalRuntimeSettingsCli([], { stdout });

    expect(context.environmentVariableCollection.prepend).toHaveBeenCalledWith(
      'PATH',
      materialized.pathPrependValue
    );
    expect(fakeFs.writeFile).toHaveBeenCalledWith(
      materialized.javascriptLauncherPath,
      expect.stringContaining('localRuntimeSettingsCli.js'),
      'utf8'
    );
    expect(result).toEqual({ outcome: 'help' });
    expect(stdout.text()).toContain('vihs');
  });
});
