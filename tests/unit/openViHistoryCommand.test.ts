import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';
import { HistoryPanelTracker } from '../../src/ui/historyPanelTracker';
import { defaultVsCodeTestHarness as vscodeHarness } from './vscodeTestHarness';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import { createOpenViHistoryCommand } from '../../src/commands/openViHistoryCommand';

const showInformationMessageMock = vscodeHarness.vscode.window.showInformationMessage;
const showWarningMessageMock = vscodeHarness.vscode.window.showWarningMessage;
const showErrorMessageMock = vscodeHarness.vscode.window.showErrorMessage;
const workspaceState = vscodeHarness.workspaceState;
const clipboardWriteTextMock = vscodeHarness.vscode.env.clipboard.writeText;
const createWebviewPanelMock = vscodeHarness.vscode.window.createWebviewPanel;

function createIneligibleModel(
  overrides: Partial<ViHistoryViewModel>
): ViHistoryViewModel {
  return {
    repositoryName: 'repo',
    repositoryRoot: '/workspace/repo',
    relativePath: 'file.vi',
    signature: 'LVIN',
    eligible: false,
    commits: [],
    ...overrides
  };
}

describe('openViHistoryCommand ineligibility messaging (VHS-REQ-016)', () => {
  beforeEach(() => {
    vscodeHarness.reset();
    workspaceState.isTrusted = true;
  });

  it('shows unknown-signature and no-history guidance', async () => {
    const historyService = {
      load: vi.fn().mockResolvedValue(
        createIneligibleModel({
          signature: 'unknown',
          commits: []
        })
      )
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined
    );

    await command({ fsPath: '/workspace/repo/file.txt' } as never);

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The selected file is not a recognized LabVIEW VI format and has no Git commit history. Open a tracked LabVIEW VI (.vi, .vim, .vit, .ctl, .ctt, .lvclass, .lvlib) with at least two commits.'
    );
  });

  it('shows unknown-signature guidance when history exists', async () => {
    const historyService = {
      load: vi.fn().mockResolvedValue(
        createIneligibleModel({
          signature: 'unknown',
          commits: [
            { hash: 'a1', authorDate: '2024-01-01', authorName: 'Dev', subject: 'Commit 1' },
            { hash: 'b2', authorDate: '2024-01-02', authorName: 'Dev', subject: 'Commit 2' }
          ]
        })
      )
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined
    );

    await command({ fsPath: '/workspace/repo/file.txt' } as never);

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The selected file is not a recognized LabVIEW VI format. Open a LabVIEW VI (.vi, .vim, .vit, .ctl, .ctt, .lvclass, .lvlib) to view its history.'
    );
  });

  it('shows no-history guidance for recognized LabVIEW files', async () => {
    const historyService = {
      load: vi.fn().mockResolvedValue(
        createIneligibleModel({
          signature: 'LVIN',
          commits: []
        })
      )
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined
    );

    await command({ fsPath: '/workspace/repo/file.vi' } as never);

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The selected file has no Git commit history. Commit the file at least twice to build reviewable history.'
    );
  });

  it('shows single-commit guidance for recognized LabVIEW files', async () => {
    const historyService = {
      load: vi.fn().mockResolvedValue(
        createIneligibleModel({
          signature: 'LVIN',
          commits: [
            {
              hash: 'a1',
              authorDate: '2024-01-01',
              authorName: 'Dev',
              subject: 'Initial commit'
            }
          ]
        })
      )
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined
    );

    await command({ fsPath: '/workspace/repo/file.vi' } as never);

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The selected file has only one Git commit. Commit additional changes to build reviewable history.'
    );
  });
});

function createEligibleModel(overrides: Partial<ViHistoryViewModel> = {}): ViHistoryViewModel {
  return {
    repositoryName: 'test-repo',
    repositoryRoot: '/workspace/test-repo',
    repositoryUrl: 'https://github.com/org/test-repo',
    relativePath: 'src/Sample.vi',
    signature: 'LVIN',
    eligible: true,
    commits: [
      {
        hash: 'abc1234567890abcdef1234567890abcdef12345',
        authorName: 'Test Author',
        authorDate: '2025-01-20',
        subject: 'Update sample',
        previousHash: 'def1234567890abcdef1234567890abcdef12345'
      },
      {
        hash: 'def1234567890abcdef1234567890abcdef12345',
        authorName: 'Test Author',
        authorDate: '2025-01-15',
        subject: 'Add sample'
      }
    ],
    ...overrides
  };
}

