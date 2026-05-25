import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';
import { HistoryPanelTracker } from '../../src/ui/historyPanelTracker';

const {
  showInformationMessageMock,
  showWarningMessageMock,
  showErrorMessageMock,
  workspaceState,
  clipboardWriteTextMock,
  createWebviewPanelMock
} = vi.hoisted(() => ({
  showInformationMessageMock: vi.fn(),
  showWarningMessageMock: vi.fn(),
  showErrorMessageMock: vi.fn(),
  workspaceState: { isTrusted: true },
  clipboardWriteTextMock: vi.fn(),
  createWebviewPanelMock: vi.fn()
}));

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: showInformationMessageMock,
    showWarningMessage: showWarningMessageMock,
    showErrorMessage: showErrorMessageMock,
    activeTextEditor: undefined,
    createWebviewPanel: createWebviewPanelMock
  },
  workspace: {
    get isTrusted() {
      return workspaceState.isTrusted;
    },
    getConfiguration: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(undefined) })
  },
  ViewColumn: {
    Active: 1
  },
  env: {
    clipboard: {
      writeText: clipboardWriteTextMock
    }
  }
}));

import { createOpenViHistoryCommand } from '../../src/commands/openViHistoryCommand';

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
    vi.clearAllMocks();
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
      {} as never,
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
      {} as never,
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
      {} as never,
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
      {} as never,
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
    vi.clearAllMocks();
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
      {} as never,
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
      {} as never,
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
      {} as never,
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
      {} as never,
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
      {} as never,
      undefined
      // no panelTracker
    );

    await expect(
      command({ fsPath: '/workspace/test-repo/src/Sample.vi' } as never)
    ).resolves.toBeUndefined();
  });
});
