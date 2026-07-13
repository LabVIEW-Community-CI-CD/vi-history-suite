import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';
import { HistoryPanelTracker } from '../../src/ui/historyPanelTracker';
import { defaultVsCodeTestHarness as vscodeHarness } from './vscodeTestHarness';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

// VHS-REQ-659: the previewRevision command routes through isViPreviewEnabled and
// materializeRevisionViTree. Mock them so preview branches are deterministic and
// no real Git/child process or temp directory is created. The mutable state is
// hoisted so the mock factory (hoisted above imports) can reference it, and each
// test sets it explicitly. The real modules are replaced entirely, so viPreviewEditor
// (imported only for VI_PREVIEW_VIEW_TYPE) resolves its viPreviewRenderHost bindings
// to these stubs without loading the heavy real host.
const previewState = vi.hoisted(() => ({ enabled: false }));
const revisionTreeMock = vi.hoisted(() => ({ materialize: vi.fn() }));

vi.mock('../../src/ui/viPreviewRenderHost', () => ({
  isViPreviewEnabled: () => previewState.enabled,
  buildViPreviewRenderDeps: vi.fn(() => ({})),
  createViPreviewCache: vi.fn(() => ({})),
  getViPreviewOperationDirectory: vi.fn(() => '/workspace/preview-op'),
  resolvePreviewRuntime: vi.fn(async () => ({}))
}));

vi.mock('../../src/git/revisionViTree', () => ({
  materializeRevisionViTree: (...args: unknown[]) => revisionTreeMock.materialize(...args),
  parseLsTreeOutput: vi.fn(() => [])
}));

// Stub only the temp-directory primitives previewRevision touches so no real
// scratch directory is created and the deferred cleanup timer is a no-op; every
// other node:fs/promises function keeps its real behavior for the rest of the graph.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdtemp: vi.fn(async (prefix: string) => `${prefix}FAKE`),
    rm: vi.fn(async () => undefined)
  };
});

import {
  createCopyReviewPacketCommand,
  createOpenViHistoryCommand
} from '../../src/commands/openViHistoryCommand';

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

