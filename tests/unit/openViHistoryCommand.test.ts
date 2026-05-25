import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';

const {
  showInformationMessageMock,
  showWarningMessageMock,
  showErrorMessageMock,
  workspaceState
} = vi.hoisted(() => ({
  showInformationMessageMock: vi.fn(),
  showWarningMessageMock: vi.fn(),
  showErrorMessageMock: vi.fn(),
  workspaceState: { isTrusted: true }
}));

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: showInformationMessageMock,
    showWarningMessage: showWarningMessageMock,
    showErrorMessage: showErrorMessageMock,
    activeTextEditor: undefined,
    createWebviewPanel: vi.fn()
  },
  workspace: {
    get isTrusted() {
      return workspaceState.isTrusted;
    }
  },
  ViewColumn: {
    Active: 1
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