function createMockPanel() {
  return {
    title: 'VI History: Sample.vi',
    webview: {
      html: '',
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn().mockResolvedValue(true)
    },
    onDidDispose: vi.fn(),
    dispose: vi.fn()
  };
}

describe('openViHistoryCommand copyReviewPacket path (VHS-REQ-039)', () => {
  beforeEach(() => {
    vscodeHarness.reset();
    workspaceState.isTrusted = true;
    clipboardWriteTextMock.mockResolvedValue(undefined);
    createWebviewPanelMock.mockReturnValue(createMockPanel());
  });

  it('writes review packet plain text to the clipboard', async () => {
    const model = createEligibleModel();
    const historyService = {
      load: vi.fn().mockResolvedValue(model)
    };
    const panelTracker = new HistoryPanelTracker();

    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker
    );

    await command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'copyReviewPacket' });

    expect(clipboardWriteTextMock).toHaveBeenCalledOnce();
    const [writtenText] = clipboardWriteTextMock.mock.calls[0] as [string];
    expect(writtenText).toContain('VI History Review Packet');
    expect(writtenText).toContain('Repository: test-repo');
    expect(writtenText).toContain('Path: src/Sample.vi');
    expect(writtenText).toContain('Signature: LVIN');
  });

  it('records copied-review-packet action in panel tracker after a successful copy', async () => {
    const model = createEligibleModel();
    const historyService = {
      load: vi.fn().mockResolvedValue(model)
    };
    const panelTracker = new HistoryPanelTracker();

    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker
    );

    await command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'copyReviewPacket' });

    const actionSummary = panelTracker.getLastActionSummary();
    expect(actionSummary?.command).toBe('copyReviewPacket');
    expect(actionSummary?.outcome).toBe('copied-review-packet');
    expect(typeof actionSummary?.copiedTextLength).toBe('number');
    expect(actionSummary?.copiedTextLength).toBeGreaterThan(0);
  });

  it('records copiedTextLength matching the actual clipboard text length', async () => {
    const model = createEligibleModel();
    const historyService = {
      load: vi.fn().mockResolvedValue(model)
    };
    const panelTracker = new HistoryPanelTracker();

    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker
    );

    await command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'copyReviewPacket' });

    const [writtenText] = clipboardWriteTextMock.mock.calls[0] as [string];
    const actionSummary = panelTracker.getLastActionSummary();
    expect(actionSummary?.copiedTextLength).toBe(writtenText.length);
  });

  it('does not record a copied-review-packet outcome when clipboard write throws', async () => {
    clipboardWriteTextMock.mockRejectedValue(new Error('clipboard unavailable'));
    const model = createEligibleModel();
    const historyService = {
      load: vi.fn().mockResolvedValue(model)
    };
    const panelTracker = new HistoryPanelTracker();

    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker
    );

    await command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never);
    await expect(
      panelTracker.dispatchLastPanelMessage({ command: 'copyReviewPacket' })
    ).rejects.toThrow('clipboard unavailable');

    expect(panelTracker.getLastActionSummary()?.outcome).not.toBe('copied-review-packet');
  });

  it('does not call clipboard when panelTracker has no recorded panel', async () => {
    const panelTracker = new HistoryPanelTracker();

    await panelTracker.dispatchLastPanelMessage({ command: 'copyReviewPacket' });

    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
  });

  it('does not crash when no panelTracker is provided', async () => {
    const model = createEligibleModel();
    const historyService = {
      load: vi.fn().mockResolvedValue(model)
    };

    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined
      // no panelTracker
    );

    await expect(
      command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never)
    ).resolves.toBeUndefined();
  });
});