describe('openViHistoryCommand ineligibility messaging (VHS-REQ-013.2, VHS-REQ-013.3, VHS-REQ-016.2, VHS-REQ-635.3, VHS-REQ-635.4)', () => {
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

  it('writes review packet plain text to the clipboard (VHS-REQ-039.2)', async () => {
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

  it('stops with guidance when no URI or active editor is available (VHS-REQ-016.1)', async () => {
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

  it('honors workspace trust before loading history (VHS-REQ-016.3, VHS-REQ-012.1, VHS-REQ-012.2, VHS-REQ-012.4)', async () => {
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

  it('surfaces history service load errors without opening a panel (VHS-REQ-016.4)', async () => {
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

  it('dispatches a working-tree selection to the comparison action with the sentinel against the chosen commit (VHS-REQ-641.1, VHS-REQ-641.2)', async () => {
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

  it('shows a concise close + Retry Compare toast when blocked by a concurrent LabVIEW bitness conflict (VHS-REQ-621.5, #530)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const panel = createMockPanel();
    createWebviewPanelMock.mockReturnValue(panel);
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'blocked-host-bitness-conflict',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'windows-host-bitness-conflict',
      hostObservedLabviewBitness: 'x64',
      hostObservedLabviewVersion: '2025',
      selectedLabviewBitness: 'x86',
      selectedLabviewVersion: '2025',
      runtimeDoctorSummaryLines: [
        'Selected provider=unavailable; engine=none; platform=win32; bitness=x86.',
        'Provider decision: rejected host-native because A supported LabVIEW 2025 or newer executable was located, but canonical CreateComparisonReport execution could not proceed because LabVIEWCLI was not located.',
        'Runtime blocked reason: windows-host-bitness-conflict.',
        'Next action: close the running LabVIEW x64 session, or set viHistorySuite.labviewBitness to x64 (currently x86), then rerun comparison report generation.'
      ]
    });
    // The harness resolves a warning toast to its first action; suppress so the
    // Retry Compare action does not recurse in this assertion-only test.
    showWarningMessageMock.mockResolvedValueOnce(undefined);
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
      expect.stringContaining('LabVIEW 2025 (64-bit) is already running'),
      'Retry Compare'
    );
    const [message] = showWarningMessageMock.mock.calls.at(-1)!;
    expect(message).toContain('LabVIEW 2025 (32-bit)');
    expect(message).toContain('Close the running LabVIEW, then click Retry Compare');
    // Concise: no provider internals, no setting-switch text, no false CLI clause.
    expect(message).not.toContain('Provider:');
    expect(message).not.toContain('Rejected providers');
    expect(message).not.toContain('viHistorySuite.labviewBitness');
    expect(message).not.toContain('LabVIEWCLI');
    // The verbose Pick Runtime Provider path is not used for this pre-launch block.
    expect(showWarningMessageMock).not.toHaveBeenCalledWith(
      expect.anything(),
      'Pick Runtime Provider'
    );

    // Codex P2 (#531): the History panel runtime update must match the concise
    // toast, not re-derive the verbose setting-switch / rejected-provider content
    // from the doctor summary (which would contradict the toast).
    const runtimeUpdate = panel.webview.postMessage.mock.calls
      .map((call: unknown[]) => call[0] as { type?: string; summary?: string; nextAction?: string })
      .find((posted) => posted?.type === 'comparisonRuntimeResult');
    expect(runtimeUpdate).toBeDefined();
    expect(runtimeUpdate?.nextAction).toContain('Retry Compare');
    expect(runtimeUpdate?.nextAction).not.toContain('viHistorySuite.labviewBitness');
    const serializedUpdate = JSON.stringify(runtimeUpdate);
    expect(serializedUpdate).not.toContain('Rejected providers');
    expect(serializedUpdate).not.toContain('viHistorySuite.labviewBitness');
    expect(serializedUpdate).not.toContain('LabVIEWCLI');
  });

  it('shows a concise close + Retry Compare toast when blocked by a concurrent LabVIEW version conflict (VHS-REQ-653.6, #530)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'blocked-host-version-conflict',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'windows-host-version-conflict',
      hostObservedLabviewBitness: 'x64',
      hostObservedLabviewVersion: '2026',
      selectedLabviewBitness: 'x64',
      selectedLabviewVersion: '2025',
      runtimeDoctorSummaryLines: [
        'Selected provider=unavailable; engine=none; platform=win32; bitness=x64.',
        'Runtime blocked reason: windows-host-version-conflict.'
      ]
    });
    showWarningMessageMock.mockResolvedValueOnce(undefined);
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
      expect.stringContaining('LabVIEW 2026 (64-bit) is already running'),
      'Retry Compare'
    );
    const [message] = showWarningMessageMock.mock.calls.at(-1)!;
    expect(message).toContain('LabVIEW 2025 (64-bit)');
    expect(message).toContain('Close the running LabVIEW, then click Retry Compare');
    expect(message).not.toContain('Provider:');
    expect(message).not.toContain('viHistorySuite.labviewVersion');
    expect(message).not.toContain('LabVIEWCLI');
    expect(showWarningMessageMock).not.toHaveBeenCalledWith(
      expect.anything(),
      'Pick Runtime Provider'
    );
  });

  it('re-runs the compare when Retry Compare is clicked on a pre-launch conflict from the panel Compare button (VHS-REQ-621.5, #530)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'blocked-host-bitness-conflict',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'windows-host-bitness-conflict',
      hostObservedLabviewBitness: 'x64',
      selectedLabviewBitness: 'x86'
    });
    // First toast: click Retry Compare; second toast (after re-block): dismiss.
    showWarningMessageMock.mockResolvedValueOnce('Retry Compare');
    showWarningMessageMock.mockResolvedValueOnce(undefined);
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReportFromSelection',
      selectedHashes: ['WORKTREE', 'def1234567890abcdef1234567890abcdef12345']
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Retry re-invokes the same compare; it re-blocks (no second LabVIEW is
    // ever launched), confirming the close + Retry Compare loop.
    expect(comparisonReportAction).toHaveBeenCalledTimes(2);
  });

  it('keeps the success runtime toast concise without provider-selection internals (#538)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      retainedArchiveAvailable: true,
      runtimeDoctorSummaryLines: [
        'Selected provider=host-native; engine=labviewcli; platform=win32; bitness=x64.',
        'Provider request=host.',
        'Provider decision: rejected windows-container because Docker container execution was not selected because the host provider was requested.'
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

    const runtimeToast = showInformationMessageMock.mock.calls
      .map((call: unknown[]) => call[0] as string)
      .find((message) => typeof message === 'string' && message.includes('completed.'));
    expect(runtimeToast).toBeDefined();
    // The toast confirms success and which runtime ran.
    expect(runtimeToast).toContain('Provider: host-native');
    // Concise: a successful compare must not surface provider-selection internals
    // (the "Rejected providers ... because ... because" tautology that reads like
    // a problem). Those facts stay in the panel Runtime details and the packet.
    expect(runtimeToast).not.toContain('Rejected providers');
    expect(runtimeToast).not.toContain('Provider request');
    expect(runtimeToast).not.toContain('because');
  });

  it('offers a Pick Runtime Provider action when comparison runtime reclassifies failure as labview-host-bitness-conflict (VHS-REQ-621.5)', async () => {
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

  it('shows a concise Pick Runtime Provider toast when a compare fails as labview-vi-version-too-new (#595, VHS-REQ-658.4)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'failed-vi-version-too-new',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'failed',
      runtimeFailureReason: 'labview-vi-version-too-new',
      selectedLabviewVersion: '2025',
      selectedLabviewBitness: 'x64',
      runtimeDoctorSummaryLines: [
        'Selected provider=host-native; engine=labview-cli; platform=win32; bitness=x64.',
        'Provider request=host.',
        'Runtime failure reason: labview-vi-version-too-new.',
        'Next action: this VI was saved in a newer LabVIEW than the selected LabVIEW 2025 (x64), which cannot open a forward-version VI. Pick a newer installed LabVIEW (for example through the Pick Runtime Provider quick-pick or viHistorySuite.labviewVersion), then rerun comparison report generation.'
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

    // Exactly one warning toast: the concise version-too-new message, with the
    // verbose runtime-failure message suppressed for this reason.
    expect(showWarningMessageMock).toHaveBeenCalledTimes(1);
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('newer LabVIEW than the selected LabVIEW 2025 (64-bit)'),
      'Pick Runtime Provider'
    );
    const [message] = showWarningMessageMock.mock.calls.at(-1)!;
    expect(message).toContain('Pick a newer installed LabVIEW, then run Compare again');
    // Concise: no doctor summary internals leak into the toast.
    expect(message).not.toContain('Runtime failure reason');
    expect(message).not.toContain('Next action:');
    expect(message).not.toContain('Provider request');
    // The toast is the only surface: the action suppressed the report webview
    // (#597), so no "VI Comparison Report opened" information message fires.
    const reportOpenedInfo = showInformationMessageMock.mock.calls
      .map((call: unknown[]) => call[0] as string)
      .find((text) => typeof text === 'string' && text.includes('VI Comparison Report opened'));
    expect(reportOpenedInfo).toBeUndefined();

    await Promise.resolve();
    await Promise.resolve();
    expect(vscodeHarness.vscode.commands.executeCommand).toHaveBeenCalledWith(
      'labviewViHistory.pickRuntimeProvider'
    );
  });

  it('shows a concise Pick Image Version toast when blocked by a container image platform mismatch (VHS-REQ-650.6, #532)', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const panel = createMockPanel();
    createWebviewPanelMock.mockReturnValue(panel);
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'blocked-container-image-platform-mismatch',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'not-available',
      blockedReason: 'container-image-platform-mismatch',
      containerSelectedImagePlatform: 'windows',
      containerActiveEnginePlatform: 'linux',
      containerSelectedImageTag: '2026q1patch2-windows',
      runtimeDoctorSummaryLines: [
        'Selected provider=unavailable; engine=none; platform=win32; bitness=x64.',
        'Provider decision: rejected host-native because Host-native execution was not selected because the Docker provider was requested.',
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
      expect.stringContaining('The selected Docker image is a Windows-container image'),
      'Pick Image Version'
    );
    const [message] = showWarningMessageMock.mock.calls.at(-1)!;
    expect(message).toContain('Docker is currently in Linux-container mode');
    expect(message).toContain('pick a Linux image version');
    // Concise: no provider internals and no host-native noise.
    expect(message).not.toContain('Provider:');
    expect(message).not.toContain('Rejected providers');
    expect(message).not.toContain('host-native');
    expect(message).not.toContain('viHistorySuite.container.imageVersion');

    await Promise.resolve();
    await Promise.resolve();
    expect(vscodeHarness.vscode.commands.executeCommand).toHaveBeenCalledWith(
      'labviewViHistory.pickContainerImageVersion'
    );

    // The History panel runtime update must match the concise toast, not the
    // verbose doctor-summary content.
    const runtimeUpdate = panel.webview.postMessage.mock.calls
      .map((call: unknown[]) => call[0] as { type?: string; nextAction?: string })
      .find((posted) => posted?.type === 'comparisonRuntimeResult');
    expect(runtimeUpdate).toBeDefined();
    expect(runtimeUpdate?.nextAction).toContain('Pick Image Version');
    const serializedUpdate = JSON.stringify(runtimeUpdate);
    expect(serializedUpdate).not.toContain('Rejected providers');
    expect(serializedUpdate).not.toContain('host-native');
  });

  it('shows a concise Docker Desktop toast and suppresses the verbose runtime warning when the Docker daemon is not running (VHS-REQ-642, VHS-REQ-642.4)', async () => {
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

  it('names the Docker daemon (not Docker Desktop) on non-Windows hosts (VHS-REQ-642, VHS-REQ-642.4)', async () => {
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

  it('re-runs the comparison for the same revision pair when Retry is selected (VHS-REQ-642, VHS-REQ-642.4)', async () => {
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

  it('opens the retained diagnostics packet for the same pair when Show diagnostics is selected (VHS-REQ-642, VHS-REQ-642.4)', async () => {
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

  it('shows an Install Docker link-only toast and suppresses the verbose warning when Docker is not installed (VHS-REQ-643.4, VHS-REQ-643.5)', async () => {
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
    expect(vscodeHarness.vscode.commands.executeCommand).not.toHaveBeenCalled();
    expect(comparisonReportAction).toHaveBeenCalledTimes(1);
  });

  it('opens the retained diagnostics packet from the Docker-not-installed toast (VHS-REQ-643.4)', async () => {
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

    expect(vscodeHarness.vscode.env.openExternal).not.toHaveBeenCalled();
    expect(openRetainedComparisonReportAction).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedHash: 'abc1234567890abcdef1234567890abcdef12345'
      })
    );
  });

  it('names Docker (not Docker Desktop) in the not-installed toast on non-Windows hosts (VHS-REQ-643.4)', async () => {
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

  it('opens the history panel for an eligible model (VHS-REQ-016.5, VHS-REQ-627/631)', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };

    const command = createOpenViHistoryCommand(historyService as never, undefined);

    await command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never);

    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
  });

  it('retains the panel context when hidden so the commit selection is not cleared (VHS-REQ-133, #561)', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };

    const command = createOpenViHistoryCommand(historyService as never, undefined);

    await command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never);

    expect(createWebviewPanelMock).toHaveBeenCalledWith(
      'viHistorySuite.history',
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true })
    );
  });
});

