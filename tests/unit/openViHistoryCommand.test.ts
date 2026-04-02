import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  showWarningMessageMock,
  showInformationMessageMock,
  clipboardWriteTextMock,
  executeCommandMock,
  createWebviewPanelMock,
  workspaceState,
  windowState
} = vi.hoisted(() => ({
  showWarningMessageMock: vi.fn(),
  showInformationMessageMock: vi.fn(),
  clipboardWriteTextMock: vi.fn(),
  executeCommandMock: vi.fn(),
  createWebviewPanelMock: vi.fn(),
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
    createWebviewPanel: createWebviewPanelMock
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
    createWebviewPanelMock.mockImplementation((_viewType: string, title: string) =>
      createMockPanel(title)
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
});