describe('openViHistoryCommand harness-backed routing and explicit stops', () => {
  beforeEach(() => {
    vscodeHarness.reset();
    workspaceState.isTrusted = true;
    clipboardWriteTextMock.mockResolvedValue(undefined);
  });

  it('stops with guidance when no URI or active editor is available', async () => {
    const historyService = { load: vi.fn() };
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined
    );

    await command();

    expect(historyService.load).not.toHaveBeenCalled();
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'Select a tracked LabVIEW VI to open VI History.'
    );
  });

  it('honors workspace trust before loading history', async () => {
    workspaceState.isTrusted = false;
    const historyService = { load: vi.fn() };
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined
    );

    await command(vscodeHarness.createUri('/workspace/repo/Sample.vi') as never);

    expect(historyService.load).not.toHaveBeenCalled();
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI History and comparison are disabled in untrusted workspaces to prevent external process execution. Documentation and local runtime settings CLI preparation remain available.'
    );
  });

  it('surfaces history service load errors without opening a panel', async () => {
    const historyService = {
      load: vi.fn().mockRejectedValue(new Error('fatal: not a git repository'))
    };
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined
    );

    await command(vscodeHarness.createUri('/workspace/repo/Sample.vi') as never);

    expect(showErrorMessageMock).toHaveBeenCalledWith(
      'VI History could not load the selected file because it is not inside a tracked Git repository. Open a local Git-backed LabVIEW VI with commit history instead.'
    );
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('routes documentation requests and records fallback to bundled overview', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const openDocumentationAction = vi
      .fn()
      .mockResolvedValueOnce({ outcome: 'unknown-documentation-page', pageId: 'missing-page' })
      .mockResolvedValueOnce({
        outcome: 'opened-documentation',
        pageId: 'overview',
        pageTitle: 'Overview',
        manifestFilePath: '/extension/resources/bundled-docs/manifest.json',
        pageFilePath: '/extension/resources/bundled-docs/pages/overview.html',
        title: 'VI History Docs: Overview'
      });
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      openDocumentationAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'openDocumentation',
      pageId: 'missing-page'
    });

    expect(openDocumentationAction).toHaveBeenNthCalledWith(1, { pageId: 'missing-page' });
    expect(openDocumentationAction).toHaveBeenNthCalledWith(2);
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI History could not resolve the requested bundled documentation page. Opened the bundled overview page instead.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'openDocumentation',
      outcome: 'opened-documentation',
      requestedDocumentationPageId: 'missing-page',
      documentationPageId: 'overview',
      documentationPageTitle: 'Overview',
      documentationFallbackUsed: true
    });
  });

  it('records explicit cancellation stage when comparison generation is stopped', async () => {    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'cancelled',
      cancellationStage: 'before-runtime-execution'
    });
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(comparisonReportAction).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedHash: 'abc1234567890abcdef1234567890abcdef12345'
      })
    );
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI History comparison report generation was cancelled. Retained comparison-report artifacts, if any, were preserved.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'generateComparisonReport',
      outcome: 'cancelled',
      cancellationStage: 'before-runtime-execution'
    });
  });

  it('dispatches a working-tree selection to the comparison action with the sentinel against the chosen commit (VHS-REQ-641)', async () => {
    const model = createEligibleModel({
      workingTree: { hasUncommittedChanges: true, headHash: 'abc1234567890abcdef1234567890abcdef12345' }
    });
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded'
    });
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    // Working-tree row checkbox (WORKTREE) plus an older committed revision.
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReportFromSelection',
      selectedHashes: ['WORKTREE', 'def1234567890abcdef1234567890abcdef12345']
    });

    expect(comparisonReportAction).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedHash: 'WORKTREE',
        baseHash: 'def1234567890abcdef1234567890abcdef12345'
      })
    );
  });

  it('offers a Pick Runtime Provider action when the runtime is blocked by a concurrent LabVIEW bitness conflict (VHS-REQ-621)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'missing-retained-comparison-report',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'windows-host-bitness-conflict',
      runtimeDoctorSummaryLines: [
        'Selected provider=unavailable; engine=none; platform=win32; bitness=x86.',
        'Provider request=host.',
        'Runtime blocked reason: windows-host-bitness-conflict.',
        'Next action: close the running LabVIEW x64 session, or set viHistorySuite.labviewBitness to x64 (currently x86), then rerun comparison report generation.'
      ]
    });
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('windows-host-bitness-conflict'),
      'Pick Runtime Provider'
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(vscodeHarness.vscode.commands.executeCommand).toHaveBeenCalledWith(
      'labviewViHistory.pickRuntimeProvider'
    );
  });

  it('offers a Pick Runtime Provider action when the runtime is blocked by a concurrent LabVIEW version conflict (VHS-REQ-653)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'missing-retained-comparison-report',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'windows-host-version-conflict',
      runtimeDoctorSummaryLines: [
        'Selected provider=unavailable; engine=none; platform=win32; bitness=x64.',
        'Provider request=host.',
        'Runtime blocked reason: windows-host-version-conflict.',
        'Next action: close the running LabVIEW 2025 session, set viHistorySuite.labviewVersion to 2025 (currently 2026), or use a Docker-backed x64 compare, then rerun comparison report generation.'
      ]
    });
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('windows-host-version-conflict'),
      'Pick Runtime Provider'
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(vscodeHarness.vscode.commands.executeCommand).toHaveBeenCalledWith(
      'labviewViHistory.pickRuntimeProvider'
    );
  });

  it('offers a Pick Runtime Provider action when comparison runtime reclassifies failure as labview-host-bitness-conflict (VHS-REQ-621)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'missing-retained-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'failed',
      runtimeFailureReason: 'labview-host-bitness-conflict',
      runtimeDoctorSummaryLines: [
        'Selected provider=host-native; engine=labview-cli; platform=win32; bitness=x86.',
        'Provider request=host.',
        'Runtime failure reason: labview-host-bitness-conflict.',
        'Next action: close the running LabVIEW session that contended with comparison-report execution, or set viHistorySuite.labviewBitness to match the running LabVIEW (currently x86), then rerun comparison report generation.'
      ]
    });
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('labview-host-bitness-conflict'),
      'Pick Runtime Provider'
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(vscodeHarness.vscode.commands.executeCommand).toHaveBeenCalledWith(
      'labviewViHistory.pickRuntimeProvider'
    );
  });

  it('offers a Pick Image Version action when the runtime is blocked by a container image platform mismatch (VHS-REQ-650)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'missing-retained-comparison-report',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'container-image-platform-mismatch',
      runtimeDoctorSummaryLines: [
        'Selected provider=unavailable; engine=none; platform=win32; bitness=x64.',
        'Provider request=docker.',
        'Runtime blocked reason: container-image-platform-mismatch.',
        'Next action: the selected viHistorySuite.container.imageVersion targets a different platform than the active Docker engine (linux-container mode); switch Docker to the matching container engine or select a linux image version (or clear viHistorySuite.container.imageVersion to use the default), then rerun comparison report generation.'
      ]
    });
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('container-image-platform-mismatch'),
      'Pick Image Version'
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(vscodeHarness.vscode.commands.executeCommand).toHaveBeenCalledWith(
      'labviewViHistory.pickContainerImageVersion'
    );
  });

  it('opens the image-version picker when the preflight Pick Image Version CTA posts its command (VHS-REQ-650)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'pickContainerImageVersion' });

    expect(vscodeHarness.vscode.commands.executeCommand).toHaveBeenCalledWith(
      'labviewViHistory.pickContainerImageVersion'
    );
  });

  it('recomputes and re-renders the preflight after the Pick Image Version picker runs (VHS-REQ-650)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const panel = createMockPanel();
    createWebviewPanelMock.mockReturnValue(panel);

    // Blocked-by-mismatch on first resolve (panel open), remediated to ready on
    // the second resolve (after the picker writes a compatible image setting).
    const comparePreflightResolver = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'blocked',
        provider: 'docker',
        labviewVersion: '2026',
        labviewBitness: 'x64',
        nextAction: 'Next action: pick a matching image version.',
        cliHint: 'Use settings CLI',
        blockedReason: 'container-image-platform-mismatch'
      })
      .mockResolvedValueOnce({
        status: 'ready',
        provider: 'docker',
        labviewVersion: '2026',
        labviewBitness: 'x64',
        nextAction: 'Next action: choose Compare.',
        cliHint: 'Use settings CLI'
      });

    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      // A comparison action must be injected for comparison generation (and thus
      // the compare preflight) to be available; it is never invoked here.
      vi.fn() as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      comparePreflightResolver
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    // Panel opens blocked: the CTA is present.
    expect(panel.webview.html).toContain('data-testid="history-action-pick-image-version"');

    await panelTracker.dispatchLastPanelMessage({ command: 'pickContainerImageVersion' });

    // The picker ran, the preflight was recomputed (second resolver call), and
    // the panel re-rendered to the now-ready state with the CTA gone.
    expect(vscodeHarness.vscode.commands.executeCommand).toHaveBeenCalledWith(
      'labviewViHistory.pickContainerImageVersion'
    );
    expect(comparePreflightResolver).toHaveBeenCalledTimes(2);
    expect(panel.webview.html).not.toContain('data-testid="history-action-pick-image-version"');
  });

  it('records missing Git URI instead of opening stale revision content', async () => {    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const gitApi = { toGitUri: vi.fn().mockReturnValue(undefined) };
    const command = createOpenViHistoryCommand(
      historyService as never,
      gitApi as never,
      panelTracker
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'openCommit',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(vscodeHarness.vscode.commands.executeCommand).not.toHaveBeenCalled();
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI History could not resolve the selected Git revision.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'openCommit',
      hash: 'abc1234567890abcdef1234567890abcdef12345',
      outcome: 'missing-git-uri'
    });
  });

  it('shows a concise Docker Desktop toast and suppresses the verbose runtime warning when the Docker daemon is not running (VHS-REQ-642)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'blocked-docker-daemon-not-running',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'docker-provider-unavailable',
      dockerCliAvailable: true,
      dockerDaemonReachable: false,
      platform: 'win32',
      retainedArchiveAvailable: true,
      runtimeDoctorSummaryLines: [
        'Selected provider=unavailable; engine=none; platform=win32; bitness=x64.',
        'Runtime blocked reason: docker-provider-unavailable.'
      ]
    });
    const openRetainedComparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report'
    });
    // User dismisses the toast so no follow-up action runs.
    showWarningMessageMock.mockResolvedValueOnce(undefined);
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction,
      undefined,
      openRetainedComparisonReportAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('Docker Desktop is not running'),
      'Retry',
      'Show diagnostics'
    );
    // Only the concise daemon-down toast is shown; the verbose runtime-diagnostics
    // warning (which names the blocked reason) is suppressed. Scan the first
    // argument of every warning call so a multi-arg call (e.g., one carrying a
    // "Pick Runtime Provider" action) cannot mask a regression.
    const warningMessages = showWarningMessageMock.mock.calls.map((callArgs) => callArgs[0]);
    expect(warningMessages).toHaveLength(1);
    expect(
      warningMessages.some(
        (message) =>
          typeof message === 'string' && message.includes('docker-provider-unavailable')
      )
    ).toBe(false);
    expect(comparisonReportAction).toHaveBeenCalledTimes(1);
  });

  it('names the Docker daemon (not Docker Desktop) on non-Windows hosts (VHS-REQ-642)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'blocked-docker-daemon-not-running',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'docker-only-provider-unavailable',
      dockerCliAvailable: true,
      dockerDaemonReachable: false,
      platform: 'linux',
      retainedArchiveAvailable: true
    });
    showWarningMessageMock.mockResolvedValueOnce(undefined);
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction,
      undefined,
      vi.fn().mockResolvedValue({ outcome: 'opened-comparison-report' })
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('The Docker daemon is not running'),
      'Retry',
      'Show diagnostics'
    );
    const warningMessages = showWarningMessageMock.mock.calls.map((callArgs) => callArgs[0]);
    expect(
      warningMessages.some(
        (message) => typeof message === 'string' && message.includes('Docker Desktop')
      )
    ).toBe(false);
  });

  it('re-runs the comparison for the same revision pair when Retry is selected (VHS-REQ-642)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'blocked-docker-daemon-not-running',
        reportStatus: 'blocked-runtime',
        runtimeExecutionState: 'not-available',
        blockedReason: 'docker-provider-unavailable',
        dockerCliAvailable: true,
        dockerDaemonReachable: false,
        retainedArchiveAvailable: true
      })
      .mockResolvedValue({
        outcome: 'opened-comparison-report',
        reportStatus: 'ready-for-runtime',
        runtimeExecutionState: 'succeeded'
      });
    // Default harness showWarningMessage resolves to the first action (Retry).
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction,
      undefined,
      vi.fn().mockResolvedValue({ outcome: 'opened-comparison-report' })
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(comparisonReportAction).toHaveBeenCalledTimes(2);
    expect(comparisonReportAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectedHash: 'abc1234567890abcdef1234567890abcdef12345'
      })
    );
  });

  it('opens the retained diagnostics packet for the same pair when Show diagnostics is selected (VHS-REQ-642)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'blocked-docker-daemon-not-running',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'docker-provider-unavailable',
      dockerCliAvailable: true,
      dockerDaemonReachable: false,
      retainedArchiveAvailable: true
    });
    const openRetainedComparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report'
    });
    showWarningMessageMock.mockResolvedValueOnce('Show diagnostics');
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction,
      undefined,
      openRetainedComparisonReportAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(openRetainedComparisonReportAction).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedHash: 'abc1234567890abcdef1234567890abcdef12345'
      })
    );
    expect(comparisonReportAction).toHaveBeenCalledTimes(1);
  });

  it('shows an Install Docker toast and suppresses the verbose warning when Docker is not installed (VHS-REQ-643)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'blocked-docker-not-installed',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'docker-provider-unavailable',
      dockerCliAvailable: false,
      dockerDaemonReachable: false,
      platform: 'win32',
      retainedArchiveAvailable: true
    });
    const openRetainedComparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report'
    });
    // Select Install Docker so the install URL opens.
    showWarningMessageMock.mockResolvedValueOnce('Install Docker');
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction,
      undefined,
      openRetainedComparisonReportAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('Docker Desktop is not installed'),
      'Install Docker',
      'Show diagnostics'
    );
    // The verbose runtime-diagnostics warning is suppressed: exactly one warning fires.
    const warningMessages = showWarningMessageMock.mock.calls.map((callArgs) => callArgs[0]);
    expect(warningMessages).toHaveLength(1);
    expect(
      warningMessages.some(
        (message) =>
          typeof message === 'string' && message.includes('docker-provider-unavailable')
      )
    ).toBe(false);
    // Install Docker opens the external install URL.
    expect(vscodeHarness.vscode.env.openExternal).toHaveBeenCalledTimes(1);
    expect(
      vscodeHarness.openedExternalUris.some((uri) => uri.includes('docker-desktop'))
    ).toBe(true);
    expect(comparisonReportAction).toHaveBeenCalledTimes(1);
  });

  it('names Docker (not Docker Desktop) in the not-installed toast on non-Windows hosts (VHS-REQ-643)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'blocked-docker-not-installed',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'docker-only-provider-unavailable',
      dockerCliAvailable: false,
      dockerDaemonReachable: false,
      platform: 'linux',
      retainedArchiveAvailable: true
    });
    showWarningMessageMock.mockResolvedValueOnce(undefined);
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction,
      undefined,
      vi.fn().mockResolvedValue({ outcome: 'opened-comparison-report' })
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('Docker is not installed'),
      'Install Docker',
      'Show diagnostics'
    );
    const warningMessages = showWarningMessageMock.mock.calls.map((callArgs) => callArgs[0]);
    expect(
      warningMessages.some(
        (message) => typeof message === 'string' && message.includes('Docker Desktop')
      )
    ).toBe(false);
  });
});