function createGitApiStub() {
  return {
    toGitUri: vi.fn((uri: { fsPath: string }, hash: string) =>
      hash ? vscodeHarness.createUri(`${uri.fsPath}@${hash}`) : undefined
    )
  };
}

describe('createCopyReviewPacketCommand Command Palette entry (VHS-REQ-039, VHS-REQ-012)', () => {
  beforeEach(() => {
    vscodeHarness.reset();
    workspaceState.isTrusted = true;
    vscodeHarness.vscode.window.activeTextEditor = undefined;
    clipboardWriteTextMock.mockResolvedValue(undefined);
  });

  it('warns and stops in an untrusted workspace before loading history (VHS-REQ-039.3, VHS-REQ-012.1)', async () => {
    workspaceState.isTrusted = false;
    const historyService = { load: vi.fn() };
    const command = createCopyReviewPacketCommand(historyService as never);

    await command(vscodeHarness.createUri('/workspace/repo/Sample.vi') as never);

    expect(historyService.load).not.toHaveBeenCalled();
    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI History review packet copy is disabled in untrusted workspaces to prevent external process execution. Documentation and local runtime settings CLI preparation remain available.'
    );
  });

  it('guides the user to select a VI when neither a URI nor an active editor is available (VHS-REQ-039.3)', async () => {
    const historyService = { load: vi.fn() };
    const command = createCopyReviewPacketCommand(historyService as never);

    await command();

    expect(historyService.load).not.toHaveBeenCalled();
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'Select a tracked LabVIEW VI to copy its VI History review packet.'
    );
  });

  it('falls back to the active editor URI when invoked without an explicit URI', async () => {
    const activeUri = vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi');
    vscodeHarness.vscode.window.activeTextEditor = { document: { uri: activeUri } };
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const command = createCopyReviewPacketCommand(historyService as never);

    await command();

    expect(historyService.load).toHaveBeenCalledTimes(1);
    const [loadedUri] = historyService.load.mock.calls[0] as [{ fsPath: string }];
    expect(loadedUri.fsPath).toBe(activeUri.fsPath);
    expect(clipboardWriteTextMock).toHaveBeenCalledOnce();
  });

  it('surfaces a Git-repository load failure without writing to the clipboard (VHS-REQ-039.3, VHS-REQ-013)', async () => {
    const historyService = {
      load: vi.fn().mockRejectedValue(new Error('fatal: not a git repository'))
    };
    const command = createCopyReviewPacketCommand(historyService as never);

    await command(vscodeHarness.createUri('/workspace/repo/Sample.vi') as never);

    expect(showErrorMessageMock).toHaveBeenCalledWith(
      'VI History could not load the selected file because it is not inside a tracked Git repository. Open a local Git-backed LabVIEW VI with commit history instead.'
    );
    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
  });

  it('explains the installed Program Files lv_icon.vi is not the review surface on load failure', async () => {
    const historyService = {
      load: vi.fn().mockRejectedValue(new Error('some load error'))
    };
    const command = createCopyReviewPacketCommand(historyService as never);

    await command({
      fsPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\resource\\plugins\\lv_icon.vi'
    } as never);

    expect(showErrorMessageMock).toHaveBeenCalledWith(
      'The selected installed copy of lv_icon.vi is not the review surface. Open resource/plugins/lv_icon.vi from a Git-backed ni/labview-icon-editor clone instead; the Program Files copy has no commit history for VI Comparison Report generation.'
    );
  });

  it('shows ineligibility guidance for a recognized VI with no history (VHS-REQ-039.3)', async () => {
    const historyService = {
      load: vi.fn().mockResolvedValue(
        createIneligibleModel({ signature: 'LVIN', commits: [] })
      )
    };
    const command = createCopyReviewPacketCommand(historyService as never);

    await command(vscodeHarness.createUri('/workspace/repo/Sample.vi') as never);

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'The selected file has no Git commit history. Commit the file at least twice to build reviewable history.'
    );
    expect(clipboardWriteTextMock).not.toHaveBeenCalled();
  });

  it('copies the plain-text review packet and confirms via an information message (VHS-REQ-039.2)', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const command = createCopyReviewPacketCommand(historyService as never);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);

    expect(clipboardWriteTextMock).toHaveBeenCalledOnce();
    const [writtenText] = clipboardWriteTextMock.mock.calls[0] as [string];
    expect(writtenText).toContain('VI History Review Packet');
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI History review packet copied to the clipboard.'
    );
  });
});

describe('openViHistoryCommand repository support gating and evidence hydration', () => {
  beforeEach(() => {
    vscodeHarness.reset();
    workspaceState.isTrusted = true;
    vscodeHarness.vscode.window.activeTextEditor = undefined;
    createWebviewPanelMock.mockReturnValue(createMockPanel());
  });

  it('warns with support guidance when the repository is an unsupported review target (VHS-REQ-627)', async () => {
    const model = createEligibleModel({
      repositorySupport: {
        tier: 'unsupported',
        supportLabel: 'Unsupported repository',
        supportGuidance: 'This repository is outside the supported VI review families.',
        allowCoreReviewActions: false,
        allowDecisionRecordActions: false,
        allowBenchmarkStatus: false
      }
    });
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const command = createOpenViHistoryCommand(historyService as never, undefined);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'This repository is outside the supported VI review families.'
    );
    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
  });

  it('hydrates retained comparison evidence availability for commits with a previous hash', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const hasRetainedComparisonReport = vi.fn().mockResolvedValue(true);
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      hasRetainedComparisonReport
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);

    // Only the newer commit has a previousHash, so the probe runs exactly once.
    expect(hasRetainedComparisonReport).toHaveBeenCalledTimes(1);
    expect(hasRetainedComparisonReport).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedHash: 'abc1234567890abcdef1234567890abcdef12345',
        baseHash: 'def1234567890abcdef1234567890abcdef12345'
      })
    );
    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
  });

  it('records the full runtime observation surface after a successful comparison run', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      blockedReason: 'diagnostic-only',
      runtimeFailureReason: 'diagnostic-only-failure',
      cancellationStage: 'none',
      packetFilePath: '/store/packet.json',
      reportFilePath: '/store/report.html',
      metadataFilePath: '/store/metadata.json',
      reportWebviewUri: 'vscode-webview://report',
      generatedReportExists: true,
      title: 'VI Comparison Report',
      retainedArchiveAvailable: true,
      archiveFailureReason: 'retained-archive-write-failed',
      runtimeDiagnosticReason: 'diagnostic-captured',
      runtimeDiagnosticNotes: ['note-one', 'note-two'],
      runtimeDiagnosticLogSourcePath: '/logs/source.log',
      runtimeDiagnosticLogArtifactPath: '/logs/artifact.log',
      runtimeExecutable: 'LabVIEWCLI',
      runtimeArgs: ['-OperationName', 'CreateComparisonReport'],
      runtimeProcessObservationArtifactPath: '/obs/pre.json',
      runtimeProcessObservationCapturedAt: '2025-01-20T00:00:00Z',
      runtimeProcessObservationTrigger: 'pre-execution',
      runtimeObservedProcessNames: ['LabVIEW.exe', 'LabVIEWCLI.exe'],
      runtimeLabviewProcessObserved: true,
      runtimeLabviewCliProcessObserved: true,
      runtimeLvcompareProcessObserved: false,
      runtimeExitProcessObservationCapturedAt: '2025-01-20T00:05:00Z',
      runtimeExitProcessObservationTrigger: 'post-exit',
      runtimeExitObservedProcessNames: ['LabVIEW.exe'],
      runtimeLabviewProcessObservedAtExit: false,
      runtimeLabviewCliProcessObservedAtExit: false,
      runtimeLvcompareProcessObservedAtExit: true,
      runtimeDoctorSummaryLines: [
        'Selected provider=host-native; engine=labview-cli; platform=win32; bitness=x64.',
        'Provider request=host.'
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

    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'generateComparisonReport',
      outcome: 'opened-comparison-report',
      retainedArchiveAvailable: true,
      archiveFailureReason: 'retained-archive-write-failed',
      runtimeDiagnosticReason: 'diagnostic-captured',
      runtimeDiagnosticNotes: ['note-one', 'note-two'],
      runtimeDiagnosticLogSourcePath: '/logs/source.log',
      runtimeDiagnosticLogArtifactPath: '/logs/artifact.log',
      runtimeExecutable: 'LabVIEWCLI',
      runtimeArgs: ['-OperationName', 'CreateComparisonReport'],
      runtimeProcessObservationArtifactPath: '/obs/pre.json',
      runtimeProcessObservationTrigger: 'pre-execution',
      runtimeObservedProcessNames: ['LabVIEW.exe', 'LabVIEWCLI.exe'],
      runtimeLabviewProcessObserved: true,
      runtimeLvcompareProcessObserved: false,
      runtimeExitProcessObservationTrigger: 'post-exit',
      runtimeLvcompareProcessObservedAtExit: true,
      comparisonRuntimePanelStatus: 'succeeded'
    });
  });

  it('notes when a comparison report opened but retained pair evidence was not archived', async () => {
    const model = createEligibleModel();
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded',
      retainedArchiveAvailable: false
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

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI Comparison Report opened, but retained pair evidence was not archived for later reuse. Re-run Compare for this pair to rebuild retained evidence if it is not yet reviewable.'
    );
  });
});