describe('openViHistoryCommand open-flow gate branches (VHS-REQ-006/013/627/631)', () => {
  beforeEach(() => {
    vscodeHarness.reset();
    workspaceState.isTrusted = true;
    vscodeHarness.vscode.window.activeTextEditor = undefined;
    createWebviewPanelMock.mockReturnValue(createMockPanel());
  });

  it('falls back to the active editor URI when invoked without an explicit URI (VHS-REQ-006)', async () => {
    const activeUri = vscodeHarness.createUri('/workspace/repo/active.vi');
    vscodeHarness.vscode.window.activeTextEditor = { document: { uri: activeUri } };
    const historyService = {
      load: vi
        .fn()
        .mockResolvedValue(createIneligibleModel({ signature: 'LVIN', commits: [] }))
    };

    const command = createOpenViHistoryCommand(historyService as never, undefined);

    await command(undefined);

    expect(historyService.load).toHaveBeenCalledTimes(1);
    const [loadedUri] = historyService.load.mock.calls[0] as [{ fsPath: string }];
    expect(loadedUri.fsPath).toBe(activeUri.fsPath);
  });

  it('surfaces a generic load-failure message when history load throws (VHS-REQ-013)', async () => {
    const historyService = { load: vi.fn().mockRejectedValue(new Error('boom')) };

    const command = createOpenViHistoryCommand(historyService as never, undefined);

    await command({ fsPath: '/workspace/repo/file.vi' } as never);

    expect(showErrorMessageMock).toHaveBeenCalledWith(
      'VI History could not load the selected file.'
    );
    expect(createWebviewPanelMock).not.toHaveBeenCalled();
  });

  it('routes eligible models through an injected compare preflight resolver (VHS-REQ-627/631)', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const comparePreflightResolver = vi.fn().mockResolvedValue({
      status: 'ready',
      provider: 'host',
      labviewVersion: '2025',
      labviewBitness: '64'
    });

    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      comparePreflightResolver
    );

    await command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never);

    expect(comparePreflightResolver).toHaveBeenCalledTimes(1);
    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
  });
});