describe('openViHistoryCommand documentation command branches (VHS-REQ-611)', () => {
  beforeEach(() => {
    vscodeHarness.reset();
    workspaceState.isTrusted = true;
    vscodeHarness.vscode.window.activeTextEditor = undefined;
    createWebviewPanelMock.mockReturnValue(createMockPanel());
  });

  it('reports when bundled documentation is not available in this build', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const command = createOpenViHistoryCommand(historyService as never, undefined, panelTracker);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'openDocumentation' });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'Bundled VI History documentation is not available in this extension build.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'openDocumentation',
      outcome: 'unsupported-command'
    });
  });

  it('opens a documentation page directly without a fallback when the page resolves', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const openDocumentationAction = vi.fn().mockResolvedValue({
      outcome: 'opened-documentation',
      pageId: 'runtime-setup',
      pageTitle: 'Runtime Setup',
      manifestFilePath: '/docs/manifest.json',
      pageFilePath: '/docs/pages/runtime-setup.html',
      title: 'VI History Docs: Runtime Setup'
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
      pageId: 'runtime-setup'
    });

    expect(openDocumentationAction).toHaveBeenCalledTimes(1);
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'openDocumentation',
      outcome: 'opened-documentation',
      documentationPageId: 'runtime-setup',
      requestedDocumentationPageId: 'runtime-setup'
    });
  });

  it('warns when the bundled documentation set is missing', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const openDocumentationAction = vi.fn().mockResolvedValue({
      outcome: 'missing-bundled-documentation'
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
    await panelTracker.dispatchLastPanelMessage({ command: 'openDocumentation' });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'Bundled VI History documentation is not available in this extension build.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'openDocumentation',
      outcome: 'missing-bundled-documentation'
    });
  });

  it('reports an unknown documentation page when no specific page was requested (no fallback)', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const openDocumentationAction = vi.fn().mockResolvedValue({
      outcome: 'unknown-documentation-page'
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
    await panelTracker.dispatchLastPanelMessage({ command: 'openDocumentation' });

    // No requestedPageId means no overview fallback attempt.
    expect(openDocumentationAction).toHaveBeenCalledTimes(1);
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI History could not resolve the requested bundled documentation page.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'openDocumentation',
      outcome: 'unknown-documentation-page'
    });
  });
});

describe('openViHistoryCommand dashboard command branches (VHS-REQ-610)', () => {
  beforeEach(() => {
    vscodeHarness.reset();
    workspaceState.isTrusted = true;
    vscodeHarness.vscode.window.activeTextEditor = undefined;
    createWebviewPanelMock.mockReturnValue(createMockPanel());
  });

  it('reports when the dashboard action is not available in this build', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const command = createOpenViHistoryCommand(historyService as never, undefined, panelTracker);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'openDashboard' });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI Review Dashboard is not available in this extension build.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'openDashboard',
      outcome: 'unsupported-command'
    });
  });

  it('surfaces each dashboard blocked outcome with the matching guidance', async () => {
    const outcomes: Array<{
      outcome: string;
      showMock: typeof showInformationMessageMock;
      message: string;
    }> = [
      {
        outcome: 'cancelled',
        showMock: showInformationMessageMock,
        message:
          'VI Review Dashboard refresh was cancelled. Retained dashboard artifacts, if any, were preserved.'
      },
      {
        outcome: 'workspace-untrusted',
        showMock: showWarningMessageMock,
        message:
          'VI Review Dashboard is disabled in untrusted workspaces to prevent external process execution. Documentation and local runtime settings CLI preparation remain available.'
      },
      {
        outcome: 'missing-storage-uri',
        showMock: showWarningMessageMock,
        message:
          'VI Review Dashboard requires an open workspace so concentrated dashboard artifacts can be stored under workspace-scoped extension storage.'
      },
      {
        outcome: 'insufficient-commits',
        showMock: showInformationMessageMock,
        message: 'VI Review Dashboard requires at least three retained commits for the selected VI.'
      }
    ];

    for (const { outcome, showMock, message } of outcomes) {
      vscodeHarness.reset();
      workspaceState.isTrusted = true;
      createWebviewPanelMock.mockReturnValue(createMockPanel());
      const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
      const panelTracker = new HistoryPanelTracker();
      const multiReportDashboardAction = vi.fn().mockResolvedValue({ outcome });
      const command = createOpenViHistoryCommand(
        historyService as never,
        undefined,
        panelTracker,
        undefined,
        multiReportDashboardAction
      );

      await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
      await panelTracker.dispatchLastPanelMessage({ command: 'openDashboard' });

      expect(showMock, `dashboard outcome ${outcome}`).toHaveBeenCalledWith(message);
    }
  });

  it('re-renders the panel after opening the review dashboard', async () => {
    const panel = createMockPanel();
    createWebviewPanelMock.mockReturnValue(panel);
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const multiReportDashboardAction = vi.fn().mockResolvedValue({
      outcome: 'opened-review-dashboard',
      dashboardFilePath: '/store/dashboard.html',
      dashboardJsonFilePath: '/store/dashboard.json',
      dashboardPairCount: 3,
      dashboardArchivedPairCount: 2,
      dashboardMissingPairCount: 1
    });
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      undefined,
      multiReportDashboardAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'openDashboard' });

    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'openDashboard',
      outcome: 'opened-review-dashboard',
      dashboardPairCount: 3
    });
    expect(typeof panel.webview.html).toBe('string');
    expect(panel.webview.html.length).toBeGreaterThan(0);
  });
});

describe('openViHistoryCommand decision-record command branches (VHS-REQ-610)', () => {
  beforeEach(() => {
    vscodeHarness.reset();
    workspaceState.isTrusted = true;
    vscodeHarness.vscode.window.activeTextEditor = undefined;
    createWebviewPanelMock.mockReturnValue(createMockPanel());
  });

  it('reports when the decision-record action is not available in this build', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const command = createOpenViHistoryCommand(historyService as never, undefined, panelTracker);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'createDecisionRecord' });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI review decision records are not available in this extension build.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'createDecisionRecord',
      outcome: 'unsupported-command'
    });
  });

  it('surfaces each decision-record blocked outcome with the matching guidance', async () => {
    const cases: Array<{
      result: Record<string, unknown>;
      showMock: typeof showInformationMessageMock;
      message: string;
    }> = [
      {
        result: { outcome: 'cancelled' },
        showMock: showInformationMessageMock,
        message:
          'VI review decision record creation was cancelled. Retained dashboard and decision-record artifacts, if any, were preserved.'
      },
      {
        result: { outcome: 'workspace-untrusted' },
        showMock: showWarningMessageMock,
        message:
          'VI review decision records are disabled in untrusted workspaces to prevent external process execution. Documentation and local runtime settings CLI preparation remain available.'
      },
      {
        result: { outcome: 'missing-storage-uri' },
        showMock: showWarningMessageMock,
        message:
          'VI review decision records require an open workspace so decision artifacts can be stored under workspace-scoped extension storage.'
      },
      {
        result: { outcome: 'insufficient-commits' },
        showMock: showInformationMessageMock,
        message:
          'VI review decision records require at least three retained commits for the selected VI.'
      },
      {
        result: { outcome: 'missing-repository-url' },
        showMock: showInformationMessageMock,
        message:
          'VI review decision records require a Git origin remote URL so the active review scenario can be matched truthfully.'
      },
      {
        result: { outcome: 'missing-review-scenario' },
        showMock: showInformationMessageMock,
        message: 'No active VI review scenario matches this repository and VI yet.'
      },
      {
        result: { outcome: 'scenario-contract-mismatch', mismatchSummary: 'Ledger drifted.' },
        showMock: showInformationMessageMock,
        message: 'Ledger drifted.'
      },
      {
        result: { outcome: 'scenario-contract-mismatch' },
        showMock: showInformationMessageMock,
        message: 'The retained dashboard evidence did not satisfy the selected review scenario contract.'
      }
    ];

    for (const { result, showMock, message } of cases) {
      vscodeHarness.reset();
      workspaceState.isTrusted = true;
      createWebviewPanelMock.mockReturnValue(createMockPanel());
      const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
      const panelTracker = new HistoryPanelTracker();
      const reviewDecisionRecordAction = vi.fn().mockResolvedValue(result);
      const command = createOpenViHistoryCommand(
        historyService as never,
        undefined,
        panelTracker,
        undefined,
        undefined,
        undefined,
        undefined,
        reviewDecisionRecordAction
      );

      await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
      await panelTracker.dispatchLastPanelMessage({ command: 'createDecisionRecord' });

      expect(showMock, `decision outcome ${String(result.outcome)}`).toHaveBeenCalledWith(message);
    }
  });

  it('records a created decision record with its artifact paths', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const reviewDecisionRecordAction = vi.fn().mockResolvedValue({
      outcome: 'created-decision-record',
      scenarioId: 'icon-editor-default',
      decisionRecordJsonPath: '/store/decision.json',
      decisionRecordMarkdownPath: '/store/decision.md'
    });
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      undefined,
      undefined,
      undefined,
      undefined,
      reviewDecisionRecordAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'createDecisionRecord' });

    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'createDecisionRecord',
      outcome: 'created-decision-record',
      scenarioId: 'icon-editor-default',
      decisionRecordJsonPath: '/store/decision.json',
      decisionRecordMarkdownPath: '/store/decision.md'
    });
  });
});

describe('openViHistoryCommand comparison routing and runtime messaging', () => {
  beforeEach(() => {
    vscodeHarness.reset();
    workspaceState.isTrusted = true;
    vscodeHarness.vscode.window.activeTextEditor = undefined;
    createWebviewPanelMock.mockReturnValue(createMockPanel());
  });

  it('guides the user when a selection compare does not resolve two distinct revisions (VHS-REQ-641)', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn();
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      comparisonReportAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReportFromSelection',
      selectedHashes: ['abc1234567890abcdef1234567890abcdef12345']
    });

    expect(comparisonReportAction).not.toHaveBeenCalled();
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'Select two distinct retained revisions to populate compare preflight.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'generateComparisonReportFromSelection',
      outcome: 'ignored-missing-hash'
    });
  });

  it('reports comparison generation is unavailable when no action is wired', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const command = createOpenViHistoryCommand(historyService as never, undefined, panelTracker);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'generateComparisonReport',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI Comparison Report generation is not available in this extension build.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'generateComparisonReport',
      outcome: 'unsupported-command'
    });
  });

  it('ignores a message with no hash after the explicit-pair commands (VHS-REQ-012)', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const command = createOpenViHistoryCommand(historyService as never, undefined, panelTracker);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({ command: 'diffPrevious' });

    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'diffPrevious',
      outcome: 'ignored-missing-hash'
    });
  });

  it('opens the retained comparison report for a Diff prev on a comparison-capable VI', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const openRetainedComparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'opened-comparison-report',
      reportStatus: 'ready-for-runtime',
      runtimeExecutionState: 'succeeded'
    });
    const command = createOpenViHistoryCommand(
      historyService as never,
      undefined,
      panelTracker,
      undefined,
      undefined,
      openRetainedComparisonReportAction
    );

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(openRetainedComparisonReportAction).toHaveBeenCalledWith(
      expect.objectContaining({ selectedHash: 'abc1234567890abcdef1234567890abcdef12345' })
    );
  });

  it('falls back to generating a comparison report for Diff prev when no retained opener is wired', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
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
    await panelTracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(comparisonReportAction).toHaveBeenCalledWith(
      expect.objectContaining({ selectedHash: 'abc1234567890abcdef1234567890abcdef12345' })
    );
  });

  it('reports Diff prev needs comparison support when neither comparison action is wired', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const command = createOpenViHistoryCommand(historyService as never, undefined, panelTracker);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'Diff prev for LabVIEW VIs requires VI Comparison Report support in this extension build.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'diffPrevious',
      outcome: 'unsupported-command'
    });
  });

  it('surfaces each terminal comparison outcome with the matching guidance', async () => {
    const cases: Array<{
      result: Record<string, unknown>;
      showMock: typeof showInformationMessageMock;
      message: string;
    }> = [
      {
        result: { outcome: 'workspace-untrusted' },
        showMock: showWarningMessageMock,
        message:
          'VI History comparison reports are disabled in untrusted workspaces to prevent external process execution. Documentation and local runtime settings CLI preparation remain available.'
      },
      {
        result: { outcome: 'missing-storage-uri' },
        showMock: showWarningMessageMock,
        message:
          'VI History comparison reports require an open workspace so reports can be stored under workspace-scoped extension storage.'
      },
      {
        result: { outcome: 'missing-selected-commit' },
        showMock: showInformationMessageMock,
        message:
          'VI History could not resolve the selected retained revision for report generation.'
      },
      {
        result: { outcome: 'missing-previous-hash' },
        showMock: showInformationMessageMock,
        message: 'VI History has no previous retained revision for this entry.'
      },
      {
        result: { outcome: 'missing-retained-comparison-report' },
        showMock: showInformationMessageMock,
        message:
          'No retained VI Comparison Report exists for this pair yet. Use the compare preflight section to generate retained evidence for it.'
      },
      {
        result: { outcome: 'invalid-retained-comparison-report' },
        showMock: showInformationMessageMock,
        message:
          'Retained VI Comparison evidence for this pair is stale or invalid. Use the compare preflight section to rebuild retained evidence for it.'
      }
    ];

    for (const { result, showMock, message } of cases) {
      vscodeHarness.reset();
      workspaceState.isTrusted = true;
      createWebviewPanelMock.mockReturnValue(createMockPanel());
      const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
      const panelTracker = new HistoryPanelTracker();
      const comparisonReportAction = vi.fn().mockResolvedValue(result);
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

      expect(showMock, `comparison outcome ${String(result.outcome)}`).toHaveBeenCalledWith(message);
    }
  });

  it('surfaces blocked compare runtime feedback through notifications and panel runtime status (VHS-REQ-133.5)', async () => {
    const panel = createMockPanel();
    createWebviewPanelMock.mockReturnValue(panel);
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'missing-retained-comparison-report',
      reportStatus: 'blocked-preflight',
      runtimeExecutionState: 'not-available',
      blockedReason: 'preflight-validation-failed',
      runtimeFailureReason: 'preflight-failure',
      runtimeDiagnosticReason: 'preflight-diagnostic',
      runtimeDoctorSummaryLines: [
        'Selected provider=windows-container; engine=container; platform=win32; bitness=x64.',
        'Provider request=docker.',
        'Tool facts: ContainerAcquisitionState=pulling; DockerCli=present.',
        'Provider decision: rejected host-native because host execution was not selected.',
        'Provider decision: rejected linux-container because the active engine is Windows-container mode.',
        'Next action: switch Docker to the matching container engine, then rerun comparison report generation.'
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

    expect(comparisonReportAction).toHaveBeenCalledTimes(1);
    expect(panel.webview.html).not.toContain('data-testid="history-compare-preflight"');
    expect(panel.webview.html).not.toContain('data-testid="history-action-pick-image-version"');

    const informationMessages = showInformationMessageMock.mock.calls.map(
      (callArgs) => callArgs[0] as string
    );
    expect(informationMessages).not.toContain(
      'No retained VI Comparison Report exists for this pair yet. Use the compare preflight section to generate retained evidence for it.'
    );
    expect(informationMessages.some((message) => message.includes('compare preflight section'))).toBe(
      false
    );

    const warningMessages = showWarningMessageMock.mock.calls.map((callArgs) => callArgs[0] as string);
    const blockedWarning = warningMessages.find(
      (message) => typeof message === 'string' && message.includes('Generate compare blocked.')
    );
    expect(blockedWarning).toBeDefined();
    expect(blockedWarning).toContain('Provider: windows-container.');
    expect(blockedWarning).toContain('Provider request: docker.');
    expect(blockedWarning).toContain('Container image acquisition: pulling.');
    expect(blockedWarning).toContain('Rejected providers: host-native because');
    expect(blockedWarning).toContain('Blocked reason: preflight-validation-failed.');
    expect(blockedWarning).toContain('Failure reason: preflight-failure.');
    expect(blockedWarning).toContain('Diagnostic reason: preflight-diagnostic.');

    const runtimeUpdate = panel.webview.postMessage.mock.calls
      .map((call: unknown[]) => call[0] as { type?: string; status?: string; details?: Array<{ label: string; value: string }> })
      .find((posted) => posted?.type === 'comparisonRuntimeResult');
    expect(runtimeUpdate).toBeDefined();
    expect(runtimeUpdate?.status).toBe('blocked');
    const detailLabels = runtimeUpdate?.details?.map((detail) => detail.label) ?? [];
    expect(detailLabels).toEqual(
      expect.arrayContaining([
        'Provider',
        'Provider request',
        'Container image acquisition',
        'Rejected providers',
        'Blocked reason',
        'Failure reason',
        'Diagnostic reason'
      ])
    );
  });

  it('maps a legacy docker-only execution mode to the docker provider request in the panel update', async () => {
    const panel = createMockPanel();
    createWebviewPanelMock.mockReturnValue(panel);
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'missing-retained-comparison-report',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'failed',
      blockedReason: 'runtime-failed',
      runtimeDoctorSummaryLines: [
        'Selected provider=linux-container; engine=container; platform=linux; bitness=x64.',
        'Selected execution mode=docker-only.',
        'Next action: retry the comparison after confirming the container engine.'
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

    const runtimeUpdate = panel.webview.postMessage.mock.calls
      .map((call: unknown[]) => call[0] as { type?: string; details?: Array<{ label: string; value: string }> })
      .find((posted) => posted?.type === 'comparisonRuntimeResult');
    const providerRequest = runtimeUpdate?.details?.find(
      (detail) => detail.label === 'Provider request'
    );
    expect(providerRequest?.value).toBe('docker');
  });

  it('routes the mid-run labview-host-bitness-conflict failure to Pick Runtime Provider (VHS-REQ-621.5)', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const comparisonReportAction = vi.fn().mockResolvedValue({
      outcome: 'missing-retained-comparison-report',
      reportStatus: 'blocked-runtime',
      runtimeExecutionState: 'failed',
      runtimeFailureReason: 'labview-host-bitness-conflict',
      runtimeDoctorSummaryLines: [
        'Selected provider=host-native; engine=labview-cli; platform=win32; bitness=x86.',
        'Next action: close the running LabVIEW session, then rerun comparison report generation.'
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
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('labview-host-bitness-conflict'),
      'Pick Runtime Provider'
    );
    expect(vscodeHarness.vscode.commands.executeCommand).toHaveBeenCalledWith(
      'labviewViHistory.pickRuntimeProvider'
    );
  });
});

describe('openViHistoryCommand git-uri, preview, and plain-diff branches (VHS-REQ-659)', () => {
  beforeEach(() => {
    vscodeHarness.reset();
    workspaceState.isTrusted = true;
    vscodeHarness.vscode.window.activeTextEditor = undefined;
    previewState.enabled = false;
    revisionTreeMock.materialize.mockReset();
    createWebviewPanelMock.mockReturnValue(createMockPanel());
  });

  it('warns when the selected Git revision cannot be resolved (missing-git-uri)', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    // No gitApi, so toGitUri cannot resolve a revision URI for previewRevision.
    const command = createOpenViHistoryCommand(historyService as never, undefined, panelTracker);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'previewRevision',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI History could not resolve the selected Git revision.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'previewRevision',
      outcome: 'missing-git-uri'
    });
  });

  it('tells the user VI Preview is off when preview is disabled', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const gitApi = createGitApiStub();
    const command = createOpenViHistoryCommand(historyService as never, gitApi as never, panelTracker);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'previewRevision',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI Preview is off. Select the Docker runtime and enable VI preview in the "VI History: Runtime & Report Settings" command to preview revisions.'
    );
    expect(revisionTreeMock.materialize).not.toHaveBeenCalled();
  });

  it('materializes the revision and opens the read-only preview editor when preview is on', async () => {
    previewState.enabled = true;
    revisionTreeMock.materialize.mockResolvedValue({
      viFilePath: '/workspace/preview/Sample.vi'
    });
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const gitApi = createGitApiStub();
    const command = createOpenViHistoryCommand(historyService as never, gitApi as never, panelTracker);

    vi.useFakeTimers();
    try {
      await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
      await panelTracker.dispatchLastPanelMessage({
        command: 'previewRevision',
        hash: 'abc1234567890abcdef1234567890abcdef12345'
      });
      vi.runOnlyPendingTimers();
    } finally {
      vi.useRealTimers();
    }

    expect(revisionTreeMock.materialize).toHaveBeenCalledTimes(1);
    expect(vscodeHarness.vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.openWith',
      expect.objectContaining({ fsPath: '/workspace/preview/Sample.vi' }),
      'viHistorySuite.viPreview'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'previewRevision',
      outcome: 'opened-revision-preview'
    });
  });

  it('warns and records a failed preview when materialization throws', async () => {
    previewState.enabled = true;
    revisionTreeMock.materialize.mockRejectedValue(new Error('materialize failed'));
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const gitApi = createGitApiStub();
    const command = createOpenViHistoryCommand(historyService as never, gitApi as never, panelTracker);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'previewRevision',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(showWarningMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('VI History could not preview this revision: materialize failed')
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'previewRevision',
      outcome: 'revision-preview-failed'
    });
  });

  it('opens a plain Git diff for a Diff prev on a non-comparison-capable eligible VI', async () => {
    const model = createEligibleModel({ signature: 'unknown' });
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const gitApi = createGitApiStub();
    const command = createOpenViHistoryCommand(historyService as never, gitApi as never, panelTracker);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(vscodeHarness.vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.diff',
      expect.anything(),
      expect.anything(),
      expect.any(String)
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'diffPrevious',
      outcome: 'diffed-previous'
    });
  });

  it('reports no previous revision for a plain Diff prev when the selected commit is the oldest', async () => {
    const model = createEligibleModel({ signature: 'unknown' });
    const historyService = { load: vi.fn().mockResolvedValue(model) };
    const panelTracker = new HistoryPanelTracker();
    const gitApi = createGitApiStub();
    const command = createOpenViHistoryCommand(historyService as never, gitApi as never, panelTracker);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'diffPrevious',
      hash: 'def1234567890abcdef1234567890abcdef12345'
    });

    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'VI History has no previous retained revision for this entry.'
    );
    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'diffPrevious',
      outcome: 'missing-previous-hash'
    });
  });

  it('records an unsupported command for an unrecognized panel message with a hash', async () => {
    const historyService = { load: vi.fn().mockResolvedValue(createEligibleModel()) };
    const panelTracker = new HistoryPanelTracker();
    const gitApi = createGitApiStub();
    const command = createOpenViHistoryCommand(historyService as never, gitApi as never, panelTracker);

    await command(vscodeHarness.createUri('/workspace/test-repo/src/Sample.vi') as never);
    await panelTracker.dispatchLastPanelMessage({
      command: 'somethingUnhandled',
      hash: 'abc1234567890abcdef1234567890abcdef12345'
    });

    expect(panelTracker.getLastActionSummary()).toMatchObject({
      command: 'somethingUnhandled',
      outcome: 'unsupported-command'
    });
  });
});

